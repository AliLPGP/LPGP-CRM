import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// The one loop every in-app research job uses: Claude searches the web with
// the server-side web_search tool and, when done, calls a `record_*` tool
// whose strict schema is the shape we store. Nothing is written from memory
// — the system prompts insist on a page for every figure — and a long
// search turn that pauses is handed back until the record call arrives.

const MODEL = "claude-opus-5-5";

export type ResearchOk<T> = { ok: true; data: T; searches: number };
export type ResearchErr = { ok: false; error: string };
export type ResearchResult<T> = ResearchOk<T> | ResearchErr;

export const RESEARCH_RULES = `Ground rules:
- Use web search. Every figure you record must come from a page you found; give that page's URL. A figure no page states is null. Never estimate or recall a number from memory. Null is the right answer more often than not.
- Prefer primary and authoritative sources: the entity's own reports and announcements, regulators, league statements, Deloitte, Forbes, Sportico, Preqin, PitchBook, Cliffwater, Cambridge Associates, MSCI/Burgiss, NCREIF, EDHECinfra, Reuters, Bloomberg, FT, WSJ, BBC, The Athletic, PEI titles.
- Money is a plain number in the currency the source states (1161000000 with currency "EUR"); never convert. Percentages are plain numbers (12.5 for 12.5%).
- Dates are ISO "YYYY-MM-DD" when the page gives a day; otherwise null with the wording in the text field.
- Factual, short headlines and notes. No marketing language.
- When done, call the record tool exactly once.`;

export function nullable(type: "string" | "number" | "integer" | "boolean") {
  return { anyOf: [{ type }, { type: "null" }] };
}

/** The moment a route must have answered by: a little inside the function's
 *  maxDuration, so a job that runs out of time reports what it saved rather
 *  than being killed mid-write. */
export function deadlineAfter(ms: number): number {
  return Date.now() + ms;
}

export function timeLeft(deadline: number | undefined): number {
  return deadline == null ? Number.POSITIVE_INFINITY : deadline - Date.now();
}

export const OUT_OF_TIME = "Out of time — run again for the rest.";

export async function research<T>(opts: {
  system: string;
  user: string;
  tool: Anthropic.Beta.BetaTool;
  maxSearches?: number;
  maxTokens?: number;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** Absolute time (ms) by which to give up; the result then says so. */
  deadline?: number;
  /** Fetch pages too (for a manager's own site); off for pure search jobs. */
  fetch?: boolean;
}): Promise<ResearchResult<T>> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "ANTHROPIC_API_KEY is not set on the server." };
  const client = new Anthropic({ timeout: opts.timeoutMs ?? 240_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.user }];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: opts.maxSearches ?? 10 },
    ...(opts.fetch ? [{ type: "web_fetch_20260209", name: "web_fetch", max_uses: 8, max_content_tokens: 30_000 } as Anthropic.Beta.BetaToolUnion] : []),
    opts.tool,
  ];
  let searches = 0;
  try {
    for (let turn = 0; turn < 8; turn++) {
      const left = timeLeft(opts.deadline);
      if (left < 15_000) return { ok: false, error: OUT_OF_TIME };
      const response = await client.beta.messages.create(
        {
          model: MODEL,
          max_tokens: opts.maxTokens ?? 16000,
          // A declined request is re-run on Anthropic's recommended fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: opts.effort ?? "medium" },
          system: opts.system,
          tools,
          messages,
        },
        Number.isFinite(left) ? { timeout: Math.min(opts.timeoutMs ?? 240_000, Math.max(5_000, left - 5_000)), maxRetries: 0 } : undefined,
      );
      searches += response.content.filter((b) => b.type === "server_tool_use").length;
      const record = response.content.find((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === opts.tool.name);
      if (record) return { ok: true, data: record.input as T, searches };
      if (response.stop_reason === "refusal") return { ok: false, error: "The research was declined." };
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: `Call ${opts.tool.name} now with what the pages support (empty fields and empty lists are fine).` });
      }
    }
    return { ok: false, error: "The research didn't finish — try again." };
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError && timeLeft(opts.deadline) < 20_000) return { ok: false, error: OUT_OF_TIME };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Research is busy — try again shortly." };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `Research failed (${error.status ?? "network"}).` };
    return { ok: false, error: "Research is unavailable." };
  }
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isoDate(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function str(v: unknown, max = 600): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

export function url(v: unknown): string | null {
  return typeof v === "string" && /^https?:\/\//.test(v) ? v.slice(0, 600) : null;
}
