import { isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getAllDeals } from "@/lib/directory/intelligence-queries";
import { DealLedger } from "@/components/intel/deal-ledger";
import { IntelShell } from "@/components/intel/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals — LPGP Connect" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const [{ class: cls }, deals] = await Promise.all([searchParams, getAllDeals()]);
  const currencies = new Set(deals.map((d) => d.currency).filter(Boolean)).size;
  return (
    <IntelShell
      crumbs={[{ label: "Deals" }]}
      title="Deals"
      description={`${deals.length.toLocaleString("en-US")} sourced transactions across every asset class — fund closes, acquisitions, stake sales, financings — each with the announcement or article that states it. Amounts stay in their own currency (${currencies} on file) and are never added across currencies.`}
    >
      <DealLedger deals={deals} initialClass={isAssetClassKey(cls) ? (cls as AssetClassKey) : null} />
    </IntelShell>
  );
}
