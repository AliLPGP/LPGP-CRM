import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { ASSET_CLASS_BY_KEY, fundClass } from "./asset-classes";
import { isoDate, nullable, num, research, str, url } from "./research";
import { STRATEGIES, STRATEGY_BY_KEY, strategiesInFundName } from "./strategies";
import { FUNDRAISING_STATUSES, GEOGRAPHIC_SCOPES, INDUSTRIES, INDUSTRY_BY_CODE, REGIONS, REGION_BY_CODE, regionsInText } from "./taxonomy";

// One fund's profile — the categories a desk expects (overview, industry and
// geography, fundraising, structure and terms, sustainability, series) — from
// the manager's own pages, SEC filings, LP board papers and the trade press.
// Each value carries the page that states it; `fund_details_upsert` drops a
// value without a page and keeps fees, terms and structure only from a
// primary or press source. Beside the profile, the researcher places the fund
// in the taxonomy (one strategy key, region codes, industry codes) from the
// words its documents use; those three codes are columns of their own, outside
// the upsert's element, and the job writes them separately.

export type FundInput = {
  id: string;
  name: string;
  name_filed: string | null;
  manager: { name: string; domain: string | null } | null;
  vintage: number | null;
  size_usd: number | null;
  strategy: string | null;
  form_d?: { first_sale: string | null; offering: number | null; sold: number | null; investors: number | null; min_investment: number | null; url: string | null } | null;
  target_usd?: number | null;
  vehicle_kind?: string | null;
  domicile?: string | null;
  lp_commitments?: number | null;
};

/** The `fund_details` columns `fund_details_upsert` accepts in `fields` (migration 0032). */
export const FUND_DETAIL_FIELDS = [
  "overview", "core_industry", "industry_focus", "geographic_scope", "core_geography", "geographic_exposure",
  "fundraising_status", "fundraising_launch", "target_size", "target_currency", "hard_cap", "closes", "co_investment_offered",
  "legal_structure", "term_years", "investment_period_years", "extension_years", "gp_commitment_pct", "management_fee_pct", "fee_basis",
  "carried_interest_pct", "hurdle_pct", "sfdr_article", "esg_policy", "sustainability_note", "series_name", "series_sequence",
] as const;
export type FundDetailField = (typeof FUND_DETAIL_FIELDS)[number];

/** Source kinds; `public.source_tier` reads them (sponsor / filing / annual_report / wire are primary, press is press). */
export const FUND_SOURCE_KINDS = ["sponsor", "filing", "annual_report", "wire", "press", "other"] as const;
export type FundSourceKind = (typeof FUND_SOURCE_KINDS)[number];

export type FundSourceRef = { url: string; name: string | null; kind: FundSourceKind; as_of: string | null };

export type FundClose = { label: string; date: string | null; amount: number | null; currency: string | null; estimated: boolean };

/** One element of the array `fund_details_upsert(p)` takes. */
export type FundUpsertRow = {
  fund_id: string;
  research_state: "done" | "no_public_data";
  fields: Partial<{
    overview: string;
    core_industry: string;
    industry_focus: string[];
    geographic_scope: string;
    core_geography: string;
    geographic_exposure: { region: string; pct: number | null }[];
    fundraising_status: string;
    fundraising_launch: string;
    target_size: number;
    target_currency: string;
    hard_cap: number;
    closes: FundClose[];
    co_investment_offered: boolean;
    legal_structure: string;
    term_years: number;
    investment_period_years: number;
    extension_years: number;
    gp_commitment_pct: number;
    management_fee_pct: number;
    fee_basis: string;
    carried_interest_pct: number;
    hurdle_pct: number;
    sfdr_article: string;
    esg_policy: boolean;
    sustainability_note: string;
    series_name: string;
    series_sequence: number;
  }>;
  sources: Partial<Record<FundDetailField, FundSourceRef[]>>;
};

/** The taxonomy placement, written to `fund_details` beside the upsert (migration 0033 columns). */
export type FundCodes = { strategy_code: string | null; region_codes: string[]; industry_codes: string[] };

export type FundResearch = { ok: true; row: FundUpsertRow; codes: FundCodes; searches: number } | { ok: false; error: string };

const STRATEGY_AXIS_KEYS = STRATEGIES.filter((s) => s.axis === "strategy").map((s) => s.key);
const REGION_CODES = REGIONS.map((r) => r.code);
const INDUSTRY_CODES = INDUSTRIES.map((i) => i.code);

