import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A magnitude chart: one row per category, the bar's length against the
 * largest row. One hue — the blue `--chart-bar` — because here colour
 * carries size, not identity; the label beside each bar names the row, and
 * every bar is direct-labelled with its figure so nothing is read off length
 * alone. Bars are 6px, square at the baseline and rounded at the data end.
 * Server-safe: no hooks.
 */
export type BarListRow = {
  key: string;
  label: string;
  value: number;
  /** The figure printed beside the bar; defaults to the value. */
  display?: string;
  /** A second figure in muted ink, right of the label. */
  sub?: string;
  href?: string;
  /** The row's tooltip; defaults to "label: display". */
  title?: string;
};

export function BarList({ rows, max, className }: { rows: BarListRow[]; max?: number; className?: string }) {
  const peak = Math.max(1, max ?? 0, ...rows.map((r) => r.value));
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => {
        const pct = r.value > 0 ? Math.max(1.5, (r.value / peak) * 100) : 0;
        const display = r.display ?? r.value.toLocaleString("en-US");
        const label = r.href ? (
          <Link href={r.href} className="truncate font-medium hover:underline">
            {r.label}
          </Link>
        ) : (
          <span className="truncate font-medium">{r.label}</span>
        );
        return (
          <li key={r.key} title={r.title ?? `${r.label}: ${display}`}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-baseline gap-2">
                {label}
                {r.sub ? <span className="tabular shrink-0 text-[11px] text-muted-foreground">{r.sub}</span> : null}
              </span>
              <span className="figure shrink-0 text-[13px]">{display}</span>
            </div>
            <div className="bar-track mt-1 h-[6px] w-full rounded-[2px]">
              <div
                className="bar-fill h-full rounded-r-[4px] transition-[width] duration-300 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
