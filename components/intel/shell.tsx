"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// The intelligence section's frame: a breadcrumb, the section's own
// navigation, and a title row with its toolbar — the same on every screen so
// moving from a firm to its funds to a deal never feels like leaving.

export type Crumb = { href?: string; label: string };

/** The directory's book as the URL carries it, as a canonical key: `LP,SP` and `SP,LP` are one book. */
const bookOf = (s: URLSearchParams) => (s.get("book") ?? s.get("category") ?? "").split(",").filter(Boolean).sort().join(",");

const FUND_DEAL_KINDS = new Set(["fund_close", "fundraise"]);

// One matcher per section of the desk — the header reads these to light the
// section a page belongs to, and `IntelNav` can still draw them as tabs. Pages several sections share are told apart
// by the query: the book on the directory, the kind of signal or deal, the
// Form D tab of an asset-class page.
export const INTEL_NAV: { href: string; label: string; match: (path: string, search: URLSearchParams) => boolean }[] = [
  { href: "/database", label: "Overview", match: (p, s) => p === "/database" && !s.toString() },
  {
    href: "/database?book=LP&view=table",
    label: "Investors",
    match: (p, s) =>
      (p === "/database" && (bookOf(s) === "LP" || s.get("itype") === "investment_consultant")) ||
      p.startsWith("/database/mandates") ||
      p.startsWith("/database/commitments") ||
      (p.startsWith("/database/signals") && s.get("kind") === "news"),
  },
  {
    href: "/database?book=GP&view=table",
    label: "Fund managers",
    match: (p, s) =>
      (p === "/database" && bookOf(s) === "GP") ||
      (p.startsWith("/database/asset-classes") && s.get("tab") !== "raises") ||
      (p.startsWith("/database/signals") && s.get("kind") !== "news"),
  },
  {
    href: "/funds",
    label: "Funds",
    match: (p, s) =>
      p.startsWith("/funds") ||
      (p.startsWith("/database/deals") && FUND_DEAL_KINDS.has(s.get("kind") ?? "")) ||
      (p.startsWith("/database/asset-classes/") && s.get("tab") === "raises"),
  },
  { href: "/database/performance?tab=funds", label: "Performance", match: (p) => p.startsWith("/database/performance") },
  {
    href: "/database?book=SP&view=table",
    label: "Service providers",
    match: (p, s) =>
      (p === "/database" && bookOf(s) === "SP") || p.startsWith("/database/market") || p.startsWith("/database/providers") || p.startsWith("/database/lenders"),
  },
  // Sports is an asset class sold as deals: it lives here, beside the borrowers and portfolio companies.
  {
    href: "/database/deals",
    label: "Companies & deals",
    match: (p, s) =>
      (p.startsWith("/database/deals") && !FUND_DEAL_KINDS.has(s.get("kind") ?? "")) ||
      p.startsWith("/database/portcos") ||
      p.startsWith("/database/borrowers") ||
      p.startsWith("/database/sports"),
  },
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
  nav = false,
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
  /** The section tabs; off by default now the header carries the sections. */
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
