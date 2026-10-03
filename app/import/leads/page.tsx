import { getSessionUser } from "@/lib/auth";
import { listProfiles } from "@/lib/crm";
import { isOpsConfigured } from "@/lib/ops";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { LeadImportTool } from "@/components/import/lead-import-tool";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import leads — LPGP Intelligence" };

export default async function ImportLeadsPage() {
  const [user, profiles] = await Promise.all([getSessionUser(), listProfiles()]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Import leads"
        description="Drop in a list from a conference, a data provider or a colleague. Columns are matched for you, duplicates are filtered, and anything already sponsoring an event is flagged."
      />

      {!isSupabaseConfigured() ? <SetupNotice /> : null}

      <LeadImportTool
        profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
        isAdmin={user?.role === "admin"}
        opsConfigured={isOpsConfigured()}
      />
    </div>
  );
}
