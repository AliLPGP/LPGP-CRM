"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The intelligence section's frame: a breadcrumb, the section's own
// navigation, and a title row with its toolbar — the same on every screen so
// moving from a firm to its funds to a deal never feels like leaving.

export type Crumb = { href?: string; label: string };

export const INTEL_NAV: { href: string; label: string; match: (path: string, search: URLSearchParams) => boolean }[] = [
  { href: "/database", label: "Overview", match: (p, s) => p === "/database" && !s.toString() },
  { href: "/database?view=table", label: "Firms", match: (p, s) => (p === "/database" && s.toString() !== "") || p.startsWith("/companies") },
  { href: "/funds", label: "Funds", match: (p) => p.startsWith("/funds") },
  { href: "/database/deals", label: "Deals", match: (p) => p.startsWith("/database/deals") },
  // Sports is an asset class: it lives under that tab, not beside it.
  { href: "/database/asset-classes", label: "Asset classes", match: (p) => p.startsWith("/database/asset-classes") || p.startsWith("/database/sports") },
  { href: "/database/market", label: "Service providers", match: (p) => p.startsWith("/database/market") || p.startsWith("/database/providers") },
  { href: "/database/signals", label: "Signals", match: (p) => p.startsWith("/database/signals") },
  { href: "/database/workflows", label: "Workflows", match: (p) => p.startsWith("/database/workflows") },
  { href: "/contacts", label: "People", match: (p) => p.startsWith("/contacts") },
  { href: "/database/lists", label: "Lists", match: (p) => p.startsWith("/database/lists") },
];

export function IntelNav() {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <nav className="desk-tabs" aria-label="Intelligence sections">
      {INTEL_NAV.map((item) => {
        const on = item.match(pathname, search);
        return (
          <Link key={item.href} href={item.href} className="desk-tab" aria-current={on ? "page" : undefined}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Crumbs({ items }: { items: Crumb[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground">
      <li>
        <Link href="/database" className="hover:text-foreground">
          Intelligence
        </Link>
      </li>
      {items.map((c, i) => (
        <li key={`${c.label}-${i}`} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3 opacity-60" />
          {c.href ? (
            <Link href={c.href} className="hover:text-foreground">
              {c.label}
            </Link>
          ) : (
            <span className="text-foreground">{c.label}</span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function IntelShell({
  crumbs,
  title,
  kicker,
  description,
  actions,
  tabs,
  children,
  wide = true,
  nav = true,
}: {
  crumbs?: Crumb[];
  title?: React.ReactNode;
  /** A small line above the title: the entity's type or its parent. */
  kicker?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Sub-tabs for this screen (a profile's sections, a hub's views). */
  tabs?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  nav?: boolean;
}) {
  return (
    <div className={cn("desk mx-auto space-y-4 px-4 py-5 md:px-6", wide ? "max-w-[1480px]" : "max-w-6xl")}>
      {nav ? <IntelNav /> : null}
      {crumbs ? <Crumbs items={crumbs} /> : null}
      {title ? (
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {kicker ? <div className="desk-label mb-1">{kicker}</div> : null}
            <h1 className="display text-[22px] leading-tight md:text-[26px]">{title}</h1>
            {description ? <p className="mt-1 max-w-3xl text-[12.5px] text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-1.5">{actions}</div> : null}
        </header>
      ) : null}
      {tabs}
      {children}
    </div>
  );
}
