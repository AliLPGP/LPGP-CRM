"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BarChart3,
  Bookmark,
  Briefcase,
  Building2,
  CalendarDays,
  ChevronDown,
  Command,
  Contact,
  FileInput,
  Gauge,
  Handshake,
  Kanban,
  Landmark,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  PhoneCall,
  Search,
  Settings,
  Shield,
  Sun,
  Upload,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { LpgpMark } from "@/components/lpgp-mark";
import { openCommandPalette } from "@/components/command-palette";
import { INTEL_NAV } from "@/components/intel/shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn, initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

// The product's frame: a sidebar down the left and a search-first bar across
// the top of the page column. The sidebar holds two workspaces, Research (the
// directory and the market) and Sales (the CRM), behind one switch, so neither
// hides inside the other's menu. A section opens in place to show the
// searches and ledgers a desk uses for it; every page is listed once. On a
// phone the same sidebar slides over the page from the bar's menu button and
// the bottom tab bar's More.

type Icon = typeof Landmark;
type Item = { href: string; label: string; note?: string };
type Column = { heading?: string; items: Item[] };
type Section = { key: string; label: string; href: string; icon: Icon; columns: Column[] };
type Workspace = "research" | "sales";

const SECTIONS: Section[] = [
  {
    key: "investors",
    label: "Investors",
    href: "/database?book=LP",
    icon: Landmark,
    columns: [
      {
        items: [
          { href: "/database?book=LP", label: "Advanced search" },
          { href: "/database?book=LP&sort=newest", label: "Newly added" },
          { href: "/database?book=LP&sort=updated", label: "Recently updated" },
          { href: "/database?book=LP,SP&itype=investment_consultant", label: "Investment consultants" },
          { href: "/database/mandates", label: "Mandates & RFPs" },
          { href: "/database/commitments", label: "Past investments" },
          { href: "/database/signals?kind=news", label: "Investor news" },
        ],
      },
    ],
  },
  {
    key: "managers",
    label: "Fund managers",
    href: "/database?book=GP",
    icon: Briefcase,
    columns: [
      {
        items: [
          { href: "/database?book=GP", label: "Advanced search" },
          { href: "/database?book=GP&sort=newest", label: "Newly added" },
          { href: "/database?book=GP&sort=updated", label: "Recently updated" },
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
    icon: Layers,
    columns: [
      {
        items: [
          { href: "/funds", label: "Advanced search" },
          { href: "/funds?strategy=pe_hybrid", label: "Evergreen & hybrid funds" },
          { href: "/database/deals?kind=fund_close", label: "Recently closed" },
          { href: "/database/asset-classes/private-equity?tab=raises", label: "Form D filings" },
          { href: "/database/performance?tab=funds", label: "Performance" },
        ],
      },
    ],
  },
  {
    key: "providers",
    label: "Service providers",
    href: "/database?book=SP",
    icon: Wrench,
    columns: [
      {
        heading: "Fund services",
        items: [
          { href: "/database?book=SP", label: "Advanced search" },
          { href: "/database?book=SP&itype=placement_agent", label: "Placement agents" },
          { href: "/database?book=SP&itype=law_firm", label: "Law firms" },
          { href: "/database?book=SP&itype=fund_administrator", label: "Fund administrators" },
          { href: "/database?book=SP&itype=prime_broker", label: "Prime brokers" },
          { href: "/database?book=SP&itype=auditor", label: "Auditors" },
          { href: "/database?book=SP&itype=custodian", label: "Custodians" },
        ],
      },
      {
        heading: "Transaction services",
        items: [
          { href: "/database?book=SP&itype=bank", label: "Banks & financial advisors" },
          { href: "/database/lenders", label: "Debt providers" },
          { href: "/database/market", label: "League tables" },
        ],
      },
    ],
  },
  {
    key: "companies",
    label: "Companies & deals",
    href: "/database/deals",
    icon: Building2,
    columns: [
      {
        items: [
          { href: "/database/deals", label: "Deals" },
          { href: "/database/portcos", label: "Portfolio companies" },
          { href: "/database/borrowers", label: "Borrowers" },
          { href: "/database/sports", label: "Sports" },
          { href: "/database/signals", label: "Signals & news" },
        ],
      },
    ],
  },
  { key: "people", label: "People", href: "/contacts", icon: Users, columns: [] },
];

/** The reader's own things, in both workspaces. */
const YOURS: Section[] = [
  { key: "lists", label: "Target lists", href: "/database/lists", icon: ListChecks, columns: [] },
  { key: "watchlist", label: "Watchlist", href: "/portfolio", icon: Bookmark, columns: [] },
];

/** The data desk: what is still to research, and the imports that fill it. */
const DATA: Section[] = [
  {
    key: "unresearched",
    label: "Data coverage",
    href: "/database?cov=thin",
    icon: Gauge,
    columns: [
      {
        items: [
          { href: "/database?cov=thin", label: "Everything unresearched" },
          { href: "/database?cov=thin&book=LP", label: "Limited partners" },
          { href: "/database?cov=thin&book=GP", label: "Fund managers" },
          { href: "/database?cov=thin&book=SP", label: "Service providers" },
          { href: "/database?cov=thin&book=UN", label: "Unclassified" },
        ],
      },
    ],
  },
  { key: "import", label: "Import", href: "/import", icon: Upload, columns: [] },
];

const SALES: Section[] = [
  { key: "crm-home", label: "Command centre", href: "/crm", icon: Command, columns: [] },
  { key: "pipeline", label: "Pipeline", href: "/pipeline", icon: Kanban, columns: [] },
  { key: "leads", label: "Leads", href: "/leads", icon: Contact, columns: [] },
  { key: "workspace", label: "Call workspace", href: "/leads/workspace", icon: PhoneCall, columns: [] },
  { key: "accounts", label: "Accounts", href: "/accounts", icon: Handshake, columns: [] },
  { key: "my-deals", label: "My deals", href: "/deals", icon: BarChart3, columns: [] },
  { key: "events", label: "Event performance", href: "/events", icon: CalendarDays, columns: [] },
  { key: "import-leads", label: "Import leads", href: "/import/leads", icon: FileInput, columns: [] },
];

const SALES_KEYS = new Set(SALES.map((s) => s.key));

// --- Which item the page belongs to ---------------------------------------------
// One rule for the sidebar and the pages: the matchers the desk shell already
// keeps for the directory, then the plain paths of everything else. The
// longest matching path wins, so the call workspace is not lit as Leads.

const SECTION_OF_TAB: Record<string, string> = {
  Investors: "investors",
  "Fund managers": "managers",
  Funds: "funds",
  Performance: "funds",
  "Service providers": "providers",
  "Companies & deals": "companies",
  "Unresearched data": "unresearched",
  People: "people",
  Lists: "lists",
};

const PATH_ITEMS: Section[] = [...SALES, ...YOURS, ...DATA.filter((d) => d.key === "import")];

function sectionOf(pathname: string, search: URLSearchParams | null): string | null {
  const s = search ?? new URLSearchParams();
  for (const tab of INTEL_NAV) if (tab.match(pathname, s) && SECTION_OF_TAB[tab.label]) return SECTION_OF_TAB[tab.label];
  let best: Section | null = null;
  for (const it of PATH_ITEMS) {
    if ((pathname === it.href || pathname.startsWith(`${it.href}/`)) && (!best || it.href.length > best.href.length)) best = it;
  }
  return best?.key ?? null;
}

function workspaceOf(key: string | null): Workspace {
  return key && SALES_KEYS.has(key) ? "sales" : "research";
}

// --- Navigation in flight ----------------------------------------------------------
// A thin blue line along the top of the bar while a route is being fetched.
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

// --- The mobile drawer, open or shut -------------------------------------------
// One store, so the bar's menu button and the bottom tab bar's "More" open the
// same drawer; the drawer reads it like the CRM flag above.

const DRAWER_EVENT = "nav-drawer";
let drawerOpen = false;

function subscribeDrawer(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(DRAWER_EVENT, cb);
  return () => window.removeEventListener(DRAWER_EVENT, cb);
}

function setDrawer(open: boolean) {
  if (drawerOpen === open) return;
  drawerOpen = open;
  window.dispatchEvent(new Event(DRAWER_EVENT));
}

/** Opens the phone menu from anywhere (the bottom tab bar's "More" uses this). */
export function openMobileMenu() {
  setDrawer(true);
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
        className="grid h-8 w-8 place-items-center rounded-full bg-[var(--primary)] text-[11px] font-bold text-white"
      >
        {initials(user.name)}
      </button>
      {open ? (
        <div className="topnav-dropdown right-0 w-60" role="menu">
          <div className="border-b border-[var(--rail-line)] px-3 py-2.5">
            <p className="truncate text-[13px] font-medium text-[var(--rail-fg-strong)]">{user.name}</p>
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

// --- The sidebar ------------------------------------------------------------------

type NavState = { pathname: string; search: URLSearchParams | null; current: string | null; onNavigate: () => void };

function NavItem({ section, nav, open, onToggle }: { section: Section; nav: NavState; open: boolean; onToggle: () => void }) {
  const on = nav.current === section.key;
  const Icon = section.icon;
  const hasSub = section.columns.length > 0;
  return (
    <li>
      <div className={cn("sidenav-item", on && "is-on")}>
        <Link
          href={section.href}
          onClick={() => {
            startNavigation(section.href);
            nav.onNavigate();
          }}
          className="sidenav-main"
          aria-current={on && !hasSub ? "page" : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={on ? 2.2 : 1.8} aria-hidden />
          <span className="truncate">{section.label}</span>
        </Link>
        {hasSub ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} ${section.label.toLowerCase()} pages`}
            className="sidenav-toggle"
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-150", open && "rotate-180")} />
          </button>
        ) : null}
      </div>
      {hasSub && open ? (
        <div className="sidenav-sub fade-in-fast">
          {section.columns.map((col, i) => (
            <div key={i}>
              {col.heading ? <p className="sidenav-subhead">{col.heading}</p> : null}
              <ul>
                {col.items.map((it) => {
                  const cur = isCurrent(it.href, nav.pathname, nav.search);
                  return (
                    <li key={it.href + it.label}>
                      <Link
                        href={it.href}
                        onClick={() => {
                          startNavigation(it.href);
                          nav.onNavigate();
                        }}
                        className={cn("sidenav-sublink", cur && "is-on")}
                        aria-current={cur ? "page" : undefined}
                      >
                        {it.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

function NavGroup({ label, items, nav }: { label: string; items: Section[]; nav: NavState }) {
  // A section the reader opened or shut by hand stays that way; otherwise the
  // page's own section is open and the rest are shut.
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  return (
    <div className="sidenav-group">
      <p className="sidenav-heading">{label}</p>
      <ul className="space-y-px">
        {items.map((s) => {
          const open = chosen[s.key] ?? nav.current === s.key;
          return <NavItem key={s.key} section={s} nav={nav} open={open} onToggle={() => setChosen({ ...chosen, [s.key]: !open })} />;
        })}
      </ul>
    </div>
  );
}

function WorkspaceSwitch({ value, onChange }: { value: Workspace; onChange: (w: Workspace) => void }) {
  return (
    <div className="ws-switch" role="group" aria-label="Workspace">
      {(["research", "sales"] as const).map((w) => (
        <button key={w} type="button" onClick={() => onChange(w)} aria-pressed={value === w} className={cn("ws-option", value === w && "is-on")}>
          {w === "research" ? "Research" : "Sales"}
        </button>
      ))}
    </div>
  );
}

function SideBody({ pathname, search, onNavigate }: { pathname: string; search: URLSearchParams | null; onNavigate: () => void }) {
  const [crmShown] = useCrmShown();
  const current = sectionOf(pathname, search);
  // The workspace follows the page; a switch the reader flips holds until
  // they move to another page.
  const [picked, setPicked] = useState<{ path: string; ws: Workspace } | null>(null);
  const derived = workspaceOf(current);
  const ws: Workspace = !crmShown ? "research" : picked && picked.path === pathname ? picked.ws : derived;
  const nav: NavState = { pathname, search, current, onNavigate };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {crmShown ? (
        <div className="px-3 pb-3">
          <WorkspaceSwitch value={ws} onChange={(w) => setPicked({ path: pathname, ws: w })} />
        </div>
      ) : null}
      <nav className="sidenav-scroll" aria-label={ws === "sales" ? "Sales" : "Research"}>
        {ws === "research" ? (
          <>
            <NavGroup label="Directory" items={SECTIONS} nav={nav} />
            <NavGroup label="Your work" items={YOURS} nav={nav} />
          </>
        ) : (
          <>
            <NavGroup label="Sales" items={SALES} nav={nav} />
            <NavGroup label="Your work" items={[SECTIONS.find((s) => s.key === "people")!, ...YOURS]} nav={nav} />
          </>
        )}
        <NavGroup label="Data" items={DATA} nav={nav} />
      </nav>
    </div>
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
      className="group flex items-center gap-2.5 rounded-[8px] py-1"
    >
      {/* The mark and the name are white on the graphite rail; the blue is only the eyebrow line beneath. */}
      <LpgpMark className="h-7 w-7 shrink-0 text-white" />
      <span className="leading-none">
        <span className="block text-[15px] font-bold tracking-tight text-white">LPGP</span>
        <span className="wordmark mt-1 block whitespace-nowrap text-[9px] tracking-[0.16em] text-[var(--brass)]">Intelligence</span>
      </span>
    </Link>
  );
}

/** The desktop sidebar: sticky, full height, from lg up. */
function SideRow({ pathname, search }: { pathname: string; search: URLSearchParams | null }) {
  return (
    <aside className="rail sidenav hidden lg:flex" aria-label="Main menu">
      <div className="px-5 pb-4 pt-4">
        <Brand />
      </div>
      <SideBody pathname={pathname} search={search} onNavigate={() => {}} />
    </aside>
  );
}

function SideLive() {
  const pathname = usePathname();
  const search = useSearchParams();
  return <SideRow pathname={pathname} search={search} />;
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <Suspense fallback={<SideRow pathname={pathname} search={null} />}>
      <SideLive />
    </Suspense>
  );
}

// --- The phone drawer: the same sidebar, over the page ------------------------------

function MobileDrawer({ pathname, search }: { pathname: string; search: URLSearchParams | null }) {
  const open = useSyncExternalStore(subscribeDrawer, () => drawerOpen, () => false);
  const close = () => setDrawer(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // While the drawer is up the page behind it does not scroll, Escape puts it
  // away, and focus starts on the close button so the keyboard is inside it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <>
      {/* Wrapped: .topnav-icon is unlayered CSS, so lg:hidden on the button itself would lose to it. */}
      <span className="flex items-center lg:hidden">
        <button type="button" onClick={() => setDrawer(true)} aria-label="Open menu" aria-expanded={open} className="topnav-icon">
          <Menu className="h-5 w-5" />
        </button>
      </span>
      {open ? (
        <div className="rail topnav-drawer fixed inset-0 z-50 flex flex-col overflow-y-auto lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex items-center justify-between px-4 py-3">
            <Brand onClick={close} />
            <button ref={closeRef} type="button" onClick={close} aria-label="Close menu" className="topnav-icon">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-3 pb-3">
            <button type="button" onClick={() => { close(); openCommandPalette(); }} className="topnav-search w-full">
              <Search className="h-4 w-4 opacity-70" />
              <span className="flex-1 text-left">Search firms, funds, people, deals</span>
            </button>
          </div>
          <SideBody pathname={pathname} search={search} onNavigate={close} />
          <div className="flex items-center justify-between border-t border-[var(--rail-line)] px-4 py-3">
            <Link href="/settings" onClick={() => { startNavigation("/settings"); close(); }} className="text-[13px] text-[var(--rail-fg)]">
              Settings
            </Link>
            <ThemeIcon />
          </div>
        </div>
      ) : null}
    </>
  );
}

// --- The top bar: search first ------------------------------------------------------

function SearchBar() {
  return (
    <button type="button" onClick={openCommandPalette} aria-label="Search firms, funds, people and deals" className="topnav-search topbar-search">
      <Search className="h-4 w-4 shrink-0 opacity-70" />
      <span className="hidden flex-1 truncate text-left sm:inline">Search firms, funds, people, deals</span>
      <kbd className="hidden rounded border border-[var(--rail-line)] px-1.5 py-px text-[10.5px] tabular sm:inline">⌘K</kbd>
    </button>
  );
}

function BarRow({ user, pathname, search }: { user: SessionUser | null; pathname: string; search: URLSearchParams | null }) {
  return (
    <div className="flex h-14 items-center gap-3 px-4 md:px-6 lg:px-8">
      <NavProgress pathname={pathname} search={search} />
      <MobileDrawer pathname={pathname} search={search} />
      <span className="lg:hidden">
        <Brand />
      </span>
      <div className="flex min-w-0 flex-1 justify-end lg:justify-start">
        <SearchBar />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="hidden lg:inline-flex">
          <ThemeIcon />
        </span>
        <UserMenu user={user} />
      </div>
    </div>
  );
}

function BarLive({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <BarRow user={user} pathname={pathname} search={search} />;
}

// The query string is read behind a Suspense boundary: a statically rendered
// page (not-found, errors) gets the path-only answer and hydrates to the full
// one, instead of failing the build over useSearchParams.
export function TopNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  return (
    <header className="rail topnav sticky top-0 z-40">
      <Suspense fallback={<BarRow user={user} pathname={pathname} search={null} />}>
        <BarLive user={user} />
      </Suspense>
    </header>
  );
}
