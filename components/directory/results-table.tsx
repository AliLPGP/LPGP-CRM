"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Check, Columns3, Mail, Sparkles, Users } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { SortKey } from "@/lib/directory/filters";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel, providerPairs, type DirectoryRecord } from "@/lib/directory/records";
import { highlight, snippet } from "@/lib/directory/search";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { REGION_BY_CODE, typeNameOf } from "@/lib/directory/taxonomy";
import { cn } from "@/lib/utils";
import type { Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

const PAGE = 50;

// --- Columns ------------------------------------------------------------------
// The registry is the one list the header, the cells and the picker read.
// "firm" is always on; "match" only exists in a keyword or lookalike search.

export type ColumnKey =
  | "firm"
  | "type"
  | "location"
  | "size"
  | "knownFunds"
  | "allocation"
  | "strategies"
  | "regions"
  | "employees"
  | "contacts"
  | "providers"
  | "match";

export const COLUMNS: { key: ColumnKey; label: string; align?: "left" | "right"; min?: "md" | "xl"; default: boolean }[] = [
  { key: "firm", label: "Firm", default: true },
  { key: "type", label: "Type", default: true },
  { key: "location", label: "Location", min: "md", default: false },
  { key: "size", label: "Size", align: "right", default: true },
  { key: "knownFunds", label: "Funds", align: "right", min: "md", default: true },
  { key: "allocation", label: "Alternatives", align: "right", min: "xl", default: false },
  { key: "strategies", label: "Strategies", min: "xl", default: true },
  { key: "regions", label: "Regions", min: "xl", default: false },
  { key: "employees", label: "Team", align: "right", min: "md", default: true },
  { key: "contacts", label: "People", align: "right", min: "md", default: true },
  { key: "providers", label: "Providers", min: "xl", default: true },
  { key: "match", label: "Match", align: "right", default: true },
];

/** Columns whose head sorts the results. */
const SORT_OF: Partial<Record<ColumnKey, SortKey>> = { firm: "name", size: "aum", employees: "employees", contacts: "contacts" };

const DEFAULT_COLUMNS: ColumnKey[] = COLUMNS.filter((c) => c.default).map((c) => c.key);

/** The viewer's own column choice: a per-browser convenience, never shared. */
export const COLUMNS_STORAGE_KEY = "discover.columns";

const columnListeners = new Set<() => void>();

function subscribeColumns(cb: () => void) {
  columnListeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    columnListeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readStoredColumns(): string | null {
  try {
    return localStorage.getItem(COLUMNS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredColumns(keys: ColumnKey[]) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Private window or blocked storage: the choice lasts for this page only.
  }
  for (const cb of columnListeners) cb();
}

function parseColumns(raw: string | null): ColumnKey[] {
  if (!raw) return DEFAULT_COLUMNS;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COLUMNS;
    const keys = parsed.filter((k): k is ColumnKey => typeof k === "string" && COLUMNS.some((c) => c.key === k));
    return keys.length ? keys : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/**
 * The chosen columns. Read through an external-store subscription so the
 * server render (which has no storage) and the first client render agree,
 * and a change in another tab lands here too.
 */
function useColumns(): [ColumnKey[], (next: ColumnKey[]) => void] {
  const raw = useSyncExternalStore(subscribeColumns, readStoredColumns, () => null);
  const columns = useMemo(() => parseColumns(raw), [raw]);
  return [columns, writeStoredColumns];
}

function responsive(min: "md" | "xl" | undefined): string | undefined {
  return min === "md" ? "hidden md:table-cell" : min === "xl" ? "hidden xl:table-cell" : undefined;
}

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-[var(--accent)] px-0.5 text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const on = sort === k;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}
      >
        {label}
        {on ? <ArrowDownWideNarrow className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

function ColumnPicker({
  columns,
  onChange,
  mode,
}: {
  columns: ColumnKey[];
  onChange: (next: ColumnKey[]) => void;
  mode: "all" | "keywords" | "similar";
}) {
  const [open, setOpen] = useState(false);
  const choices = COLUMNS.filter((c) => c.key !== "firm" && (c.key !== "match" || mode !== "all"));
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-56 rounded-md border bg-popover p-1.5 shadow-[var(--shadow-pop)]">
            <p className="desk-label px-1.5 pb-1 pt-0.5">Show columns</p>
            {choices.map((c) => {
              const on = columns.includes(c.key);
              const label = c.key === "match" ? (mode === "similar" ? "Match" : "Fit") : c.label;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onChange(on ? columns.filter((k) => k !== c.key) : [...columns, c.key])}
                  aria-pressed={on}
                  className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[13px] hover:bg-accent/60"
                >
                  <span
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded border",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                    )}
                  >
                    {on ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="flex-1">{label}</span>
                  {c.min ? <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.min}+</span> : null}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => onChange(DEFAULT_COLUMNS)}
              className="mt-1 w-full rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              Reset to default
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** "Funds" means what the book can know: commitments, funds or clients on file. */
function knownFundsTitle(r: DirectoryRecord): string {
  if (r.category === "LP") return "Fund commitments on file";
  if (r.category === "GP") return "Funds on file";
  if (r.category === "SP") return "Manager clients on Form ADV";
  return "On file";
}

const pctLabel = (n: number) => `${Number(n.toFixed(1))}%`;

function allocationTitle(r: DirectoryRecord): string | undefined {
  if (!r.alloc.length) return r.altsPct != null ? "Alternatives, as the investor publishes it" : undefined;
  return r.alloc.map(([k, p]) => `${isAssetClassKey(k) ? ASSET_CLASS_BY_KEY[k].name : k} ${pctLabel(p)}`).join(" · ");
}

function NamesCell({ names, tags }: { names: string[]; tags?: boolean }) {
  if (!names.length) return <span className="text-muted-foreground">—</span>;
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {shown.map((n) =>
        tags ? (
          <span key={n} className="tag">
            {n}
          </span>
        ) : (
          <span key={n} className="text-[12.5px]">
            {n}
          </span>
        ),
      )}
      {rest > 0 ? <span className="figure text-[11px] text-muted-foreground">+{rest}</span> : null}
    </span>
  );
}

/**
 * Discover's results. Shows fifty at a time; it's keyed by the query upstream,
 * so a new search starts back at the first fifty.
 */
export function ResultsTable({
  dir,
  rows,
  sort,
  onSort,
  query,
  mode,
  selected,
  onToggle,
  onToggleMany,
  onSimilar,
  onQuickLook,
}: {
  dir: Directory;
  rows: ResultRow[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
  query: string;
  mode: "all" | "keywords" | "similar";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  onSimilar: (id: string) => void;
  /** Row click: the firm at a glance, without leaving the results. */
  onQuickLook: (id: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [columns, setColumns] = useColumns();
  const visible = rows.slice(0, shown);
  const allOn = visible.length > 0 && visible.every((r) => selected.has(r.record.id));
  const active = COLUMNS.filter((c) => c.key === "firm" || (columns.includes(c.key) && (c.key !== "match" || mode !== "all")));

  function head(c: (typeof COLUMNS)[number]) {
    const sortKey = c.key === "match" ? (mode === "similar" ? "similarity" : "relevance") : SORT_OF[c.key];
    const label = c.key === "match" ? (mode === "similar" ? "Match" : "Fit") : c.label;
    const cls = cn(c.key === "firm" && "min-w-[300px]", responsive(c.min));
    if (sortKey) return <SortHead key={c.key} label={label} k={sortKey} sort={sort} onSort={onSort} align={c.align} className={cls} />;
    return (
      <th key={c.key} className={cn("px-3 py-2.5 font-medium", c.align === "right" ? "text-right" : "text-left", cls)}>
        {label}
      </th>
    );
  }

  function cell(c: (typeof COLUMNS)[number], r: DirectoryRecord, score: number | null, reasons: string[]) {
    const base = cn("px-3 py-3", c.align === "right" && "text-right", responsive(c.min));
    switch (c.key) {
      case "firm": {
        const meta = [locationLabel(r), r.founded ? `Est. ${r.founded}` : null].filter(Boolean) as string[];
        const blurb =
          mode === "keywords" ? snippet(r.description ?? r.lines, query, 170) : (r.description ?? r.lines)?.slice(0, 170);
        return (
          <td key={c.key} className={base}>
            <div className="flex gap-3">
              <CompanyLogo name={r.name} domain={r.domain} size={40} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/companies/${r.id}`} className="font-semibold hover:text-primary">
                    {r.name}
                  </Link>
                  <CategoryBadge category={r.category} />
                  {r.subType ? <span className="text-xs text-muted-foreground">{r.subType}</span> : null}
                  {r.adv ? (
                    <span
                      className="rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                      title={r.adv === "ERA" ? "Exempt reporting adviser (Form ADV)" : "SEC-registered adviser (Form ADV)"}
                    >
                      {r.adv === "ERA" ? "ERA" : "RIA"}
                    </span>
                  ) : null}
                </div>
                {mode === "similar" && reasons.length ? (
                  <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted-foreground">
                    {reasons.map((x) => (
                      <li key={x} className="flex gap-1.5">
                        <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />
                        <span className="line-clamp-1">{x}</span>
                      </li>
                    ))}
                  </ul>
                ) : blurb ? (
                  <p className="mt-0.5 line-clamp-2 max-w-[62ch] text-[12.5px] leading-snug text-muted-foreground">
                    {mode === "keywords" ? <Highlighted text={blurb} query={query} /> : blurb}
                  </p>
                ) : null}
                {meta.length ? <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p> : null}
              </div>
            </div>
          </td>
        );
      }
      case "type": {
        const name = typeNameOf(r.category, r.typeCode);
        return (
          <td key={c.key} className={cn(base, "text-[12.5px]")}>
            {name ?? <span className="text-muted-foreground">—</span>}
          </td>
        );
      }
      case "location":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap text-[12.5px]")}>
            {locationLabel(r) ?? <span className="text-muted-foreground">—</span>}
          </td>
        );
      case "size":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap tabular")} title={sizeTitle(r)}>
            {sizeLabel(r)}
          </td>
        );
      case "knownFunds":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap tabular text-muted-foreground")} title={knownFundsTitle(r)}>
            {r.knownFunds ? r.knownFunds.toLocaleString("en-US") : "—"}
          </td>
        );
      case "allocation":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap tabular text-muted-foreground")} title={allocationTitle(r)}>
            {r.altsPct != null ? pctLabel(r.altsPct) : "—"}
          </td>
        );
      case "strategies":
        return (
          <td key={c.key} className={base}>
            <NamesCell names={r.strategies.map((k) => STRATEGY_BY_KEY[k]?.name ?? k)} tags />
          </td>
        );
      case "regions":
        return (
          <td key={c.key} className={base}>
            <NamesCell names={r.regions.map((k) => REGION_BY_CODE[k]?.name ?? k)} />
          </td>
        );
      case "employees":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap tabular text-muted-foreground")}>
            {headcountLabel(r.employees)}
          </td>
        );
      case "contacts":
        return (
          <td key={c.key} className={cn(base, "whitespace-nowrap")}>
            {r.contacts ? (
              <span
                className="inline-flex items-center gap-1 tabular text-muted-foreground"
                title={r.connectable ? `${r.connectable} with a direct email on file` : undefined}
              >
                {r.connectable ? <Mail className="h-3 w-3 text-[var(--success)]" /> : <Users className="h-3 w-3" />}
                {r.contacts}
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </td>
        );
      case "providers": {
        const brands = [...new Set(providerPairs(r).map((p) => p.brand))];
        return (
          <td key={c.key} className={base}>
            <span className="flex items-center gap-1">
              {brands.slice(0, 4).map((i) => {
                const b = dir.brands[i];
                return (
                  <span key={b.key} title={b.name}>
                    <CompanyLogo name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={22} />
                  </span>
                );
              })}
              {brands.length > 4 ? <span className="figure text-[11px] text-muted-foreground">+{brands.length - 4}</span> : null}
            </span>
          </td>
        );
      }
      case "match":
        return (
          <td key={c.key} className={base}>
            {score != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--chart-track)]">
                  <span className="block h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${score}%` }} />
                </span>
                <span className="tabular text-xs text-muted-foreground">{score}</span>
              </span>
            ) : null}
          </td>
        );
    }
  }

  return (
    <div className="space-y-2">
      {/* Outside the card: its rounded corners clip overflow, and the picker drops below the header row. */}
      <div className="flex items-center justify-end">
        <ColumnPicker columns={columns} onChange={setColumns} mode={mode} />
      </div>
      <div className="sheen overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => onToggleMany(visible.map((r) => r.record.id), !allOn)}
                    className="h-4 w-4 accent-[var(--primary)]"
                    aria-label="Select all shown"
                  />
                </th>
                {active.map(head)}
                <th className="w-10 pr-4" />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ record: r, score, reasons }) => {
                const on = selected.has(r.id);
                return (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      // Links, boxes and buttons keep their own behaviour.
                      if ((e.target as HTMLElement).closest("a,button,input")) return;
                      onQuickLook(r.id);
                    }}
                    className={cn("group cursor-pointer border-t align-top transition-colors hover:bg-muted/30", on && "bg-accent/40")}
                  >
                    <td className="py-3 pl-4 pr-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(r.id)}
                        className="mt-1 h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    {active.map((c) => cell(c, r, score, reasons))}
                    <td className="py-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSimilar(r.id)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        title="Find similar firms"
                        aria-label={`Find firms similar to ${r.name}`}
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
        <div className="flex gap-2">
          {rows.length > shown ? (
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="rounded-md border bg-card px-3 py-1.5 text-foreground hover:bg-accent"
            >
              Show {Math.min(PAGE, rows.length - shown)} more
            </button>
          ) : null}
          {rows.length > shown + PAGE ? (
            <button
              type="button"
              onClick={() => setShown(rows.length)}
              className="rounded-md px-3 py-1.5 hover:bg-accent hover:text-foreground"
            >
              Show all
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
