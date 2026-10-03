import "server-only";
import { cache } from "react";
import { getReadClient } from "../supabase/server";
import { chunk } from "../supabase/paged";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, type AssetClassKey } from "./asset-classes";
import { commitmentClass } from "./intelligence-queries";
import { performanceSample, type FundPerformanceRow } from "./investor-queries";
import { getProfileCommitments } from "./profile-queries";
import type { NamedCommitment } from "./queries";

// An LP's book, read from what it has disclosed: its commitments placed in
// their asset classes, the managers behind them, and how each fund has done
// as the LP itself (and the other LPs that hold it) report it. Nothing here
// is estimated: a commitment with no stated amount counts as a fund, not as
// money; amounts stay in their own currency; a fund with no reported figure
// has no performance.

export type LpCommitment = NamedCommitment & {
  /** Where the commitment sits: the LP's own programme, else the fund's name, else the manager's type. */
  cls: AssetClassKey | null;
  /** What the LPs that hold this fund report, across all of them. */
  sample: FundPerformanceRow | null;
};

export type CurrencyTotal = { currency: string; amount: number; n: number };

export type LpClassSummary = {
  key: AssetClassKey;
  name: string;
  slug: string;
  commitments: number;
  funds: number;
  managers: number;
  /** Stated amounts, summed within each currency only. */
  totals: CurrencyTotal[];
  /** Commitments where the LP states a net IRR, and the median of those. */
  withIrr: number;
  medianIrr: number | null;
  medianMultiple: number | null;
  latestYear: number | null;
  rows: LpCommitment[];
};

export type LpBook = {
  all: LpCommitment[];
  classes: LpClassSummary[];
  /** Commitments no page places in a class. */
  unplaced: number;
  managers: number;
  funds: number;
  withPerformance: number;
  totals: CurrencyTotal[];
  latestYear: number | null;
};

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function totalsOf(rows: LpCommitment[]): CurrencyTotal[] {
  const by = new Map<string, CurrencyTotal>();
  for (const c of rows) {
    if (c.amount == null || !c.currency) continue;
    const e = by.get(c.currency) ?? { currency: c.currency, amount: 0, n: 0 };
    e.amount += Number(c.amount);
    e.n += 1;
    by.set(c.currency, e);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.amount - a.amount);
}

const distinct = (rows: LpCommitment[], key: (c: LpCommitment) => string | null) => new Set(rows.map(key).filter((v): v is string => Boolean(v))).size;

function summarise(key: AssetClassKey, rows: LpCommitment[]): LpClassSummary {
  const meta = ASSET_CLASS_BY_KEY[key];
  const irr = rows.map((c) => c.net_irr).filter((v): v is number => v != null).map(Number);
  const mult = rows.map((c) => c.multiple).filter((v): v is number => v != null).map(Number);
  return {
    key,
    name: meta.name,
    slug: meta.slug,
    commitments: rows.length,
    funds: distinct(rows, (c) => c.fund_id ?? (c.fund_label ? `n:${c.fund_label.toLowerCase()}` : null)),
    managers: distinct(rows, (c) => c.gp_company_id ?? (c.gp_label ? `n:${c.gp_label.toLowerCase()}` : null)),
    totals: totalsOf(rows),
    withIrr: irr.length,
    medianIrr: median(irr),
    medianMultiple: median(mult),
    latestYear: rows.reduce<number | null>((y, c) => (c.commitment_year != null && (y == null || c.commitment_year > y) ? c.commitment_year : y), null),
    rows,
  };
}

/** The LP's disclosed book, placed and scored. Empty for a firm with no disclosed commitment. */
export const getLpBook = cache(async (companyId: string): Promise<LpBook> => {
  const { asLp } = await getProfileCommitments(companyId);
  const disclosed = asLp.filter((c) => c.source !== "sample");
  const empty: LpBook = { all: [], classes: [], unplaced: 0, managers: 0, funds: 0, withPerformance: 0, totals: [], latestYear: null };
  if (!disclosed.length) return empty;

  // The manager's directory type places a commitment whose fund name and
  // programme say nothing; one read for every manager in the book.
  const supabase = getReadClient();
  const gpType = new Map<string, string | null>();
  const gpIds = [...new Set(disclosed.map((c) => c.gp_company_id).filter((v): v is string => Boolean(v)))];
  if (supabase && gpIds.length) {
    for (const ids of chunk(gpIds, 150)) {
      const { data } = await supabase.from("companies").select("id, sub_type").in("id", ids);
      for (const r of (data ?? []) as { id: string; sub_type: string | null }[]) gpType.set(r.id, r.sub_type);
    }
  }
  const { rows: sample } = await performanceSample();
  const perf = new Map(sample.map((r) => [r.fund_id, r]));

  const all: LpCommitment[] = disclosed.map((c) => ({
    ...c,
    cls: commitmentClass({ ...c, gp_type: c.gp_company_id ? gpType.get(c.gp_company_id) : null }),
    sample: c.fund_id ? (perf.get(c.fund_id) ?? null) : null,
  }));
  const byClass = new Map<AssetClassKey, LpCommitment[]>();
  for (const c of all) if (c.cls) byClass.set(c.cls, [...(byClass.get(c.cls) ?? []), c]);
  const classes = ASSET_CLASSES.filter((k) => byClass.has(k.key))
    .map((k) => summarise(k.key, byClass.get(k.key)!))
    .sort((a, b) => b.commitments - a.commitments);
  return {
    all,
    classes,
    unplaced: all.filter((c) => !c.cls).length,
    managers: distinct(all, (c) => c.gp_company_id ?? (c.gp_label ? `n:${c.gp_label.toLowerCase()}` : null)),
    funds: distinct(all, (c) => c.fund_id ?? (c.fund_label ? `n:${c.fund_label.toLowerCase()}` : null)),
    withPerformance: all.filter((c) => c.net_irr != null || c.multiple != null || c.sample?.net_irr_median != null).length,
    totals: totalsOf(all),
    latestYear: all.reduce<number | null>((y, c) => (c.commitment_year != null && (y == null || c.commitment_year > y) ? c.commitment_year : y), null),
  };
});
