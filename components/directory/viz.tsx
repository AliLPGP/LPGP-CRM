"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";

// Small building blocks shared by Discover's dashboard, the result insights
// and the market map. Bars carry magnitude, so they wear the one blue
// (--chart-bar) and never a series colour.

export function Panel({
  eyebrow,
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("sheen flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card", className)}>
      <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
        <div className="min-w-0">
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2 className="display mt-0.5 text-[15px] leading-snug">{title}</h2>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className={cn("min-h-0 flex-1 px-5 pb-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PanelLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  const cls = "inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children} <ArrowUpRight className="h-3 w-3" />
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children} <ArrowUpRight className="h-3 w-3" />
    </button>
  );
}

/** One row of a horizontal magnitude bar list. */
export function BarRow({
  label,
  value,
  display,
  max,
  sub,
  leading,
  onClick,
  href,
  rank,
}: {
  label: React.ReactNode;
  value: number;
  display?: React.ReactNode;
  max: number;
  sub?: React.ReactNode;
  leading?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  rank?: number;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  const inner = (
    <>
      {rank != null ? <span className="figure w-5 shrink-0 text-right text-[11px] text-muted-foreground">{rank}</span> : null}
      {leading}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13px] font-medium">{label}</span>
          <span className="figure shrink-0 text-[12.5px]">{display ?? value.toLocaleString("en-US")}</span>
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bar-track">
          <span className="block h-full rounded-full bar-fill transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </span>
        {sub ? <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">{sub}</span> : null}
      </span>
    </>
  );
  const cls = "group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/50";
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/** Overlapping logos, largest first. */
export function LogoStack({
  items,
  size = 28,
  max = 6,
  extra,
}: {
  items: { id: string; name: string; domain: string | null }[];
  size?: number;
  max?: number;
  extra?: number;
}) {
  const shown = items.slice(0, max);
  return (
    <div className="flex items-center">
      {shown.map((r, i) => (
        <span
          key={r.id}
          className="rounded-md ring-2 ring-[var(--card)]"
          style={{ marginLeft: i ? -size * 0.28 : 0, zIndex: shown.length - i }}
          title={r.name}
        >
          <CompanyLogo name={r.name} domain={r.domain} size={size} />
        </span>
      ))}
      {extra && extra > 0 ? (
        <span className="ml-2 text-xs text-muted-foreground">+{extra.toLocaleString("en-US")}</span>
      ) : null}
    </div>
  );
}

/** A figure with its label, for KPI strips. */
export function Figure({
  label,
  value,
  sub,
  className,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span className="eyebrow block">{label}</span>
      <span className="figure mt-1.5 block text-[26px] leading-none md:text-[30px]">{value}</span>
      {sub ? <span className="mt-1.5 block text-[11.5px] leading-snug text-muted-foreground">{sub}</span> : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn("min-w-0 text-left transition-opacity hover:opacity-80", className)}>
        {body}
      </button>
    );
  }
  return <div className={cn("min-w-0", className)}>{body}</div>;
}

/** Compact counts: 1,774 → "1,774"; 12,400 → "12.4k". */
export function compact(n: number): string {
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-US");
}
