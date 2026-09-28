"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, ClipboardCopy, Database, ExternalLink, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, timeAgo } from "@/lib/utils";

export type SetupPart = { name: string; sql: string };

export type SetupState = {
  /** Migrations 0013 + 0014 have both run. */
  sqlDone: boolean;
  /** Only 0014 is missing: a database set up before the fund lineup. */
  fundsOnly: boolean;
  lastImport: { at: string; filename: string | null } | null;
  sqlEditorUrl: string | null;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or a page without clipboard permission.
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function Step({
  n,
  done,
  title,
  children,
  muted,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={cn("relative flex gap-4 p-5 md:p-6", muted && "opacity-60")}>
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
          done ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]" : "border-[var(--brass)] text-[var(--brass)]",
        )}
      >
        {done ? <Check className="h-4 w-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <h3 className="font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

/**
 * The two things the directory needs before it can show anything: its SQL,
 * and one import of the Master Directory. Shown to admins on Discover and the
 * import page until both are done.
 */
export function DirectorySetupPanel({
  state,
  parts,
  isAdmin,
  showImportStep = true,
}: {
  state: SetupState;
  parts: SetupPart[];
  isAdmin: boolean;
  /** Off on the import page itself, which is step two. */
  showImportStep?: boolean;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();

  if (!isAdmin) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brass)]" />
        <p className="text-muted-foreground">
          The intelligence database is still being set up. An admin needs to run the directory SQL and import the
          Master Directory — then every firm, contact, provider and fund appears here.
        </p>
      </div>
    );
  }

  const imported = Boolean(state.lastImport);
  const title = state.sqlDone
    ? "One step left: load the Master Directory"
    : state.fundsOnly
      ? "One database update for the fund lineup"
      : "Set up the intelligence database";

  return (
    <section className="sheen overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 md:px-6">
        <div>
          <p className="eyebrow">Setup</p>
          <h2 className="display mt-0.5 text-lg">{title}</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startCheck(() => router.refresh())}
          disabled={checking}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Check again
        </Button>
      </div>

      <div className={cn("grid divide-y md:divide-y-0", showImportStep && "md:grid-cols-2 md:divide-x")}>
        <Step n={1} done={state.sqlDone} title={state.sqlDone ? "Database updated" : "Update the database"}>
          {state.sqlDone ? (
            <p className="text-sm text-muted-foreground">Every directory table and column is in place.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {state.fundsOnly
                  ? "Adds the columns for the funds GPs name on Form ADV. Paste it into Supabase's SQL editor and press Run."
                  : "Adds the columns and tables the directory fills. Paste each part into Supabase's SQL editor and press Run — in order, one at a time. Every part is safe to run twice."}
              </p>
              {state.sqlEditorUrl ? (
                <Button asChild size="sm">
                  <a href={state.sqlEditorUrl} target="_blank" rel="noreferrer">
                    Open the SQL editor <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              ) : null}
              <ol className="space-y-1.5">
                {parts.map((p, i) => (
                  <li key={p.name} className="rounded-xl border bg-background/60">
                    <div className="flex items-center gap-3 px-3 py-2">
                      <span className="figure w-5 text-center text-xs text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {parts.length > 1 ? `Part ${i + 1} of ${parts.length}` : p.name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {(new TextEncoder().encode(p.sql).length / 1024).toFixed(1)} KB
                        </span>
                      </span>
                      <Button
                        size="sm"
                        variant={copied === p.name ? "outline" : "secondary"}
                        onClick={async () => {
                          if (await copyText(p.sql)) setCopied(p.name);
                        }}
                      >
                        {copied === p.name ? <Check className="h-3.5 w-3.5 text-[var(--success)]" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                        {copied === p.name ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <details className="group border-t px-3 py-1.5">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Show SQL</summary>
                      <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg bg-muted/60 p-2.5 text-[11px] leading-relaxed">
                        {p.sql}
                      </pre>
                    </details>
                  </li>
                ))}
                {parts.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Run <code className="font-mono text-xs">supabase/sql-parts/3-directory/</code> in order.
                  </li>
                ) : null}
              </ol>
              <p className="text-xs text-muted-foreground">Ran them all? Press “Check again”.</p>
            </>
          )}
        </Step>

        {showImportStep ? (
          <Step n={2} done={imported && state.sqlDone} title="Load the Master Directory" muted={!state.sqlDone}>
            <p className="text-sm text-muted-foreground">
              {imported
                ? `Last imported ${timeAgo(state.lastImport!.at)}${state.lastImport!.filename ? ` from ${state.lastImport!.filename}` : ""}.${state.fundsOnly ? " Import it again after the update to load the fund lineup." : ""}`
                : "Drop the workbook on the import page. It brings in every firm, key contact, Form ADV provider link, named fund and LP commitment — in about a minute, and safe to repeat with each new edition."}
            </p>
            <Button asChild size="sm" variant={state.sqlDone ? "default" : "outline"} disabled={!state.sqlDone}>
              <Link href="/import/directory" aria-disabled={!state.sqlDone}>
                <FileSpreadsheet className="h-4 w-4" /> {imported ? "Import again" : "Import the workbook"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Step>
        ) : null}
      </div>
    </section>
  );
}
