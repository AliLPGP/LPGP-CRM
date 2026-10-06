import "server-only";
import { cache } from "react";
import { getReadClient } from "../supabase/server";
import { foldFunds, fundKey, matchFund, type FundCard, type FundMatch } from "./fund-match";
import { performanceSample } from "./investor-queries";
import type { CompanyFund } from "./queries";

export { fundKey, matchFund, type FundMatch };

// Which portfolio companies a fund holds. A sponsor's portfolio page names the
// fund behind a holding in its own words ("Nordic Capital Evolution I",
// "PAI Europe VI", sometimes only a programme: "Foundation", "TPG Growth");
// the filings name the vehicles ("PAI Europe VI-1 FPCI", "Vista Foundation
// Fund IV, L.P."). A holding joins a fund only when the two names say the
// same thing once legal forms and parallel-vehicle suffixes are set aside.
// A programme name with no fund number joins every numbered fund of that
// programme as a programme match, and the page says so: the sponsor did not
// say which of them made the investment.

export type FundHolding = {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  sector: string | null;
  hq: string | null;
  status: string | null;
  invested_year: number | null;
  exit_year: number | null;
  fund_name: string | null;
  intel_key: string | null;
  deal_value: number | null;
  deal_currency: string | null;
  deal_value_basis: string | null;
  stake_pct: number | null;
  source_url: string | null;
  match: FundMatch;
};

const HOLDING_COLUMNS = "id, name, domain, description, sector, hq, status, invested_year, exit_year, fund_name, intel_key, deal_value, deal_currency, deal_value_basis, stake_pct, source_url";

export type ManagerHolding = Omit<FundHolding, "match">;

/** Every holding a manager's portfolio puts in a named fund, read once per request. */
export const managerHoldings = cache(async (managerId: string): Promise<ManagerHolding[]> => {
  const supabase = getReadClient();
  if (!supabase || !managerId) return [];
  const { data, error } = await supabase.from("portfolio_companies").select(HOLDING_COLUMNS).eq("gp_company_id", managerId).not("fund_name", "is", null).limit(1000);
  if (error || !data) return [];
  return data as ManagerHolding[];
});

/** The holdings that name one fund (any of its vehicles), fund matches before programme ones, newest investment first. */
export function holdingsOf(rows: ManagerHolding[], vehicles: { name: string; name_filed?: string | null }[], sponsor: string | null): FundHolding[] {
  const out: FundHolding[] = [];
  for (const r of rows) {
    let m: FundMatch | null = null;
    for (const v of vehicles) {
      const x = matchFund(r.fund_name, v, sponsor);
      if (x === "fund") {
        m = "fund";
        break;
      }
      if (x) m = x;
    }
    if (m) out.push({ ...r, match: m });
  }
  return out.sort((a, b) => (a.match === b.match ? 0 : a.match === "fund" ? -1 : 1) || (b.invested_year ?? 0) - (a.invested_year ?? 0) || a.name.localeCompare(b.name));
}

/** The companies a fund holds, as its manager's portfolio names the fund. */
export async function fundHoldings(vehicles: { name: string; name_filed?: string | null }[], manager: { id: string; name: string } | null): Promise<FundHolding[]> {
  if (!manager) return [];
  return holdingsOf(await managerHoldings(manager.id), vehicles, manager.name);
}

/** For each holding of one sponsor, the sponsor's fund its stated fund name agrees with (exact agreement only). */
export async function holdingFunds(holdings: { id: string; gp_company_id: string; gp_name: string | null; fund_name: string | null }[]): Promise<Map<string, { id: string; name: string }>> {
  const out = new Map<string, { id: string; name: string }>();
  const supabase = getReadClient();
  const wanted = holdings.filter((h) => h.fund_name);
  if (!supabase || !wanted.length) return out;
  const gps = [...new Set(wanted.map((h) => h.gp_company_id))];
  const { data, error } = await supabase.from("funds").select("id, name, name_filed, company_id").in("company_id", gps).limit(2000);
  if (error || !data) return out;
  const funds = data as { id: string; name: string; name_filed: string | null; company_id: string }[];
  for (const h of wanted) {
    const hits = funds.filter((f) => f.company_id === h.gp_company_id && matchFund(h.fund_name, f, h.gp_name) === "fund");
    // Parallel vehicles fold to one name; the shortest name (the main vehicle) stands for the fund.
    const pick = [...hits].sort((a, b) => a.name.length - b.name.length)[0];
    if (pick) out.set(h.id, { id: pick.id, name: pick.name });
  }
  return out;
}

/**
 * A manager's funds as cards: duplicate filings of one fund folded into one
 * (led by the vehicle investors report on), each with the median net IRR and
 * multiple its investors report, how many disclose a commitment, and the
 * companies the manager's portfolio puts in it.
 */
export async function fundCards(manager: { id: string; name: string }, funds: CompanyFund[], lpsByFund?: Map<string, number>): Promise<FundCard[]> {
  if (!funds.length) return [];
  const [sample, rows] = await Promise.all([performanceSample(), managerHoldings(manager.id)]);
  const ids = new Set(funds.map((f) => f.id));
  const perf = new Map(sample.rows.filter((r) => ids.has(r.fund_id)).map((r) => [r.fund_id, r]));
  const lps = lpsByFund ?? new Map<string, number>();
  const score = (f: CompanyFund) => (perf.get(f.id)?.lps ?? 0) * 100 + (lps.get(f.id) ?? 0) * 10 + (f.vintage_year ? 1 : 0);
  return foldFunds(funds, score).map(({ lead, vehicles }) => {
    const p = vehicles.map((v) => perf.get(v.id)).filter((x) => x != null).sort((a, b) => b.lps - a.lps)[0];
    const held = holdingsOf(rows, vehicles, manager.name).filter((h) => h.match === "fund");
    const statusOf = vehicles.find((v) => v.status)?.status ?? null;
    return {
      id: lead.id,
      name: lead.name,
      name_filed: lead.name_filed,
      vintage_year: lead.vintage_year ?? vehicles.find((v) => v.vintage_year)?.vintage_year ?? null,
      fund_size_usd: lead.fund_size_usd ?? vehicles.find((v) => v.fund_size_usd != null)?.fund_size_usd ?? null,
      target_size_usd: lead.target_size_usd ?? null,
      status: lead.status ?? statusOf,
      vehicles: vehicles.length,
      irr: p?.net_irr_median ?? null,
      multiple: p?.multiple_median ?? null,
      lps: Math.max(0, ...vehicles.map((v) => Math.max(lps.get(v.id) ?? 0, perf.get(v.id)?.lps ?? 0))),
      companies: held.map((h) => ({ id: h.id, name: h.name, domain: h.domain })),
    };
  });
}
