"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadIntelligenceDataset, type LoadResult } from "@/lib/directory/intelligence-load";

/**
 * Loads the researched dataset that ships with the app — clubs, investors,
 * deals and signals — into the database. One click; safe to repeat.
 */
export function DatasetLoader({
  shipped,
  loaded,
  ready,
}: {
  shipped: { version: string; generated_at: string; teams: number; investors: number; deals: number; signals: number } | null;
  loaded: boolean;
  /** Migration 0016 has run. */
  ready: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<LoadResult | null>(null);
  const fmt = (n: number) => n.toLocaleString("en-US");

  return (
    <section id="dataset" className="sheen scroll-mt-16 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <p className="eyebrow">Intelligence dataset</p>
          <h2 className="display mt-0.5 text-lg">Sports, deals and signals</h2>
        </div>
        {loaded ? (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--success)]">
            <CheckCircle2 className="h-3.5 w-3.5" /> Loaded
          </span>
        ) : null}
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        {shipped ? (
          <p className="text-muted-foreground">
            This build ships version <span className="font-mono text-xs text-foreground">{shipped.version}</span> ({shipped.generated_at.slice(0, 10)}):{" "}
            <span className="text-foreground">{fmt(shipped.teams)}</span> clubs, <span className="text-foreground">{fmt(shipped.investors)}</span> investors in
            sport, <span className="text-foreground">{fmt(shipped.deals)}</span> deals and <span className="text-foreground">{fmt(shipped.signals)}</span> signals — every
            figure with the page that states it. Loading updates rows in place and never touches anything added by hand.
          </p>
        ) : (
          <p className="text-muted-foreground">This build has no dataset file (data/intelligence/dataset.json).</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={pending || !shipped || !ready}
            onClick={() =>
              start(async () => {
                setResult(null);
                const r = await loadIntelligenceDataset();
                setResult(r);
                if (r.ok) router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            {loaded ? "Reload the dataset" : "Load the intelligence dataset"}
          </Button>
          {!ready ? <span className="text-xs text-muted-foreground">Run the database update above first.</span> : null}
        </div>
        {result ? (
          result.ok ? (
            <p className="text-xs text-muted-foreground">
              Loaded {fmt(result.teams)} clubs, {fmt(result.owners)} owner rows, {fmt(result.investors)} investors, {fmt(result.deals)} deals and{" "}
              {fmt(result.signals)} signals; {fmt(result.linkedFirms)} parties linked to directory firms.
            </p>
          ) : (
            <p className="text-xs text-destructive">{result.error}</p>
          )
        ) : null}
      </div>
    </section>
  );
}
