import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { ASSET_CLASSES, isAssetClassKey, type AssetClassKey } from "./asset-classes";
import { isoDate, nullable, num, research, str, url } from "./research";
import { STRATEGIES, STRATEGY_BY_KEY } from "./strategies";
import { INDUSTRIES, INDUSTRY_BY_CODE, INVESTOR_PRACTICES, INVESTOR_TYPES, INVESTOR_TYPE_BY_CODE, PLAN_STATUSES, PLAN_TYPES, REGIONS, REGION_BY_CODE } from "./taxonomy";

// One limited partner's investor profile, from what it publishes: type, size,
// allocation to each private asset class, the strategies, regions and
// industries it says it prefers, the ticket it writes, how it commits, and its
// stated plans for the next twelve months. Every figure carries the page that
// states it; the database function `investor_profile_upsert` drops anything
// without one and keeps money and allocation figures only from the investor's
// own documents or major press. Null is the usual answer.
//
// The record tool's input is flat (strict JSON schemas cannot carry a map
// with free keys), and `toUpsertRow` maps it onto exactly one element of the
// array `investor_profile_upsert(p)` takes — nothing else reaches the function.

/** What the batch (or the per-firm route) knows about the LP before research. */
export type InvestorInput = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  subType: string | null;
  /** Fund names the directory already holds commitments to, up to a few. */
  knownFunds: string[];
  /** Hints from the directory, shown to the researcher as what is on file. */
  investorType?: string | null;
  totalAssetsUsd?: number | null;
  altsAllocationPct?: number | null;
  commitments?: number | null;
};

/** The `investor_profiles` columns `investor_profile_upsert` accepts in `fields`. */
export const INVESTOR_PROFILE_FIELDS = [
  "investor_type",
  "aum_usd",
  "aum_as_of",
  "allocations",
  "strategy_prefs",
  "region_prefs",
  "industry_prefs",
  "ticket_min_usd",
  "ticket_max_usd",
  "practices",
  "active_in_alternatives",
  "overview",
] as const;
export type InvestorProfileField = (typeof INVESTOR_PROFILE_FIELDS)[number];

/** Source kinds; `public.source_tier` reads them (annual_report / company / filing are primary, press is press). */
export const INVESTOR_SOURCE_KINDS = ["annual_report", "company", "filing", "press", "other"] as const;
export type InvestorSourceKind = (typeof INVESTOR_SOURCE_KINDS)[number];

export type SourceRef = { url: string; name: string | null; kind: InvestorSourceKind; as_of: string | null };

export type InvestorAllocation = { class: AssetClassKey; current_pct: number | null; target_pct: number | null; current_usd: number | null; as_of: string | null };

export type InvestorPlanRow = {
  asset_class: AssetClassKey;
  status: (typeof PLAN_STATUSES)[number];
  plan_types: string[];
  strategies: string[];
  regions: string[];
  ticket_min_usd: number | null;
  ticket_max_usd: number | null;
  new_gp_relationships: boolean | null;
  funds_planned: number | null;
  note: string | null;
  source_url: string;
  source_name: string | null;
  source_kind: InvestorSourceKind;
  as_of: string | null;
};

/** One element of the array `investor_profile_upsert(p)` takes. */
export type InvestorUpsertRow = {
  company_id: string;
  research_state: "done" | "no_public_data";
  fields: Partial<{
    investor_type: string;
    aum_usd: number;
    aum_as_of: string;
    allocations: InvestorAllocation[];
    strategy_prefs: string[];
    region_prefs: string[];
    industry_prefs: string[];
    ticket_min_usd: number;
    ticket_max_usd: number;
    practices: string[];
    active_in_alternatives: boolean;
    overview: string;
  }>;
  plans: InvestorPlanRow[];
  sources: Partial<Record<InvestorProfileField, SourceRef[]>>;
};

export type InvestorResearch = { ok: true; row: InvestorUpsertRow; searches: number } | { ok: false; error: string };