const stringList = (values: string[]) => ({ type: "array", items: { type: "string", enum: values } });
const nullableEnum = (values: readonly string[]) => ({ anyOf: [{ type: "string", enum: [...values] }, { type: "null" }] });

const TOOL: Anthropic.Beta.BetaTool = {
  name: "record_fund_details",
  description: "Record the fund's profile, each value with the page that states it, and its place in the taxonomy. Call exactly once when done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      research_state: { type: "string", enum: ["done", "no_public_data"] },
      // Overview / investment strategy
      overview: nullable("string"),
      core_industry: nullable("string"),
      industry_focus: { type: "array", items: { type: "string" } },
      geographic_scope: nullableEnum(GEOGRAPHIC_SCOPES),
      core_geography: nullable("string"),
      geographic_exposure: {
        type: "array",
        items: { type: "object", additionalProperties: false, properties: { region: { type: "string" }, pct: nullable("number") }, required: ["region", "pct"] },
      },
      // Fundraising
      fundraising_status: nullableEnum(FUNDRAISING_STATUSES),
      fundraising_launch: nullable("string"),
      target_size: nullable("number"),
      target_currency: nullable("string"),
      hard_cap: nullable("number"),
      closes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { label: { type: "string" }, date: nullable("string"), amount: nullable("number"), currency: nullable("string"), estimated: { type: "boolean" } },
          required: ["label", "date", "amount", "currency", "estimated"],
        },
      },
      co_investment_offered: nullable("boolean"),
      // Structure and terms
      legal_structure: nullable("string"),
      term_years: nullable("integer"),
      investment_period_years: nullable("integer"),
      extension_years: nullable("integer"),
      gp_commitment_pct: nullable("number"),
      management_fee_pct: nullable("number"),
      fee_basis: nullable("string"),
      carried_interest_pct: nullable("number"),
      hurdle_pct: nullable("number"),
      // Sustainability
      sfdr_article: nullableEnum(["6", "8", "9"]),
      esg_policy: nullable("boolean"),
      sustainability_note: nullable("string"),
      // Series
      series_name: nullable("string"),
      series_sequence: nullable("integer"),
      // Taxonomy placement, from the fund's own documents
      strategy_code: nullableEnum(STRATEGY_AXIS_KEYS),
      region_codes: stringList(REGION_CODES),
      industry_codes: stringList(INDUSTRY_CODES),
      sources: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: [...FUND_DETAIL_FIELDS] },
            url: { type: "string" },
            name: nullable("string"),
            kind: { type: "string", enum: [...FUND_SOURCE_KINDS] },
            as_of: nullable("string"),
          },
          required: ["field", "url", "name", "kind", "as_of"],
        },
      },
    },
    required: [
      "research_state", "overview", "core_industry", "industry_focus", "geographic_scope", "core_geography", "geographic_exposure",
      "fundraising_status", "fundraising_launch", "target_size", "target_currency", "hard_cap", "closes", "co_investment_offered",
      "legal_structure", "term_years", "investment_period_years", "extension_years", "gp_commitment_pct", "management_fee_pct", "fee_basis",
      "carried_interest_pct", "hurdle_pct", "sfdr_article", "esg_policy", "sustainability_note", "series_name", "series_sequence",
      "strategy_code", "region_codes", "industry_codes", "sources",
    ],
  },
};

const vocab = (lines: string[]) => lines.map((l) => `  ${l}`).join("\n");

