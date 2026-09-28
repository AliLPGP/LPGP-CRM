import { getFundUniverse } from "@/lib/directory/fund-universe";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { FundUniverse } from "@/components/directory/fund-universe";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Funds — LPGP Connect" };
export const dynamic = "force-dynamic";

export default async function FundsPage() {
  const data = await getFundUniverse();

  return (
    <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Intelligence database"
        title="Funds"
        description="Every private fund on file — the vehicles managers name on Form ADV Schedule D, with the auditor, administrator and custodian each filing ties them to — plus any added by hand."
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <FundUniverse data={data} />
    </div>
  );
}
