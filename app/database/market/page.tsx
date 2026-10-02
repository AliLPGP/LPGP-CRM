import { preload } from "react-dom";
import { getDirectoryOverview } from "@/lib/directory/index-server";
import { indexUrl } from "@/lib/directory/records";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { MarketMap } from "@/components/directory/market-map";
import { IntelShell } from "@/components/intel/shell";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Market map — LPGP Connect" };

// The map reads the same index Discover does, from the same browser-side
// cache: a reader coming from Discover has it already, and one landing here
// first fetches it once for both.

export default async function MarketPage() {
  const overview = await getDirectoryOverview();
  preload(indexUrl(overview.version), { as: "fetch", crossOrigin: "anonymous" });
  const managers = overview.insights.filers;
  return (
    <IntelShell
      crumbs={[{ label: "Service providers" }]}
      title="Service providers"
      description={`Who audits, administers, holds custody for, prime-brokers and raises capital for ${managers.toLocaleString("en-US")} managers — from their own Form ADV filings — and the landscape of every book by segment.`}
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <MarketMap version={overview.version} />
    </IntelShell>
  );
}
