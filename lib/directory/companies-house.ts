import "server-only";

/**
 * Companies House: the UK register's public API (a free key, Basic auth
 * with the key as the user name) and its document service, which serves a
 * filed set of accounts as iXBRL. Everything here returns what the register
 * states; a figure the accounts do not tag is null.
 *
 * Rate limit: 600 requests per five minutes. `chFetch` spaces calls out.
 */

const API = "https://api.company-information.service.gov.uk";
const DOCS = "https://document-api.company-information.service.gov.uk";
const MIN_GAP_MS = 550;
let last = 0;

export function companiesHouseConfigured(): boolean {
  return Boolean(process.env.COMPANIES_HOUSE_API_KEY);
}

function auth(): string {
  return "Basic " + Buffer.from(`${process.env.COMPANIES_HOUSE_API_KEY ?? ""}:`).toString("base64");
}

async function paced(): Promise<void> {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

async function chFetch(url: string, accept = "application/json"): Promise<Response> {
  await paced();
  const res = await fetch(url, { headers: { Authorization: auth(), Accept: accept }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 65_000));
    return chFetch(url, accept);
  }
  return res;
}

export type ChCompany = {
  number: string;
  name: string;
  status: string | null;
  type: string | null;
  sic: string[];
  incorporated: string | null;
  address: string | null;
};

export type ChOfficer = { name: string; role: string | null; occupation: string | null; appointed_on: string | null; resigned_on: string | null };

export type ChAccounts = {
  period_end: string | null;
  type: string | null;
  url: string | null;
  currency: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_profit: number | null;
  profit_before_tax: number | null;
  depreciation: number | null;
  amortisation: number | null;
  employees: number | null;
  net_assets: number | null;
  cash: number | null;
  creditors_over_year: number | null;
};

