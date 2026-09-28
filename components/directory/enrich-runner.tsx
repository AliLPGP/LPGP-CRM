"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { chunk } from "@/lib/supabase/paged";

export type EnrichFirm = { id: string; name: string; operators: number; portcos: number };

type Run = { kind: "operators" | "portfolio"; done: number; total: number; found: number; errors: string[]; finished: boolean };

async function call(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(json.error ?? `Failed (${res.status})`));
  return json;
}

/**
 * Admin bulk runs over the GP book: operating partners from Lusha (search
 * previews, ~1 credit per 25 people, no reveals) and portfolio companies read
 * from each manager's own site. Firms go largest first; either run can stop.
 */
export function EnrichRunner({ gps, lushaReady, aiReady }: { gps: EnrichFirm[]; lushaReady: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [portfolioCount, setPortfolioCount] = useState(25);
  const stop = useRef(false);
  const busy = Boolean(run && !run.finished);

  async function operators() {
    const targets = gps.filter((g) => g.operators === 0);
    stop.current = false;
    const batches = chunk(targets, 40);
    let state: Run = { kind: "operators", done: 0, total: targets.length, found: 0, errors: [], finished: false };
    setRun(state);
    for (const batch of batches) {
      if (stop.current) break;
      try {
        const r = await call("/api/directory/operating-partners", { companyIds: batch.map((g) => g.id) });
        state = { ...state, done: state.done + batch.length, found: state.found + Number(r.added ?? 0) };
      } catch (e) {
        state = { ...state, done: state.done + batch.length, errors: [...state.errors, e instanceof Error ? e.message : "Failed"] };
        if (state.errors.length >= 3) break;
      }
      setRun(state);
    }
    setRun({ ...state, finished: true });
    router.refresh();
  }

  async function portfolio() {
    const targets = gps.filter((g) => g.portcos === 0).slice(0, portfolioCount);
    stop.current = false;
    let state: Run = { kind: "portfolio", done: 0, total: targets.length, found: 0, errors: [], finished: false };
    setRun(state);
    // Two at a time: each is a minute or so of reading.
    for (const pair of chunk(targets, 2)) {
      if (stop.current) break;
      const results = await Promise.allSettled(pair.map((g) => call("/api/directory/portfolio", { companyId: g.id })));
      let found = 0;
      const errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") found += Number(r.value.saved ?? 0);
        else errors.push(`${pair[i].name}: ${r.reason instanceof Error ? r.reason.message : "failed"}`);
      });
      state = { ...state, done: state.done + pair.length, found: state.found + found, errors: [...state.errors, ...errors] };
      setRun(state);
    }
    setRun({ ...state, finished: true });
    router.refresh();
  }

  const withOperators = gps.filter((g) => g.operators > 0).length;
  const withPortfolio = gps.filter((g) => g.portcos > 0).length;

  return (
    <section className="sheen rounded-2xl border bg-card">
      <div className="border-b px-5 py-4">
        <p className="eyebrow">Enrich the GP book</p>
        <h2 className="display mt-0.5 text-lg">Operating partners and portfolio companies</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Neither is in Form ADV or the workbook. These runs fetch them from their sources and save them on each firm — run
          again any time; firms already covered are skipped.
        </p>
      </div>
      <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-[var(--brass)]" />
            <h3 className="font-semibold">Operating partners · Lusha</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {withOperators.toLocaleString("en-US")} of {gps.length.toLocaleString("en-US")} GPs with a website have some on file. Searches
            Lusha by the firm&rsquo;s domain for operating partners, operating executives and value-creation leads — names, titles and
            LinkedIn only, about one credit per 25 people. No emails or phones are revealed.
          </p>
          <Button onClick={() => void operators()} disabled={busy || !lushaReady}>
            {busy && run?.kind === "operators" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
            Find for {(gps.length - withOperators).toLocaleString("en-US")} GPs
          </Button>
          {!lushaReady ? <p className="text-xs text-muted-foreground">Needs LUSHA_API_KEY.</p> : null}
        </div>
        <div className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--brass)]" />
            <h3 className="font-semibold">Portfolio companies · the managers&rsquo; own sites</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {withPortfolio.toLocaleString("en-US")} GPs have a portfolio on file. Claude reads each manager&rsquo;s portfolio page and press
            releases and saves every company with the page that names it — about a minute per firm, largest firms first.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={portfolioCount}
              onChange={(e) => setPortfolioCount(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
              disabled={busy}
              aria-label="How many firms"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  Next {n} largest
                </option>
              ))}
            </select>
            <Button onClick={() => void portfolio()} disabled={busy || !aiReady}>
              {busy && run?.kind === "portfolio" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Research
            </Button>
          </div>
          {!aiReady ? <p className="text-xs text-muted-foreground">Needs ANTHROPIC_API_KEY.</p> : null}
        </div>
      </div>
      {run ? (
        <div className="space-y-2 border-t px-5 py-3 text-sm">
          <div className="flex items-center gap-3">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bar-track">
              <span className="block h-full rounded-full bar-fill transition-all" style={{ width: `${run.total ? (run.done / run.total) * 100 : 100}%` }} />
            </span>
            <span className="figure text-xs">
              {run.done}/{run.total}
            </span>
            {busy ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  stop.current = true;
                }}
              >
                <Square className="h-3 w-3" /> Stop
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            {run.kind === "operators" ? "Operating partners added" : "Portfolio companies saved"}:{" "}
            <span className="figure text-foreground">{run.found.toLocaleString("en-US")}</span>
            {run.finished ? " · done" : ""}
          </p>
          {run.errors.length ? (
            <ul className="space-y-0.5 text-xs text-destructive">
              {run.errors.slice(0, 5).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
