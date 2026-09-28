import Link from "next/link";
import { BarChart3 } from "lucide-react";
import type { DirectoryRecord } from "@/lib/directory/records";
import { formatUsd } from "@/lib/utils";

type Metric = {
  label: string;
  value: (r: DirectoryRecord) => number | null;
  format: (n: number) => string;
  basis: string;
};

const METRICS: Metric[] = [
  {
    label: "Size",
    value: (r) => (r.aum != null && r.aum > 0 ? r.aum : null),
    format: (n) => formatUsd(n),
    basis: "regulatory AUM or total assets",
  },
  {
    label: "Team",
    value: (r) => (r.employees != null && r.employees > 0 ? r.employees : null),
    format: (n) => n.toLocaleString("en-US"),
    basis: "employees",
  },
  {
    label: "Funds",
    value: (r) => (r.funds > 0 ? r.funds : r.privateFunds && r.privateFunds > 0 ? r.privateFunds : null),
    format: (n) => n.toLocaleString("en-US"),
    basis: "funds on file or reported on Form ADV",
  },
];

function Strip({ firm, peers, metric }: { firm: DirectoryRecord; peers: DirectoryRecord[]; metric: Metric }) {
  const mine = metric.value(firm);
  const values = peers.map((p) => ({ r: p, v: metric.value(p) })).filter((x): x is { r: DirectoryRecord; v: number } => x.v != null);
  if (mine == null || values.length < 4) return null;
  const all = [...values.map((x) => x.v), mine];
  const lo = Math.log10(Math.min(...all));
  const hi = Math.log10(Math.max(...all));
  const x = (v: number) => (hi === lo ? 50 : ((Math.log10(v) - lo) / (hi - lo)) * 100);
  const below = values.filter((p) => p.v < mine).length;
  const pct = Math.round((below / values.length) * 100);
  const sorted = [...values].sort((a, b) => b.v - a.v);
  const rank = sorted.findIndex((p) => p.v <= mine) + 1 || values.length + 1;
  // Enough dots to show the spread without shipping a thousand links.
  const step = Math.max(1, Math.ceil(values.length / 300));
  const drawn = sorted.filter((_, i) => i % step === 0);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{metric.label}</span>
        <span className="text-xs text-muted-foreground">
          <span className="figure text-foreground">{metric.format(mine)}</span> · #{rank} of {values.length + 1} ·{" "}
          {rank === 1
            ? "the largest"
            : rank === values.length + 1
              ? "the smallest"
              : pct >= 50
                ? `larger than ${pct}% of peers`
                : `smaller than ${100 - pct}% of peers`}
        </span>
      </div>
      <div className="relative mt-3 h-7">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        {drawn.map((p) => (
          <Link
            key={p.r.id}
            href={`/companies/${p.r.id}`}
            title={`${p.r.name}: ${metric.format(p.v)}`}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--chart-bar)]/60 bg-[var(--chart-bar)]/25 hover:bg-[var(--chart-bar)]"
            style={{ left: `${x(p.v)}%` }}
          />
        ))}
        <span
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--card)] bg-[var(--foreground)] ring-2 ring-[var(--brass)]"
          style={{ left: `${x(mine)}%` }}
          title={`${firm.name}: ${metric.format(mine)}`}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10.5px] text-muted-foreground">
        <span className="figure">{metric.format(10 ** lo)}</span>
        <span>log scale · {metric.basis}</span>
        <span className="figure">{metric.format(10 ** hi)}</span>
      </div>
    </div>
  );
}

/** Where a firm sits among firms of its own type: one dot per peer. */
export function PeerBenchmark({ firm, records }: { firm: DirectoryRecord; records: DirectoryRecord[] }) {
  const sameType = records.filter((r) => r.id !== firm.id && r.category === firm.category && firm.subType && r.subType === firm.subType);
  const peers = sameType.length >= 6 ? sameType : records.filter((r) => r.id !== firm.id && r.category === firm.category);
  const strips = METRICS.map((m) => ({ m, ok: m.value(firm) != null && peers.filter((p) => m.value(p) != null).length >= 4 })).filter((s) => s.ok);
  if (!strips.length) return null;
  const peerLabel = sameType.length >= 6 ? `${firm.subType} ${firm.category === "GP" ? "managers" : "firms"}` : `the ${firm.category} book`;

  return (
    <section id="peers" className="sheen scroll-mt-20 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">How it compares</h2>
        </div>
        <span className="text-xs text-muted-foreground">
          Against {peers.length.toLocaleString("en-US")} {peerLabel} · each dot is a firm
        </span>
      </div>
      <div className="space-y-6 px-5 py-5">
        {strips.map(({ m }) => (
          <Strip key={m.label} firm={firm} peers={peers} metric={m} />
        ))}
      </div>
    </section>
  );
}