/** The register's own name folding: upper case, punctuation and legal suffixes off. */
export function chNameKey(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,'"()&]/g, " ")
    .replace(/\b(LIMITED|LTD|PLC|LLP|LP|HOLDINGS?|GROUP|UK|COMPANY|CO|INC|CORP)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Search the register for a company by name; the best active match, or null. */
export async function chSearch(name: string): Promise<ChCompany | null> {
  const res = await chFetch(`${API}/search/companies?q=${encodeURIComponent(name)}&items_per_page=10`);
  if (!res.ok) return null;
  const json = (await res.json()) as { items?: Record<string, unknown>[] };
  const want = chNameKey(name);
  const items = (json.items ?? []).map((it) => ({
    number: String(it.company_number ?? ""),
    name: String(it.title ?? ""),
    status: (it.company_status as string) ?? null,
    type: (it.company_type as string) ?? null,
    sic: [] as string[],
    incorporated: (it.date_of_creation as string) ?? null,
    address: (it.address_snippet as string) ?? null,
  }));
  // Exact fold first, then a fold that starts with ours, active before dissolved.
  const score = (c: ChCompany) => {
    const k = chNameKey(c.name);
    const s = k === want ? 3 : k.startsWith(want + " ") || want.startsWith(k + " ") ? 2 : 0;
    return s + (c.status === "active" ? 0.5 : 0);
  };
  const best = items.filter((c) => c.number && score(c) >= 2).sort((a, b) => score(b) - score(a))[0];
  return best ?? null;
}

export async function chProfile(number: string): Promise<ChCompany | null> {
  const res = await chFetch(`${API}/company/${number}`);
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  const addr = j.registered_office_address as Record<string, string> | undefined;
  return {
    number,
    name: String(j.company_name ?? ""),
    status: (j.company_status as string) ?? null,
    type: (j.type as string) ?? null,
    sic: Array.isArray(j.sic_codes) ? (j.sic_codes as string[]) : [],
    incorporated: (j.date_of_creation as string) ?? null,
    address: addr ? [addr.address_line_1, addr.address_line_2, addr.locality, addr.postal_code, addr.country].filter(Boolean).join(", ") : null,
  };
}

export async function chOfficers(number: string): Promise<ChOfficer[]> {
  const res = await chFetch(`${API}/company/${number}/officers?items_per_page=50`);
  if (!res.ok) return [];
  const j = (await res.json()) as { items?: Record<string, unknown>[] };
  return (j.items ?? []).map((o) => ({
    name: String(o.name ?? ""),
    role: (o.officer_role as string) ?? null,
    occupation: (o.occupation as string) ?? null,
    appointed_on: (o.appointed_on as string) ?? null,
    resigned_on: (o.resigned_on as string) ?? null,
  }));
}

/** The latest filed accounts: the document id and what it says. */
export async function chLatestAccounts(number: string): Promise<ChAccounts | null> {
  const res = await chFetch(`${API}/company/${number}/filing-history?category=accounts&items_per_page=5`);
  if (!res.ok) return null;
  const j = (await res.json()) as { items?: Record<string, unknown>[] };
  const item = (j.items ?? []).find((it) => (it.links as Record<string, string> | undefined)?.document_metadata);
  if (!item) return null;
  const links = item.links as Record<string, string>;
  const desc = item.description_values as Record<string, string> | undefined;
  const meta = await chFetch(links.document_metadata);
  if (!meta.ok) return null;
  const m = (await meta.json()) as { resources?: Record<string, unknown>; links?: { document?: string } };
  const docUrl = m.links?.document ?? `${DOCS}/document/${links.document_metadata.split("/").pop()}`;
  const hasXhtml = Boolean(m.resources && "application/xhtml+xml" in m.resources);
  if (!hasXhtml) {
    return { period_end: desc?.made_up_date ?? null, type: String(item.type ?? item.description ?? "accounts"), url: `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`, currency: null, revenue: null, gross_profit: null, operating_profit: null, profit_before_tax: null, depreciation: null, amortisation: null, employees: null, net_assets: null, cash: null, creditors_over_year: null };
  }
  const doc = await chFetch(docUrl + "/content", "application/xhtml+xml");
  if (!doc.ok) return null;
  const parsed = parseIxbrl(await doc.text());
  return {
    period_end: parsed.period_end ?? desc?.made_up_date ?? null,
    type: String(item.type ?? item.description ?? "accounts"),
    url: `https://find-and-update.company-information.service.gov.uk/company/${number}/filing-history`,
    currency: parsed.currency,
    revenue: parsed.revenue,
    gross_profit: parsed.gross_profit,
    operating_profit: parsed.operating_profit,
    profit_before_tax: parsed.profit_before_tax,
    depreciation: parsed.depreciation,
    amortisation: parsed.amortisation,
    employees: parsed.employees,
    net_assets: parsed.net_assets,
    cash: parsed.cash,
    creditors_over_year: parsed.creditors_over_year,
  };
}

// --- iXBRL ---------------------------------------------------------------

// Concept local names, across the UK GAAP taxonomies (FRS 102, FRS 101,
// IFRS, micro-entity). The first tagged fact in the current period wins.
const CONCEPTS: Record<keyof Omit<ChAccounts, "period_end" | "type" | "url" | "currency">, RegExp> = {
  revenue: /:(TurnoverRevenue|Turnover|Revenue|TurnoverGrossOperatingRevenue)$/i,
  gross_profit: /:(GrossProfitLoss)$/i,
  operating_profit: /:(OperatingProfitLoss)$/i,
  profit_before_tax: /:(ProfitLossOnOrdinaryActivitiesBeforeTax|ProfitLossBeforeTax)$/i,
  depreciation: /:(DepreciationExpense|DepreciationAmortisationImpairmentExpense|DepreciationAmortisationExpense)$/i,
  amortisation: /:(AmortisationExpense|AmortisationImpairmentExpenseIntangibleAssets)$/i,
  employees: /:(AverageNumberEmployeesDuringPeriod)$/i,
  net_assets: /:(NetAssetsLiabilities|NetAssetsLiabilitiesIncludingPensionAssetLiability)$/i,
  cash: /:(CashBankOnHand|CashCashEquivalents)$/i,
  creditors_over_year: /:(Creditors|CreditorsDueAfterOneYear)$/i,
};

type Parsed = ChAccounts;

/** Read the tagged facts of a filed set of accounts for their current period. */
export function parseIxbrl(html: string): Parsed {
  // Contexts: id -> { end, dimensional }. Facts on a context with a segment
  // are a member of a breakdown, not the whole; the whole is wanted.
  const contexts = new Map<string, { end: string | null; plain: boolean }>();
  for (const m of html.matchAll(/<xbrli:context\s+id="([^"]+)"[\s\S]*?<\/xbrli:context>/g)) {
    const body = m[0];
    const end = body.match(/<xbrli:endDate>([^<]+)<\/xbrli:endDate>/)?.[1] ?? body.match(/<xbrli:instant>([^<]+)<\/xbrli:instant>/)?.[1] ?? null;
    contexts.set(m[1], { end: end?.trim() ?? null, plain: !/<xbrli:segment>/.test(body) });
  }
  const ends = [...contexts.values()].map((c) => c.end).filter((e): e is string => Boolean(e)).sort();
  const period_end = ends.length ? ends[ends.length - 1] : null;
  const out: Parsed = { period_end, type: null, url: null, currency: null, revenue: null, gross_profit: null, operating_profit: null, profit_before_tax: null, depreciation: null, amortisation: null, employees: null, net_assets: null, cash: null, creditors_over_year: null };

  for (const m of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/g)) {
    const attrs = m[1];
    const name = attrs.match(/\bname="([^"]+)"/)?.[1];
    const ctx = attrs.match(/\bcontextRef="([^"]+)"/)?.[1];
    if (!name || !ctx) continue;
    const c = contexts.get(ctx);
    if (!c || !c.plain || (period_end && c.end !== period_end)) continue;
    const text = m[2].replace(/<[^>]+>/g, "").replace(/[,\s£$€]/g, "");
    if (!text || text === "-") continue;
    let value = Number(text);
    if (!Number.isFinite(value)) continue;
    const scale = Number(attrs.match(/\bscale="(-?\d+)"/)?.[1] ?? "0");
    if (scale) value *= 10 ** scale;
    if (/\bsign="-"/.test(attrs)) value = -value;
    const unit = attrs.match(/\bunitRef="([^"]+)"/)?.[1] ?? "";
    for (const key of Object.keys(CONCEPTS) as (keyof typeof CONCEPTS)[]) {
      if (out[key] == null && CONCEPTS[key].test(name)) {
        out[key] = key === "employees" ? Math.round(value) : value;
        if (key !== "employees" && !out.currency) out.currency = /GBP/i.test(unit) ? "GBP" : /USD/i.test(unit) ? "USD" : /EUR/i.test(unit) ? "EUR" : null;
      }
    }
  }
  return out;
}

/** EBITDA only as arithmetic on three stated figures; null when any is missing. */
export function ebitdaFrom(a: Pick<ChAccounts, "operating_profit" | "depreciation" | "amortisation">): number | null {
  if (a.operating_profit == null || a.depreciation == null) return null;
  return a.operating_profit + Math.abs(a.depreciation) + Math.abs(a.amortisation ?? 0);
}
