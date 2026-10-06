import "server-only";
import { cache } from "react";
import { getReadClient } from "../supabase/server";
import { chunk } from "../supabase/paged";
import { getProfileCommitments } from "./profile-queries";
import type { NamedCommitment } from "./queries";
import type { CurrencyTotal } from "./lp-profile";

// Who backs a manager: the LPs that have disclosed commitments to its funds,
// grouped per LP, with what each committed (per currency, never converted),
// to how many funds, since when, and the net IRR it reports. The same rows,
// grouped per fund, give each fund its LP count.

export type Backer = {
  /** The LP's directory record, when the disclosure is linked to one. */
  id: string | null;
  name: string;
  type: string | null;
  domain: string | null;
  commitments: number;
  funds: string[];
  totals: CurrencyTotal[];
  first: number | null;
  latest: number | null;
  /** Net IRRs this LP reports for this manager's funds. */
  irrs: number[];
};

export type GpBackers = {
  backers: Backer[];
  commitments: NamedCommitment[];
  /** LPs per fund id, for the fund cards. */
  lpsByFund: Map<string, number>;
};

export const getGpBackers = cache(async (companyId: string): Promise<GpBackers> => {
  const { asGp } = await getProfileCommitments(companyId);
  const rows = asGp.filter((c) => c.source !== "sample");
  const by = new Map<string, Backer & { _totals: Map<string, CurrencyTotal>; _funds: Set<string> }>();
  const lpsByFundSets = new Map<string, Set<string>>();
  for (const c of rows) {
    const name = c.lp_label ?? c.lp_name ?? "Investor not named";
    const key = c.lp_company_id ?? `n:${name.toLowerCase()}`;
    const e =
      by.get(key) ??
      ({ id: c.lp_company_id, name, type: null, domain: null, commitments: 0, funds: [], totals: [], first: null, latest: null, irrs: [], _totals: new Map(), _funds: new Set() } as Backer & { _totals: Map<string, CurrencyTotal>; _funds: Set<string> });
    e.commitments += 1;
    const fund = c.fund_label ?? c.fund_name;
    if (fund) e._funds.add(fund);
    if (c.amount != null && c.currency) {
      const t = e._totals.get(c.currency) ?? { currency: c.currency, amount: 0, n: 0 };
      t.amount += Number(c.amount);
      t.n += 1;
      e._totals.set(c.currency, t);
    }
    if (c.commitment_year != null) {
      e.first = e.first == null ? c.commitment_year : Math.min(e.first, c.commitment_year);
      e.latest = e.latest == null ? c.commitment_year : Math.max(e.latest, c.commitment_year);
    }
    if (c.net_irr != null) e.irrs.push(Number(c.net_irr));
    by.set(key, e);
    if (c.fund_id) {
      const s = lpsByFundSets.get(c.fund_id) ?? new Set<string>();
      s.add(key);
      lpsByFundSets.set(c.fund_id, s);
    }
  }

  // The LPs' own records: their type and domain, for the cards.
  const ids = [...by.values()].map((b) => b.id).filter((v): v is string => Boolean(v));
  const supabase = getReadClient();
  if (supabase && ids.length) {
    for (const batch of chunk(ids, 150)) {
      const { data } = await supabase.from("companies").select("id, sub_type, domain").in("id", batch);
      for (const r of (data ?? []) as { id: string; sub_type: string | null; domain: string | null }[]) {
        const b = by.get(r.id);
        if (b) {
          b.type = r.sub_type;
          b.domain = r.domain;
        }
      }
    }
  }

  const backers: Backer[] = [...by.values()]
    .map(({ _totals, _funds, ...b }) => ({ ...b, funds: [..._funds], totals: [..._totals.values()].sort((a, z) => z.n - a.n || z.amount - a.amount) }))
    .sort((a, b) => b.commitments - a.commitments || (b.latest ?? 0) - (a.latest ?? 0) || a.name.localeCompare(b.name));
  return { backers, commitments: rows, lpsByFund: new Map([...lpsByFundSets].map(([k, v]) => [k, v.size])) };
});

/**
 * The same backers counted over a subset of the commitments (one asset
 * class's funds, say): commitments, funds, totals per currency, years and
 * IRRs re-added from the rows kept, the LP's type and domain carried over.
 */
export function backersOver(full: GpBackers, keep: (c: NamedCommitment) => boolean): Backer[] {
  const known = new Map(full.backers.map((b) => [b.id ?? `n:${b.name.toLowerCase()}`, b]));
  const by = new Map<string, Backer & { _totals: Map<string, CurrencyTotal>; _funds: Set<string> }>();
  for (const c of full.commitments) {
    if (!keep(c)) continue;
    const name = c.lp_label ?? c.lp_name ?? "Investor not named";
    const key = c.lp_company_id ?? `n:${name.toLowerCase()}`;
    const k = known.get(key);
    const e: Backer & { _totals: Map<string, CurrencyTotal>; _funds: Set<string> } = by.get(key) ?? {
      id: c.lp_company_id,
      name,
      type: k?.type ?? null,
      domain: k?.domain ?? null,
      commitments: 0,
      funds: [] as string[],
      totals: [] as CurrencyTotal[],
      first: null,
      latest: null,
      irrs: [] as number[],
      _totals: new Map<string, CurrencyTotal>(),
      _funds: new Set<string>(),
    };
    e.commitments += 1;
    const fund = c.fund_label ?? c.fund_name;
    if (fund) e._funds.add(fund);
    if (c.amount != null && c.currency) {
      const t = e._totals.get(c.currency) ?? { currency: c.currency, amount: 0, n: 0 };
      t.amount += Number(c.amount);
      t.n += 1;
      e._totals.set(c.currency, t);
    }
    if (c.commitment_year != null) {
      e.first = e.first == null ? c.commitment_year : Math.min(e.first, c.commitment_year);
      e.latest = e.latest == null ? c.commitment_year : Math.max(e.latest, c.commitment_year);
    }
    if (c.net_irr != null) e.irrs.push(Number(c.net_irr));
    by.set(key, e);
  }
  return [...by.values()]
    .map(({ _totals, _funds, ...b }) => ({ ...b, funds: [..._funds], totals: [..._totals.values()].sort((a, z) => z.n - a.n || z.amount - a.amount) }))
    .sort((a, b) => b.commitments - a.commitments || (b.latest ?? 0) - (a.latest ?? 0) || a.name.localeCompare(b.name));
}
