import { getSessionUser } from "@/lib/auth";
import { listLeads } from "@/lib/crm";
import { opsSummaries } from "@/lib/ops-links";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { CallWorkspace } from "@/components/workspace/call-workspace";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Call workspace — LPGP Intelligence" };

export default async function WorkspacePage() {
  const [user, leads, ops] = await Promise.all([
    getSessionUser(),
    listLeads(),
    opsSummaries("lead"),
  ]);

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <SetupNotice />
      </div>
    );
  }

  return (
    <CallWorkspace leads={leads} currentUserId={user?.id ?? null} opsByLead={ops} />
  );
}
