"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import {
  Briefcase,
  CalendarRange,
  ChevronDown,
  Command,
  Compass,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Kanban,
  Landmark,
  Layers,
  List,
  ListChecks,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  PhoneCall,
  Receipt,
  Settings,
  Shield,
  Star,
  TrendingUp,
  Trophy,
  Upload,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { LpgpMark } from "@/components/lpgp-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { openCommandPalette } from "@/components/command-palette";
import { cn, initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

/** `also`: other paths this entry owns (a firm's profile belongs to Discover).
 *  `children`: the entry's own sub-tree, shown when it or one of them is the
 *  page you're on — the way a data terminal nests books under a section. */
type NavItem = { href: string; label: string; icon?: typeof Kanban; also?: string[]; children?: NavItem[] };
type NavGroup = { label: string; items: NavItem[]; collapsible?: boolean };

const SELL: NavItem[] = [
  { href: "/", label: "Command centre", icon: Gauge },
  { href: "/pipeline", label: "Pipeline", icon: Kanban },
  { href: "/leads", label: "Leads", icon: List },
  { href: "/leads/workspace", label: "Call workspace", icon: PhoneCall },
  { href: "/accounts", label: "Accounts", icon: Handshake },
  { href: "/deals", label: "My deals", icon: Receipt },
  { href: "/events", label: "Event performance", icon: CalendarRange },
  { href: "/import/leads", label: "Import leads", icon: FileSpreadsheet },
];

// The intelligence section is laid out the way a private-markets data desk
// is: a section per kind of counterparty (investors, fund managers, funds,
// performance, service providers, consultants, companies and deals), each
// with the searches and ledgers a desk opens for it, then the workflows,
// people, and the reader's own lists and imports. Several sections share a
// page (a target list, the signals ledger): the entry carries the section's
// view of it, and the query string says which.
const DATA: NavItem[] = [
  { href: "/database", label: "Overview", icon: Gauge },
  {
    href: "/database?book=LP&view=table",
    label: "Investors",
    icon: Landmark,
    children: [
      { href: "/database?book=LP&view=table", label: "Advanced search" },
      { href: "/database/mandates", label: "Mandates & RFPs" },
      { href: "/database/commitments", label: "By past investments" },
      { href: "/database/commitments", label: "Investor documents" },
      { href: "/database/signals?kind=news", label: "Investor news" },
      { href: "/database/lists", label: "Target lists" },
    ],
  },
  {
    href: "/database?book=GP&view=table",
    label: "Fund managers",
    icon: Briefcase,
    children: [
      { href: "/database?book=GP&view=table", label: "Advanced search" },
      { href: "/database/asset-classes", label: "By asset class" },
      { href: "/database/portcos", label: "Portfolio companies" },
      { href: "/database/signals", label: "Manager news" },
      { href: "/database/lists", label: "Target lists" },
    ],
  },
  {
    href: "/funds",
    label: "Funds",
    icon: Layers,
    children: [
      { href: "/funds", label: "Advanced search" },
      { href: "/database/deals?kind=fund_close", label: "Recently closed" },
      { href: "/database/asset-classes/private-equity?tab=raises", label: "Fundraising (Form D)" },
      { href: "/funds?strategy=pe_hybrid", label: "Evergreen funds" },
      { href: "/database/signals", label: "Alerts" },
      { href: "/database/lists", label: "Target lists" },
    ],
  },
  {
    href: "/database/performance?tab=funds",
    label: "Performance",
    icon: TrendingUp,
    children: [
      { href: "/database/performance?tab=funds", label: "Best performing funds" },
      { href: "/database/performance?tab=managers", label: "Best performing managers" },
      { href: "/database/performance?tab=benchmark", label: "Market benchmarks" },
    ],
  },
  {
    href: "/database?book=SP&view=table",
    label: "Service providers",
    icon: MapIcon,
    also: ["/database/providers"],
    children: [
      { href: "/database?book=SP&view=table", label: "Advanced search" },
      { href: "/database/market", label: "League tables" },
      { href: "/database/lenders", label: "Loan books" },
      { href: "/database/borrowers", label: "Borrowers" },
    ],
  },
  { href: "/database?book=LP,SP&itype=investment_consultant&view=table", label: "Investment consultants", icon: Compass },
  {
    href: "/database/deals",
    label: "Companies & deals",
    icon: Handshake,
    children: [
      { href: "/database/deals", label: "Deals" },
      { href: "/database/portcos", label: "Portfolio companies" },
      { href: "/database/borrowers", label: "Borrowers" },
      { href: "/database/sports", label: "Sports", icon: Trophy },
    ],
  },
  {
    href: "/database/workflows",
    label: "Workflows",
    icon: Workflow,
    children: [
      { href: "/database/workflows/market-intelligence", label: "Market intelligence" },
      { href: "/database/workflows/deal-sourcing", label: "Deal sourcing" },
      { href: "/database/workflows/deal-execution", label: "Deal execution" },
      { href: "/database/workflows/networking", label: "Networking" },
      { href: "/database/workflows/due-diligence", label: "Due diligence" },
      { href: "/database/workflows/fundraising", label: "Fundraising" },
      { href: "/database/workflows/benchmarking", label: "Benchmarking" },
      { href: "/database/workflows/business-development", label: "Business development" },
      { href: "/database/workflows/asset-allocation", label: "Asset allocation" },
      { href: "/database/workflows/portfolio-management", label: "Portfolio management" },
    ],
  },
  { href: "/contacts", label: "People", icon: Users },
  { href: "/database/lists", label: "Lists", icon: ListChecks },
  { href: "/portfolio", label: "Watchlist", icon: Star },
  { href: "/import", label: "Import", icon: Upload, also: ["/import/directory"] },
];

const GROUPS: NavGroup[] = [
  { label: "Sell", items: SELL },
  { label: "Intelligence", items: DATA, collapsible: true },
];

const ALL_ITEMS = GROUPS.flatMap((g) => g.items.flatMap((i) => [i, ...(i.children ?? [])]));
/** Path-only entries: the ones a deeper path can be more specific than. */
const PATH_HREFS = ALL_ITEMS.filter((i) => !i.href.includes("?")).map((i) => i.href);
/** Entries told apart by their query string. */
const QUERY_ITEMS = ALL_ITEMS.filter((i) => i.href.includes("?"));

/** The query keys that make one entry a different view from another on the
 *  same path: the book and investor type on the directory, a page's tab, a
 *  deal or signal kind, a fund strategy or status. Anything else in the URL
 *  (the layout, a search, a sort) is the reader's own and never decides. */
const VIEW_KEYS = ["book", "itype", "tab", "kind", "strategy", "status", "class"];

/** A comma-separated list as a canonical key, so `LP,SP` equals `SP,LP`. */
const asSet = (v: string) => v.split(",").filter(Boolean).sort().join(",");

/** How specifically a query entry matches the page: the number of view keys
 *  it carries that the page agrees with, or null if any of them disagrees. */
function specificity(item: NavItem, pathname: string, search: URLSearchParams | null): number | null {
  const [href, query] = item.href.split("?");
  if (!query || pathname !== href || !search) return null;
  const want = new URLSearchParams(query);
  let n = 0;
  for (const k of VIEW_KEYS) {
    const v = want.get(k);
    if (v == null) continue;
    const got = search.get(k);
    if (got == null) return null;
    if (k === "book" ? asSet(got) !== asSet(v) : got !== v) return null;
    n += 1;
  }
  return n;
}

/**
 * The most specific matching entry wins, so /leads/workspace lights up "Call
 * workspace" rather than both it and "Leads", and /import/leads doesn't also
 * light "Import contacts". Entries that differ only by query string (the
 * investor, manager and provider books on /database, a page's tabs, a kind
 * of deal or signal) are told apart by the view keys in the query — the same
 * rule as the in-page IntelNav; the entry carrying the most agreeing keys
 * owns the page, and without a query to read, Overview owns the bare path.
 */
function isActive(pathname: string, item: NavItem, search: URLSearchParams | null) {
  const [href, query] = item.href.split("?");
  if (item.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (query) {
    const mine = specificity(item, pathname, search);
    if (mine == null) return false;
    return !QUERY_ITEMS.some((other) => other.href !== item.href && (specificity(other, pathname, search) ?? -1) > mine);
  }
  if (href === "/database") return pathname === "/database" && !search?.toString();
  if (href === "/" || href === "/import") return pathname === href;
  if (!pathname.startsWith(href)) return false;
  // A view of this page that a query entry names belongs to that entry.
  if (search && QUERY_ITEMS.some((other) => specificity(other, pathname, search) != null)) return false;
  return !PATH_HREFS.some(
    (other) => other !== href && other.startsWith(href) && pathname.startsWith(other),
  );
}

/** An entry's tree holds the page: itself or one of its children is active. */
function isWithin(pathname: string, item: NavItem, search: URLSearchParams | null) {
  return isActive(pathname, item, search) || Boolean(item.children?.some((c) => isActive(pathname, c, search)));
}

/** A parent is lit only when none of its children is: the leaf carries the mark. */
function isLit(pathname: string, item: NavItem, search: URLSearchParams | null) {
  if (!isActive(pathname, item, search)) return false;
  return !item.children?.some((c) => isActive(pathname, c, search));
}

// Collapsed nav groups, and the rail itself folded to icons, remembered per
// browser. Read through useSyncExternalStore so the server render and the
// first client render agree.
const COLLAPSE_KEY = "nav:collapsed";
const COLLAPSE_EVENT = "nav-collapse";
const RAIL_KEY = "nav:rail";

function readRail(): string {
  try {
    return localStorage.getItem(RAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Whether the rail is folded to icons, and the toggle. */
function useRailFolded(): [boolean, () => void] {
  const raw = useSyncExternalStore(subscribeCollapse, readRail, () => "");
  const folded = raw === "folded";
  const toggle = () => {
    try {
      localStorage.setItem(RAIL_KEY, folded ? "" : "folded");
    } catch {
      /* private mode: the fold just won't persist */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };
  return [folded, toggle];
}

function subscribeCollapse(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(COLLAPSE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(COLLAPSE_EVENT, cb);
  };
}

function readCollapse(): string {
  try {
    return localStorage.getItem(COLLAPSE_KEY) ?? "";
  } catch {
    return "";
  }
}

function useCollapsedGroups(): [Set<string>, (label: string) => void] {
  const raw = useSyncExternalStore(subscribeCollapse, readCollapse, () => "");
  const set = new Set(raw.split("|").filter(Boolean));
  const toggle = (label: string) => {
    const next = new Set(set);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    try {
      localStorage.setItem(COLLAPSE_KEY, [...next].join("|"));
    } catch {
      /* private mode: the toggle just won't persist */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };
  return [set, toggle];
}

function Brand({ onClick, folded }: { onClick?: () => void; folded?: boolean }) {
  return (
    <Link href="/" onClick={onClick} className="group flex items-center gap-2.5 px-1" title={folded ? "LPGP Connect" : undefined}>
      <LpgpMark className="h-8 w-8 shrink-0 text-[var(--rail-fg)] transition-transform group-hover:scale-105" />
      <span className={cn("leading-none", folded && "hidden")}>
        <span className="block text-[15px] font-bold tracking-tight text-[#f3efe6]">LPGP Connect</span>
        <span className="wordmark mt-1 block text-[9px] text-[var(--brass)]">
          Sales CRM
        </span>
      </span>
    </Link>
  );
}

// The query string is read behind a Suspense boundary: a statically rendered
// page (not-found, errors) gets the path-only answer and hydrates to the
// full one, instead of failing the build over useSearchParams.
function RailLink({ item, onNavigate, folded }: { item: NavItem; onNavigate?: () => void; folded?: boolean }) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<RailEntry item={item} onNavigate={onNavigate} pathname={pathname} search={null} folded={folded} />}>
      <RailLinkLive item={item} onNavigate={onNavigate} folded={folded} />
    </Suspense>
  );
}

function RailLinkLive({ item, onNavigate, folded }: { item: NavItem; onNavigate?: () => void; folded?: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <RailEntry item={item} onNavigate={onNavigate} pathname={pathname} search={search} folded={folded} />;
}

/** An entry and, when it has one, its sub-tree: open on the page it holds,
 *  or on the chevron; the leaf carries the mark. A folded rail shows the
 *  icon alone and lights the parent for any page in its tree. */
function RailEntry({ item, onNavigate, pathname, search, folded }: { item: NavItem; onNavigate?: () => void; pathname: string; search: URLSearchParams | null; folded?: boolean }) {
  const within = isWithin(pathname, item, search);
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = !folded && Boolean(item.children?.length) && (toggled ?? within);
  return (
    <div>
      <RailLinkView
        item={item}
        onNavigate={onNavigate}
        on={folded ? within : isLit(pathname, item, search)}
        folded={folded}
        chevron={!folded && item.children?.length ? { open, toggle: () => setToggled(!open) } : undefined}
      />
      {open ? (
        <div className="ml-[19px] mt-0.5 space-y-px border-l border-[var(--rail-line)] pl-2">
          {item.children!.map((child) => (
            <RailLinkView key={`${child.href} ${child.label}`} item={child} onNavigate={onNavigate} on={isActive(pathname, child, search)} small />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RailLinkView({ item, onNavigate, on, small, chevron, folded }: { item: NavItem; onNavigate?: () => void; on: boolean; small?: boolean; chevron?: { open: boolean; toggle: () => void }; folded?: boolean }) {
  const Icon = item.icon;
  return (
    <div className="relative">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={on ? "page" : undefined}
        aria-label={folded ? item.label : undefined}
        title={folded ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-2.5 rounded-lg font-medium transition-colors",
          folded ? "justify-center px-0 py-2" : "px-2.5",
          small ? "py-[5px] text-[12px]" : "py-[7px] text-[13px]",
          chevron ? "pr-8" : "",
          on
            ? "bg-[var(--rail-hover)] text-[#f3efe6]"
            : "text-[var(--rail-fg)] hover:bg-[var(--rail-hover)] hover:text-[#f3efe6]",
        )}
      >
        {/* Active marker rides the left edge rather than filling the row, so the
            rail stays calm with a dozen items in a group. */}
        <span
          className={cn(
            "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full transition-all",
            on ? "brand-gradient opacity-100" : "opacity-0",
          )}
        />
        {Icon ? <Icon className={cn("shrink-0", small ? "h-3.5 w-3.5" : "h-4 w-4", on ? "text-[var(--brand-2)]" : "opacity-80")} /> : null}
        {folded ? <span className="sr-only">{item.label}</span> : item.label}
      </Link>
      {chevron ? (
        <button
          type="button"
          onClick={chevron.toggle}
          aria-label={chevron.open ? `Collapse ${item.label}` : `Expand ${item.label}`}
          aria-expanded={chevron.open}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--rail-fg-dim)] hover:text-[#f3efe6]"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", chevron.open ? "" : "-rotate-90")} />
        </button>
      ) : null}
    </div>
  );
}

function CommandTrigger({ onNavigate, folded }: { onNavigate?: () => void; folded?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        openCommandPalette();
      }}
      title={folded ? "Search or jump (⌘K)" : undefined}
      aria-label="Search or jump"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border border-[var(--rail-line)] bg-black/25 py-2 text-[13px] text-[var(--rail-fg-dim)] transition-colors hover:border-[var(--brand)]/50 hover:text-[#f3efe6]",
        folded ? "justify-center px-0" : "px-2.5",
      )}
    >
      <Command className="h-3.5 w-3.5" />
      {folded ? null : (
        <>
          <span className="flex-1 text-left">Search or jump…</span>
          <kbd className="rounded border border-[var(--rail-line)] px-1 text-[10px] tabular">⌘K</kbd>
        </>
      )}
    </button>
  );
}

function NavBody({ user, onNavigate, folded }: { user: SessionUser | null; onNavigate?: () => void; folded?: boolean }) {
  const pathname = usePathname();
  const [collapsed, toggle] = useCollapsedGroups();
  return (
    <nav className={cn("flex-1 space-y-5 overflow-y-auto py-4", folded ? "px-2" : "px-3")}>
      {GROUPS.map((group) => {
        // A collapsed group still opens for the page you're on; a folded rail
        // shows every group as icons, with a hairline between them.
        const holdsActive = group.items.some((i) => isWithin(pathname, i, null));
        const open = folded || !group.collapsible || !collapsed.has(group.label) || holdsActive;
        return (
          <div key={group.label} className={cn("space-y-0.5", folded && "border-t border-[var(--rail-line)] pt-3 first:border-t-0 first:pt-0")}>
            {folded ? null : group.collapsible ? (
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={open}
                className="group flex w-full items-center justify-between px-2.5 pb-1.5 text-left"
              >
                <span className="wordmark text-[9px] text-[var(--rail-fg-dim)] group-hover:text-[var(--rail-fg)]">
                  {group.label}
                </span>
                <ChevronDown
                  className={cn(
                    "h-3 w-3 text-[var(--rail-fg-dim)] transition-transform",
                    open ? "" : "-rotate-90",
                  )}
                />
              </button>
            ) : (
              <p className="wordmark px-2.5 pb-1.5 text-[9px] text-[var(--rail-fg-dim)]">
                {group.label}
              </p>
            )}
            {open
              ? group.items.map((item) => <RailLink key={`${item.href} ${item.label}`} item={item} onNavigate={onNavigate} folded={folded} />)
              : null}
          </div>
        );
      })}

      {user?.role === "admin" ? (
        <div className={cn("space-y-0.5", folded && "border-t border-[var(--rail-line)] pt-3")}>
          {folded ? null : (
            <p className="wordmark px-2.5 pb-1.5 text-[9px] text-[var(--rail-fg-dim)]">
              Admin
            </p>
          )}
          <RailLink
            item={{ href: "/admin", label: "Team & assignments", icon: Shield }}
            onNavigate={onNavigate}
            folded={folded}
          />
        </div>
      ) : null}
    </nav>
  );
}

function RailFooter({ user, onNavigate, folded, onFold }: { user: SessionUser | null; onNavigate?: () => void; folded?: boolean; onFold?: () => void }) {
  const pathname = usePathname();
  const settingsOn = pathname.startsWith("/settings");
  return (
    <div className={cn("rail-line space-y-2 border-t", folded ? "p-2" : "p-3")}>
      <Link
        href="/settings"
        onClick={onNavigate}
        title={folded ? "Settings" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg py-[7px] text-[13px] font-medium transition-colors",
          folded ? "justify-center px-0" : "px-2.5",
          settingsOn
            ? "bg-[var(--rail-hover)] text-[#f3efe6]"
            : "text-[var(--rail-fg)] hover:bg-[var(--rail-hover)] hover:text-[#f3efe6]",
        )}
      >
        <Settings className="h-4 w-4 opacity-80" />
        {folded ? <span className="sr-only">Settings</span> : "Settings"}
      </Link>

      {folded ? null : <ThemeToggle variant="rail" />}

      {user ? (
        folded ? (
          <div className="flex justify-center" title={`${user.name} · ${user.role === "admin" ? "Admin" : "Member"}`}>
            <span className="brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-[var(--rail-bg)]">
              {initials(user.name)}
            </span>
          </div>
        ) : (
          <div className="rail-line flex items-center gap-2.5 rounded-lg border bg-black/25 px-2.5 py-2">
            <span className="brand-gradient grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-[var(--rail-bg)]">
              {initials(user.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-[#f3efe6]">{user.name}</div>
              <div className="truncate text-[10px] text-[var(--rail-fg-dim)]">
                {user.role === "admin" ? "Admin" : "Member"}
              </div>
            </div>
            <SignOutButton variant="rail" />
          </div>
        )
      ) : null}

      {onFold ? (
        <button
          type="button"
          onClick={onFold}
          aria-label={folded ? "Expand the navigation" : "Collapse the navigation"}
          title={folded ? "Expand" : "Collapse"}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg py-[6px] text-[12px] text-[var(--rail-fg-dim)] transition-colors hover:bg-[var(--rail-hover)] hover:text-[#f3efe6]",
            folded ? "justify-center px-0" : "px-2.5",
          )}
        >
          {folded ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          {folded ? null : "Collapse"}
        </button>
      ) : null}
    </div>
  );
}

export function AppSidebar({ user }: { user: SessionUser | null }) {
  const [folded, fold] = useRailFolded();
  return (
    <aside className={cn("rail rail-edge sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 md:flex", folded ? "w-[4rem]" : "w-[15.5rem]")}>
      <div className={cn("rail-line flex h-16 items-center border-b", folded ? "justify-center px-2" : "px-3")}>
        <Brand folded={folded} />
      </div>
      <div className={cn("pt-3", folded ? "px-2" : "px-3")}>
        <CommandTrigger folded={folded} />
      </div>
      <NavBody user={user} folded={folded} />
      <RailFooter user={user} folded={folded} onFold={fold} />
    </aside>
  );
}

export function MobileTopBar({ user }: { user: SessionUser | null }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <div className="rail sticky top-0 z-40 flex h-14 items-center justify-between px-3 md:hidden">
        <Brand />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="p-2 text-[var(--rail-fg)]"
            aria-label="Search"
          >
            <Command className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-mr-1 p-2 text-[var(--rail-fg)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={close}
          />
          <div className="rail absolute left-0 top-0 flex h-full w-72 max-w-[85%] flex-col shadow-2xl">
            <div className="rail-line flex h-14 items-center justify-between border-b px-3">
              <Brand onClick={close} />
              <button onClick={close} className="p-2 text-[var(--rail-fg)]" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-3 pt-3">
              <CommandTrigger onNavigate={close} />
            </div>
            <NavBody user={user} onNavigate={close} />
            <RailFooter user={user} onNavigate={close} />
          </div>
        </div>
      ) : null}
    </>
  );
}
