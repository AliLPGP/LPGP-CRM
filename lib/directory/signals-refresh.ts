import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ASSET_CLASSES, type AssetClass } from "./asset-classes";
import { OUT_OF_TIME, timeLeft } from "./research";

// The daily signals job: for each asset class, Claude searches the last few
// days of news and returns dated items with the page that reported each.
// Items are keyed by URL, so a story already on file is not added twice.

const MODEL = "claude-opus-5-5";

export type FreshSignal = {
  date: string | null;
  kind: "deal" | "fund_close" | "fundraise" | "people" | "regulatory" | "performance" | "news";
  headline: string;
  summary: string;
  entities: string[];
  source_name: string;
  source_url: string;
};

const nullable = (type: "string") => ({ anyOf: [{ type }, { type: "null" }] });

const RECORD_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_signals",
  description: "Record the news items found. Call exactly once when the search is done, with every item a page you found reports.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: nullable("string"),
            kind: { type: "string", enum: ["deal", "fund_close", "fundraise", "people", "regulatory", "performance", "news"] },
            headline: { type: "string" },
            summary: { type: "string" },
            entities: { type: "array", items: { type: "string" } },
            source_name: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["date", "kind", "headline", "summary", "entities", "source_name", "source_url"],
        },
      },
    },
    required: ["items"],
  },
};

function system(days: number): string {
  return `You keep a private-markets news feed for a sales team. Search the web for the last ${days} days of news in one asset class and record every material item with the URL of the page that reports it.

Rules:
- Only items a page you found actually reports. Never write an item from memory; never invent a date, a figure or a source.
- One item per story; skip duplicates of the same story from different outlets (keep the most authoritative).
- Material means: fund closes and fundraising milestones, significant transactions, regulation and policy, senior people moves, performance or fundraising data releases, LP allocation news, launches of new strategies. Skip opinion pieces and marketing.
- date is the story's date as ISO YYYY-MM-DD when the page states it, else null. entities are the firms, funds or people named. headline is factual and short; summary is one sentence.
- When done, call record_signals once. An empty list is fine.`;
}

export type RefreshOutcome = { cls: AssetClass; items: FreshSignal[]; error?: string };

export async function refreshClassSignals(cls: AssetClass, days = 5, deadline?: number): Promise<RefreshOutcome> {
  if (!process.env.ANTHROPIC_API_KEY) return { cls, items: [], error: "ANTHROPIC_API_KEY is not set" };
  const client = new Anthropic({ timeout: 200_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Asset class: ${cls.name}. ${cls.blurb} Find the last ${days} days of material news, worldwide. Plan 5–8 searches.` },
  ];
  try {
    for (let turn = 0; turn < 6; turn++) {
      const left = timeLeft(deadline);
      if (left < 15_000) return { cls, items: [], error: OUT_OF_TIME };
      const response = await client.beta.messages.create(
        {
          model: MODEL,
          max_tokens: 12000,
          // A declined request is re-run on Anthropic's recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: "low" },
          system: system(days),
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, RECORD_TOOL],
          messages,
        },
        Number.isFinite(left) ? { timeout: Math.min(200_000, Math.max(5_000, left - 5_000)), maxRetries: 0 } : undefined,
      );
      const record = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "record_signals");
      if (record) {
        const input = record.input as { items?: FreshSignal[] };
        const items = (Array.isArray(input.items) ? input.items : []).filter(
          (i) => i && typeof i.headline === "string" && i.headline.trim() && typeof i.source_url === "string" && /^https?:\/\//.test(i.source_url),
        );
        return { cls, items };
      }
      if (response.stop_reason === "refusal") return { cls, items: [], error: "declined" };
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: "Call record_signals now with what the pages support (an empty list is fine)." });
      }
    }
    return { cls, items: [], error: "did not finish" };
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError && timeLeft(deadline) < 20_000) return { cls, items: [], error: OUT_OF_TIME };
    if (error instanceof Anthropic.APIError) return { cls, items: [], error: `API ${error.status ?? "network"}` };
    return { cls, items: [], error: "unavailable" };
  }
}

/** All classes, a few at a time so a slow one doesn't hold the rest. Classes
 *  the deadline leaves no time for are reported, not searched. */
export async function refreshAllSignals(days = 5, deadline?: number, classes: readonly AssetClass[] = ASSET_CLASSES): Promise<RefreshOutcome[]> {
  const out: RefreshOutcome[] = [];
  for (let i = 0; i < classes.length; i += 4) {
    const batch = classes.slice(i, i + 4);
    if (timeLeft(deadline) < 30_000) {
      out.push(...batch.map((cls) => ({ cls, items: [], error: OUT_OF_TIME })));
      continue;
    }
    out.push(...(await Promise.all(batch.map((cls) => refreshClassSignals(cls, days, deadline)))));
  }
  return out;
}

/** The store key for a URL: scheme, www., tracking parameters and the
 *  trailing slash ignored, the path decoded. The dataset builder
 *  (supabase/tools/build_intelligence_dataset.py, signal_key) keys the same
 *  way, so a story it ships is one the daily refresh recognises. */
export function signalKey(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    let path = u.pathname;
    try {
      path = decodeURIComponent(path);
    } catch {
      /* a malformed escape stays as written */
    }
    return `${u.hostname.replace(/^www\./, "")}${path.replace(/\/+$/, "")}${u.searchParams.toString() ? `?${u.searchParams.toString()}` : ""}`.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
