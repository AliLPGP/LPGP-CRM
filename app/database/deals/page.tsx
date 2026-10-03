import { ASSET_CLASSES, DEAL_KIND_LABEL, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getClassCounts, searchDeals } from "@/lib/directory/intelligence-queries";
import { DealLedger } from "@/components/intel/deal-ledger";
import { IntelShell } from "@/components/intel/shell";
import { Stat, StatStrip } from "@/components/intel/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals — LPGP Intelligence" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ class?: string; kind?: string }> }) {
  const { class: cls, kind } = await searchParams;
  const initialClass = isAssetClassKey(cls) ? (cls as AssetClassKey) : null;
  // A kind the nav links to ("recently closed" = fund closes) opens the ledger on it.
  const initialKind = kind && kind in DEAL_KIND_LABEL ? kind : null;
  // The whole ledger's facets (one row, no page) give the strip its figures
  // and the class menu its counts; the first page is the cut the link asked for.
  const [initial, all, classCounts] = await Promise.all([
    searchDeals({ cls: initialClass, kind: initialKind }),
    initialClass || initialKind ? searchDeals({ limit: 1 }) : null,
    getClassCounts(),
  ]);
  const whole = all ?? initial;
  const thisYear = new Date().getUTCFullYear();
  const thisYearCount = whole.years.find(([y]) => y === thisYear)?.[1] ?? 0;
  const closes = whole.kinds.filter(([k]) => k === "fund_close" || k === "fundraise").reduce((n, [, c]) => n + c, 0);
  const classesWithDeals = ASSET_CLASSES.filter((c) => (classCounts[c.key]?.deals ?? 0) > 0).length;
  const topInvestor = whole.investors[0] ?? null;
  const span = whole.years.length ? `${Math.min(...whole.years.map(([y]) => y))}–${Math.max(...whole.years.map(([y]) => y))}` : null;

  return (
    <IntelShell
      crumbs={[{ label: "Deals" }]}
      title="Deals"
      description="Sourced transactions across every asset class — fund closes, acquisitions, stake sales, financings — each with the announcement or article that states it. Amounts stay in the currency the source states and are never added across currencies."
    >
      <StatStrip>
        <Stat label="Deals on file" value={whole.total.toLocaleString("en-US")} basis="sourced transactions, each with its page" />
        <Stat label="This year" value={thisYearCount.toLocaleString("en-US")} basis={span ? `announced ${thisYear} · ledger spans ${span}` : `announced ${thisYear}`} />
        <Stat label="Fund closes" value={closes.toLocaleString("en-US")} basis="closes and fundraising milestones" href="/database/deals?kind=fund_close" />
        <Stat label="Kinds" value={whole.kinds.length.toLocaleString("en-US")} basis="as the announcements describe them" />
        <Stat label="Asset classes" value={classesWithDeals.toLocaleString("en-US")} basis={`of ${ASSET_CLASSES.length} with a deal on file`} />
        <Stat label="Most active" value={topInvestor ? <span className="truncate text-[15px]" title={topInvestor.name}>{topInvestor.name}</span> : "—"} basis={topInvestor ? `${topInvestor.n.toLocaleString("en-US")} deals named` : "no investor named yet"} />
      </StatStrip>
      <DealLedger
        initial={initial}
        initialClass={initialClass}
        initialKind={initialKind}
        classCounts={Object.fromEntries(ASSET_CLASSES.map((c) => [c.key, classCounts[c.key]?.deals ?? 0])) as Partial<Record<AssetClassKey, number>>}
      />
    </IntelShell>
  );
}
