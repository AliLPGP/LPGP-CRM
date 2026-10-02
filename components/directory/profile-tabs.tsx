"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { TabPanel } from "./profile-sections";

// A profile's tabs. The URL is the state (`?tab=`), read by both halves
// through `useSearchParams`, so the bar in the shell's header and the panel
// below it agree without sharing anything else.
//
// A tab whose rows came with the page (`eager`) switches in the browser:
// its link writes the URL with `pushState`, which Next's router picks up,
// and the panel that was already in the page shows at once. A tab fetched
// on request (a limited partner's 900 commitments, a sponsor's portfolio)
// navigates, and the server streams it behind the header.

export type ProfileTab = { key: string; label: string; count: number | null; href: string; eager: boolean };

const DEFAULT_TAB = "overview";

function activeTab(tabs: ProfileTab[], wanted: string | null): string {
  return tabs.some((t) => t.key === wanted) ? (wanted as string) : DEFAULT_TAB;
}

export function ProfileTabBar({ tabs }: { tabs: ProfileTab[] }) {
  const active = activeTab(tabs, useSearchParams().get("tab"));
  return (
    <nav className="desk-tabs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className="desk-tab"
          data-active={active === t.key ? "true" : undefined}
          aria-current={active === t.key ? "page" : undefined}
          onClick={
            t.eager
              ? (e) => {
                  // A plain click only: a modifier or a middle click still opens a new tab.
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  window.history.pushState(null, "", t.href);
                }
              : undefined
          }
        >
          {t.label}
          {t.count != null ? <span className="count">{t.count.toLocaleString("en-US")}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

export function ProfileTabPanel({
  tabs,
  panels,
  serverTab,
  current,
  fallback,
}: {
  tabs: ProfileTab[];
  /** The panels that came with the page, by tab key. */
  panels: Record<string, React.ReactNode>;
  /** The tab the server rendered `current` for, when it is one fetched on request. */
  serverTab: string;
  current: React.ReactNode;
  /** What a tab fetched on request looks like while the navigation is in flight. */
  fallback: React.ReactNode;
}) {
  const active = activeTab(tabs, useSearchParams().get("tab"));
  const panel = active in panels ? panels[active] : active === serverTab ? current : fallback;
  return <TabPanel key={active}>{panel}</TabPanel>;
}
