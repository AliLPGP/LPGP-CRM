import { getFundUniverse } from "@/lib/directory/fund-universe";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { FundUniverseLoader } from "@/components/directory/fund-universe-loader";
import { SetupNotice } from "@/components/setup-notice";
import { IntelShell } from "@/components/intel/shell";

export const metadata = { title: "Funds — LPGP Connect" };
export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const data = await getFundUniverse();
  // The first paint carries the best-documented slice (the universe is
  // sorted that way); the rest arrives from the API once the page is up.
  const FIRST = 3000;
  const initial = data.funds.length > FIRST ? { ...data, funds: data.funds.slice(0, FIRST) } : data;

  return (
    <IntelShell
      crumbs={[{ label: "Funds" }]}
      title="Funds"
      description="Every private fund on file — the vehicles managers name on Form ADV Schedule D, with the auditor, administrator and custodian each filing ties them to — plus any added by hand."
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <FundUniverseLoader initial={initial} total={data.funds.length} />
    </IntelShell>
  );
}
