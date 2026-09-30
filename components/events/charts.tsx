"use client";

import { useState } from "react";
import { SERIES_COLOR, type SeriesId } from "@/lib/events-catalogue";
import { formatOpsMoney } from "@/lib/ops-types";
import { cn } from "@/lib/utils";

/**
 * Charts for event performance.
 *
 * Both forms encode magnitude as bar length against a shared scale. The series
 * chart colours each bar by the series it *is* (identity follows the entity, so
 * a series keeps its colour everywhere), while the per-event chart uses one hue
 * — an event isn't a recurring identity, and five hues on twenty-five rows would be
 * noise. Every bar is direct-labelled, so colour never carries meaning alone.
 */

type SeriesDatum = {
  id: SeriesId | "unassigned";
  short: string;
  code: string;
  actual: number;
  target: number;
  collected: number;
  eventCount: number;
  sponsorCount: number;
};

export function SeriesRevenueChart({
  data,
  currency = "GBP",
}: {
  data: SeriesDatum[];
  currency?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // One scale across both measures so a bar and its target marker are
  // comparable — the whole point of drawing them together.
  const scale = Math.max(1, ...data.map((d) => Math.max(d.actual, d.target)));

  if (!data.length) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        No events allocated yet.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {data.map((d) => {
        const color =
          d.id === "unassigned" ? "var(--muted-foreground)" : SERIES_COLOR[d.id as SeriesId];
        const actualPct = (d.actual / scale) * 100;
        const targetPct = (d.target / scale) * 100;
        const hit = d.target > 0 && d.actual >= d.target;

        return (
          <div
            key={d.id}
            className="relative"
            onMouseEnter={() => setHover(d.id)}
            onMouseLeave={() => setHover(null)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: color }}
                  aria-hidden
                />
                <span className="truncate font-medium">{d.short}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {d.eventCount} event{d.eventCount === 1 ? "" : "s"}
                </span>
              </span>
              <span className="shrink-0 text-sm">
                <span className="tabular font-semibold">{formatOpsMoney(d.actual, currency)}</span>
                {d.target > 0 ? (
                  <span className="tabular text-xs text-muted-foreground">
                    {" "}
                    / {formatOpsMoney(d.target, currency)}
                  </span>
                ) : null}
              </span>
            </div>

            {/* Track + bar. The data-end is rounded and the bar is anchored to
                the baseline; the target sits on the same scale as a tick. */}
            <div className="relative mt-1.5 h-2.5 w-full rounded-full bg-[var(--chart-track)]">
              <div
                className="absolute inset-y-0 left-0 rounded-l-full rounded-r-[4px] transition-[width] duration-700 ease-out"
                style={{ width: `${Math.max(1.5, actualPct)}%`, background: color }}
              />
              {d.target > 0 ? (
                <span
                  className="absolute -top-[3px] h-[17px] w-[2px] rounded-full bg-foreground/70"
                  style={{ left: `calc(${Math.min(100, targetPct)}% - 1px)` }}
                  aria-hidden
                  title={`Target ${formatOpsMoney(d.target, currency)}`}
                />
              ) : null}
            </div>

            {hover === d.id ? (
              <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border bg-popover p-2.5 text-xs shadow-lg">
                <p className="font-semibold">{d.short}</p>
                <dl className="mt-1.5 space-y-1">
                  <Row label="Allocated" value={formatOpsMoney(d.actual, currency)} />
                  <Row label="Collected" value={formatOpsMoney(d.collected, currency)} />
                  <Row
                    label="Target"
                    value={d.target > 0 ? formatOpsMoney(d.target, currency) : "Not set"}
                  />
                  {d.target > 0 ? (
                    <Row
                      label="Against target"
                      value={`${Math.round((d.actual / d.target) * 100)}%`}
                      tone={hit ? "good" : undefined}
                    />
                  ) : null}
                  <Row label="Sponsors" value={String(d.sponsorCount)} />
                </dl>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular font-medium", tone === "good" && "text-[var(--success)]")}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The bar shown on each event row: actual against target on a shared scale.
 * One hue, because the row's series chip already carries identity.
 */
export function EventBar({
  actual,
  target,
  scale,
  currency = "GBP",
}: {
  actual: number;
  target: number | null;
  scale: number;
  currency?: string;
}) {
  const safeScale = Math.max(1, scale);
  const actualPct = (actual / safeScale) * 100;
  const targetPct = target ? (target / safeScale) * 100 : null;
  const hit = target != null && target > 0 && actual >= target;

  return (
    <div className="relative h-2.5 w-full rounded-full bg-[var(--chart-track)]">
      <div
        className={cn(
          "absolute inset-y-0 left-0 rounded-l-full rounded-r-[4px] transition-[width] duration-700 ease-out",
          hit ? "bg-[var(--success)]" : "bg-[var(--chart-bar)]",
        )}
        style={{ width: `${Math.max(1.5, Math.min(100, actualPct))}%` }}
      />
      {targetPct != null ? (
        <span
          className="absolute -top-[3px] h-[17px] w-[2px] rounded-full bg-foreground/70"
          style={{ left: `calc(${Math.min(100, targetPct)}% - 1px)` }}
          aria-hidden
          title={`Target ${formatOpsMoney(target, currency)}`}
        />
      ) : null}
    </div>
  );
}

/** Programme-level progress: one headline figure against its target. */
export function ProgressMeter({
  actual,
  target,
  currency = "GBP",
}: {
  actual: number;
  target: number;
  currency?: string;
}) {
  const pct = target > 0 ? (actual / target) * 100 : 0;
  const hit = target > 0 && actual >= target;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="figure text-[2rem] leading-none md:text-[2.5rem]">
          {formatOpsMoney(actual, currency)}
        </p>
        <p className="text-sm text-muted-foreground">
          {target > 0 ? (
            <>
              of <span className="tabular font-medium">{formatOpsMoney(target, currency)}</span>{" "}
              target
            </>
          ) : (
            "no programme target set yet"
          )}
        </p>
      </div>
      <div className="relative mt-3 h-3 w-full overflow-hidden rounded-full bg-[var(--chart-track)]">
        <div
          className={cn(
            "h-full rounded-l-full rounded-r-[4px] transition-[width] duration-700 ease-out",
            hit ? "bg-[var(--success)]" : "bg-[var(--chart-bar)]",
          )}
          style={{ width: `${Math.max(target > 0 ? 1.5 : 0, Math.min(100, pct))}%` }}
        />
      </div>
      {target > 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          <span className={cn("tabular font-semibold", hit && "text-[var(--success)]")}>
            {Math.round(pct)}%
          </span>{" "}
          of target
          {actual < target ? (
            <> · {formatOpsMoney(target - actual, currency)} to go</>
          ) : (
            <> · {formatOpsMoney(actual - target, currency)} ahead</>
          )}
        </p>
      ) : null}
    </div>
  );
}