const CLASS_KEYS = ASSET_CLASSES.map((c) => c.key).filter((k) => k !== "sports");
const STRATEGY_KEYS = STRATEGIES.map((s) => s.key);
const REGION_CODES = REGIONS.map((r) => r.code);
const INDUSTRY_CODES = INDUSTRIES.map((i) => i.code);
const PRACTICE_KEYS = Object.keys(INVESTOR_PRACTICES);
const INVESTOR_TYPE_CODES = INVESTOR_TYPES.map((t) => t.code);

const stringList = (values: string[]) => ({ type: "array", items: { type: "string", enum: values } });
const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: "string", enum: [...values] }, { type: "null" }] });

const SOURCE_ITEM = {
  type: "object",
  additionalProperties: false,
  properties: {
    field: { type: "string", enum: [...INVESTOR_PROFILE_FIELDS] },
    url: { type: "string" },
    name: nullable("string"),
    kind: { type: "string", enum: [...INVESTOR_SOURCE_KINDS] },
    as_of: nullable("string"),
  },
  required: ["field", "url", "name", "kind", "as_of"],
};

const TOOL: Anthropic.Beta.BetaTool = {
  name: "record_investor_profile",
  description: "Record the investor's profile and its stated plans, each value with the page that states it. Call exactly once when done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      research_state: { type: "string", enum: ["done", "no_public_data"] },
      investor_type: nullableEnum(INVESTOR_TYPE_CODES),
      aum_usd: nullable("number"),
      aum_as_of: nullable("string"),
      allocations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            class: { type: "string", enum: CLASS_KEYS },
            current_pct: nullable("number"),
            target_pct: nullable("number"),
            current_usd: nullable("number"),
            as_of: nullable("string"),
          },
          required: ["class", "current_pct", "target_pct", "current_usd", "as_of"],
        },
      },
      strategy_prefs: stringList(STRATEGY_KEYS),
      region_prefs: stringList(REGION_CODES),
      industry_prefs: stringList(INDUSTRY_CODES),
      ticket_min_usd: nullable("number"),
      ticket_max_usd: nullable("number"),
      practices: stringList(PRACTICE_KEYS),
      active_in_alternatives: nullable("boolean"),
      overview: nullable("string"),
      plans: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            asset_class: { type: "string", enum: CLASS_KEYS },
            status: { type: "string", enum: [...PLAN_STATUSES] },
            plan_types: stringList([...PLAN_TYPES]),
            strategies: stringList(STRATEGY_KEYS),
            regions: stringList(REGION_CODES),
            ticket_min_usd: nullable("number"),
            ticket_max_usd: nullable("number"),
            new_gp_relationships: nullable("boolean"),
            funds_planned: nullable("integer"),
            note: nullable("string"),
            source_url: { type: "string" },
            source_name: nullable("string"),
            source_kind: { type: "string", enum: [...INVESTOR_SOURCE_KINDS] },
            as_of: nullable("string"),
          },
          required: ["asset_class", "status", "plan_types", "strategies", "regions", "ticket_min_usd", "ticket_max_usd", "new_gp_relationships", "funds_planned", "note", "source_url", "source_name", "source_kind", "as_of"],
        },
      },
      sources: { type: "array", items: SOURCE_ITEM },
    },
    required: [
      "research_state", "investor_type", "aum_usd", "aum_as_of", "allocations", "strategy_prefs", "region_prefs", "industry_prefs",
      "ticket_min_usd", "ticket_max_usd", "practices", "active_in_alternatives", "overview", "plans", "sources",
    ],
  },
};

const vocab = (lines: string[]) => lines.map((l) => `  ${l}`).join("\n");

