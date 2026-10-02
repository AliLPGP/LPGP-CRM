import { getSessionUser } from "@/lib/auth";
import { listLeads, listProfiles } from "@/lib/crm";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { PipelineBoard } from "@/components/pipeline-board";
import { LeadStatRow } from "@/components/lead-stats";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline — LPGP Connect" };

export default async function PipelinePage() {
  const [user, leads, profiles] = await Promise.all([
    getSessionUser(),
    listLeads(),
    listProfiles(),
  ]);
  const profileLite = profiles.map((p) => ({ id: p.id, full_name: p.full_name }));
  // Pinned once per request: the stat row and the queue read the same clock.
  const now = new Date().getTime();

  return (
    <div className="mx-auto max-w-[110rem] space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Pipeline"
        description="Your team's live deal flow. Drag a lead between stages; filter by market or owner."
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <LeadStatRow leads={leads} currentUserId={user?.id ?? null} now={now} />
      <PipelineBoard
        leads={leads}
        currentUserId={user?.id ?? null}
        isAdmin={user?.role === "admin"}
        profiles={profileLite}
      />
    </div>
  );
}
