"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, Check, Columns3, Eye, Mail, Sparkles, Users } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Tag } from "@/components/intel/ui";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import { filtersFromParams, type SortKey } from "@/lib/directory/filters";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel, providerPairs, type DirectoryRecord } from "@/lib/directory/records";
import { highlight, snippet } from "@/lib/directory/search";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { REGION_BY_CODE, typeNameOf } from "@/lib/directory/taxonomy";
import { cn, formatUsd } from "@/lib/utils";
import type { Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

const PAGE = 50;

/** The one "show more" button every desk list ends with. */
const MORE = "rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent";

/** The menu's open panel: the header's own fade-and-rise, off under reduced motion. */
const POP = "animate-[topnav-in_160ms_ease-out] motion-reduce:animate-none";

// --- Columns ------------------------------------------------------------------
// The registry is the one list the header, the cells and the picker read.
// "firm" is always on; "match" only exists in a keyword or lookalike search.
// The per-class pair (what a manager's funds state, and what it has raised)
// exists once per asset class: on by default while that class is filtered,
// offered in the chooser otherwise.

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
  | "founded"
  | "contacts"
  | "providers"
  | "match"
  | `strategies:${AssetClassKey}`
  | `raised:${AssetClassKey}`;

export type Column = {
  key: ColumnKey;
  label: string;
  align?: "left" | "right";
  min?: "md" | "xl";
  /** On until chosen otherwise; a per-class column's default follows the class filter instead. */
  default: boolean;
  /** Set on the per-class pair. */
  classKey?: AssetClassKey;
};

export const COLUMNS: Column[] = [
  { key: "firm", label: "Firm", default: true },
  { key: "type", label: "Type", default: true },
  { key: "location", label: "Location", min: "md", default: true },
  { key: "size", label: "Size", align: "right", default: true },
  { key: "knownFunds", label: "Funds", align: "right", min: "md", default: true },
  { key: "allocation", label: "Alternatives", align: "right", min: "xl", default: false },
  { key: "strategies", label: "Strategies", min: "xl", default: true },
  { key: "regions", label: "Regions", min: "xl", default: false },
  { key: "employees", label: "Team", align: "right", min: "md", default: true },
  { key: "founded", label: "Est.", align: "right", min: "xl", default: false },
  { key: "contacts", label: "People", align: "right", min: "md", default: true },
  { key: "providers", label: "Providers", min: "xl", default: true },
  { key: "match", label: "Match", align: "right", default: true },
  ...ASSET_CLASSES.flatMap((a): Column[] => [
    { key: `strategies:${a.key}`, label: `${a.short}: strategies`, min: "md", default: false, classKey: a.key },
    { key: `raised:${a.key}`, label: `${a.short}: raised, last 10 yrs`, align: "right", min: "md", default: false, classKey: a.key },
  ]),
];

const COLUMN_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

/** Columns whose head sorts the results. */
const SORT_OF: Partial<Record<ColumnKey, SortKey>> = { firm: "name", size: "aum", employees: "employees", founded: "founded", contacts: "contacts" };

/** The viewer's own column choice: a per-browser convenience, never shared. */
export const COLUMNS_STORAGE_KEY = "discover.columns";

/** What the viewer chose explicitly; every other column takes its default.
 *  Kept as two lists so a column the viewer never touched can follow a
 *  default that moves with the class filter. */
type ColumnChoice = { on: ColumnKey[]; off: ColumnKey[] };

const NO_CHOICE: ColumnChoice = { on: [], off: [] };

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

function writeStoredColumns(choice: ColumnChoice) {
  try {
    localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Private window or blocked storage: the choice lasts for this page only.
  }
  for (const cb of columnListeners) cb();
}

function isColumnKey(k: unknown): k is ColumnKey {
  return typeof k === "string" && COLUMN_BY_KEY.has(k as ColumnKey);
}

function keyList(v: unknown): ColumnKey[] {
  return Array.isArray(v) ? v.filter(isColumnKey) : [];
}

function parseChoice(raw: string | null): ColumnChoice {
  if (!raw) return NO_CHOICE;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // The older form listed the columns that were on. Those were the
      // fixed columns only, so a fixed one missing is off; a per-class one
      // missing had no say and takes its default.
      const on = keyList(parsed);
      const off = COLUMNS.filter((c) => !c.classKey && c.key !== "firm" && !on.includes(c.key)).map((c) => c.key);
      return { on, off };
    }
    if (parsed && typeof parsed === "object") {
      const o = parsed as { on?: unknown; off?: unknown };
      return { on: keyList(o.on), off: keyList(o.off) };
    }
    return NO_CHOICE;
  } catch {
    return NO_CHOICE;
  }
}

