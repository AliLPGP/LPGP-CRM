import { getDirectoryIndex } from "@/lib/directory/index-server";
import { packIndex } from "@/lib/directory/records";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { MarketMap } from "@/components/directory/market-map";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market map — LPGP Connect" };

export default async function MarketPage() {
  const index = await getDirectoryIndex();
  const managers = index.records.filter((r) => r.providers.length).length;
  // The map needs structure, not prose: leave descriptions behind.
  const packed = packIndex({
    ...index,
    records: index.records.map((r) => ({ ...r, description: null, lines: null })),
  });
  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Intelligence database"
        title="Market map"
        description={`Who audits, administers, holds custody for, prime-brokers and raises capital for ${managers.toLocaleString("en-US")} managers — from their own Form ADV filings — and the landscape of every book by segment.`}
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <MarketMap packed={packed} />
    </div>
  );
}
