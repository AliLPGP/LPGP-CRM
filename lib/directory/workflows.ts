import "server-only";
import { ASSET_CLASSES, classOfGpType, type AssetClass } from "./asset-classes";
import { getClassSummaries, type ClassSummary } from "./asset-class-data";
import { getFundUniverse } from "./fund-universe";
import { getDirectoryIndex } from "./index-server";
import { isRegulatoryAum, summarize, type Insights } from "./insights";
import { commitmentClass, getAllDeals, getBenchmarks, getSignals, getTeamOwners, listSportsTeams, type Benchmark } from "./intelligence-queries";
import type { Deal, Signal, SportsTeam } from "./intelligence-types";
import { leagueTable, type League } from "./market";
import type { PortfolioCompany } from "./portfolio";
import { PROVIDER_ROLES } from "./providers";
import { getAllDisclosedCommitments, getRecentFilings, listPortfolioCompanies, type NamedCommitment } from "./queries";
import type { DirectoryBrand, DirectoryRecord } from "./records";
import { quartiles, type Quartiles } from "./strategy-data";

// The workflows: the ten jobs a private-markets desk is used for, each a
// view over the same records. Nothing here is a new dataset — every panel is
// the directory, the fund universe, the LP disclosures and the 0016 tables
// arranged for one job, so what it shows is exactly what the database holds.

export type WorkflowKey =
  | "market_intelligence"
  | "deal_sourcing"
  | "deal_execution"
  | "networking"
  | "due_diligence"
  | "fundraising"
  | "benchmarking"
  | "business_development"
  | "asset_allocation"
  | "portfolio_management";

export type Workflow = { key: WorkflowKey; slug: string; name: string; blurb: string; icon: string; /** The questions the desk answers, in the order its panels do. */ answers: string[] };

export const WORKFLOWS: Workflow[] = [
  { key: "market_intelligence", slug: "market-intelligence", name: "Market intelligence", blurb: "The market by class: managers, capital, funds, what filed and what moved this week.", icon: "search", answers: ["How big is each class, in managers and regulatory AUM?", "What moved this week — deals, news, filings?", "Where are the managers, and what kind are they?"] },
  { key: "deal_sourcing", slug: "deal-sourcing", name: "Deal sourcing", blurb: "What is transacting, who is buying, which assets have institutional money behind them.", icon: "radar", answers: ["What has transacted, by quarter and by class?", "Who is buying most often?", "Which assets already have institutional money behind them?"] },
  { key: "deal_execution", slug: "deal-execution", name: "Deal execution", blurb: "The counterparties a deal runs through: administrators, auditors, custodians, placement agents — and deals with stated terms.", icon: "handshake", answers: ["Which administrators, auditors, custodians and agents do managers actually use?", "Which deals state terms a comparable can be drawn from?"] },
  { key: "networking", slug: "networking", name: "Networking", blurb: "Who to know: the people on file, the firms with the deepest benches, the operating partners.", icon: "users", answers: ["How many people are on file, and how many can be reached?", "Which firms have the deepest benches?", "Which managers have operating partners?"] },
  { key: "due_diligence", slug: "due-diligence", name: "Due diligence", blurb: "What a manager files: registration, private funds, providers, domiciles, latest Form ADV.", icon: "clipboard", answers: ["Who is SEC-registered, exempt, or not filing?", "What do the largest managers file?", "Where are funds domiciled and in what vehicles?"] },
  { key: "fundraising", slug: "fundraising", name: "Fundraising", blurb: "The limited partners: who discloses commitments, what they committed to, the closes on record.", icon: "banknote", answers: ["Which LPs publish their commitments?", "What have they committed to, and when?", "What has closed?"] },
  { key: "benchmarking", slug: "benchmarking", name: "Benchmarking", blurb: "Published figures per class and strategy, and the size distribution of managers by class.", icon: "chart", answers: ["How are managers sized within each class?", "What do Preqin, PitchBook, Cliffwater and the rest publish, with the page?"] },
  { key: "business_development", slug: "business-development", name: "Business development", blurb: "The solution providers' market: who serves the most managers, where the white space is.", icon: "briefcase", answers: ["Which providers serve the most managers?", "What kinds of provider are there, and how large?", "Where is the white space?"] },
  { key: "asset_allocation", slug: "asset-allocation", name: "Asset allocation", blurb: "Where disclosed LP capital goes by class, and which LPs disclose the most.", icon: "pie", answers: ["Where does disclosed LP capital go, by class and by year?", "Which LPs disclose the most?", "Who are the largest allocators?"] },
  { key: "portfolio_management", slug: "portfolio-management", name: "Portfolio management", blurb: "Portfolio companies on file: who owns what, sectors, holding periods, exits.", icon: "folder", answers: ["Which portfolio companies are on file, and who owns them?", "When were they bought, and which have exited?", "Which sectors?"] },
];

