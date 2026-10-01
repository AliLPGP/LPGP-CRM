import { cn } from "@/lib/utils";

// The desk's charts: server-rendered SVG, one axis, form before colour.
// Magnitude wears the walnut (--chart-bar); identity (an asset class, a
// book) takes a fixed hue from --chart-1..7 by entity, never cycled per
// render. Every chart is drawn to scale from the rows it is handed.

export const CLASS_HUE: Record<string, string> = {
  private_equity: "var(--chart-1)",
  private_credit: "var(--chart-2)",
  venture_capital: "var(--chart-3)",
  real_estate: "var(--chart-4)",
  infrastructure: "var(--chart-5)",
  secondaries: "var(--chart-6)",
  hedge_funds: "var(--chart-7)",
  sports: "var(--chart-bar)",
};

/** Deal kinds in the validated slot order; identity follows the kind, never its rank. */
export const DEAL_KIND_ORDER = ["company_acquisition", "minority_investment", "funding_round", "add_on_acquisition", "debt_financing", "company_exit", "ipo"] as const;
export const KIND_HUE: Record<string, string> = {
  company_acquisition: "var(--chart-1)",
  minority_investment: "var(--chart-2)",
  funding_round: "var(--chart-3)",
  add_on_acquisition: "var(--chart-4)",
  debt_financing: "var(--chart-5)",
  company_exit: "var(--chart-6)",
  ipo: "var(--chart-7)",
};

export type Column = { label: string; value: number; hint?: string };

/** Columns over an ordered axis (months, quarters, years): counts or sums.
 *  Drawn with boxes rather than a stretched SVG so the labels stay crisp. */
export function Columns({ rows, height = 120, format = (v: number) => v.toLocaleString("en-US"), className }: { rows: Column[]; height?: number; format?: (v: number) => string; className?: string }) {
  if (!rows.length) return <p className="text-[12px] text-muted-foreground">Nothing to chart yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className={cn("flex items-end gap-1", className)} role="img" aria-label={rows.map((r) => `${r.label} ${format(r.value)}`).join(", ")}>
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-1 flex-col items-center" title={`${r.label}: ${format(r.value)}${r.hint ? ` — ${r.hint}` : ""}`}>
          <span className="figure mb-0.5 text-[10px] leading-none text-muted-foreground">{r.value > 0 ? format(r.value) : ""}</span>
          <div className="flex w-full items-end border-b border-border" style={{ height }}>
            <span className="mx-auto block w-[64%] rounded-t-[2px] bar-fill" style={{ height: `${Math.max(r.value > 0 ? 2 : 0, (r.value / max) * 100)}%` }} />
          </div>
          <span className="mt-1 max-w-full truncate text-[10px] text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export type Range = { key: string; label: string; min: number; q1: number; median: number; q3: number; max: number; n: number };

/** Quartile ranges per row on one log axis: the box is Q1–Q3, the tick the median, the whisker min–max. */
export function Ranges({ rows, format }: { rows: Range[]; format: (v: number) => string }) {
  const valid = rows.filter((r) => r.n > 0 && r.max > 0);
  if (!valid.length) return <p className="text-[12px] text-muted-foreground">No sizes to chart yet.</p>;
  const lo = Math.log10(Math.max(1, Math.min(...valid.map((r) => r.min))));
  const hi = Math.log10(Math.max(...valid.map((r) => r.max)));
  const x = (v: number) => ((Math.log10(Math.max(1, v)) - lo) / Math.max(1e-9, hi - lo)) * 100;
  return (
    <div className="space-y-1.5">
      {valid.map((r) => (
        <div key={r.key} className="grid grid-cols-[minmax(110px,32%)_1fr_64px] items-center gap-2 text-[12px]">
          <span className="truncate">{r.label}</span>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="h-[14px] w-full" role="img" aria-label={`${r.label}: median ${format(r.median)}, Q1 ${format(r.q1)}, Q3 ${format(r.q3)}`}>
            <title>{`${r.label} · n=${r.n} · min ${format(r.min)} · Q1 ${format(r.q1)} · median ${format(r.median)} · Q3 ${format(r.q3)} · max ${format(r.max)}`}</title>
            <line x1={x(r.min)} x2={x(r.max)} y1={5} y2={5} stroke="var(--chart-track)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            <rect x={x(r.q1)} y={2} width={Math.max(0.6, x(r.q3) - x(r.q1))} height={6} fill={CLASS_HUE[r.key] ?? "var(--chart-bar)"} opacity={0.85} />
            <line x1={x(r.median)} x2={x(r.median)} y1={0.5} y2={9.5} stroke="var(--foreground)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="figure text-right text-[11px] text-muted-foreground">{format(r.median)}</span>
        </div>
      ))}
      <p className="text-[10.5px] text-muted-foreground">Log scale. Box Q1–Q3, line at the median, whisker min–max.</p>
    </div>
  );
}

export type Segment = { key: string; label: string; value: number; hue?: string };

/** One 100% bar split by entity, with a legend: share, where the parts are of one whole. */
export function ShareBar({ segments, format = (v: number) => v.toLocaleString("en-US") }: { segments: Segment[]; format?: (v: number) => string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const rows = segments.filter((s) => s.value > 0);
  if (!total || !rows.length) return <p className="text-[12px] text-muted-foreground">Nothing to chart yet.</p>;
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[2px]" role="img" aria-label={rows.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}>
        {rows.map((s) => (
          <span key={s.key} title={`${s.label}: ${format(s.value)} (${Math.round((s.value / total) * 100)}%)`} style={{ width: `${(s.value / total) * 100}%`, background: s.hue ?? CLASS_HUE[s.key] ?? "var(--chart-bar)" }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {rows.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: s.hue ?? CLASS_HUE[s.key] ?? "var(--chart-bar)" }} />
            <span>{s.label}</span>
            <span className="figure text-muted-foreground">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
