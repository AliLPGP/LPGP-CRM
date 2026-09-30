import "server-only";
import { ASSET_CLASSES, classOfGpType, fundClass, type AssetClass, type AssetClassKey } from "./asset-classes";
import { getFundUniverse, type PackedFundUniverse } from "./fund-universe";
import { getDirectoryIndex } from "./index-server";
import { isRegulatoryAum } from "./insights";
import { getClassCounts, getDeals, getSignals } from "./intelligence-queries";
import type { Deal, Signal } from "./intelligence-types";
import { filers, leagueTable, type League } from "./market";
import { PROVIDER_ROLES } from "./providers";
import { getAllDisclosedCommitments, type NamedCommitment } from "./queries";
import type { DirectoryBrand, DirectoryRecord } from "./records";

// Everything one asset-class page shows, composed from the directory index,
// the fund universe, the LP disclosures and the 0016 tables.

export type ClassFund = {
  id: string;
  name: string;
  manager: { id: string; name: string; domain: string | null } | null;
  managerName: string | null;
  kind: string | null;
  domicile: string | null;
  size: number | null;
  vintage: number | null;
  /** "name" when the fund's own name states the class, "manager" when inherited. */
  basis: "name" | "manager";
  providers: { key: string; name: string; role: string }[];
};

export type ClassPage = {
  cls: AssetClass;
  managers: DirectoryRecord[];
  /** Managers with Form ADV provider links. */
  filers: number;
  raum: { sum: number; firms: number };
  countries: [string, number][];
  leagues: League[];
  brands: DirectoryBrand[];
  funds: ClassFund[];
  fundsByName: number;
  commitments: NamedCommitment[];
  deals: Deal[];
  signals: Signal[];
  largest: DirectoryRecord[];
  newest: DirectoryRecord[];
};

function fundsFor(universe: PackedFundUniverse, key: AssetClassKey, byId: Map<string, DirectoryRecord>): { funds: ClassFund[]; byName: number } {
  const funds: ClassFund[] = [];
  let byName = 0;
  for (const f of universe.funds) {
    const manager = f[1] >= 0 ? universe.managers[f[1]] : null;
    const managerType = manager ? (byId.get(manager[0])?.subType ?? manager[4]) : null;
    const fc = fundClass(f[2], managerType);
    if (!fc || fc.key !== key) continue;
    if (fc.basis === "name") byName += 1;
    const providers: ClassFund["providers"] = [];
    for (let i = 0; i + 1 < f[10].length; i += 2) {
      const b = universe.brands[f[10][i]];
      if (b) providers.push({ key: b[0], name: b[1], role: PROVIDER_ROLES[f[10][i + 1]] ?? "other" });
    }
    funds.push({
      id: f[0],
      name: f[2],
      manager: manager ? { id: manager[0], name: manager[1], domain: manager[2] } : null,
      managerName: manager ? manager[1] : f[11],
      kind: f[3],
      domicile: f[4],
      size: f[6],
      vintage: f[7],
      basis: fc.basis,
      providers,
    });
  }
  // Named-in-name first: they are the surer placement.
  funds.sort((a, b) => (a.basis === b.basis ? a.name.localeCompare(b.name) : a.basis === "name" ? -1 : 1));
  return { funds, byName };
}

export async function getClassPage(cls: AssetClass): Promise<ClassPage> {
  const [index, universe, commitmentsAll, deals, signals] = await Promise.all([
    getDirectoryIndex(),
    getFundUniverse(),
    getAllDisclosedCommitments(),
    getDeals({ assetClass: cls.key, limit: 400 }),
    getSignals({ assetClass: cls.key, limit: 200 }),
  ]);
  const byId = new Map(index.records.map((r) => [r.id, r]));
  const managers = index.records.filter((r) => r.category === "GP" && classOfGpType(r.subType) === cls.key);
  const seenBrand = new Set<number>();
  const raum = { sum: 0, firms: 0 };
  const countries = new Map<string, number>();
  for (const m of managers) {
    if (isRegulatoryAum(m) && !(m.aumKind === "brand" && seenBrand.has(m.aum!))) {
      if (m.aumKind === "brand") seenBrand.add(m.aum!);
      raum.sum += m.aum!;
      raum.firms += 1;
    }
    if (m.country) countries.set(m.country, (countries.get(m.country) ?? 0) + 1);
  }
  const inClass = filers(managers);
  const leagues = PROVIDER_ROLES.map((role) => leagueTable(inClass, index.brands, role, 8));
  const { funds, byName } = fundsFor(universe, cls.key, byId);
  // An LP's own programme places its commitment first; a fund's name or its
  // manager's type only when the disclosure did not say.
  const commitments = commitmentsAll.filter((c) => {
    if (c.asset_class) return c.asset_class === cls.key;
    const gp = c.gp_company_id ? byId.get(c.gp_company_id) : null;
    return fundClass(c.fund_label, gp?.subType)?.key === cls.key;
  });
  const largest = [...managers].filter(isRegulatoryAum).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 12);
  const newest = [...managers].filter((m) => m.founded).sort((a, b) => (b.founded ?? 0) - (a.founded ?? 0)).slice(0, 8);
  return {
    cls,
    managers,
    filers: inClass.length,
    raum,
    countries: [...countries.entries()].sort((a, b) => b[1] - a[1]),
    leagues,
    brands: index.brands,
    funds,
    fundsByName: byName,
    commitments,
    deals,
    signals,
    largest,
    newest,
  };
}

export type ClassSummary = {
  cls: AssetClass;
  managers: number;
  raum: number;
  funds: number;
  deals: number;
  signals: number;
  top: DirectoryRecord[];
};

export async function getClassSummaries(): Promise<ClassSummary[]> {
  const [index, universe, counts] = await Promise.all([getDirectoryIndex(), getFundUniverse(), getClassCounts()]);
  const byId = new Map(index.records.map((r) => [r.id, r]));
  const fundCount = new Map<AssetClassKey, number>();
  for (const f of universe.funds) {
    const manager = f[1] >= 0 ? universe.managers[f[1]] : null;
    const fc = fundClass(f[2], manager ? (byId.get(manager[0])?.subType ?? manager[4]) : null);
    if (fc) fundCount.set(fc.key, (fundCount.get(fc.key) ?? 0) + 1);
  }
  return ASSET_CLASSES.map((cls) => {
    const managers = index.records.filter((r) => r.category === "GP" && classOfGpType(r.subType) === cls.key);
    const seen = new Set<number>();
    let raum = 0;
    for (const m of managers) {
      if (!isRegulatoryAum(m)) continue;
      if (m.aumKind === "brand") {
        if (seen.has(m.aum!)) continue;
        seen.add(m.aum!);
      }
      raum += m.aum!;
    }
    return {
      cls,
      managers: managers.length,
      raum,
      funds: fundCount.get(cls.key) ?? 0,
      deals: counts[cls.key]?.deals ?? 0,
      signals: counts[cls.key]?.signals ?? 0,
      top: [...managers].filter((m) => m.domain).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 6),
    };
  });
}