function systemPrompt(today: string): string {
  return `You build the profile of one private fund for a private-markets sales team's intelligence desk. Today is ${today}.

Ground rules:
- Use web search and fetch pages. Every value you record must come from a page you read in this run; give that page's URL as its source. A value no page states is null. Never estimate, convert or recall a figure from memory. Null is the right answer more often than not; a profile with only an overview, or none at all with research_state "no_public_data", is a fine answer.
- Sources, in order: the manager's own website and press releases; SEC filings (Form D, Form ADV); LP board and investment-committee papers that describe the fund (public pension funds publish these, and they often state fees and terms); Reuters, Bloomberg, FT, PEI titles (Private Equity International, Private Debt Investor, Infrastructure Investor, PERE), Buyouts. Use aggregators and data vendors only to find the primary page, never as a source URL — no Preqin or PitchBook pages, no profile sites.
- Source kinds: "sponsor" for the manager's own site or announcement; "filing" for an SEC or other regulatory filing and for an LP's published board or committee papers; "annual_report" for an annual or quarterly report; "wire" for a press release on a wire; "press" for the titles above; "other" for anything else.
- Fees, terms and structure (legal_structure, term_years, investment_period_years, extension_years, gp_commitment_pct, management_fee_pct, fee_basis, carried_interest_pct, hurdle_pct) only from a document that states them — an LP board paper, a filing, the manager's own document or a press report that quotes them. Never from a typical-terms assumption.
- Money is a plain number in full units in the currency the page states (1500000000 with target_currency "EUR"); never convert. The target, the hard cap and the closes share target_currency unless a close states its own. Percentages are plain numbers (2 for 2%, 20 for 20%, 8 for an 8% hurdle). Dates are ISO "YYYY-MM-DD" when the page gives a day, else null.
- closes: one entry per close the pages state (label "First close", "Second close", "Final close"…), with the amount and currency as published; estimated is true only when the page says the figure is approximate or reported rather than announced.
- fundraising_status as the newest page supports: "Raising" while open, "Final close" or "Closed" once announced, "Evergreen" for an open-ended vehicle, "Pre-marketing" only when a page says so.
- geographic_scope is one of Global, Continental, Regional, Country; core_geography and geographic_exposure in the source's own words (regions with the percentage when stated).
- sfdr_article only when the manager's own document states it. esg_policy true only when a page describes an ESG policy for this fund.
- series_name and series_sequence: the fund family and the fund's number in it, as the name or the manager states them.
- Taxonomy placement from the fund's own documents and name: strategy_code is the one strategy key that best fits how the fund invests (null when no page says); region_codes the regions it targets; industry_codes the industries it names. Place nothing the words do not say.
- Give a sources entry for every non-null field you record (one per field, more if several pages state it). A field without a source is dropped by the loader.
- overview: two or three factual sentences on what the fund does, in plain words, with its source.
- When done, call record_fund_details exactly once.

Vocabulary:
- strategy keys (by class):
${vocab(Object.keys(ASSET_CLASS_BY_KEY).map((k) => `${k}: ${STRATEGIES.filter((s) => s.classKey === k && s.axis === "strategy").map((s) => `${s.key} (${s.name})`).join(", ")}`).filter((l) => !l.endsWith(": ")))}
- region codes: ${REGIONS.map((r) => `${r.code} = ${r.name}`).join("; ")}
- industry codes: ${INDUSTRIES.map((i) => `${i.code} = ${i.name}`).join("; ")}
- fundraising statuses: ${FUNDRAISING_STATUSES.join(" | ")}`;
}

function userPrompt(fund: FundInput, today: string): string {
  const cls = fundClass(fund.name_filed ?? fund.name, null);
  const stated = cls ? strategiesInFundName(fund.name_filed ?? fund.name, cls.key).filter((s) => s.axis === "strategy").map((s) => s.key) : [];
  const onFile: string[] = [];
  if (fund.name_filed && fund.name_filed !== fund.name) onFile.push(`name as filed: ${fund.name_filed}`);
  if (fund.vintage) onFile.push(`vintage ${fund.vintage}`);
  if (fund.size_usd != null) onFile.push(`size on file USD ${Math.round(fund.size_usd).toLocaleString("en-US")} (from the filings — record target and closes only from a page you read)`);
  if (fund.target_usd != null) onFile.push(`target on file USD ${Math.round(fund.target_usd).toLocaleString("en-US")} (same)`);
  if (fund.strategy) onFile.push(`strategy on file: ${fund.strategy}`);
  if (fund.vehicle_kind) onFile.push(`vehicle: ${fund.vehicle_kind}`);
  if (fund.domicile) onFile.push(`domicile: ${fund.domicile}`);
  if (fund.lp_commitments) onFile.push(`${fund.lp_commitments} LP commitments on file`);
  if (cls) onFile.push(`asset class by its ${cls.basis}: ${cls.key}`);
  if (stated.length) onFile.push(`strategies its name states: ${stated.join(", ")}`);
  const formD = fund.form_d
    ? `Form D on file${fund.form_d.url ? ` (${fund.form_d.url})` : ""}: first sale ${fund.form_d.first_sale ?? "n/a"}, offering ${fund.form_d.offering ?? "n/a"}, sold ${fund.form_d.sold ?? "n/a"}, investors ${fund.form_d.investors ?? "n/a"}, minimum ${fund.form_d.min_investment ?? "n/a"}. You may cite that filing as a "filing" source for what it states.`
    : "";
  const manager = fund.manager ? `${fund.manager.name}${fund.manager.domain ? ` (https://${fund.manager.domain})` : ""}` : "unknown";
  const year = Number(today.slice(0, 4));
  return `Fund: ${fund.name}
Manager: ${manager}
${onFile.length ? `On file: ${onFile.join(". ")}.` : ""}
${formD}

Find this fund's profile. Plan 6–10 searches and fetch the pages that matter: the manager's own fund page or press release, "${fund.name} final close", "${fund.name} target hard cap", "${fund.name} management fee carried interest board", "${fund.name} investment committee memo pension", "${fund.name} ${year} fundraising", plus the SEC's EDGAR entry for the fund. Record what the pages state and nothing more.`;
}

const list = (v: unknown, allowed: (x: string) => boolean, max = 24): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && allowed(x)))].slice(0, max) : [];

