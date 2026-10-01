import { Download } from "lucide-react";
import { searchContacts } from "@/lib/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { ContactsBrowser } from "@/components/contacts-browser";
import { SetupNotice } from "@/components/setup-notice";
import { IntelShell } from "@/components/intel/shell";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Contacts — LPGP Connect" };
export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const initial = await searchContacts({});

  return (
    <IntelShell
      crumbs={[{ label: "People" }]}
      title="People"
      description="Senior decision-makers across every firm in the book."
      actions={
          initial.all > 0 ? (
            <Button asChild variant="outline">
              <a href="/api/export/contacts" download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
          ) : null
        }
    >
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      <ContactsBrowser initial={initial} />
    </IntelShell>
  );
}
