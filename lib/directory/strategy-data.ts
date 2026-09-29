import "server-only";
import type { AssetClass } from "./asset-classes";
import type { ClassFund } from "./asset-class-data";
import { isRegulatoryAum } from "./insights";
import { getBenchmarks, type Benchmark } from "./intelligence-queries";
import { leagueTable } from "./market";
import type { DirectoryBrand, DirectoryRecord } from "./records";
import { STRATEGIES_BY_CLASS, strategiesInFirmText, strategiesInFundName, type Strategy } from "./strategies";

// What each strategy within a class adds up to — from the directory's own
// data (Form ADV sizes, funds, providers, geography) and from published
// benchmarks on file. Every number here is countable back to a record.

export type Quartiles = { n: number; min: number; q1: number; median: number; q3: number; max: number };

export function quartiles(values: number[]): Quartiles | null {
  const v = [...values].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const at = (p: number) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return v[lo] + (v[hi] - v[lo]) * (i - lo);
  };
  return { n: v.length, min: v[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: v[v.length - 1] };
}

export type StrategyMetrics = {
  strategy: Strategy;
  managers: DirectoryRecord[];
  /** Managers placed by their own vertical or overview. */
  managersByText: number;
  funds: ClassFund[];
  raum: { sum: number; firms: number; quartiles: Quartiles | null };
  eraShare: number | null;
  countries: [string, number][];
  administrators: { key: string; name: string; clients: number }[];
  auditors: { key: string; name: string; clients: number }[];
  benchmarks: Benchmark[];
  largest: DirectoryRecord[];
};

export type ClassMetrics = {
  cls: AssetClass;
  strategies: StrategyMetrics[];
  /** Managers in the class not placed in any strategy. */
  unplaced: number;
  classBenchmarks: Benchmark[];
  raumQuartiles: Quartiles | null;
  privateFunds: Quartiles | null;
  eraShare: number | null;
};

export async function getClassMetrics(cls: AssetClass, managers: DirectoryRecord[], funds: ClassFund[], brands: DirectoryBrand[]): Promise<ClassMetrics> {
  const benchmarks = await getBenchmarks(cls.key);
  const placed = new Set<string>();
  // Each manager's and fund's placement is worked out once, not once per
  // strategy: the regexes run over thousands of descriptions and names.
  const managerStrategies = new Map(managers.map((m) => [m.id, new Set(strategiesInFirmText(`${m.vertical ?? ""} ${m.description ?? ""}`, cls.key).map((s) => s.key))]));
  const fundStrategies = new Map(funds.map((f) => [f.id, new Set(strategiesInFundName(f.name, cls.key).map((s) => s.key))]));
  const strategies = STRATEGIES_BY_CLASS[cls.key].map((strategy) => {
    const byText = managers.filter((m) => managerStrategies.get(m.id)?.has(strategy.key));
    const sFunds = funds.filter((f) => fundStrategies.get(f.id)?.has(strategy.key));
    // A manager whose fund names state the strategy belongs too.
    const byFund = new Set(sFunds.map((f) => f.manager?.id).filter(Boolean) as string[]);
    const set = new Map<string, DirectoryRecord>();
    for (const m of byText) set.set(m.id, m);
    for (const m of managers) if (byFund.has(m.id)) set.set(m.id, m);
    const sManagers = [...set.values()];
    for (const m of sManagers) placed.add(m.id);
    const seenBrand = new Set<number>();
    const sizes: number[] = [];
    let sum = 0;
    let era = 0;
    let advKnown = 0;
    const countries = new Map<string, number>();
    for (const m of sManagers) {
      if (m.adv) {
        advKnown += 1;
        if (m.adv === "ERA") era += 1;
      }
      if (m.country) countries.set(m.country, (countries.get(m.country) ?? 0) + 1);
      if (!isRegulatoryAum(m)) continue;
      if (m.aumKind === "brand") {
        if (seenBrand.has(m.aum!)) continue;
        seenBrand.add(m.aum!);
      }
      sizes.push(m.aum!);
      sum += m.aum!;
    }
    const filers = sManagers.filter((m) => m.providers.length);
    const admins = leagueTable(filers, brands, "administrator", 5).rows.map((r) => ({ key: r.brand.key, name: r.brand.name, clients: r.clients }));
    const auditors = leagueTable(filers, brands, "auditor", 5).rows.map((r) => ({ key: r.brand.key, name: r.brand.name, clients: r.clients }));
    return {
      strategy,
      managers: sManagers.sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)),
      managersByText: byText.length,
      funds: sFunds,
      raum: { sum, firms: sizes.length, quartiles: quartiles(sizes) },
      eraShare: advKnown ? era / advKnown : null,
      countries: [...countries.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      administrators: admins,
      auditors,
      benchmarks: benchmarks.filter((b) => b.strategy === strategy.key),
      largest: sManagers.filter(isRegulatoryAum).slice(0, 5),
    };
  });
  const all: number[] = [];
  const seen = new Set<number>();
  let era = 0;
  let advKnown = 0;
  const pf: number[] = [];
  for (const m of managers) {
    if (m.adv) {
      advKnown += 1;
      if (m.adv === "ERA") era += 1;
    }
    if (m.privateFunds) pf.push(m.privateFunds);
    if (!isRegulatoryAum(m)) continue;
    if (m.aumKind === "brand") {
      if (seen.has(m.aum!)) continue;
      seen.add(m.aum!);
    }
    all.push(m.aum!);
  }
  return {
    cls,
    strategies: strategies.sort((a, b) => b.managers.length + b.funds.length - (a.managers.length + a.funds.length)),
    unplaced: managers.filter((m) => !placed.has(m.id)).length,
    classBenchmarks: benchmarks.filter((b) => !b.strategy),
    raumQuartiles: quartiles(all),
    privateFunds: quartiles(pf),
    eraShare: advKnown ? era / advKnown : null,
  };
}
