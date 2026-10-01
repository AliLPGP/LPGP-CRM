import { isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { searchDeals } from "@/lib/directory/intelligence-queries";
import { DealLedger } from "@/components/intel/deal-ledger";
import { IntelShell } from "@/components/intel/shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals — LPGP Connect" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const { class: cls } = await searchParams;
  const initialClass = isAssetClassKey(cls) ? (cls as AssetClassKey) : null;
  const initial = await searchDeals({ cls: initialClass });
  const all = initialClass ? await searchDeals({ limit: 1 }) : initial;
  return (
    <IntelShell
      crumbs={[{ label: "Deals" }]}
      title="Deals"
      description={`${all.total.toLocaleString("en-US")} sourced transactions across every asset class — fund closes, acquisitions, stake sales, financings — each with the announcement or article that states it. Amounts stay in the currency the source states and are never added across currencies.`}
    >
      <DealLedger initial={initial} initialClass={initialClass} />
    </IntelShell>
  );
}