export const WORKFLOW_BY_SLUG: Record<string, Workflow> = Object.fromEntries(WORKFLOWS.map((w) => [w.slug, w]));

export type Count = { key: string; count: number };

const top = (m: Map<string, number>, n = 8): Count[] =>
  [...m.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
const bump = (m: Map<string, number>, k: string | null | undefined, by = 1) => {
  if (k) m.set(k, (m.get(k) ?? 0) + by);
};

export type Series = { label: string; value: number; hint?: string }[];

/** Counts per quarter over the last `n` quarters, oldest first, from ISO dates. */
function byQuarter(dates: (string | null)[], n = 8): Series {
  const now = new Date();
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i * 3, 1));
    keys.push(`${d.getUTCFullYear()}Q${Math.floor(d.getUTCMonth() / 3) + 1}`);
  }
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const iso of dates) {
    if (!iso) continue;
    const k = `${iso.slice(0, 4)}Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
    if (counts.has(k)) counts.set(k, counts.get(k)! + 1);
  }
  return keys.map((k) => ({ label: k.replace(/^(\d{2})(\d{2})Q/, "$2 Q"), value: counts.get(k)! }));
}

/** Counts per year over the last `n` years, oldest first. */
function byYear(years: (number | null)[], n = 8): Series {
  const last = new Date().getUTCFullYear();
  const counts = new Map<number, number>();
  for (let y = last - n + 1; y <= last; y++) counts.set(y, 0);
  for (const y of years) if (y != null && counts.has(y)) counts.set(y, counts.get(y)! + 1);
  return [...counts.entries()].map(([y, value]) => ({ label: String(y), value }));
}

export type WorkflowData = {
  workflow: Workflow;
  insights: Insights;
  // Series for the charts: drawn to scale from the rows below.
  dealsByQuarter: Series;
  dealsByClass: Count[];
  managersByClass: Count[];
  commitmentsByYear: Series;
  commitmentsByClass: Count[];
  portcosByYear: Series;
  peopleByBook: Count[];
  records: DirectoryRecord[];
  brands: DirectoryBrand[];
  classes: ClassSummary[];
  domainOf: (companyId: string | null) => string | null;
  // Market intelligence
  signals: Signal[];
  filings: { id: string; name: string; domain: string | null; sub_type: string | null; adv_last_filed: string | null }[];
  // Deal sourcing
  deals: Deal[];
  activeInvestors: { name: string; deals: number; companyId: string | null; investorId: string | null; classes: string[] }[];
  closes: Deal[];
  backedClubs: (SportsTeam & { investors: string[] })[];
  dealKinds: Count[];
  // Deal execution
  leagues: League[];
  termedDeals: Deal[];
  // Networking
  deepestBench: DirectoryRecord[];
  operatorFirms: DirectoryRecord[];
  // Due diligence
  managers: DirectoryRecord[];
  registration: { registered: number; era: number; unfiled: number };
  domiciles: Count[];
  vehicles: Count[];
  // Fundraising
  commitments: NamedCommitment[];
  lpTypes: Count[];
  disclosingLps: DirectoryRecord[];
  largestLps: DirectoryRecord[];
  // Benchmarking
  benchmarks: Benchmark[];
  sizeByClass: { cls: AssetClass; q: Quartiles | null; era: number | null }[];
  // Business development
  spTypes: Count[];
  topProviders: DirectoryRecord[];
  largestSps: DirectoryRecord[];
  // Asset allocation
  allocation: { cls: AssetClass; commitments: number; usd: number; usdCount: number; lps: number }[];
  topDisclosers: { name: string; id: string | null; commitments: number; classes: string[] }[];
  // Portfolio management
  portcos: (PortfolioCompany & { gp: DirectoryRecord | null })[];
  portcoOwners: DirectoryRecord[];
  sectors: Count[];
  portcoStatus: Count[];
};

export async function getWorkflow(workflow: Workflow): Promise<WorkflowData> {
  const [index, universe, classes, deals, signals, filings, commitments, benchmarksByClass, teams, portcosRaw] = await Promise.all([
    getDirectoryIndex(),
    getFundUniverse(),
    getClassSummaries(),
    getAllDeals(),
    getSignals({ limit: 200 }),
    getRecentFilings(12),
    getAllDisclosedCommitments(),
    Promise.all(ASSET_CLASSES.map((c) => getBenchmarks(c.key))),
    listSportsTeams(),
    listPortfolioCompanies(400),
  ]);
  const records = index.records;
  const byId = new Map(records.map((r) => [r.id, r]));
  const domainOf = (id: string | null) => (id ? (byId.get(id)?.domain ?? null) : null);
  const insights = summarize(records);
  const managers = records.filter((r) => r.category === "GP");
  const lps = records.filter((r) => r.category === "LP");
  const sps = records.filter((r) => r.category === "SP");

  // Deal sourcing
  const investorMap = new Map<string, { name: string; deals: number; companyId: string | null; investorId: string | null; classes: Set<string> }>();
  const dealKinds = new Map<string, number>();
  for (const d of deals) {
    const k = d.investor.toLowerCase();
    const e = investorMap.get(k) ?? { name: d.investor, deals: 0, companyId: d.investor_company_id, investorId: d.investor_id, classes: new Set<string>() };
    e.deals += 1;
    e.classes.add(d.asset_class);
    investorMap.set(k, e);
    bump(dealKinds, d.kind);
  }
  const activeInvestors = [...investorMap.values()]
    .sort((a, b) => b.deals - a.deals || a.name.localeCompare(b.name))
    .slice(0, 12)
    .map((e) => ({ ...e, classes: [...e.classes] }));
  const closes = deals.filter((d) => d.kind === "fund_close" || d.kind === "fundraise").slice(0, 20);
  const owners = await getTeamOwners(teams.map((t) => t.id));
  const instByTeam = new Map<string, string[]>();
  for (const o of owners) if (o.institutional) instByTeam.set(o.team_id, [...(instByTeam.get(o.team_id) ?? []), o.name]);
  const backedClubs = teams
    .filter((t) => instByTeam.has(t.id))
    .map((t) => ({ ...t, investors: instByTeam.get(t.id)! }))
    .sort((a, b) => (b.valuation ?? 0) - (a.valuation ?? 0))
    .slice(0, 12);

  // Deal execution
  const filers = managers.filter((m) => m.providers.length);
  const leagues = PROVIDER_ROLES.map((role) => leagueTable(filers, index.brands, role, 8));
  const termedDeals = deals.filter((d) => d.amount != null && (d.valuation != null || d.stake_pct != null)).slice(0, 25);

  // Networking
  const deepestBench = [...records].sort((a, b) => b.contacts - a.contacts).slice(0, 15);
  const operatorFirms = managers.filter((m) => m.operators > 0).sort((a, b) => b.operators - a.operators).slice(0, 12);

  // Due diligence
  const registration = {
    registered: managers.filter((m) => m.adv === "Registered").length,
    era: managers.filter((m) => m.adv === "ERA").length,
    unfiled: managers.filter((m) => !m.adv).length,
  };
  const domiciles = new Map<string, number>();
  const vehicles = new Map<string, number>();
  for (const f of universe.funds) {
    bump(domiciles, f[4]);
    bump(vehicles, f[3]);
  }

  // Fundraising
  const lpTypes = new Map<string, number>();
  for (const lp of lps) bump(lpTypes, lp.subType ?? "Unclassified");
  const disclosingLps = lps.filter((l) => l.discloses).sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 15);
  const largestLps = [...lps].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0)).slice(0, 15);

  // Benchmarking
  const sizeByClass = ASSET_CLASSES.map((cls) => {
    const inClass = managers.filter((m) => classOfGpType(m.subType) === cls.key);
    const seen = new Set<number>();
    const sizes: number[] = [];
    let era = 0;
    let known = 0;
    for (const m of inClass) {
      if (m.adv) {
        known += 1;
        if (m.adv === "ERA") era += 1;
      }
      if (!isRegulatoryAum(m)) continue;
      if (m.aumKind === "brand") {
        if (seen.has(m.aum!)) continue;
        seen.add(m.aum!);
      }
      sizes.push(m.aum!);
    }
    return { cls, q: quartiles(sizes), era: known ? era / known : null };
  });

  // Business development
  const spTypes = new Map<string, number>();
  for (const sp of sps) bump(spTypes, sp.subType ?? "Unclassified");
  const topProviders = [...sps].filter((s) => s.clientCount > 0).sort((a, b) => b.clientCount - a.clientCount).slice(0, 15);
  const largestSps = [...sps].filter((s) => s.employees).sort((a, b) => (b.employees ?? 0) - (a.employees ?? 0)).slice(0, 12);

  // Asset allocation
  const alloc = new Map<string, { commitments: number; usd: number; usdCount: number; lps: Set<string> }>();
  const disclosers = new Map<string, { name: string; id: string | null; commitments: number; classes: Set<string> }>();
  for (const c of commitments) {
    const gp = c.gp_company_id ? byId.get(c.gp_company_id) : null;
    const cls = commitmentClass({ ...c, gp_type: gp?.subType ?? null });
    const lpKey = c.lp_company_id ?? (c.lp_label ?? "").toLowerCase();
    if (cls) {
      const e = alloc.get(cls) ?? { commitments: 0, usd: 0, usdCount: 0, lps: new Set<string>() };
      e.commitments += 1;
      if (c.amount_usd != null) {
        e.usd += Number(c.amount_usd);
        e.usdCount += 1;
      }
      if (lpKey) e.lps.add(lpKey);
      alloc.set(cls, e);
    }
    if (lpKey) {
      const d = disclosers.get(lpKey) ?? { name: c.lp_label ?? "Unnamed LP", id: c.lp_company_id, commitments: 0, classes: new Set<string>() };
      d.commitments += 1;
      if (cls) d.classes.add(cls);
      disclosers.set(lpKey, d);
    }
  }
  const allocation = ASSET_CLASSES.map((cls) => {
    const e = alloc.get(cls.key);
    return { cls, commitments: e?.commitments ?? 0, usd: e?.usd ?? 0, usdCount: e?.usdCount ?? 0, lps: e?.lps.size ?? 0 };
  });
  const topDisclosers = [...disclosers.values()]
    .sort((a, b) => b.commitments - a.commitments)
    .slice(0, 15)
    .map((d) => ({ ...d, classes: [...d.classes] }));

  // Portfolio management
  const portcos = portcosRaw.map((p) => ({ ...p, gp: byId.get(p.gp_company_id) ?? null }));
  const portcoOwners = managers.filter((m) => m.portcos > 0).sort((a, b) => b.portcos - a.portcos).slice(0, 15);
  const sectors = new Map<string, number>();
  const portcoStatus = new Map<string, number>();
  for (const p of portcosRaw) {
    bump(sectors, p.sector);
    bump(portcoStatus, p.status ?? "unknown");
  }

  const dealsByClass = new Map<string, number>();
  for (const d of deals) bump(dealsByClass, d.asset_class);
  const managersByClass = new Map<string, number>();
  for (const m of managers) bump(managersByClass, classOfGpType(m.subType) ?? "");
  const commitmentsByClass = new Map<string, number>();
  for (const [k, e] of alloc) commitmentsByClass.set(k, e.commitments);
  const peopleByBook = new Map<string, number>();
  for (const r of records) bump(peopleByBook, r.category, r.contacts);

  return {
    workflow,
    insights,
    dealsByQuarter: byQuarter(deals.map((d) => d.date)),
    dealsByClass: top(dealsByClass, 8),
    managersByClass: top(managersByClass, 8).filter((c) => c.key),
    commitmentsByYear: byYear(commitments.map((c) => c.commitment_year ?? (c.commitment_date ? Number(c.commitment_date.slice(0, 4)) : null))),
    commitmentsByClass: top(commitmentsByClass, 8),
    portcosByYear: byYear(portcosRaw.map((p) => p.invested_year), 10),
    peopleByBook: top(peopleByBook, 4),
    records,
    brands: index.brands,
    classes,
    domainOf,
    signals,
    filings,
    deals,
    activeInvestors,
    closes,
    backedClubs,
    dealKinds: top(dealKinds, 12),
    leagues,
    termedDeals,
    deepestBench,
    operatorFirms,
    managers,
    registration,
    domiciles: top(domiciles, 10),
    vehicles: top(vehicles, 8),
    commitments,
    lpTypes: top(lpTypes, 10),
    disclosingLps,
    largestLps,
    benchmarks: benchmarksByClass.flat(),
    sizeByClass,
    spTypes: top(spTypes, 12),
    topProviders,
    largestSps,
    allocation,
    topDisclosers,
    portcos,
    portcoOwners,
    sectors: top(sectors, 12),
    portcoStatus: top(portcoStatus, 5),
  };
}
