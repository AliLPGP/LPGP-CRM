import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { countSampleRows, getLastDirectoryImport, probeDirectorySchema } from "@/lib/directory/queries";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { DirectoryImport } from "@/components/directory/directory-import";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import the Master Directory — LPGP Connect" };

export default async function DirectoryImportPage() {
  const [user, samples, last, schemaReady] = await Promise.all([
    getSessionUser(),
    countSampleRows(),
    getLastDirectoryImport(),
    probeDirectorySchema(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
      <Link href="/import" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Import
      </Link>
      <PageHeader
        eyebrow="Intelligence database"
        title="Import the Master Directory"
        description="Loads the team's capture workbook — every firm, key contact, Form ADV provider link and LP commitment — into the database behind Discover. Safe to run again with each new edition."
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      {last ? (
        <p className="text-sm text-muted-foreground">
          Last imported {timeAgo(last.created_at)}
          {last.filename ? <> from <span className="font-medium text-foreground">{last.filename}</span></> : null}.
        </p>
      ) : null}
      <DirectoryImport isAdmin={user?.role === "admin"} schemaReady={schemaReady} samples={samples} />
    </div>
  );
}
