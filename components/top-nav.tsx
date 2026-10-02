"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, Command, LogOut, Menu, Moon, Search, Settings, Shield, Sun, X } from "lucide-react";
import { LpgpMark } from "@/components/lpgp-mark";
import { openCommandPalette } from "@/components/command-palette";
import { INTEL_NAV } from "@/components/intel/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn, initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

// The product's header, laid out the way a private-markets data terminal is:
// a section per kind of counterparty across the top, each opening a panel
// of the searches and ledgers a desk uses for it, the quick search in the
// middle, and the reader's own things on the right. Every page is listed
// once — the panels are the whole map, so a page never needs a second menu.
// The sales CRM rides along as one menu that can be put away, until it
// moves to its own product.

type Item = { href: string; label: string; note?: string };
type Column = { heading?: string; items: Item[] };
type Section = { key: string; label: string; href: string; columns: Column[]; blurb: string };

const SECTIONS: Section[] = [
  {
    key: "investors",
    label: "Investors",
    href: "/database?book=LP&view=table",
    blurb: "Limited partners: who they are, what they allocate, what they plan to do next.",
    columns: [
      {
        heading: "Search",
        items: [
          { href: "/database?book=LP&view=table", label: "Advanced search", note: "Type, allocation, geography, ticket" },
          { href: "/database?book=LP&sort=newest&view=table", label: "Newly added" },
          { href: "/database?book=LP&sort=updated&view=table", label: "Recently updated" },
          { href: "/database?book=LP,SP&itype=investment_consultant&view=table", label: "Investment consultants" },
        ],
      },
      {
        heading: "Intelligence",
        items: [
          { href: "/database/mandates", label: "Mandates & RFPs", note: "Next twelve months, per asset class" },
          { href: "/database/commitments", label: "Past investments", note: "Disclosed fund commitments" },
          { href: "/database/signals?kind=news", label: "Investor news" },
        ],
      },
    ],
  },
  {
    key: "managers",
    label: "Fund managers",
    href: "/database?book=GP&view=table",
    blurb: "General partners by asset class, strategy and what they have raised.",
    columns: [
      {
        heading: "Search",
        items: [
          { href: "/database?book=GP&view=table", label: "Advanced search", note: "Strategy, sector, raised per class" },
          { href: "/database?book=GP&sort=newest&view=table", label: "Newly added" },
          { href: "/database?book=GP&sort=updated&view=table", label: "Recently updated" },
        ],
      },
      {
        heading: "By asset class",
        items: [
          { href: "/database/asset-classes", label: "All asset classes" },
          { href: "/database/asset-classes/private-equity", label: "Private equity" },
          { href: "/database/asset-classes/private-credit", label: "Private credit" },
          { href: "/database/asset-classes/venture-capital", label: "Venture capital" },
          { href: "/database/asset-classes/real-estate", label: "Real estate" },
          { href: "/database/asset-classes/infrastructure", label: "Infrastructure" },
          { href: "/database/asset-classes/natural-resources", label: "Natural resources" },
          { href: "/database/asset-classes/secondaries", label: "Secondaries" },
          { href: "/database/asset-classes/hedge-funds", label: "Hedge funds" },
        ],
      },
    ],
  },
  {
    key: "funds",
    label: "Funds",
    href: "/funds",
    blurb: "Every fund on file: strategy, region, size, status and terms.",
    columns: [
      {
        heading: "Search",
        items: [
          { href: "/funds", label: "Advanced search", note: "Strategy, sector, region, size, status" },
          { href: "/funds?strategy=pe_hybrid", label: "Evergreen & hybrid funds" },
        ],
      },
      {
        heading: "Fundraising",
        items: [
          { href: "/database/deals?kind=fund_close", label: "Recently closed" },
          { href: "/database/asset-classes/private-equity?tab=raises", label: "Form D filings", note: "US private offerings as filed" },
        ],
      },
    ],
  },
  {
    key: "performance",
    label: "Performance",
    href: "/database/performance?tab=funds",
    blurb: "Net IRR, multiples, DPI and RVPI as the investors themselves report them.",
    columns: [
      {
        items: [
          { href: "/database/performance?tab=funds", label: "Best performing funds" },
          { href: "/database/performance?tab=managers", label: "Best performing managers" },
          { href: "/database/performance?tab=benchmark", label: "Market benchmarks", note: "Published figures per class and strategy" },
        ],
      },
    ],
  },
  {
    key: "providers",
    label: "Service providers",
    href: "/database?book=SP&view=table",
    blurb: "The firms funds and transactions retain, with the managers that file them.",
    columns: [
      {
        heading: "Fund services",
        items: [
          { href: "/database?book=SP&view=table", label: "Advanced search" },
          { href: "/database?book=SP&itype=placement_agent&view=table", label: "Placement agents" },
          { href: "/database?book=SP&itype=law_firm&view=table", label: "Law firms" },
          { href: "/database?book=SP&itype=fund_administrator&view=table", label: "Fund administrators" },
          { href: "/database?book=SP&itype=prime_broker&view=table", label: "Prime brokers" },
          { href: "/database?book=SP&itype=auditor&view=table", label: "Auditors" },
          { href: "/database?book=SP&itype=custodian&view=table", label: "Custodians" },
        ],
      },
      {
        heading: "Transaction services",
        items: [
          { href: "/database?book=SP&itype=bank&view=table", label: "Banks & financial advisors" },
          { href: "/database/lenders", label: "Debt providers", note: "Loan books as filed" },
          { href: "/database/market", label: "League tables", note: "Who serves the most managers" },
        ],
      },
    ],
  },
  {
    key: "companies",
    label: "Companies & deals",
    href: "/database/deals",
    blurb: "The transactions, the companies behind them and the news around them.",
    columns: [
      {
        items: [
          { href: "/database/deals", label: "Deals", note: "Every sourced transaction" },
          { href: "/database/portcos", label: "Portfolio companies" },
          { href: "/database/borrowers", label: "Borrowers" },
          { href: "/database/sports", label: "Sports" },
          { href: "/database/signals", label: "Signals & news" },
        ],
      },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    href: "/database/workflows",
    blurb: "The desk's workflows, people, lists and imports.",
    columns: [
      {
        heading: "Workflows",
        items: [
          { href: "/database/workflows/market-intelligence", label: "Market intelligence" },
          { href: "/database/workflows/deal-sourcing", label: "Deal sourcing" },
          { href: "/database/workflows/deal-execution", label: "Deal execution" },
          { href: "/database/workflows/due-diligence", label: "Due diligence" },
          { href: "/database/workflows/fundraising", label: "Fundraising" },
          { href: "/database/workflows/benchmarking", label: "Benchmarking" },
          { href: "/database/workflows/business-development", label: "Business development" },
          { href: "/database/workflows/asset-allocation", label: "Asset allocation" },
          { href: "/database/workflows/portfolio-management", label: "Portfolio management" },
          { href: "/database/workflows/networking", label: "Networking" },
        ],
      },
      {
        heading: "Yours",
        items: [
          { href: "/contacts", label: "People" },
          { href: "/database/lists", label: "Target lists" },
          { href: "/portfolio", label: "Watchlist" },
          { href: "/import", label: "Import", note: "Master directory and datasets" },
        ],
      },
    ],
  },
];

const CRM: Item[] = [
  { href: "/", label: "Command centre" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/leads", label: "Leads" },
  { href: "/leads/workspace", label: "Call workspace" },
  { href: "/accounts", label: "Accounts" },
  { href: "/deals", label: "My deals" },
  { href: "/events", label: "Event performance" },
  { href: "/import/leads", label: "Import leads" },
];

const CRM_PATHS = ["/pipeline", "/leads", "/accounts", "/deals", "/events", "/import/leads"];

// --- Which section the page belongs to ------------------------------------------
// One rule for the header and the pages: the matchers the desk shell already
// keeps. Tools covers what the shell lists as workflows, people and lists.

const SECTION_OF_TAB: Record<string, string> = {
  Investors: "investors",
  "Fund managers": "managers",
  Funds: "funds",
  Performance: "performance",
  "Service providers": "providers",
  "Companies & deals": "companies",
  Workflows: "tools",
  People: "tools",
  Lists: "tools",
};

function sectionOf(pathname: string, search: URLSearchParams | null): string | null {
  const s = search ?? new URLSearchParams();
  for (const tab of INTEL_NAV) if (tab.match(pathname, s) && SECTION_OF_TAB[tab.label]) return SECTION_OF_TAB[tab.label];
  if (pathname.startsWith("/portfolio") || pathname.startsWith("/import")) return pathname.startsWith("/import/leads") ? "crm" : "tools";
  if (pathname === "/" || CRM_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return "crm";
  if (pathname.startsWith("/companies/") || pathname.startsWith("/funds/")) return null;
  return null;
}

// --- Navigation in flight ----------------------------------------------------------
// A thin brass line along the top of the bar while a route is being fetched.
// Next's `useLinkStatus` only answers inside the Link that was clicked, and a
// panel link unmounts the moment its panel closes, so the bar keys on the
// URL instead: a click records the page it left from, and the bar shows
// until the page shown is no longer that one. A click on the page already
// shown records nothing, so the line can never run with nowhere to go.

const NAV_EVENT = "nav-progress";
let navFrom: string | null = null;

/** A URL as path plus query, serialised one way so two spellings of the same page compare equal. */
function keyOf(url: string): string {
  try {
    const u = new URL(url, "http://x");
    const q = u.searchParams.toString();
    return q ? `${u.pathname}?${q}` : u.pathname;
  } catch {
    return url;
  }
}

/** Marks a navigation to `href` as started from the page the browser shows now. The command palette calls it too. */
export function startNavigation(href: string) {
  if (typeof window === "undefined") return;
  const from = keyOf(window.location.href);
  navFrom = keyOf(href) === from ? null : from;
  window.dispatchEvent(new Event(NAV_EVENT));
}

function subscribeNav(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(NAV_EVENT, cb);
  return () => window.removeEventListener(NAV_EVENT, cb);
}

function NavProgress({ pathname, search }: { pathname: string; search: URLSearchParams | null }) {
  const from = useSyncExternalStore(subscribeNav, () => navFrom, () => null);
  const q = search?.toString() ?? "";
  const pending = from != null && from === keyOf(q ? `${pathname}?${q}` : pathname);
  return pending ? <span className="topnav-progress" aria-hidden /> : null;
}

// --- The CRM menu, put away or shown, remembered per browser -------------------

const CRM_KEY = "nav:crm";
const CRM_EVENT = "nav-crm";

function subscribeCrm(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CRM_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CRM_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function readCrm(): boolean {
  try {
    return localStorage.getItem(CRM_KEY) !== "hidden";
  } catch {
    return true;
  }
}

function useCrmShown(): [boolean, () => void] {
  const shown = useSyncExternalStore(subscribeCrm, readCrm, () => true);
  const toggle = () => {
    try {
      localStorage.setItem(CRM_KEY, shown ? "hidden" : "shown");
    } catch {
      /* the choice just does not persist */
    }
    window.dispatchEvent(new Event(CRM_EVENT));
  };
  return [shown, toggle];
}

// --- Theme, as an icon ------------------------------------------------------------

function subscribeTheme(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("themechange", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("themechange", cb);
    window.removeEventListener("storage", cb);
  };
}

function ThemeIcon() {
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains("dark"), () => false);
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.classList.toggle("dark", !dark);
        try {
          localStorage.setItem("theme", dark ? "light" : "dark");
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event("themechange"));
      }}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="topnav-icon"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

// --- Menus --------------------------------------------------------------------------

/** Closes an open menu on a click outside it or on Escape. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

/** Whether a menu item is the page shown: a link with a query must match it exactly; a bare path matches whatever query the page carries. */
function isCurrent(href: string, pathname: string, search: URLSearchParams | null): boolean {
  if (!href.includes("?")) return href === pathname;
  const q = search?.toString() ?? "";
  return keyOf(href) === keyOf(q ? `${pathname}?${q}` : pathname);
}

function MenuLink({ item, onNavigate, on }: { item: Item; onNavigate: () => void; on?: boolean }) {
  return (
    <Link
      href={item.href}
      onClick={() => {
        startNavigation(item.href);
        onNavigate();
      }}
      className={cn("topnav-link", on && "is-on")}
      aria-current={on ? "page" : undefined}
    >
      <span className="block text-[13px] font-medium leading-tight">{item.label}</span>
      {item.note ? <span className="mt-0.5 block text-[11px] leading-tight text-[var(--rail-fg-dim)]">{item.note}</span> : null}
    </Link>
  );
}

function SectionPanel({ section, onNavigate, pathname, search }: { section: Section; onNavigate: () => void; pathname: string; search: URLSearchParams | null }) {
  return (
    <div className="topnav-panel" role="menu" aria-label={section.label}>
      <div className="mx-auto flex max-w-[1480px] gap-8 px-5 py-5 md:px-7">
        <div className="hidden w-56 shrink-0 lg:block">
          <p className="wordmark text-[10px] text-[var(--brass)]">{section.label}</p>
          <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--rail-fg-dim)]">{section.blurb}</p>
          <Link
            href={section.href}
            onClick={() => {
              startNavigation(section.href);
              onNavigate();
            }}
            className="topnav-link mt-2 -ml-2 inline-block text-[12.5px] font-medium"
          >
            Open {section.label.toLowerCase()} →
          </Link>
        </div>
        <div className={cn("grid flex-1 gap-x-8 gap-y-5", section.columns.length > 1 ? "sm:grid-cols-2" : "sm:grid-cols-1 sm:max-w-sm")}>
          {section.columns.map((col, i) => (
            <div key={i}>
              {col.heading ? <p className="wordmark mb-2 text-[9.5px] text-[var(--rail-fg-dim)]">{col.heading}</p> : null}
              <ul className="space-y-0.5">
                {col.items.map((it) => (
                  <li key={it.href + it.label}>
                    <MenuLink item={it} onNavigate={onNavigate} on={isCurrent(it.href, pathname, search)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopNav({ pathname, search }: { pathname: string; search: URLSearchParams | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setOpen(null);
  const ref = useDismiss(open != null, close);
  const current = sectionOf(pathname, search);
  const leave = useRef<number | null>(null);
  const enter = (key: string) => {
    if (leave.current) window.clearTimeout(leave.current);
    setOpen(key);
  };
  const scheduleClose = () => {
    if (leave.current) window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setOpen(null), 160);
  };
  return (
    <div
      ref={ref}
      className="relative hidden flex-1 items-stretch lg:flex"
      onMouseLeave={scheduleClose}
      onMouseEnter={() => leave.current && window.clearTimeout(leave.current)}
      // Tabbing out of the bar and its panel closes the panel, as the pointer leaving does.
      onBlur={(e) => {
        if (open && !ref.current?.contains(e.relatedTarget as Node | null)) close();
      }}
    >
      <ul className="flex items-stretch gap-0.5">
        {SECTIONS.map((s) => {
          const on = current === s.key;
          const isOpen = open === s.key;
          return (
            <li key={s.key} className="flex items-stretch" onMouseEnter={() => enter(s.key)}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.key)}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                className={cn("topnav-section", (on || isOpen) && "is-on")}
              >
                {s.label}
                <ChevronDown className={cn("ml-1 h-3 w-3 opacity-60 transition-transform duration-150", isOpen && "rotate-180")} />
              </button>
            </li>
          );
        })}
      </ul>
      {open ? <SectionPanel section={SECTIONS.find((s) => s.key === open)!} onNavigate={close} pathname={pathname} search={search} /> : null}
    </div>
  );
}

function CrmMenu({ pathname }: { pathname: string }) {
  const [shown, toggle] = useCrmShown();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const on = sectionOf(pathname, null) === "crm";
  if (!shown) return null;
  return (
    <div ref={ref} className="relative hidden lg:block">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="menu" className={cn("topnav-section", (on || open) && "is-on")}>
        <span className="wordmark mr-1.5 text-[9px] text-[var(--brass)]">CRM</span>
        Sales
        <ChevronDown className={cn("ml-1 h-3 w-3 opacity-60 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="topnav-dropdown right-0 w-64" role="menu">
          <ul className="space-y-0.5 p-2">
            {CRM.map((it) => (
              <li key={it.href}>
                <MenuLink item={it} onNavigate={close} on={pathname === it.href} />
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--rail-line)] px-3 py-2">
            <button type="button" onClick={() => { toggle(); close(); }} className="text-[11.5px] text-[var(--rail-fg-dim)] hover:text-white">
              Put the CRM away
            </button>
            <p className="mt-0.5 text-[10.5px] text-[var(--rail-fg-dim)]">It comes back from your account menu.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const [crmShown, toggleCrm] = useCrmShown();
  if (!user) {
    return (
      <Link href="/login" className="topnav-section">
        Sign in
      </Link>
    );
  }
  async function signOut() {
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account"
        className="grid h-8 w-8 place-items-center rounded-full bg-[var(--brass)] text-[11px] font-bold text-[#121316]"
      >
        {initials(user.name)}
      </button>
      {open ? (
        <div className="topnav-dropdown right-0 w-60" role="menu">
          <div className="border-b border-[var(--rail-line)] px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-[#f3efe6]">{user.name}</p>
            <p className="truncate text-[11px] text-[var(--rail-fg-dim)]">
              {user.email} · {user.role === "admin" ? "Admin" : "Member"}
            </p>
          </div>
          <ul className="p-2">
            <li>
              <Link href="/settings" onClick={() => { startNavigation("/settings"); close(); }} className="topnav-link flex items-center gap-2">
                <Settings className="h-3.5 w-3.5 opacity-70" /> Settings
              </Link>
            </li>
            {user.role === "admin" ? (
              <li>
                <Link href="/admin" onClick={() => { startNavigation("/admin"); close(); }} className="topnav-link flex items-center gap-2">
                  <Shield className="h-3.5 w-3.5 opacity-70" /> Team & assignments
                </Link>
              </li>
            ) : null}
            <li>
              <button type="button" onClick={() => { toggleCrm(); close(); }} className="topnav-link flex w-full items-center gap-2 text-left">
                <Command className="h-3.5 w-3.5 opacity-70" /> {crmShown ? "Put the sales CRM away" : "Show the sales CRM"}
              </button>
            </li>
            <li>
              <button type="button" onClick={signOut} disabled={pending} className="topnav-link flex w-full items-center gap-2 text-left">
                <LogOut className="h-3.5 w-3.5 opacity-70" /> {pending ? "Signing out…" : "Sign out"}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SearchTrigger() {
  return (
    <button type="button" onClick={openCommandPalette} aria-label="Quick search" className="topnav-search">
      <Search className="h-3.5 w-3.5 opacity-70" />
      <span className="hidden flex-1 text-left sm:inline">Quick search</span>
      <kbd className="hidden rounded border border-[var(--rail-line)] px-1 text-[10px] tabular sm:inline">⌘K</kbd>
    </button>
  );
}

function MobileDrawer({ user, pathname }: { user: SessionUser | null; pathname: string }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [crmShown] = useCrmShown();
  const close = () => setOpen(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // While the drawer is up the page behind it does not scroll, Escape puts it
  // away, and focus starts on the close button so the keyboard is inside it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} className="topnav-icon lg:hidden">
        <Menu className="h-5 w-5" />
      </button>
      {open ? (
        <div className="rail topnav-drawer fixed inset-0 z-50 overflow-y-auto lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex items-center justify-between border-b border-[var(--rail-line)] px-4 py-3">
            <Brand onClick={close} />
            <button ref={closeRef} type="button" onClick={close} aria-label="Close menu" className="topnav-icon">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-3 py-3">
            <button type="button" onClick={() => { close(); openCommandPalette(); }} className="topnav-search mb-3 w-full">
              <Search className="h-3.5 w-3.5 opacity-70" />
              <span className="flex-1 text-left">Quick search</span>
            </button>
            {[...SECTIONS, ...(crmShown ? [{ key: "crm", label: "Sales CRM", href: "/", blurb: "", columns: [{ items: CRM }] } as Section] : [])].map((s) => {
              const isOpen = section === s.key;
              return (
                <div key={s.key} className="border-b border-[var(--rail-line)]">
                  <button
                    type="button"
                    onClick={() => setSection(isOpen ? null : s.key)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center justify-between py-3 text-[14px] font-medium text-[var(--rail-fg)]"
                  >
                    {s.label}
                    <ChevronDown className={cn("h-4 w-4 opacity-60 transition-transform duration-150", isOpen && "rotate-180")} />
                  </button>
                  {isOpen ? (
                    <div className="fade-in-fast pb-3">
                      {s.columns.map((col, i) => (
                        <div key={i} className="mb-2">
                          {col.heading ? <p className="wordmark mb-1 px-2 text-[9.5px] text-[var(--rail-fg-dim)]">{col.heading}</p> : null}
                          <ul>
                            {col.items.map((it) => (
                              <li key={it.href + it.label}>
                                <MenuLink item={it} onNavigate={close} on={pathname === it.href} />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            <div className="flex items-center justify-between py-3">
              <Link href="/settings" onClick={() => { startNavigation("/settings"); close(); }} className="text-[13px] text-[var(--rail-fg)]">
                Settings
              </Link>
              <div className="flex items-center gap-2">
                <ThemeIcon />
                <UserMenu user={user} />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/database"
      onClick={() => {
        startNavigation("/database");
        onClick?.();
      }}
      className="group flex items-center gap-2.5 rounded-[4px] py-2"
    >
      <LpgpMark className="h-7 w-7 shrink-0 text-[var(--rail-fg)]" />
      <span className="leading-none">
        <span className="block text-[14px] font-bold tracking-tight text-[#f3efe6]">LPGP Connect</span>
        <span className="wordmark mt-0.5 block text-[8.5px] text-[var(--brass)]">Private markets intelligence</span>
      </span>
    </Link>
  );
}

// The query string is read behind a Suspense boundary: a statically rendered
// page (not-found, errors) gets the path-only answer and hydrates to the full
// one, instead of failing the build over useSearchParams.
function NavLive({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <NavRow user={user} pathname={pathname} search={search} />;
}

function NavRow({ user, pathname, search }: { user: SessionUser | null; pathname: string; search: URLSearchParams | null }) {
  return (
    <div className="mx-auto flex h-14 max-w-[1480px] items-stretch gap-3 px-4 md:px-6">
      <NavProgress pathname={pathname} search={search} />
      <MobileDrawer user={user} pathname={pathname} />
      <Brand />
      <DesktopNav pathname={pathname} search={search} />
      <div className="ml-auto flex items-center gap-1.5">
        <SearchTrigger />
        <CrmMenu pathname={pathname} />
        <span className="hidden lg:inline-flex">
          <ThemeIcon />
        </span>
        <span className="hidden lg:inline-flex">
          <UserMenu user={user} />
        </span>
      </div>
    </div>
  );
}

export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  return (
    <header className="rail topnav sticky top-0 z-40">
      <Suspense fallback={<NavRow user={user} pathname={pathname} search={null} />}>
        <NavLive user={user} />
      </Suspense>
    </header>
  );
}
