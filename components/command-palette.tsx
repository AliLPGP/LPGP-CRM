"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  Building2,
  CalendarRange,
  Layers,
  ListChecks,
  Map as MapIcon,
  Sparkles,
  Upload,
  CornerDownLeft,
  FileSpreadsheet,
  Gauge,
  Handshake,
  Kanban,
  List,
  Loader2,
  PhoneCall,
  Receipt,
  Search,
  Settings,
  Star,
  User,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { startNavigation } from "@/components/top-nav";

type PaletteHit = {
  kind: "lead" | "account" | "company" | "contact";
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

type Command = {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: typeof Gauge;
  keywords: string;
};

const COMMANDS: Command[] = [
  { id: "home", label: "Command centre", href: "/", icon: Gauge, keywords: "dashboard home overview today" },
  { id: "pipeline", label: "Pipeline", href: "/pipeline", icon: Kanban, keywords: "board stages deals kanban" },
  { id: "leads", label: "Leads", href: "/leads", icon: List, keywords: "list prospects" },
  {
    id: "workspace",
    label: "Call workspace",
    hint: "Work your queue",
    href: "/leads/workspace",
    icon: PhoneCall,
    keywords: "dial call queue phone next",
  },
  { id: "accounts", label: "Accounts", hint: "Sponsors", href: "/accounts", icon: Handshake, keywords: "sponsors clients contacts poc" },
  {
    id: "import-leads",
    label: "Import leads",
    hint: "From a spreadsheet",
    href: "/import/leads",
    icon: FileSpreadsheet,
    keywords: "excel csv xlsx upload spreadsheet",
  },
  {
    id: "deals",
    label: "My deals",
    hint: "Yours in the ops panel",
    href: "/deals",
    icon: Receipt,
    keywords: "deal invoice agreement signed contract money sponsor",
  },
  {
    id: "events",
    label: "Event performance",
    hint: "Targets vs actuals",
    href: "/events",
    icon: CalendarRange,
    keywords: "event target revenue portfolio series sponsor performance",
  },
  {
    id: "discover",
    label: "Discover",
    hint: "Search the directory",
    href: "/database",
    icon: Sparkles,
    keywords: "database companies firms lp gp sp search thesis lookalike similar inven",
  },
  {
    id: "market",
    label: "Market map",
    hint: "Form ADV league tables",
    href: "/database/market",
    icon: MapIcon,
    keywords: "providers auditors administrators custodians prime brokers placement agents landscape",
  },
  { id: "lists", label: "Lists", hint: "Team target lists", href: "/database/lists", icon: ListChecks, keywords: "saved targets list" },
  { id: "funds", label: "Funds", href: "/funds", icon: Layers, keywords: "fund vehicles commitments" },
  {
    id: "import-directory",
    label: "Import the Master Directory",
    hint: "Admins",
    href: "/import/directory",
    icon: Upload,
    keywords: "workbook xlsx directory import adv",
  },
  { id: "contacts", label: "Contacts", href: "/contacts", icon: Users, keywords: "people database" },
  { id: "portfolio", label: "Portfolio", href: "/portfolio", icon: Star, keywords: "starred saved" },
  { id: "settings", label: "Settings", href: "/settings", icon: Settings, keywords: "preferences ops panel connection" },
];

const KIND_ICON = {
  lead: List,
  account: Handshake,
  company: Building2,
  contact: User,
} as const;

const KIND_LABEL = {
  lead: "Lead",
  account: "Account",
  company: "Company",
  contact: "Contact",
} as const;

const OPEN_EVENT = "command-palette-open";

/** Open the palette from anywhere (the rail's search button uses this). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * ⌘K / Ctrl-K palette: jump to any page, or search leads, accounts, companies
 * and contacts in one box.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  // Results carry the query they answer, so a stale response is ignored rather
  // than cleared by an effect.
  const [result, setResult] = useState<{ query: string; hits: PaletteHit[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search/palette?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        if (mine !== seq.current) return;
        setResult({ query: trimmed, hits: (json.hits as PaletteHit[]) ?? [] });
      } catch {
        if (mine === seq.current) setResult({ query: trimmed, hits: [] });
      } finally {
        if (mine === seq.current) setSearching(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [open, trimmed]);

  const lower = trimmed.toLowerCase();
  const commands = lower
    ? COMMANDS.filter(
        (c) => c.label.toLowerCase().includes(lower) || c.keywords.includes(lower),
      )
    : COMMANDS;
  const hits = result?.query === trimmed ? result.hits : [];
  const rows = [
    ...commands.map((c) => ({ key: `cmd:${c.id}`, href: c.href })),
    ...hits.map((h) => ({ key: `hit:${h.kind}:${h.id}`, href: h.href })),
  ];
  const active = Math.min(cursor, Math.max(0, rows.length - 1));

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setResult(null);
    setCursor(0);
    startNavigation(href); // the header's progress line runs until the page arrives
    router.push(href);
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-[12vh]">
      <button
        className="modal-overlay absolute inset-0 bg-black/70 backdrop-blur-[3px]"
        aria-label="Close search"
        onClick={() => setOpen(false)}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search and commands"
        className="modal-panel relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border bg-popover shadow-[var(--shadow-pop)]"
      >
        <div className="flex items-center gap-2.5 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => (rows.length ? (c + 1) % rows.length : 0));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => (rows.length ? (c - 1 + rows.length) % rows.length : 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const row = rows[active];
                if (row) go(row.href);
              }
            }}
            placeholder="Search leads, sponsors, firms — or jump to a page"
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {searching ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <kbd className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground tabular">
            esc
          </kbd>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {commands.length ? (
            <Section label="Go to">
              {commands.map((c, i) => {
                const Icon = c.icon;
                return (
                  <Row
                    key={c.id}
                    active={active === i}
                    onHover={() => setCursor(i)}
                    onSelect={() => go(c.href)}
                    icon={<Icon className="h-4 w-4" />}
                    title={c.label}
                    subtitle={c.hint ?? null}
                  />
                );
              })}
            </Section>
          ) : null}

          {hits.length ? (
            <Section label="Records">
              {hits.map((h, i) => {
                const Icon = KIND_ICON[h.kind];
                const index = commands.length + i;
                return (
                  <Row
                    key={`${h.kind}:${h.id}`}
                    active={active === index}
                    onHover={() => setCursor(index)}
                    onSelect={() => go(h.href)}
                    icon={<Icon className="h-4 w-4" />}
                    title={h.title}
                    subtitle={h.subtitle}
                    tag={KIND_LABEL[h.kind]}
                  />
                );
              })}
            </Section>
          ) : null}

          {!commands.length && !hits.length ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {searching ? "Searching…" : `Nothing matches “${trimmed}”.`}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 border-t bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border px-1">↑</kbd>
            <kbd className="rounded border px-1">↓</kbd> navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span className="ml-auto">⌘K anywhere</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="wordmark px-2.5 py-1.5 text-[10px] text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  active,
  onHover,
  onSelect,
  icon,
  title,
  subtitle,
  tag,
}: {
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string | null;
  tag?: string;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
        // The selected row wears the blue tint; the hover stays neutral.
        active ? "bg-primary-soft text-foreground" : "hover:bg-accent",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-md",
          active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      {tag ? (
        <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {tag}
        </span>
      ) : null}
    </button>
  );
}
