"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileSpreadsheet, GitMerge, Loader2, Upload } from "lucide-react";
import {
  finishDirectoryImport,
  importDirectoryCommitments,
  importDirectoryCompanies,
  importDirectoryContacts,
  importDirectoryFunds,
  importDirectoryRelationships,
} from "@/lib/directory/import-actions";
import { transformDirectory, type DirectoryBundle } from "@/lib/directory/transform";
import { chunk } from "@/lib/supabase/paged";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Parsed = { fileName: string; bundle: DirectoryBundle };

type Phase = "companies" | "contacts" | "relationships" | "funds" | "commitments" | "finish";

const PHASES: Phase[] = ["companies", "contacts", "relationships", "funds", "commitments", "finish"];

const PHASE_LABEL: Record<Phase, string> = {
  companies: "Firms",
  contacts: "Key contacts",
  relationships: "Form ADV provider links",
  funds: "Form ADV fund lineup",
  commitments: "LP commitments",
  finish: "Tidying up",
};

type Progress = { phase: Phase; done: number; total: number };

type Outcome = {
  companies: { created: number; updated: number };
  contacts: { created: number; updated: number };
  relationships: number;
  advFunds: number;
  commitments: number;
  funds: number;
  pruned: number;
  samplesRemoved: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");

function pick(ids: Record<string, string>, keys: (string | null)[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) if (k && ids[k]) out[k] = ids[k];
  return out;
}

export function DirectoryImport({
  isAdmin,
  schemaReady,
  fundsReady,
  samples,
}: {
  isAdmin: boolean;
  schemaReady: boolean;
  /** Migration 0014 has run: the fund lineup can load. */
  fundsReady: boolean;
  samples: { relationships: number; commitments: number };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [removeSamples, setRemoveSamples] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [dragging, setDragging] = useState(false);

  async function readFile(file: File) {
    setParsing(true);
    setParseError(null);
    setParsed(null);
    setOutcome(null);
    setRunError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheets: Record<string, unknown[][]> = {};
      for (const name of wb.SheetNames) {
        sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
          header: 1,
          raw: true,
          defval: null,
          blankrows: false,
        }) as unknown[][];
      }
      const bundle = transformDirectory(sheets);
      if (bundle.companies.length === 0) {
        setParseError(
          "No firms found. This importer reads the Master Directory workbook — the one with GP / LP / SP Directory sheets.",
        );
      } else {
        setParsed({ fileName: file.name, bundle });
      }
    } catch (e) {
      setParseError(e instanceof Error ? `Couldn't read that file: ${e.message}` : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  async function run() {
    if (!parsed) return;
    const { bundle, fileName } = parsed;
    setRunning(true);
    setRunError(null);
    setOutcome(null);
    const result: Outcome = {
      companies: { created: 0, updated: 0 },
      contacts: { created: 0, updated: 0 },
      relationships: 0,
      advFunds: 0,
      commitments: 0,
      funds: 0,
      pruned: 0,
      samplesRemoved: 0,
    };
    let phase: Phase = "companies";
    const fail = (at: Phase, error?: string) => {
      setRunError(`${PHASE_LABEL[at]}: ${error ?? "failed"}. Nothing is lost — running the import again picks up where it stands.`);
      setRunning(false);
    };

    try {
      // Firms first: every later phase needs their ids.
      const ids: Record<string, string> = {};
      const companyChunks = chunk(bundle.companies, 150);
      for (let i = 0; i < companyChunks.length; i++) {
        setProgress({ phase: "companies", done: i, total: companyChunks.length });
        const r = await importDirectoryCompanies(companyChunks[i]);
        if (!r.ok) return fail("companies", r.error);
        Object.assign(ids, r.ids);
        result.companies.created += r.created;
        result.companies.updated += r.updated;
      }
      for (const [alias, primary] of Object.entries(bundle.aliases)) {
        if (!ids[alias] && ids[primary]) ids[alias] = ids[primary];
      }

      phase = "contacts";
      const contactChunks = chunk(bundle.contacts, 600);
      for (let i = 0; i < contactChunks.length; i++) {
        setProgress({ phase: "contacts", done: i, total: contactChunks.length });
        const part = contactChunks[i];
        const r = await importDirectoryContacts(part, pick(ids, part.map((c) => c.company_ext)));
        if (!r.ok) return fail("contacts", r.error);
        result.contacts.created += r.created;
        result.contacts.updated += r.updated;
      }

      phase = "relationships";
      const relChunks = chunk(bundle.relationships, 800);
      for (let i = 0; i < relChunks.length; i++) {
        setProgress({ phase: "relationships", done: i, total: relChunks.length });
        const part = relChunks[i];
        const r = await importDirectoryRelationships(
          part,
          pick(ids, part.flatMap((x) => [x.client_ext, x.provider_ext])),
        );
        if (!r.ok) return fail("relationships", r.error);
        result.relationships += r.created;
      }

      if (fundsReady) {
        phase = "funds";
        const fundChunks = chunk(bundle.funds, 700);
        for (let i = 0; i < fundChunks.length; i++) {
          setProgress({ phase: "funds", done: i, total: fundChunks.length });
          const part = fundChunks[i];
          const r = await importDirectoryFunds(part, pick(ids, part.map((x) => x.gp_ext)));
          if (!r.ok) return fail("funds", r.error);
          result.advFunds += r.created;
        }
      }

      phase = "commitments";
      setProgress({ phase: "commitments", done: 0, total: 1 });
      const c = await importDirectoryCommitments(
        bundle.commitments,
        pick(ids, bundle.commitments.flatMap((x) => [x.lp_ext, x.gp_ext])),
      );
      if (!c.ok) return fail("commitments", c.error);
      result.commitments = c.created;
      result.funds = c.funds;

      phase = "finish";
      setProgress({ phase: "finish", done: 0, total: 1 });
      const f = await finishDirectoryImport({
        filename: fileName,
        stats: bundle.stats as unknown as Record<string, unknown>,
        result: result as unknown as Record<string, unknown>,
        relationshipKeys: bundle.relationships.map((r) => r.external_key),
        commitmentKeys: bundle.commitments.map((c) => c.external_key),
        fundKeys: fundsReady ? bundle.funds.map((x) => x.external_key) : undefined,
        removeSamples,
      });
      if (!f.ok) return fail("finish", f.error);
      result.pruned = f.pruned;
      result.samplesRemoved = f.samplesRemoved;
      setOutcome(result);
      setProgress(null);
    } catch (e) {
      fail(phase, e instanceof Error ? e.message : undefined);
      return;
    }
    setRunning(false);
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        Only admins can import the Master Directory. Ask an admin, or have your email added to{" "}
        <code className="font-mono text-xs">ADMIN_EMAILS</code>.
      </div>
    );
  }

  const stats = parsed?.bundle.stats;
  const totalFirms = parsed?.bundle.companies.length ?? 0;
  const sampleCount = samples.relationships + samples.commitments;

  return (
    <div className="space-y-6">

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void readFile(file);
        }}
        className={cn(
          "sheen flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card px-6 py-10 text-center transition-colors",
          dragging && "border-[var(--brass)] bg-accent/40",
        )}
      >
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent text-accent-foreground">
          {parsing ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5" />}
        </span>
        <div>
          <p className="font-medium">{parsing ? "Reading the workbook…" : "Drop the Master Directory workbook here"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            .xlsx with the GP, LP, SP and Unclassified directory sheets, the Form ADV relationships and the LP
            allocations. It&rsquo;s read in your browser; only the cleaned rows are sent.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={parsing || running}>
          <Upload className="h-4 w-4" /> Choose file
        </Button>
        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}
      </div>

      {parsed && stats ? (
        <div className="space-y-5">
          <div className="sheen rounded-2xl border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">{parsed.fileName}</h2>
              <span className="text-sm text-muted-foreground">— what this import will bring in</span>
            </div>
            <div className="grid gap-px bg-border sm:grid-cols-3">
              {[
                { label: "Firms", value: fmt(totalFirms), sub: `GP ${fmt(stats.companies.GP)} · LP ${fmt(stats.companies.LP)} · SP ${fmt(stats.companies.SP)} · Unclassified ${fmt(stats.companies.UN)}` },
                { label: "Key contacts", value: fmt(stats.contacts), sub: `${fmt(stats.connectableContacts)} with a direct email in your master sheet` },
                { label: "Form ADV provider links", value: fmt(stats.relationships), sub: `${fmt(stats.relationshipRows)} filing rows → ${fmt(stats.providerBrands)} provider brands` },
                { label: "Named funds", value: fmt(stats.funds), sub: `private funds ${fmt(stats.fundManagers)} managers list on Form ADV, with their providers` },
                { label: "LP commitments", value: fmt(stats.commitments), sub: "public disclosures, amounts in their own currency" },
                { label: "Form ADV facts", value: fmt(stats.withAdv), sub: "firms with a CRD, entity and filing date" },
                { label: "Size on record", value: fmt(stats.withAum), sub: "firms with regulatory AUM or total assets" },
                { label: "Websites", value: fmt(stats.withDomain), sub: "matched domains (Lusha)" },
                { label: "Descriptions", value: fmt(stats.withDescription), sub: "firm overviews for thesis search" },
              ].map((s) => (
                <div key={s.label} className="bg-card p-4">
                  <p className="eyebrow">{s.label}</p>
                  <p className="figure mt-2 text-2xl">{s.value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-semibold">Duplicates merged</h3>
                <span className="text-sm text-muted-foreground">
                  {fmt(stats.mergedRows)} rows folded into {fmt(stats.mergedGroups)} firms
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {parsed.bundle.companies
                  .filter((c) => c.external_ids.length > 1)
                  .slice(0, 8)
                  .map((c) => (
                    <li key={c.external_id} className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{c.name}</span>
                      <span className="tabular shrink-0 text-xs text-muted-foreground">{c.external_ids.join(" + ")}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Same firm under two spellings or two sheets. Every source id is kept, so the next edition of the
                workbook lands on the same record.
              </p>
            </div>

            <div className="rounded-2xl border bg-card p-5">
              <h3 className="font-semibold">How existing records are treated</h3>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>
                  Firms already in the CRM are matched by workbook id, Lusha id, website, then name — and
                  updated, never duplicated.
                </li>
                <li>
                  Form ADV facts, LP disclosures and SP service lines refresh from the workbook. Names,
                  descriptions, websites and locations someone edited by hand are kept.
                </li>
                <li>Contacts you already have are matched by name at the same firm.</li>
              </ul>
              {parsed.bundle.warnings.length ? (
                <div className="mt-4 space-y-1.5 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  {parsed.bundle.warnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {sampleCount > 0 ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
                checked={removeSamples}
                onChange={(e) => setRemoveSamples(e.target.checked)}
                disabled={running}
              />
              <span>
                <span className="font-medium">
                  Remove the {fmt(sampleCount)} illustrative sample links from the original seed
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {fmt(samples.relationships)} service-provider links and {fmt(samples.commitments)} commitments the
                  first setup script added as examples. They&rsquo;re labelled “sample” either way; tick this to delete them
                  so only sourced data remains. This can&rsquo;t be undone.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => void run()} disabled={running || !schemaReady}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {running ? "Importing…" : `Import ${fmt(totalFirms)} firms`}
            </Button>
            {progress ? (
              <div className="min-w-[260px] flex-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{PHASE_LABEL[progress.phase]}</span>
                  <span className="tabular">
                    {progress.total > 1 ? `${progress.done + 1} / ${progress.total}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--chart-track)]">
                  <div
                    className="h-full rounded-full bg-[var(--chart-bar)] transition-all"
                    style={{
                      width: `${Math.round(
                        ((PHASES.indexOf(progress.phase) + (progress.total ? progress.done / progress.total : 0)) /
                          PHASES.length) *
                          100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {runError ? <p className="text-sm text-destructive">{runError}</p> : null}
        </div>
      ) : null}

      {outcome ? (
        <div className="sheen rounded-2xl border bg-card p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[var(--success)]" />
            <h2 className="font-semibold">Directory imported</h2>
          </div>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <li>
              <span className="figure">{fmt(outcome.companies.created)}</span> firms added,{" "}
              <span className="figure">{fmt(outcome.companies.updated)}</span> updated
            </li>
            <li>
              <span className="figure">{fmt(outcome.contacts.created)}</span> contacts added,{" "}
              <span className="figure">{fmt(outcome.contacts.updated)}</span> matched
            </li>
            <li>
              <span className="figure">{fmt(outcome.relationships)}</span> Form ADV provider links
              {outcome.pruned ? ` (${fmt(outcome.pruned)} stale rows removed)` : ""}
            </li>
            <li>
              <span className="figure">{fmt(outcome.advFunds)}</span> named funds from Form ADV
            </li>
            <li>
              <span className="figure">{fmt(outcome.commitments)}</span> commitments across{" "}
              <span className="figure">{fmt(outcome.funds)}</span> funds
            </li>
            {outcome.samplesRemoved ? (
              <li>
                <span className="figure">{fmt(outcome.samplesRemoved)}</span> sample rows removed
              </li>
            ) : null}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/database">
                Open Discover <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/database/market">Market map</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