function systemPrompt(today: string): string {
  return `You build the public profile of one limited partner (an institutional investor) for a private-markets sales team's intelligence desk. Today is ${today}.

Ground rules:
- Use web search and fetch pages. Every value you record must come from a page you read in this run; give that page's URL as its source. A value no page states is null. Never estimate, convert or recall a figure from memory. Null is the right answer more often than not; an empty profile with research_state "no_public_data" is a fine answer.
- Sources are the investor's own documents first: its annual report, its investment policy statement, board and investment-committee papers and minutes, pacing plans, RFP and procurement notices, pension disclosure pages, its own website. Then press: FT, Reuters, Bloomberg, PEI titles (Private Equity International, Private Debt Investor, Infrastructure Investor, PERE, Venture Capital Journal, Buyouts), IPE, Pensions & Investments. Use aggregators and data vendors only to find the primary page, never as a source URL — no Preqin or PitchBook pages, no profile sites.
- Source kinds: "annual_report" for the investor's annual or quarterly report; "company" for its own website, investment policy statement, board or committee papers, pacing plans, RFP notices, disclosure pages; "filing" for a regulatory filing; "press" for the titles above; "other" for anything else. Money, allocation, ticket and active/inactive values are kept only when their source is one of the investor's own documents or press.
- Money is a plain number in full units and only in US dollars: aum_usd, ticket_min_usd, ticket_max_usd and current_usd are filled only when the page states the figure in USD. A figure stated in another currency stays null — mention it, with its currency, in the overview. Percentages are plain numbers (12.5 for 12.5%). Dates are ISO "YYYY-MM-DD" when the page gives a day, else null.
- Allocations: one entry per private asset class, only when a page states the current percentage, the target percentage or the current amount for that class. as_of is the date the figure is as of (a report date, a quarter end).
- Plans: only when the investor itself says what it will do over the next twelve months — a board paper or pacing plan with next year's commitment programme, an annual plan, an RFP, an interview with its CIO or head of private markets. One plan per asset class with status "investing" (it says it will commit), "considering" (it is reviewing or may commit) or "not_investing" (it says it will not). plan_types, strategies, regions and the ticket only as stated. funds_planned is the number of fund commitments it says it will make; new_gp_relationships whether it says it will add managers. Never derive a plan from a target allocation or from past commitments.
- Preferences (strategy_prefs, region_prefs, industry_prefs, practices) are the investor's own words placed in the vocabulary below; leave a list empty rather than guess. active_in_alternatives is false only when a page says the investor has stopped committing to alternatives; true only when a current document shows it committing; else null.
- Give a sources entry for every non-null field you record (one per field, more if several pages state it). A field without a source is dropped by the loader.
- overview: two or three factual sentences about the investor's private-markets programme, in plain words, with its source.
- When done, call record_investor_profile exactly once.

Vocabulary:
- investor_type codes:
${vocab(INVESTOR_TYPES.map((t) => `${t.code} = ${t.name}`))}
- asset classes: ${CLASS_KEYS.join(", ")}
- strategy keys (by class):
${vocab(CLASS_KEYS.map((k) => `${k}: ${STRATEGIES.filter((s) => s.classKey === k).map((s) => `${s.key} (${s.name})`).join(", ")}`))}
- region codes: ${REGIONS.map((r) => `${r.code} = ${r.name}`).join("; ")}
- industry codes: ${INDUSTRIES.map((i) => `${i.code} = ${i.name}`).join("; ")}
- practices: ${Object.entries(INVESTOR_PRACTICES).map(([k, v]) => `${k} = ${v}`).join("; ")}
- plan types: ${PLAN_TYPES.join(" | ")}`;
}

