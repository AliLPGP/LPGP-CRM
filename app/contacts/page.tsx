import { Download } from "lucide-react";
import { listContacts } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { ContactsBrowser } from "@/components/contacts-browser";
import { SetupNotice } from "@/components/setup-notice";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Contacts — LPGP Connect" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const contacts = await listContacts();

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Directory"
        title="Contacts"
        description="Senior decision-makers across every firm in the book."
        actions={
          contacts.length > 0 ? (
            <Button asChild variant="outline">
              <a href="/api/export/contacts" download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
          ) : null
        }
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <ContactsBrowser
        contacts={contacts.map((c) => ({
          id: c.id,
          full_name: c.full_name,
          job_title: c.job_title,
          country: c.country,
          email: c.email,
          phone: c.phone,
          linkedin_url: c.linkedin_url,
          connectable: c.connectable ?? null,
          company: c.company ? { id: c.company.id, name: c.company.name, category: c.company.category, logo_url: null } : null,
        }))}
      />
    </div>
  );
}
