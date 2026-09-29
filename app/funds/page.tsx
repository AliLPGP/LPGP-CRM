import { getFundUniverse } from "@/lib/directory/fund-universe";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { FundUniverse } from "@/components/directory/fund-universe";
import { SetupNotice } from "@/components/setup-notice";
import { IntelShell } from "@/components/intel/shell";

export const metadata = { title: "Funds — LPGP Connect" };
export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const data = await getFundUniverse();

  return (
    <IntelShell
      crumbs={[{ label: "Funds" }]}
      title="Funds"
      description="Every private fund on file — the vehicles managers name on Form ADV Schedule D, with the auditor, administrator and custodian each filing ties them to — plus any added by hand."
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <FundUniverse data={data} />
    </IntelShell>
  );
}
