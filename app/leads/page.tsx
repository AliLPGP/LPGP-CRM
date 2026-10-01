import { getSessionUser } from "@/lib/auth";
import { listLeads, listProfiles } from "@/lib/crm";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { LeadsTable } from "@/components/leads-table";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — LPGP Connect" };

export default async function LeadsPage() {
  const [user, leads, profiles] = await Promise.all([
    getSessionUser(),
    listLeads(),
    listProfiles(),
  ]);
  const profileLite = profiles.map((p) => ({ id: p.id, full_name: p.full_name }));

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="CRM"
        title="Leads"
        description="Every lead in the book as a filterable list. Owner-tagged so you don't cross wires."
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <LeadsTable
        leads={leads}
        currentUserId={user?.id ?? null}
        isAdmin={user?.role === "admin"}
        profiles={profileLite}
      />
    </div>
  );
}