const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

const money = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};

const pct = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n >= 0 && n <= 100 ? n : null;
};

const years = (v: unknown): number | null => {
  const n = num(v);
  return n != null && Number.isInteger(n) && n >= 0 && n <= 99 ? n : null;
};

const currency = (v: unknown): string | null => {
  const s = str(v, 3);
  return s && /^[A-Za-z]{3}$/.test(s) ? s.toUpperCase() : null;
};

function sourceRef(s: Record<string, unknown>): FundSourceRef | null {
  const u = url(s.url);
  if (!u) return null;
  const kind = typeof s.kind === "string" && (FUND_SOURCE_KINDS as readonly string[]).includes(s.kind) ? (s.kind as FundSourceKind) : "other";
  return { url: u, name: str(s.name, 160), kind, as_of: isoDate(s.as_of) };
}

/**
 * The record tool's input as one element of `fund_details_upsert`'s array —
 * only the columns the function accepts, only non-null values, sources
 * regrouped by field — and, beside it, the three taxonomy codes.
 */
export function toUpsertRow(fundId: string, input: Record<string, unknown>): { row: FundUpsertRow; codes: FundCodes } {
  const f: FundUpsertRow["fields"] = {};

  const overview = str(input.overview, 1200);
  if (overview) f.overview = overview;
  const coreIndustry = str(input.core_industry, 120);
  if (coreIndustry) f.core_industry = coreIndustry;
  const industryFocus = list(input.industry_focus, (x) => x.trim().length > 0, 12).map((x) => x.trim().slice(0, 80));
  if (industryFocus.length) f.industry_focus = industryFocus;
  const scope = typeof input.geographic_scope === "string" && (GEOGRAPHIC_SCOPES as readonly string[]).includes(input.geographic_scope) ? input.geographic_scope : null;
  if (scope) f.geographic_scope = scope;
  const coreGeography = str(input.core_geography, 160);
  if (coreGeography) f.core_geography = coreGeography;
  const exposure: { region: string; pct: number | null }[] = [];
  for (const e of Array.isArray(input.geographic_exposure) ? input.geographic_exposure : []) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const region = str(o.region, 80);
    if (!region || exposure.some((x) => x.region === region)) continue;
    exposure.push({ region, pct: pct(o.pct) });
  }
  if (exposure.length) f.geographic_exposure = exposure.slice(0, 12);

  const status = typeof input.fundraising_status === "string" && (FUNDRAISING_STATUSES as readonly string[]).includes(input.fundraising_status) ? input.fundraising_status : null;
  if (status) f.fundraising_status = status;
  const launch = isoDate(input.fundraising_launch);
  if (launch) f.fundraising_launch = launch;
  const target = money(input.target_size);
  if (target != null) f.target_size = target;
  const hardCap = money(input.hard_cap);
  if (hardCap != null) f.hard_cap = hardCap;
  const targetCurrency = currency(input.target_currency);
  if (targetCurrency && (target != null || hardCap != null)) f.target_currency = targetCurrency;
  const closes: FundClose[] = [];
  for (const c of Array.isArray(input.closes) ? input.closes : []) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    const label = str(o.label, 60);
    if (!label) continue;
    const amount = money(o.amount);
    const date = isoDate(o.date);
    if (amount == null && !date) continue;
    closes.push({ label, date, amount, currency: amount != null ? (currency(o.currency) ?? targetCurrency) : null, estimated: o.estimated === true });
  }
  if (closes.length) f.closes = closes.slice(0, 12);
  const coInvest = bool(input.co_investment_offered);
  if (coInvest != null) f.co_investment_offered = coInvest;

  const legal = str(input.legal_structure, 120);
  if (legal) f.legal_structure = legal;
  const term = years(input.term_years);
  if (term != null) f.term_years = term;
  const period = years(input.investment_period_years);
  if (period != null) f.investment_period_years = period;
  const extension = years(input.extension_years);
  if (extension != null) f.extension_years = extension;
  const gpCommit = pct(input.gp_commitment_pct);
  if (gpCommit != null) f.gp_commitment_pct = gpCommit;
  const mgmtFee = pct(input.management_fee_pct);
  if (mgmtFee != null) f.management_fee_pct = mgmtFee;
  const feeBasis = str(input.fee_basis, 80);
  if (feeBasis && mgmtFee != null) f.fee_basis = feeBasis;
  const carry = pct(input.carried_interest_pct);
  if (carry != null) f.carried_interest_pct = carry;
  const hurdle = pct(input.hurdle_pct);
  if (hurdle != null) f.hurdle_pct = hurdle;

  const sfdr = typeof input.sfdr_article === "string" && ["6", "8", "9"].includes(input.sfdr_article) ? input.sfdr_article : null;
  if (sfdr) f.sfdr_article = sfdr;
  const esg = bool(input.esg_policy);
  if (esg != null) f.esg_policy = esg;
  const sustainability = str(input.sustainability_note, 600);
  if (sustainability) f.sustainability_note = sustainability;

  const seriesName = str(input.series_name, 160);
  if (seriesName) f.series_name = seriesName;
  const seq = num(input.series_sequence);
  if (seq != null && Number.isInteger(seq) && seq > 0 && seq < 100) f.series_sequence = seq;

  // Sources regrouped by field; only fields the function accepts and that we
  // are sending a value for. The currency rides with the target's source and
  // the fee basis with the fee's, as the function expects.
  const sources: FundUpsertRow["sources"] = {};
  for (const s of Array.isArray(input.sources) ? input.sources : []) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const field = typeof o.field === "string" && (FUND_DETAIL_FIELDS as readonly string[]).includes(o.field) ? (o.field as FundDetailField) : null;
    if (!field || !(field in f)) continue;
    const ref = sourceRef(o);
    if (!ref) continue;
    const refs = (sources[field] ??= []);
    if (!refs.some((r) => r.url === ref.url)) refs.push(ref);
  }
  if (f.target_currency && !sources.target_currency) sources.target_currency = sources.target_size ?? sources.hard_cap;
  if (f.fee_basis && !sources.fee_basis && sources.management_fee_pct) sources.fee_basis = sources.management_fee_pct;
  for (const k of Object.keys(sources) as FundDetailField[]) if (!sources[k]) delete sources[k];

  const strategyCode = typeof input.strategy_code === "string" && STRATEGY_BY_KEY[input.strategy_code]?.axis === "strategy" ? input.strategy_code : null;
  const codes: FundCodes = {
    strategy_code: strategyCode,
    region_codes: list(input.region_codes, (k) => Boolean(REGION_BY_CODE[k])),
    industry_codes: list(input.industry_codes, (k) => Boolean(INDUSTRY_BY_CODE[k])),
  };

  const hasAnything = Object.keys(f).length > 0;
  return {
    row: { fund_id: fundId, research_state: input.research_state === "no_public_data" && !hasAnything ? "no_public_data" : "done", fields: f, sources },
    codes,
  };
}

