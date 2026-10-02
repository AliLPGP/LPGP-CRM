"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Radar,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import {
  applyMapping,
  autoMapColumns,
  LEAD_IMPORT_FIELDS,
  mappedRowIsUsable,
  type MappedLeadRow,
} from "@/lib/lead-import-fields";
import { LEAD_STAGES, MARKETS } from "@/lib/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

type SheetData = {
  filename: string;
  headers: string[];
  rows: Record<string, unknown>[];
};

type ImportSummary = {
  total: number;
  created: number;
  skipped: number;
  duplicates: number;
  opsLinked: number;
  opsMatches: { company: string; opsCompany: string; events: string[] }[];
  errors: string[];
};

type ProfileLite = { id: string; full_name: string | null };

const PREVIEW_ROWS = 6;

/**
 * Spreadsheet → leads, in three visible steps: pick a file, confirm the column
 * mapping, import. Nothing is written until the mapping has been shown.
 */
export function LeadImportTool({
  profiles,
  isAdmin,
  opsConfigured,
}: {
  profiles: ProfileLite[];
  isAdmin: boolean;
  opsConfigured: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const [ownerId, setOwnerId] = useState("");
  const [stage, setStage] = useState("New");
  const [market, setMarket] = useState("");
  const [source, setSource] = useState("");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [checkOps, setCheckOps] = useState(true);

  async function onFile(file: File) {
    setError(null);
    setSummary(null);
    setParsing(true);
    try {
      // xlsx is ~400KB; loading it only when a file is picked keeps it off the
      // initial page bundle.
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: "array" });
      const first = book.SheetNames[0];
      if (!first) {
        setError("That file has no sheets in it.");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[first], {
        defval: "",
        raw: false,
      });
      if (!rows.length) {
        setError("That sheet has no rows below the header.");
        return;
      }
      // Union of keys — some exporters omit trailing empty cells per row.
      const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter((h) => h.trim());
      setSheet({ filename: file.name, headers, rows });
      setMapping(autoMapColumns(headers));
    } catch (e) {
      setError(e instanceof Error ? `Could not read that file: ${e.message}` : "Could not read that file.");
    } finally {
      setParsing(false);
    }
  }

  const mapped: MappedLeadRow[] = sheet
    ? sheet.rows.map((r) => applyMapping(r, mapping)).filter(mappedRowIsUsable)
    : [];
  const unusable = sheet ? sheet.rows.length - mapped.length : 0;
  const hasCompany = Object.values(mapping).includes("company_name");

  async function runImport() {
    if (!sheet) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/import/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rows: mapped,
          mapping,
          filename: sheet.filename,
          ownerId: isAdmin && ownerId ? ownerId : undefined,
          defaultStage: stage,
          defaultMarket: market || null,
          defaultSource: source || null,
          skipDuplicates,
          checkOpsPanel: opsConfigured && checkOps,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed");
        return;
      }
      setSummary(json as ImportSummary);
      setSheet(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  if (summary) {
    return <ImportSummaryCard summary={summary} onAgain={() => setSummary(null)} />;
  }

  return (
    <div className="space-y-5">
      {/* Step 1 — file */}
      <section className="rounded-2xl border bg-card p-5">
        <StepHeading n={1} title="Choose a spreadsheet" done={Boolean(sheet)} />
        {!sheet ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-colors hover:border-primary/50 hover:bg-accent/40 disabled:opacity-60"
            >
              {parsing ? (
                <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-7 w-7 text-muted-foreground" />
              )}
              <span className="text-sm font-medium">
                {parsing ? "Reading the file…" : "Click to upload .xlsx, .xls or .csv"}
              </span>
              <span className="text-xs text-muted-foreground">
                The first sheet is used. The first row must be your column headers.
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3 rounded-xl border bg-muted/40 px-3.5 py-2.5">
            <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{sheet.filename}</p>
              <p className="text-xs text-muted-foreground">
                {sheet.rows.length} row{sheet.rows.length === 1 ? "" : "s"} ·{" "}
                {sheet.headers.length} columns
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSheet(null);
                setMapping({});
              }}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>

      {sheet ? (
        <>
          {/* Step 2 — mapping */}
          <section className="rounded-2xl border bg-card p-5">
            <StepHeading n={2} title="Match your columns" done={hasCompany} />
            <p className="mt-1 text-sm text-muted-foreground">
              We&apos;ve guessed from your headers. Change anything that looks wrong — set a column
              to &ldquo;Ignore&rdquo; to leave it out.
            </p>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {sheet.headers.map((header) => {
                const sample = sheet.rows.find((r) => String(r[header] ?? "").trim())?.[header];
                return (
                  <div key={header} className="rounded-xl border bg-background p-3">
                    <p className="truncate text-sm font-medium">{header}</p>
                    <p className="mt-0.5 h-4 truncate text-xs text-muted-foreground">
                      {sample ? String(sample) : "— empty —"}
                    </p>
                    <NativeSelect
                      className="mt-2 w-full"
                      value={mapping[header] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => {
                          const next = { ...m };
                          const field = e.target.value;
                          // A lead field can only come from one column.
                          if (field) {
                            for (const [h, f] of Object.entries(next)) {
                              if (f === field && h !== header) delete next[h];
                            }
                            next[header] = field;
                          } else {
                            delete next[header];
                          }
                          return next;
                        })
                      }
                    >
                      <option value="">Ignore this column</option>
                      {LEAD_IMPORT_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                          {f.required ? " (required)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                );
              })}
            </div>

            {!hasCompany ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <TriangleAlert className="h-4 w-4 shrink-0" />
                Map one column to <strong>Company</strong> — a lead without a company can&apos;t be
                created.
              </p>
            ) : null}
          </section>

          {/* Step 3 — preview & options */}
          <section className="rounded-2xl border bg-card p-5">
            <StepHeading n={3} title="Check and import" />

            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{mapped.length} importable</Badge>
              {unusable ? (
                <Badge variant="outline" className="text-muted-foreground">
                  {unusable} skipped (no company)
                </Badge>
              ) : null}
            </div>

            {mapped.length ? (
              <div className="mt-3 overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60">
                    <tr>
                      {["company_name", "contact_name", "contact_email", "contact_phone"].map((k) => (
                        <th
                          key={k}
                          className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                        >
                          {LEAD_IMPORT_FIELDS.find((f) => f.key === k)?.label ?? k}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapped.slice(0, PREVIEW_ROWS).map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-medium">{row.company_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.contact_name ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.contact_email ?? "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.contact_phone ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {mapped.length > PREVIEW_ROWS ? (
                  <p className="border-t bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                    + {mapped.length - PREVIEW_ROWS} more rows
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Defaults */}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <Label className="mb-1.5">Starting stage</Label>
                <NativeSelect className="w-full" value={stage} onChange={(e) => setStage(e.target.value)}>
                  {LEAD_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Default market</Label>
                <NativeSelect className="w-full" value={market} onChange={(e) => setMarket(e.target.value)}>
                  <option value="">Infer from country</option>
                  {MARKETS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <Label className="mb-1.5">Source</Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="e.g. Conference list"
                />
              </div>
              {isAdmin ? (
                <div>
                  <Label className="mb-1.5">Assign to</Label>
                  <NativeSelect
                    className="w-full"
                    value={ownerId}
                    onChange={(e) => setOwnerId(e.target.value)}
                  >
                    <option value="">Me</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? "Unnamed"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>

            <div className="mt-4 space-y-2">
              <Toggle
                checked={skipDuplicates}
                onChange={setSkipDuplicates}
                title="Skip companies already in the pipeline"
                hint="Also removes repeats within the file itself."
              />
              <Toggle
                checked={opsConfigured && checkOps}
                onChange={setCheckOps}
                disabled={!opsConfigured}
                title="Check against the ops panel"
                hint={
                  opsConfigured
                    ? "Flags imported companies that already have signed business, and links them."
                    : "Connect the ops panel in Settings to enable this."
                }
              />
            </div>

            {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

            <div className="mt-5 flex justify-end">
              <Button onClick={runImport} disabled={importing || !hasCompany || !mapped.length}>
                {importing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                Import {mapped.length} lead{mapped.length === 1 ? "" : "s"}
              </Button>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function StepHeading({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full text-xs font-bold",
          done ? "bg-[var(--success)] text-white" : "bg-primary-soft text-primary",
        )}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : n}
      </span>
      <h2 className="font-semibold">{title}</h2>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  title,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-2.5 rounded-xl border bg-muted/30 px-3 py-2.5",
        disabled && "opacity-60",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function ImportSummaryCard({
  summary,
  onAgain,
}: {
  summary: ImportSummary;
  onAgain: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-6 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]">
          <BadgeCheck className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-xl font-semibold">
          {summary.created} lead{summary.created === 1 ? "" : "s"} imported
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          from {summary.total} row{summary.total === 1 ? "" : "s"}
          {summary.duplicates ? ` · ${summary.duplicates} duplicates skipped` : ""}
          {summary.skipped ? ` · ${summary.skipped} unusable` : ""}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/leads/workspace">Start calling</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/leads">View leads</Link>
          </Button>
          <Button variant="ghost" onClick={onAgain}>
            Import another file
          </Button>
        </div>
      </section>

      {summary.opsMatches.length ? (
        <section className="rounded-2xl border border-[var(--ops)]/40 bg-[var(--ops-soft)]/60 p-5">
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-[var(--ops)]" />
            <h3 className="font-semibold">
              {summary.opsMatches.length} already in the ops panel
            </h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            These companies have signed business in the tracker — they&apos;ve been linked, so their
            event allocations show on the lead.
          </p>
          <ul className="mt-3 space-y-1.5">
            {summary.opsMatches.map((m) => (
              <li
                key={m.company}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[var(--ops)]/30 bg-card/70 px-3 py-2 text-sm"
              >
                <span className="font-medium">{m.company}</span>
                <span className="text-muted-foreground">
                  {m.events.length ? `sponsoring ${m.events.join(", ")}` : "no events allocated"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {summary.errors.length ? (
        <section className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <TriangleAlert className="h-4 w-4" /> Some rows had problems
          </p>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {summary.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
