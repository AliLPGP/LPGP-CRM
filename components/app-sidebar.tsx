"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState, useSyncExternalStore } from "react";
import {
  Activity,
  Building2,
  CalendarRange,
  ChevronDown,
  Command,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Kanban,
  LayoutGrid,
  Layers,
  List,
  ListChecks,
  Map as MapIcon,
  Menu,
  PhoneCall,
  Receipt,
  Settings,
  Shield,
  Star,
  Trophy,
  Upload,
  Users,
  X,
} from "lucide-react";
import { LpgpMark } from "@/components/lpgp-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { SignOutButton } from "@/components/sign-out-button";
import { openCommandPalette } from "@/components/command-palette";
import { cn, initials } from "@/lib/utils";
import type { SessionUser } from "@/lib/auth";

/** `also`: other paths this entry owns (a firm's profile belongs to Discover). */
type NavItem = { href: string; label: string; icon: typeof Kanban; also?: string[] };
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

const DATA: NavItem[] = [
  { href: "/database", label: "Overview", icon: Gauge },
  { href: "/database?view=table", label: "Firms", icon: Building2, also: ["/companies"] },
  { href: "/funds", label: "Funds", icon: Layers },
  { href: "/database/deals", label: "Deals", icon: Handshake },
  { href: "/database/asset-classes", label: "Asset classes", icon: LayoutGrid },
  { href: "/database/sports", label: "Sports", icon: Trophy },
  { href: "/database/market", label: "Service providers", icon: MapIcon, also: ["/database/providers"] },
  { href: "/database/signals", label: "Signals", icon: Activity },
  { href: "/contacts", label: "People", icon: Users },
  { href: "/database/lists", label: "Lists", icon: ListChecks },
  { href: "/portfolio", label: "Watchlist", icon: Star },
  { href: "/import", label: "Import", icon: Upload, also: ["/import/directory"] },
];

const GROUPS: NavGroup[] = [
  { label: "Sell", items: SELL },
  { label: "Intelligence", items: DATA, collapsible: true },
];

const ALL_HREFS = GROUPS.flatMap((g) => g.items).map((i) => i.href.split("?")[0]);

/**
 * The most specific matching entry wins, so /leads/workspace lights up "Call
 * workspace" rather than both it and "Leads", and /import/leads doesn't also
 * light "Import contacts". Overview and Firms share /database and only the
 * query string tells them apart (the same rule as the in-page IntelNav);
 * without one to read, Overview owns the bare path.
 */
function isActive(pathname: string, item: NavItem, search: URLSearchParams | null) {
  const href = item.href.split("?")[0];
  if (item.also?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  if (item.href === "/database?view=table") return pathname === "/database" && Boolean(search?.toString());
  if (href === "/database") return pathname === "/database" && !search?.toString();
  if (href === "/" || href === "/import") return pathname === href;
  if (!pathname.startsWith(href)) return false;
  return !ALL_HREFS.some(
    (other) => other !== href && other.startsWith(href) && pathname.startsWith(other),
  );
}

// Collapsed nav groups, remembered per browser. Read through
// useSyncExternalStore so the server render and the first client render agree.
const COLLAPSE_KEY = "nav:collapsed";
const COLLAPSE_EVENT = "nav-collapse";

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

function Brand({ onClick }: { onClick?: () => void }) {
  return (
    <Link href="/" onClick={onClick} className="group flex items-center gap-2.5 px-1">
      <LpgpMark className="h-8 w-8 shrink-0 text-[var(--rail-fg)] transition-transform group-hover:scale-105" />
      <span className="leading-none">
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
function RailLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<RailLinkView item={item} onNavigate={onNavigate} on={isActive(pathname, item, null)} />}>
      <RailLinkLive item={item} onNavigate={onNavigate} />
    </Suspense>
  );
}

function RailLinkLive({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <RailLinkView item={item} onNavigate={onNavigate} on={isActive(pathname, item, search)} />;
}

function RailLinkView({ item, onNavigate, on }: { item: NavItem; onNavigate?: () => void; on: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={on ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
        on
          ? "bg-[var(--rail-hover)] text-[#f3efe6]"
          : "text-[var(--rail-fg)] hover:bg-[var(--rail-hover)] hover:text-[#f3efe6]",
      )}
    >
      {/* Active marker rides the left edge rather than filling the row, so the
          rail stays calm with six items in a group. */}
      <span
        className={cn(
          "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full transition-all",
          on ? "brand-gradient opacity-100" : "opacity-0",
        )}
      />
      <Icon className={cn("h-4 w-4 shrink-0", on ? "text-[var(--brand-2)]" : "opacity-80")} />
      {item.label}
    </Link>
  );
}

function CommandTrigger({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        openCommandPalette();
      }}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--rail-line)] bg-black/25 px-2.5 py-2 text-[13px] text-[var(--rail-fg-dim)] transition-colors hover:border-[var(--brand)]/50 hover:text-[#f3efe6]"
    >
      <Command className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Search or jump…</span>
      <kbd className="rounded border border-[var(--rail-line)] px-1 text-[10px] tabular">⌘K</kbd>
    </button>
  );
}

function NavBody({ user, onNavigate }: { user: SessionUser | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, toggle] = useCollapsedGroups();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {GROUPS.map((group) => {
        // A collapsed group still opens for the page you're on.
        const holdsActive = group.items.some((i) => isActive(pathname, i, null));
        const open = !group.collapsible || !collapsed.has(group.label) || holdsActive;
        return (
          <div key={group.label} className="space-y-0.5">
            {group.collapsible ? (
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
              ? group.items.map((item) => <RailLink key={item.href} item={item} onNavigate={onNavigate} />)
              : null}
          </div>
        );
      })}

      {user?.role === "admin" ? (
        <div className="space-y-0.5">
          <p className="wordmark px-2.5 pb-1.5 text-[9px] text-[var(--rail-fg-dim)]">
            Admin
          </p>
          <RailLink
            item={{ href: "/admin", label: "Team & assignments", icon: Shield }}
            onNavigate={onNavigate}
          />
        </div>
      ) : null}
    </nav>
  );
}

function RailFooter({ user, onNavigate }: { user: SessionUser | null; onNavigate?: () => void }) {
  const pathname = usePathname();
  const settingsOn = pathname.startsWith("/settings");
  return (
    <div className="rail-line space-y-2 border-t p-3">
      <Link
        href="/settings"
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors",
          settingsOn
            ? "bg-[var(--rail-hover)] text-[#f3efe6]"
            : "text-[var(--rail-fg)] hover:bg-[var(--rail-hover)] hover:text-[#f3efe6]",
        )}
      >
        <Settings className="h-4 w-4 opacity-80" />
        Settings
      </Link>

      <ThemeToggle variant="rail" />

      {user ? (
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
      ) : null}
    </div>
  );
}

export function AppSidebar({ user }: { user: SessionUser | null }) {
  return (
    <aside className="rail rail-edge sticky top-0 hidden h-screen w-[15.5rem] shrink-0 flex-col md:flex">
      <div className="rail-line flex h-16 items-center border-b px-3">
        <Brand />
      </div>
      <div className="px-3 pt-3">
        <CommandTrigger />
      </div>
      <NavBody user={user} />
      <RailFooter user={user} />
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