/** What the fund's own name already places, for a run that found nothing: the name is a source of its own words. */
export function codesFromName(fund: Pick<FundInput, "name" | "name_filed">): FundCodes {
  const name = fund.name_filed ?? fund.name;
  const cls = fundClass(name, null);
  const stated = cls ? strategiesInFundName(name, cls.key).filter((s) => s.axis === "strategy") : [];
  return { strategy_code: stated[0]?.key ?? null, region_codes: regionsInText(name), industry_codes: [] };
}

export async function researchFund(fund: FundInput, opts: { today?: string; deadline?: number } = {}): Promise<FundResearch> {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const r = await research<Record<string, unknown>>({
    system: systemPrompt(today),
    user: userPrompt(fund, today),
    tool: TOOL,
    maxSearches: 12,
    maxTokens: 20000,
    effort: "medium",
    deadline: opts.deadline,
    fetch: true,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const { row, codes } = toUpsertRow(fund.id, r.data && typeof r.data === "object" ? r.data : {});
  // The name's own words fill a placement the pages did not give.
  const fromName = codesFromName(fund);
  return {
    ok: true,
    row,
    codes: {
      strategy_code: codes.strategy_code ?? fromName.strategy_code,
      region_codes: codes.region_codes.length ? codes.region_codes : fromName.region_codes,
      industry_codes: codes.industry_codes,
    },
    searches: r.searches,
  };
}
