import Link from "next/link";
import { ArrowRight, Database, FileSpreadsheet, Plug } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getLastDirectoryImport } from "@/lib/directory/queries";
import { lushaConfigured } from "@/lib/lusha";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { ExcelUpload } from "@/components/excel-upload";
import { ImportTool } from "@/components/import-tool";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import — LPGP Intelligence" };

export default async function ImportPage() {
  const [user, last] = await Promise.all([getSessionUser(), getLastDirectoryImport()]);
  return (
    <div className="mx-auto max-w-4xl px-4 md:px-6 py-8 space-y-10">
      <PageHeader
        eyebrow="Intelligence database"
        title="Import data"
        description="Bring your book into the CRM. Companies are created and de-duplicated automatically; re-uploading updates what's already there instead of duplicating it."
      />

      <section className="sheen flex flex-col gap-4 rounded-2xl border bg-card p-5 sm:flex-row sm:items-center">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <Database className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Master Directory workbook</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Every GP, LP and provider in the team&rsquo;s capture file — with key contacts, Form ADV facts and provider
            links, and public LP commitments — into the database behind Discover.
            {last ? ` Last imported ${timeAgo(last.created_at)}.` : ""}
          </p>
        </div>
        {user?.role === "admin" ? (
          <Button asChild>
            <Link href="/import/directory">
              Import workbook <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Admins only</span>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Upload Excel / CSV</h2>
        </div>
        <ExcelUpload adminReady={isAdminConfigured()} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Pull from Lusha</h2>
          <span className="rounded-md border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            optional
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Already wired up — add a <code className="font-mono text-xs">LUSHA_API_KEY</code> to enrich
          and pull fresh leads by job title, country and firm.
        </p>
        <ImportTool lushaReady={lushaConfigured()} adminReady={isAdminConfigured()} />
      </section>
    </div>
  );
}
