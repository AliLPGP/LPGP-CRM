"use client";

import { useState } from "react";
import type { Count } from "@/lib/directory/insights";
import type { WorldGeometry } from "@/lib/directory/world-map";
import { cn } from "@/lib/utils";

/**
 * Firms by headquarters country as proportional circles — area follows the
 * count, so Luxembourg's forty firms read bigger than a vast country's three.
 */
export function WorldMap({
  geometry,
  counts,
  selected = [],
  onPick,
  className,
}: {
  geometry: WorldGeometry;
  counts: Count<string>[];
  selected?: string[];
  onPick?: (country: string) => void;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = counts[0]?.count ?? 1;
  const R = 30;
  const radius = (n: number) => Math.max(2.6, Math.sqrt(n / max) * R);
  // Small circles on top of big ones, so every country stays clickable.
  const placed = counts
    .filter((c) => geometry.anchors[c.key])
    .sort((a, b) => b.count - a.count);
  const labelled = new Set(placed.slice(0, 6).map((c) => c.key));
  const hovered = hover ? placed.find((c) => c.key === hover) : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${geometry.width} ${geometry.height}`}
        className="h-auto w-full"
        role="img"
        aria-label="Firms by headquarters country"
      >
        <path d={geometry.land} className="fill-[var(--muted)]" />
        <path d={geometry.borders} fill="none" className="stroke-[var(--background)]" strokeWidth={0.6} />
        {placed.map((c) => {
          const [x, y] = geometry.anchors[c.key];
          const on = selected.includes(c.key) || hover === c.key;
          return (
            <g
              key={c.key}
              className={onPick ? "cursor-pointer" : undefined}
              onMouseEnter={() => setHover(c.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick?.(c.key)}
            >
              <circle
                cx={x}
                cy={y}
                r={radius(c.count)}
                fill="var(--chart-bar)"
                fillOpacity={on ? 0.85 : 0.42}
                stroke="var(--chart-bar)"
                strokeWidth={on ? 2 : 1}
              />
              <title>{`${c.key}: ${c.count.toLocaleString("en-US")} firms`}</title>
            </g>
          );
        })}
        {placed
          .filter((c) => labelled.has(c.key))
          .map((c) => {
            const [x, y] = geometry.anchors[c.key];
            const r = radius(c.count);
            return (
              <text
                key={`l-${c.key}`}
                x={x}
                y={y - r - 5}
                textAnchor="middle"
                className="pointer-events-none fill-[var(--foreground)] text-[12px] font-semibold"
                style={{ paintOrder: "stroke", stroke: "var(--card)", strokeWidth: 3 }}
              >
                {c.count.toLocaleString("en-US")}
              </text>
            );
          })}
      </svg>
      {hovered ? (
        <div className="pointer-events-none absolute left-3 top-3 rounded-lg border bg-popover px-2.5 py-1.5 text-xs shadow-[var(--shadow-pop)]">
          <span className="font-semibold">{hovered.key}</span>
          <span className="figure ml-2">{hovered.count.toLocaleString("en-US")}</span>
          <span className="ml-1 text-muted-foreground">firms</span>
        </div>
      ) : null}
    </div>
  );
}
