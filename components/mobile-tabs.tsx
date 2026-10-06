"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Briefcase, Building2, Landmark, Layers, Menu } from "lucide-react";
import { INTEL_NAV } from "@/components/intel/shell";
import { openMobileMenu, startNavigation } from "@/components/top-nav";
import { cn } from "@/lib/utils";

// The phone's bottom tab bar: the four sections a reader lives in, and More
// for the rest of the map (the header's drawer). Fixed under the page, black
// like the rail, padded for the home indicator. Which tab is lit is decided
// by the same matchers the header reads (INTEL_NAV), so the two never
// disagree about where a page belongs. Hidden from lg up, where the header
// carries the sections itself.

type Tab = { key: string; label: string; href: string; icon: typeof Landmark; nav: string };

const TABS: Tab[] = [
  { key: "investors", label: "Investors", href: "/database?book=LP", icon: Landmark, nav: "Investors" },
  { key: "managers", label: "Managers", href: "/database?book=GP", icon: Briefcase, nav: "Fund managers" },
  { key: "funds", label: "Funds", href: "/funds", icon: Layers, nav: "Funds" },
  { key: "companies", label: "Companies", href: "/database/portcos", icon: Building2, nav: "Companies & deals" },
];

/** The tab the page belongs to, by the header's own matchers; null when it is none of the four. */
function currentTab(pathname: string, search: URLSearchParams | null): string | null {
  const s = search ?? new URLSearchParams();
  for (const item of INTEL_NAV) {
    if (!item.match(pathname, s)) continue;
    return TABS.find((t) => t.nav === item.label)?.key ?? null;
  }
  return null;
}

function TabRow({ pathname, search }: { pathname: string; search: URLSearchParams | null }) {
  const current = currentTab(pathname, search);
  return (
    <nav className="mobile-tabs rail lg:hidden" aria-label="Sections">
      {TABS.map((t) => {
        const on = current === t.key;
        const Icon = t.icon;
        return (
          <Link
            key={t.key}
            href={t.href}
            onClick={() => startNavigation(t.href)}
            className={cn("mobile-tab", on && "is-on")}
            aria-current={on ? "page" : undefined}
          >
            <Icon className="h-[22px] w-[22px]" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
            <span>{t.label}</span>
          </Link>
        );
      })}
      <button type="button" onClick={openMobileMenu} className="mobile-tab" aria-label="More: the whole menu" aria-haspopup="dialog">
        <Menu className="h-[22px] w-[22px]" strokeWidth={1.75} aria-hidden />
        <span>More</span>
      </button>
    </nav>
  );
}

// The query string is read behind a Suspense boundary, as the header does:
// a statically rendered page gets the path-only answer and hydrates to the
// full one, instead of failing the build over useSearchParams.
function TabsLive() {
  const pathname = usePathname();
  const search = useSearchParams();
  return <TabRow pathname={pathname} search={search} />;
}

export function MobileTabs() {
  const pathname = usePathname();
  return (
    <Suspense fallback={<TabRow pathname={pathname} search={null} />}>
      <TabsLive />
    </Suspense>
  );
}