function userPrompt(lp: InvestorInput, today: string): string {
  const year = Number(today.slice(0, 4));
  const onFile: string[] = [];
  if (lp.subType) onFile.push(`directory type: ${lp.subType}`);
  if (lp.investorType) onFile.push(`investor type on file: ${lp.investorType}`);
  if (lp.totalAssetsUsd != null) onFile.push(`total assets on file: USD ${Math.round(lp.totalAssetsUsd).toLocaleString("en-US")} (the workbook's figure — record aum_usd only from a page you read)`);
  if (lp.altsAllocationPct != null) onFile.push(`alternatives allocation on file: ${lp.altsAllocationPct}% (same)`);
  if (lp.commitments) onFile.push(`${lp.commitments} fund commitments on file`);
  if (lp.knownFunds.length) onFile.push(`funds it is known to hold: ${lp.knownFunds.slice(0, 8).join("; ")}`);
  return `Investor: ${lp.name}${lp.country ? `, ${lp.country}` : ""}${lp.domain ? `\nWebsite: https://${lp.domain}` : ""}
${onFile.length ? `On file: ${onFile.join(". ")}.` : "Nothing on file beyond the name."}

Find its investor profile and its plans for the next twelve months. Plan 6–10 searches and fetch the documents that matter: "${lp.name} annual report ${year - 1} private equity allocation", "${lp.name} investment policy statement", "${lp.name} board meeting private markets pacing plan ${year}", "${lp.name} private credit commitment plan", "${lp.name} RFP private equity", "${lp.name} CIO interview private markets", plus the investor's own site. Record what the pages state and nothing more.`;
}

const list = (v: unknown, allowed: (x: string) => boolean, max = 24): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed(x)))].slice(0, max) : [];

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

const money = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n >= 0 ? n : null;
};

const pct = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n >= 0 && n <= 100 ? n : null;
};

function sourceRef(s: Record<string, unknown>): SourceRef | null {
  const u = url(s.url);
  if (!u) return null;
  const kind = typeof s.kind === "string" && (INVESTOR_SOURCE_KINDS as readonly string[]).includes(s.kind) ? (s.kind as InvestorSourceKind) : "other";
  return { url: u, name: str(s.name, 160), kind, as_of: isoDate(s.as_of) };
}

/**
 * The record tool's input as one element of `investor_profile_upsert`'s array:
 * only the columns the function accepts, only non-null values, every code
 * checked against the taxonomy, and the sources regrouped by field.
 */