/** Is the column on: by the viewer's choice, else by its default. */
function columnOn(c: Column, choice: ColumnChoice, classes: AssetClassKey[]): boolean {
  if (choice.on.includes(c.key)) return true;
  if (choice.off.includes(c.key)) return false;
  return c.classKey ? classes.includes(c.classKey) : c.default;
}

/**
 * The viewer's column choice. Read through an external-store subscription so
 * the server render (which has no storage) and the first client render agree,
 * and a change in another tab lands here too. The toolbar's button and the
 * table both read it, so the one store keeps them in step.
 */
function useColumnChoice(): [ColumnChoice, (next: ColumnChoice) => void] {
  const raw = useSyncExternalStore(subscribeColumns, readStoredColumns, () => null);
  const choice = useMemo(() => parseChoice(raw), [raw]);
  return [choice, writeStoredColumns];
}

/** The classes the current search filters by: the per-class columns' default. */
function useFilteredClasses(): AssetClassKey[] {
  const params = useSearchParams();
  return useMemo(() => filtersFromParams(params).classes, [params]);
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

/** The header sticks under the top bar once the table no longer scrolls sideways (md and up). */
const STICKY = "md:sticky md:top-14 md:z-[2]";
const STICKY_STYLE: React.CSSProperties = {
  background: "color-mix(in oklab, var(--muted) 55%, var(--card))",
  boxShadow: "inset 0 -1px 0 var(--border)",
};

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
    <th className={cn(STICKY, align === "right" && "num", className)} style={STICKY_STYLE} aria-sort={on ? "descending" : undefined}>
      <button type="button" onClick={() => onSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}>
        {label}
        {on ? <ArrowDownWideNarrow className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

/**
 * The toolbar's "Columns" button: the chooser over the registry. Sits in the
 * toolbar's right-hand cluster, beside Export, on every list screen.
 */
export function ColumnsButton({ mode }: { mode: "all" | "keywords" | "similar" }) {
  const [choice, onChange] = useColumnChoice();
  const classes = useFilteredClasses();
  const [open, setOpen] = useState(false);
  const fixed = COLUMNS.filter((c) => !c.classKey && c.key !== "firm" && (c.key !== "match" || mode !== "all"));
  const perClass = COLUMNS.filter((c) => c.classKey);

  function setOn(key: ColumnKey, on: boolean) {
    onChange({
      on: on ? [...choice.on.filter((k) => k !== key), key] : choice.on.filter((k) => k !== key),
      off: on ? choice.off.filter((k) => k !== key) : [...choice.off.filter((k) => k !== key), key],
    });
  }

  function row(c: Column) {
    const on = columnOn(c, choice, classes);
    const label = c.key === "match" ? (mode === "similar" ? "Match" : "Fit") : c.label;
    return (
      <button key={c.key} type="button" onClick={() => setOn(c.key, !on)} aria-pressed={on} className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1 text-left text-[12.5px] hover:bg-accent">
        <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
          {on ? <Check className="h-2.5 w-2.5" /> : null}
        </span>
        <span className="flex-1">{label}</span>
        {c.min ? <span className="desk-label text-[9.5px]">{c.min}+</span> : null}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </button>
      {open ? (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close" onClick={() => setOpen(false)} />
          <div className={cn(POP, "absolute right-0 top-[calc(100%+4px)] z-40 max-h-[70vh] w-64 overflow-y-auto rounded-[4px] border bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-pop)]")}>
            <p className="desk-label px-2 pb-1 pt-1">Show columns</p>
            {fixed.map(row)}
            <p className="desk-label mt-2 px-2 pb-1 pt-1">Per asset class</p>
            <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
              What a manager&apos;s fund names state. Raised is the sum of stated fund sizes as filed, in USD — never an estimate. On by default for a filtered class.
            </p>
            {perClass.map(row)}
            <button type="button" onClick={() => onChange(NO_CHOICE)} className="mt-1 w-full rounded-[3px] px-2 py-1 text-left text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground">
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

/** Strategy-axis names a manager's words or fund names state within one class. */
function classStrategyNames(r: DirectoryRecord, classKey: AssetClassKey): string[] {
  const out: string[] = [];
  for (const k of r.strategies) {
    const s = STRATEGY_BY_KEY[k];
    if (s && s.classKey === classKey && s.axis === "strategy") out.push(s.name);
  }
  return out;
}

/** What the manager raised in one class over the last ten vintages, as filed. */
function RaisedCell({ r, classKey, className }: { r: DirectoryRecord; classKey: AssetClassKey; className: string }) {
  const hit = r.raised.find(([k]) => k === classKey);
  const funds = hit?.[2] ?? 0;
  const sum = hit?.[1] ?? 0;
  const plural = funds === 1 ? "fund" : "funds";
  const title =
    sum > 0
      ? `Stated fund sizes as filed, USD, summed across the sized ones of ${funds} ${plural} with a vintage in the last ten years — never an estimate`
      : funds > 0
        ? `${funds} ${plural} with a vintage in the last ten years, none with a stated size`
        : undefined;
  return (
    <td className={cn(className, "num", sum > 0 ? undefined : "text-muted-foreground")} title={title}>
      {sum > 0 ? formatUsd(sum) : "—"}
    </td>
  );
}

function NamesCell({ names, tags }: { names: string[]; tags?: boolean }) {
  if (!names.length) return <span className="text-muted-foreground">—</span>;
  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return (
    <span className="flex items-center gap-1 whitespace-nowrap" title={names.join(" · ")}>
      {shown.map((n) => (tags ? <Tag key={n}>{n}</Tag> : <span key={n}>{n}</span>))}
      {rest > 0 ? <span className="figure text-[11px] text-muted-foreground">+{rest}</span> : null}
    </span>
  );
}

/** A quiet icon button at the row's end; shown on hover, always reachable by keyboard. */
const ROW_ICON = "grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100";

/**
 * Discover's results as a desk ledger. Fifty at a time; it's keyed by the
 * query upstream, so a new search starts back at the first fifty. The firm's
 * name is the link that covers the row; the checkbox and the two row buttons
 * (quick look, lookalikes) sit above that cover.
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
  /** The firm at a glance, without leaving the results. */
  onQuickLook: (id: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const [choice] = useColumnChoice();
  const classes = useFilteredClasses();
  const visible = rows.slice(0, shown);
  const allOn = visible.length > 0 && visible.every((r) => selected.has(r.record.id));
  const active = COLUMNS.filter((c) => c.key === "firm" || (columnOn(c, choice, classes) && (c.key !== "match" || mode !== "all")));

  function head(c: Column) {
    const sortKey = c.key === "match" ? (mode === "similar" ? "similarity" : "relevance") : SORT_OF[c.key];
    const label = c.key === "match" ? (mode === "similar" ? "Match" : "Fit") : c.label;
    const cls = cn(c.key === "firm" && "min-w-[280px]", responsive(c.min));
    if (sortKey) return <SortHead key={c.key} label={label} k={sortKey} sort={sort} onSort={onSort} align={c.align} className={cls} />;
    return (
      <th
        key={c.key}
        className={cn(STICKY, c.align === "right" && "num", cls)}
        style={STICKY_STYLE}
        title={c.classKey && c.key.startsWith("raised:") ? "Stated fund sizes as filed, USD, never estimates" : undefined}
      >
        {label}
      </th>
    );
  }

  function cell(c: Column, r: DirectoryRecord, score: number | null, reasons: string[]) {
    const base = responsive(c.min) ?? "";
    if (c.classKey) {
      if (c.key.startsWith("raised:")) return <RaisedCell key={c.key} r={r} classKey={c.classKey} className={base} />;
      return (
        <td key={c.key} className={base}>
          <NamesCell names={classStrategyNames(r, c.classKey)} tags />
        </td>
      );
    }
    switch (c.key) {
      case "firm": {
        // Two lines at most: the name with its type, then the opening of the
        // overview (the sentence that matched, in a keyword search; the first
        // reason, for a lookalike). The full text is one hover away.
        const text = r.description ?? r.lines;
        const blurb = mode === "similar" && reasons.length ? reasons[0] : mode === "keywords" ? snippet(text, query, 140) : text;
        return (
          <td key={c.key} className={cn(base, "max-w-[460px]")}>
            <div className="flex items-center gap-2.5">
              <CompanyLogo name={r.name} domain={r.domain} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Link href={`/companies/${r.id}`} className="cover min-w-0 truncate font-medium">
                    {r.name}
                  </Link>
                  {r.subType ? <span className="max-w-[160px] shrink-0 truncate text-[11.5px] text-muted-foreground">{r.subType}</span> : null}
                  {r.adv ? <Tag title={r.adv === "ERA" ? "Exempt reporting adviser (Form ADV)" : "SEC-registered adviser (Form ADV)"}>{r.adv === "ERA" ? "ERA" : "RIA"}</Tag> : null}
                </div>
                {blurb ? (
                  <p className="truncate text-[11.5px] leading-snug text-muted-foreground" title={text ?? blurb}>
                    {mode === "keywords" ? <Highlighted text={blurb} query={query} /> : blurb}
                  </p>
                ) : null}
              </div>
            </div>
          </td>
        );
      }
      case "type": {
        const name = typeNameOf(r.category, r.typeCode);
        return (
          <td key={c.key} className={cn(base, "max-w-[180px] truncate")} title={name ?? undefined}>
            {name ?? <span className="text-muted-foreground">—</span>}
          </td>
        );
      }
      case "location": {
        const place = locationLabel(r);
        return (
          <td key={c.key} className={cn(base, "max-w-[180px] truncate")} title={place ?? undefined}>
            {place ?? <span className="text-muted-foreground">—</span>}
          </td>
        );
      }
      case "size":
        return (
          <td key={c.key} className={cn(base, "num")} title={sizeTitle(r)}>
            {sizeLabel(r)}
          </td>
        );
      case "knownFunds":
        return (
          <td key={c.key} className={cn(base, "num text-muted-foreground")} title={knownFundsTitle(r)}>
            {r.knownFunds ? r.knownFunds.toLocaleString("en-US") : "—"}
          </td>
        );
      case "allocation":
        return (
          <td key={c.key} className={cn(base, "num text-muted-foreground")} title={allocationTitle(r)}>
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
          <td key={c.key} className={cn(base, "num text-muted-foreground")}>
            {headcountLabel(r.employees)}
          </td>
        );
      case "founded":
        return (
          <td key={c.key} className={cn(base, "num text-muted-foreground")}>
            {r.founded ?? "—"}
          </td>
        );
      case "contacts":
        return (
          <td key={c.key} className={cn(base, "num")}>
            {r.contacts ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground" title={r.connectable ? `${r.connectable} with a direct email on file` : undefined}>
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
                    <CompanyLogo name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={20} />
                  </span>
                );
              })}
              {brands.length > 4 ? <span className="figure text-[11px] text-muted-foreground">+{brands.length - 4}</span> : null}
              {brands.length === 0 ? <span className="text-muted-foreground">—</span> : null}
            </span>
          </td>
        );
      }
      case "match":
        return (
          <td key={c.key} className={cn(base, "num")}>
            {score != null ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[5px] w-10 overflow-hidden rounded-[2px] bar-track">
                  <span className="block h-full bar-fill" style={{ width: `${score}%` }} />
                </span>
                <span className="figure text-xs text-muted-foreground">{score}</span>
              </span>
            ) : null}
          </td>
        );
    }
  }

  return (
    <div className="space-y-2">
      <div className="sheen rounded-[4px] border bg-card max-md:overflow-x-auto">
        <table className="desk-table">
          <thead>
            <tr>
              <th className={cn(STICKY, "w-8 pr-0")} style={STICKY_STYLE}>
                <input
                  type="checkbox"
                  checked={allOn}
                  onChange={() => onToggleMany(visible.map((r) => r.record.id), !allOn)}
                  className="block h-3.5 w-3.5 accent-[var(--primary)]"
                  aria-label="Select all shown"
                />
              </th>
              {active.map(head)}
              <th className={cn(STICKY, "w-16")} style={STICKY_STYLE} aria-label="Row actions" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ record: r, score, reasons }) => {
              const on = selected.has(r.id);
              return (
                <tr key={r.id} className={cn("linked group", on && "bg-accent/40")}>
                  <td className="relative z-[1] w-8 pr-0">
                    <input type="checkbox" checked={on} onChange={() => onToggle(r.id)} className="block h-3.5 w-3.5 accent-[var(--primary)]" aria-label={`Select ${r.name}`} />
                  </td>
                  {active.map((c) => cell(c, r, score, reasons))}
                  <td className="relative z-[1] w-16">
                    <span className="flex items-center justify-end gap-0.5">
                      <button type="button" onClick={() => onQuickLook(r.id)} className={ROW_ICON} title="Quick look" aria-label={`Quick look at ${r.name}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => onSimilar(r.id)} className={ROW_ICON} title="Find similar firms" aria-label={`Find firms similar to ${r.name}`}>
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
        {rows.length > shown ? (
          <button type="button" onClick={() => setShown(shown + PAGE)} className={cn(MORE, "text-foreground")}>
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
