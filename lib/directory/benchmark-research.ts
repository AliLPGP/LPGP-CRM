import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { type AssetClass } from "./asset-classes";
import { isoDate, nullable, num, research, RESEARCH_RULES, slugify, str, url } from "./research";
import { STRATEGIES_BY_CLASS } from "./strategies";

// Published benchmark figures for an asset class and its strategies —
// fundraising totals, dry powder, index returns, median IRRs, default
// rates, spreads — each with publisher, period and the page it appears on.

export type BenchmarkRow = {
  external_key: string;
  asset_class: string;
  strategy: string | null;
  metric: string;
  label: string;
  value: number | null;
  unit: string | null;
  period: string | null;
  geography: string | null;
  publisher: string | null;
  published_on: string | null;
  source_url: string;
  note: string | null;
  source: "web_research";
};

const METRICS = ["fundraising_total", "dry_powder", "aum", "median_net_irr", "index_return", "default_rate", "spread_bps", "deal_volume", "fund_count", "other"];
/** Money units are the currency the publisher states; a figure in a currency
 *  not listed is recorded as "other" with the currency named in the note. */
export const BENCHMARK_UNITS = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD", "SGD", "HKD", "CNY", "INR", "KRW", "SEK", "NOK", "DKK", "BRL", "ZAR", "AED", "SAR", "pct", "bps", "x", "count", "other"];

function tool(strategyKeys: string[]): Anthropic.Beta.BetaTool {
  return {
    name: "record_benchmarks",
    description: "Record the published benchmark figures found. Call exactly once when done.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        figures: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              // JSON Schema forbids an empty enum: a class with no strategies
              // (sports) records class-level figures only.
              strategy: strategyKeys.length ? { anyOf: [{ type: "string", enum: strategyKeys }, { type: "null" }] } : { type: "null" },
              metric: { type: "string", enum: METRICS },
              label: { type: "string" },
              value: nullable("number"),
              unit: { anyOf: [{ type: "string", enum: BENCHMARK_UNITS }, { type: "null" }] },
              period: nullable("string"),
              geography: nullable("string"),
              publisher: { type: "string" },
              published_on: nullable("string"),
              source_url: { type: "string" },
              note: nullable("string"),
            },
            required: ["strategy", "metric", "label", "value", "unit", "period", "geography", "publisher", "published_on", "source_url", "note"],
          },
        },
      },
      required: ["figures"],
    },
  };
}

export async function researchBenchmarks(cls: AssetClass, opts: { deadline?: number } = {}): Promise<{ rows: BenchmarkRow[]; error?: string; searches: number }> {
  const strategies = STRATEGIES_BY_CLASS[cls.key];
  const hints = strategies.map((s) => `- ${s.key} (${s.name}): ${s.benchmarks.join("; ")}`).join("\n");
  const system = `You collect published market benchmarks for a private-markets sales team's intelligence desk. ${RESEARCH_RULES}
Record each figure once, with: the strategy it belongs to (or null for the whole asset class), the metric type, the publisher's own wording as label, the numeric value (a percentage as 12.5, money as a plain number in its currency, spreads in basis points), the unit (the currency the publisher states, or "other" with the currency named in the note when it is not in the list), the period it covers, the geography, the publisher, the publication date and the page URL. Prefer the newest edition of each series; include the prior year's figure too when the same page states it (as a separate row with its own period). Record every figure the pages state and nothing more: fewer well-sourced rows beat a full list.`;
  const user = `Asset class: ${cls.name}. ${cls.blurb}
Find the latest published figures (2025–2026 editions) for the class as a whole — fundraising totals, dry powder, AUM, deal volume, median net IRR by vintage, index returns${strategies.length ? ` — and for these strategies:\n${hints}` : "."}
Plan 8–12 searches, e.g. "${cls.name} fundraising 2025 Preqin", "${cls.name} dry powder 2026 PitchBook", "${cls.name} median net IRR 2025"${strategies.length ? ", plus one or two per strategy from the hints" : ""}.`;
  const r = await research<{ figures: Record<string, unknown>[] }>({ system, user, tool: tool(strategies.map((s) => s.key)), maxSearches: 14, effort: "medium", deadline: opts.deadline });
  if (!r.ok) return { rows: [], error: r.error, searches: 0 };
  const rows: BenchmarkRow[] = [];
  const seen = new Set<string>();
  for (const f of Array.isArray(r.data.figures) ? r.data.figures : []) {
    const source_url = url(f.source_url);
    const label = str(f.label, 200);
    const metric = typeof f.metric === "string" && METRICS.includes(f.metric) ? f.metric : "other";
    if (!source_url || !label) continue;
    const strategy = typeof f.strategy === "string" && strategies.some((s) => s.key === f.strategy) ? f.strategy : null;
    const period = str(f.period, 60);
    const publisher = str(f.publisher, 120) ?? "unknown";
    const key = `${cls.key}:${strategy ?? "all"}:${metric}:${slugify(period ?? "na")}:${slugify(publisher)}:${slugify(label).slice(0, 40)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      external_key: key,
      asset_class: cls.key,
      strategy,
      metric,
      label,
      value: num(f.value),
      unit: str(f.unit, 8),
      period,
      geography: str(f.geography, 80),
      publisher,
      published_on: isoDate(f.published_on),
      source_url,
      note: str(f.note, 400),
      source: "web_research",
    });
  }
  return { rows, searches: r.searches };
}