export function toUpsertRow(companyId: string, input: Record<string, unknown>): InvestorUpsertRow {
  const fields: InvestorUpsertRow["fields"] = {};

  const investorType = typeof input.investor_type === "string" && INVESTOR_TYPE_BY_CODE[input.investor_type] ? input.investor_type : null;
  if (investorType) fields.investor_type = investorType;
  const aum = money(input.aum_usd);
  if (aum != null) fields.aum_usd = aum;
  const aumAsOf = isoDate(input.aum_as_of);
  if (aumAsOf) fields.aum_as_of = aumAsOf;

  const allocations: InvestorAllocation[] = [];
  const seenClass = new Set<string>();
  for (const a of Array.isArray(input.allocations) ? input.allocations : []) {
    if (!a || typeof a !== "object") continue;
    const o = a as Record<string, unknown>;
    if (!isAssetClassKey(o.class) || seenClass.has(o.class)) continue;
    const row: InvestorAllocation = { class: o.class, current_pct: pct(o.current_pct), target_pct: pct(o.target_pct), current_usd: money(o.current_usd), as_of: isoDate(o.as_of) };
    if (row.current_pct == null && row.target_pct == null && row.current_usd == null) continue;
    seenClass.add(o.class);
    allocations.push(row);
  }
  if (allocations.length) fields.allocations = allocations;

  const strategyPrefs = list(input.strategy_prefs, (k) => Boolean(STRATEGY_BY_KEY[k]));
  if (strategyPrefs.length) fields.strategy_prefs = strategyPrefs;
  const regionPrefs = list(input.region_prefs, (k) => Boolean(REGION_BY_CODE[k]));
  if (regionPrefs.length) fields.region_prefs = regionPrefs;
  const industryPrefs = list(input.industry_prefs, (k) => Boolean(INDUSTRY_BY_CODE[k]));
  if (industryPrefs.length) fields.industry_prefs = industryPrefs;

  const ticketMin = money(input.ticket_min_usd);
  const ticketMax = money(input.ticket_max_usd);
  if (ticketMin != null) fields.ticket_min_usd = ticketMin;
  if (ticketMax != null && (ticketMin == null || ticketMax >= ticketMin)) fields.ticket_max_usd = ticketMax;

  const practices = list(input.practices, (k) => PRACTICE_KEYS.includes(k));
  if (practices.length) fields.practices = practices;
  const active = bool(input.active_in_alternatives);
  if (active != null) fields.active_in_alternatives = active;
  const overview = str(input.overview, 1200);
  if (overview) fields.overview = overview;

  const plans: InvestorPlanRow[] = [];
  const seenPlan = new Set<string>();
  for (const p of Array.isArray(input.plans) ? input.plans : []) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const sourceUrl = url(o.source_url);
    if (!isAssetClassKey(o.asset_class) || !sourceUrl) continue;
    const status = typeof o.status === "string" && (PLAN_STATUSES as readonly string[]).includes(o.status) ? (o.status as InvestorPlanRow["status"]) : null;
    if (!status) continue;
    const key = `${o.asset_class}|${sourceUrl}`;
    if (seenPlan.has(key)) continue;
    seenPlan.add(key);
    const min = money(o.ticket_min_usd);
    const max = money(o.ticket_max_usd);
    const funds = num(o.funds_planned);
    plans.push({
      asset_class: o.asset_class,
      status,
      plan_types: list(o.plan_types, (k) => (PLAN_TYPES as readonly string[]).includes(k)),
      strategies: list(o.strategies, (k) => Boolean(STRATEGY_BY_KEY[k])),
      regions: list(o.regions, (k) => Boolean(REGION_BY_CODE[k])),
      ticket_min_usd: min,
      ticket_max_usd: max != null && (min == null || max >= min) ? max : null,
      new_gp_relationships: bool(o.new_gp_relationships),
      funds_planned: funds != null && Number.isInteger(funds) && funds >= 0 ? funds : null,
      note: str(o.note, 600),
      source_url: sourceUrl,
      source_name: str(o.source_name, 160),
      source_kind: typeof o.source_kind === "string" && (INVESTOR_SOURCE_KINDS as readonly string[]).includes(o.source_kind) ? (o.source_kind as InvestorSourceKind) : "other",
      as_of: isoDate(o.as_of),
    });
  }

  // Sources regrouped by field; only fields the function accepts, only ones we
  // are sending a value for (a source without a value says nothing).
  const sources: InvestorUpsertRow["sources"] = {};
  for (const s of Array.isArray(input.sources) ? input.sources : []) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const field = typeof o.field === "string" && (INVESTOR_PROFILE_FIELDS as readonly string[]).includes(o.field) ? (o.field as InvestorProfileField) : null;
    if (!field || !(field in fields)) continue;
    const ref = sourceRef(o);
    if (!ref) continue;
    const refs = (sources[field] ??= []);
    if (!refs.some((r) => r.url === ref.url)) refs.push(ref);
  }
  // The as-of date rides with the AUM figure's source.
  if (fields.aum_as_of && !sources.aum_as_of && sources.aum_usd) sources.aum_as_of = sources.aum_usd;

  const hasAnything = Object.keys(fields).length > 0 || plans.length > 0;
  return {
    company_id: companyId,
    research_state: input.research_state === "no_public_data" && !hasAnything ? "no_public_data" : "done",
    fields,
    plans,
    sources,
  };
}

export async function researchInvestor(lp: InvestorInput, opts: { today?: string; deadline?: number } = {}): Promise<InvestorResearch> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const r = await research<Record<string, unknown>>({
    system: systemPrompt(today),
    user: userPrompt(lp, today),
    tool: TOOL,
    maxSearches: 12,
    maxTokens: 20000,
    effort: "medium",
    deadline: opts.deadline,
    fetch: true,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, row: toUpsertRow(lp.id, r.data && typeof r.data === "object" ? r.data : {}), searches: r.searches };
}
