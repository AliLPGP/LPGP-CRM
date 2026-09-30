import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { countSampleRows } from "@/lib/directory/queries";
import { getDirectorySetup, missingSql, upgradeOnly } from "@/lib/directory/setup";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { DirectoryImport } from "@/components/directory/directory-import";
import { DirectorySetupPanel } from "@/components/directory/directory-setup";
import { DatasetLoader } from "@/components/directory/dataset-loader";
import { EnrichRunner } from "@/components/directory/enrich-runner";
import { SPONSOR_TYPES } from "@/lib/directory/jobs";
import { shippedDatasetInfo } from "@/lib/directory/intelligence-queries";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { lushaConfigured } from "@/lib/lusha";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import the Master Directory — LPGP Connect" };

export default async function DirectoryImportPage() {
  const [user, samples, setup, index, shipped] = await Promise.all([
    getSessionUser(),
    countSampleRows(),
    getDirectorySetup(),
    getDirectoryIndex(),
    shippedDatasetInfo(),
  ]);
  // GPs with a website, in the order the enrichment runs go: sponsors whose
  // investments are companies (private equity, growth, venture, alternatives)
  // before lenders and listed-securities managers, the directory's own firms
  // before the SEC roster's, and the largest first within each.
  const sponsor = (t: string | null) => Boolean(t && SPONSOR_TYPES.includes(t));
  const gps = index.records
    .filter((r) => r.category === "GP" && r.domain)
    .sort((a, b) => Number(sponsor(b.subType)) - Number(sponsor(a.subType)) || Number(b.directory) - Number(a.directory) || (b.aum ?? 0) - (a.aum ?? 0))
    .map((r) => ({ id: r.id, name: r.name, operators: r.operators, portcos: r.portcos }));
  const isAdmin = user?.role === "admin";
  const parts = isAdmin ? await missingSql(setup) : [];
  const last = setup.lastImport;

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
      <Link href="/import" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Import
      </Link>
      <PageHeader
        eyebrow="Intelligence database"
        title="Import the Master Directory"
        description="Loads the team's capture workbook — every firm, key contact, Form ADV provider link, named fund and LP commitment — into the database behind Discover. Safe to run again with each new edition."
      />
      {!isSupabaseConfigured() ? <SetupNotice /> : null}
      {setup.configured && parts.length ? (
        <DirectorySetupPanel
          state={{
            sqlDone: false,
            fundsOnly: upgradeOnly(setup),
            lastImport: last,
            sqlEditorUrl: setup.sqlEditorUrl,
          }}
          parts={parts}
          isAdmin={isAdmin}
          showImportStep={false}
        />
      ) : null}
      {last ? (
        <p className="text-sm text-muted-foreground">
          Last imported {timeAgo(last.at)}
          {last.filename ? <> from <span className="font-medium text-foreground">{last.filename}</span></> : null}.
        </p>
      ) : null}
      <DirectoryImport isAdmin={isAdmin} schemaReady={setup.directory} fundsReady={setup.funds} samples={samples} />
      {isAdmin ? <DatasetLoader shipped={shipped} loaded={setup.datasetLoaded} ready={setup.intelligence} /> : null}
      {isAdmin && setup.portfolio && gps.length ? (
        <EnrichRunner gps={gps} lushaReady={lushaConfigured()} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
      ) : null}
    </div>
  );
}
