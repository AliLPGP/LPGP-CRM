"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { FacetMenu, type FacetGroup, type FacetOption } from "@/components/intel/facet-menu";
import { usePhone } from "@/components/use-media-query";
import { CATEGORIES, DIRECTORY_BOOKS, isCategory } from "@/lib/categories";
import { ASSET_CLASSES, isAssetClassKey } from "@/lib/directory/asset-classes";
import { toggle, type DirectoryFilters } from "@/lib/directory/filters";
import { parseMoney } from "@/lib/directory/format";
import { SUBREGIONS, ZONES, ZONE_LABEL, type Subregion, type Zone } from "@/lib/directory/geo";
import { PROVIDER_ROLES, ROLE_LABEL, type ProviderRole } from "@/lib/directory/providers";
import { STRATEGIES_BY_CLASS } from "@/lib/directory/strategies";
import {
  AUM_BANDS,
  INDUSTRIES,
  INVESTOR_TYPE_GROUPS,
  INVESTOR_TYPES,
  MANAGER_TYPES,
  PROVIDER_TYPES,
  TICKET_BANDS,
  type Band,
} from "@/lib/directory/taxonomy";
import { cn, formatUsd } from "@/lib/utils";
import { EMP_BANDS, type Facets } from "./use-results";
import type { Directory } from "./use-directory";

// Discover's filters, as a data product lays them out: one dropdown per
// dimension across the top of the results (FacetBar), and the long tail —
// ranges, toggles, the provider picker — behind one "More filters" panel.
// Every control reads and writes the same DirectoryFilters the URL carries;
// nothing here keeps a filter of its own.

/** A menu's open panel: the header's own fade-and-rise, off under reduced motion. */
const POP = "animate-[topnav-in_160ms_ease-out] motion-reduce:animate-none";

const INPUT = "h-8 w-full rounded-[4px] border border-input bg-background px-2 text-[12.5px] outline-none focus-visible:border-ring";

const opt = (key: string, label: string, count: number): FacetOption => ({ key, label, count });

// --- Bands ----------------------------------------------------------------------
// A range filter (aumMin / aumMax) shown as a menu of bands: the bands wholly
// inside the range read as ticked, and ticking bands sets the one range that
// spans them. Adjacent bands make exactly their union; a gap between two
// ticked bands is filled, and the chip says the range plainly.

/** The bands that sit wholly inside [min, max]. */
function bandsIn(bands: Band[], min: number | null, max: number | null): string[] {
  if (min == null && max == null) return [];
  return bands
    .filter((b) => (b.min ?? -Infinity) >= (min ?? -Infinity) && (b.max ?? Infinity) <= (max ?? Infinity))
    .map((b) => b.key);
}

/** The one range spanning a set of bands. */
function spanOf(bands: Band[], keys: string[]): [number | null, number | null] {
  const picked = bands.filter((b) => keys.includes(b.key));
  if (!picked.length) return [null, null];
  const min = picked.some((b) => b.min == null) ? null : Math.min(...picked.map((b) => b.min as number));
  const max = picked.some((b) => b.max == null) ? null : Math.max(...picked.map((b) => b.max as number));
  return [min, max];
}

/** Band options that the results carry, or that are ticked. */
function bandOptions(bands: Band[], counts: Map<string, number>, selected: string[]): FacetOption[] {
  return bands
    .filter((b) => (counts.get(b.key) ?? 0) > 0 || selected.includes(b.key))
    .map((b) => opt(b.key, b.label, counts.get(b.key) ?? 0));
}

// --- The bar ----------------------------------------------------------------------

/**
 * The facet dropdowns: Book, Asset class, Strategy (grouped by class, sectors
 * after strategies), Industry, Type (investors by family, then managers and
 * providers), Location (zone, region, country) and Size (AUM bands). Each
 * lists what the current results carry, or what is ticked — never the whole
 * vocabulary — with a count beside every value.
 */
export function FacetBar({
  dir,
  filters,
  facets,
  onChange,
}: {
  dir: Directory;
  filters: DirectoryFilters;
  facets: Facets;
  onChange: (next: DirectoryFilters) => void;
}) {
  const set = (patch: Partial<DirectoryFilters>) => onChange({ ...filters, ...patch });

  const books: FacetGroup[] = [
    {
      label: "",
      options: DIRECTORY_BOOKS.filter((b) => (facets.books.get(b) ?? 0) > 0 || filters.books.includes(b)).map((b) =>
        opt(b, CATEGORIES[b].name, facets.books.get(b) ?? 0),
      ),
    },
  ];

  const classes: FacetGroup[] = [
    {
      label: "",
      options: ASSET_CLASSES.filter((c) => (facets.classes.get(c.key) ?? 0) > 0 || filters.classes.includes(c.key)).map((c) =>
        opt(c.key, c.name, facets.classes.get(c.key) ?? 0),
      ),
    },
  ];

  const strategies: FacetGroup[] = [];
  for (const cls of ASSET_CLASSES) {
    const present = STRATEGIES_BY_CLASS[cls.key].filter(
      (s) => (facets.strategies.get(s.key) ?? 0) > 0 || filters.strategies.includes(s.key),
    );
    const how = present.filter((s) => s.axis === "strategy");
    const what = present.filter((s) => s.axis === "sector");
    if (how.length) strategies.push({ label: cls.name, options: how.map((s) => opt(s.key, s.name, facets.strategies.get(s.key) ?? 0)) });
    if (what.length) strategies.push({ label: `${cls.name} · sectors`, options: what.map((s) => opt(s.key, s.name, facets.strategies.get(s.key) ?? 0)) });
  }

  const industries: FacetGroup[] = [
    {
      label: "",
      options: INDUSTRIES.filter((i) => (facets.sectors.get(i.code) ?? 0) > 0 || filters.sectors.includes(i.code)).map((i) =>
        opt(i.code, i.name, facets.sectors.get(i.code) ?? 0),
      ),
    },
  ];

  // A code is one facet value whichever book it belongs to ("bank" is an
  // investor type and a provider type), so it is listed once.
  const types: FacetGroup[] = [];
  {
    const listed = new Set<string>();
    const families: [string, { code: string; name: string }[]][] = [
      ...INVESTOR_TYPE_GROUPS.map((g): [string, { code: string; name: string }[]] => [g, INVESTOR_TYPES.filter((t) => t.group === g)]),
      ["Fund managers", MANAGER_TYPES],
      ["Service providers", PROVIDER_TYPES],
    ];
    for (const [label, list] of families) {
      const options: FacetOption[] = [];
      for (const t of list) {
        if (listed.has(t.code)) continue;
        const n = facets.typeCodes.get(t.code) ?? 0;
        if (n > 0 || filters.typeCodes.includes(t.code)) {
          listed.add(t.code);
          options.push(opt(t.code, t.name, n));
        }
      }
      if (options.length) types.push({ label, options });
    }
  }

  // Location is three filters in one menu, told apart by a key prefix.
  const locationSelected = [
    ...filters.zones.map((z) => `z:${z}`),
    ...filters.regions.map((r) => `r:${r}`),
    ...filters.countries.map((c) => `c:${c}`),
  ];
  const countries = [...facets.countries.entries()].sort((a, b) => b[1] - a[1]);
  for (const c of filters.countries) if (!facets.countries.has(c)) countries.push([c, 0]);
  const location: FacetGroup[] = [
    { label: "Zone", options: ZONES.filter((z) => (facets.zones.get(z) ?? 0) > 0 || filters.zones.includes(z)).map((z) => opt(`z:${z}`, ZONE_LABEL[z], facets.zones.get(z) ?? 0)) },
    { label: "Region", options: SUBREGIONS.filter((r) => (facets.regions.get(r) ?? 0) > 0 || filters.regions.includes(r)).map((r) => opt(`r:${r}`, r, facets.regions.get(r) ?? 0)) },
    { label: "Country", options: countries.map(([c, n]) => opt(`c:${c}`, c, n)) },
  ].filter((g) => g.options.length);

  const sizeSelected = bandsIn(AUM_BANDS, filters.aumMin, filters.aumMax);
  const sizes: FacetGroup[] = [{ label: "", options: bandOptions(AUM_BANDS, facets.aumBands, sizeSelected) }];

  return (
    <>
      <FacetMenu label="Book" groups={books} selected={filters.books} onChange={(next) => set({ books: next.filter(isCategory) })} searchable={false} width={240} />
      <FacetMenu label="Asset class" groups={classes} selected={filters.classes} onChange={(next) => set({ classes: next.filter(isAssetClassKey) })} searchable={false} width={240} />
      <FacetMenu label="Strategy" groups={strategies} selected={filters.strategies} onChange={(next) => set({ strategies: next })} width={320} />
      <FacetMenu label="Industry" groups={industries} selected={filters.sectors} onChange={(next) => set({ sectors: next })} width={280} />
      <FacetMenu label="Type" groups={types} selected={filters.typeCodes} onChange={(next) => set({ typeCodes: next })} width={300} />
      <FacetMenu
        label="Location"
        groups={location}
        selected={locationSelected}
        onChange={(next) =>
          set({
            zones: next.filter((k) => k.startsWith("z:")).map((k) => k.slice(2) as Zone),
            regions: next.filter((k) => k.startsWith("r:")).map((k) => k.slice(2) as Subregion),
            countries: next.filter((k) => k.startsWith("c:")).map((k) => k.slice(2)),
          })
        }
        width={300}
      />
      <FacetMenu
        label="Size"
        groups={sizes}
        selected={sizeSelected}
        onChange={(next) => {
          const [aumMin, aumMax] = spanOf(AUM_BANDS, next);
          set({ aumMin, aumMax });
        }}
        searchable={false}
        width={220}
      />
      <MoreFilters dir={dir} filters={filters} facets={facets} onChange={onChange} />
    </>
  );
}

// --- The "More filters" panel -----------------------------------------------------

function Option({
  on,
  label,
  count,
  onClick,
  title,
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={cn("flex w-full items-center gap-2 rounded-[3px] px-1.5 py-1 text-left text-[12.5px] hover:bg-accent max-md:min-h-10 max-md:text-[14px]", count === 0 && !on && "opacity-50")}
    >
      <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border max-md:h-4 max-md:w-4", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
        {on ? <Check className="h-2.5 w-2.5" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? <span className="figure text-[11px] text-muted-foreground">{count.toLocaleString("en-US")}</span> : null}
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="desk-label pb-1.5">{title}</p>
      {children}
      {hint ? <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function MoneyInput({ value, placeholder, onCommit }: { value: number | null; placeholder: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? formatUsd(value).replace("$", "") : "");
  const commit = () => onCommit(text.trim() ? parseMoney(text) : null);
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder={placeholder}
      className={INPUT}
      inputMode="decimal"
    />
  );
}

function YearInput({ value, placeholder, onCommit }: { value: number | null; placeholder: string; onCommit: (v: number | null) => void }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const commit = () => {
    const n = Number(text);
    onCommit(text.trim() && Number.isInteger(n) && n > 1600 && n < 2200 ? n : null);
  };
  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
      }}
      placeholder={placeholder}
      className={INPUT}
      inputMode="numeric"
    />
  );
}

/** A share of a portfolio, 0–100. Anything else commits as "no bound". */
function PercentInput({ value, placeholder, onCommit, label }: { value: number | null; placeholder: string; onCommit: (v: number | null) => void; label: string }) {
  const [text, setText] = useState(value != null ? String(value) : "");
  const commit = () => {
    const n = Number(text.replace("%", "").trim());
    onCommit(text.trim() && Number.isFinite(n) && n >= 0 && n <= 100 ? n : null);
  };
  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(INPUT, "pr-6")}
        inputMode="decimal"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">%</span>
    </div>
  );
}

function ProviderPicker({ dir, onAdd }: { dir: Directory; onAdd: (key: string, role: ProviderRole | null) => void }) {
  const [q, setQ] = useState("");
  const [role, setRole] = useState<ProviderRole | "">("");
  const matchesQ = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const pool = dir.brands.filter((b) => b.clients >= 1);
    const hits = needle ? pool.filter((b) => b.name.toLowerCase().includes(needle)) : pool;
    return [...hits].sort((a, b) => b.clients - a.clients).slice(0, 6);
  }, [q, dir.brands]);
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="KPMG, Citco, J.P. Morgan…" className={cn(INPUT, "pl-7")} />
      </div>
      <select value={role} onChange={(e) => setRole(e.target.value as ProviderRole | "")} className={INPUT} aria-label="As">
        <option value="">In any role</option>
        {PROVIDER_ROLES.map((r) => (
          <option key={r} value={r}>
            As {ROLE_LABEL[r].toLowerCase()}
          </option>
        ))}
      </select>
      <div>
        {matchesQ.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              onAdd(b.key, role || null);
              setQ("");
            }}
            className="flex w-full items-center gap-2 rounded-[3px] px-1.5 py-1 text-left text-[12.5px] hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            <span className="figure text-[11px] text-muted-foreground" title="GP clients on Form ADV">
              {b.clients}
            </span>
          </button>
        ))}
        {matchesQ.length === 0 ? <p className="px-1.5 text-[11.5px] text-muted-foreground">No provider by that name.</p> : null}
      </div>
    </div>
  );
}

/** The sub-types as the directory records them, searchable, the most common first. */
function TypeList({ filters, facets, onToggle }: { filters: DirectoryFilters; facets: Facets; onToggle: (t: string) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const all = [...facets.types.entries()].sort((a, b) => b[1] - a[1]);
  for (const t of filters.types) if (!facets.types.has(t)) all.push([t, 0]);
  const rows = needle ? all.filter(([t]) => t.toLowerCase().includes(needle)) : all.slice(0, 8);
  return (
    <div className="space-y-1.5">
      {all.length > 8 ? (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${all.length} types`} className={cn(INPUT, "pl-7")} />
        </div>
      ) : null}
      <div className="max-h-44 overflow-y-auto">
        {rows.map(([t, n]) => (
          <Option key={t} on={filters.types.includes(t)} label={t} count={n} onClick={() => onToggle(t)} />
        ))}
        {rows.length === 0 ? <p className="px-1.5 text-[11.5px] text-muted-foreground">No type by that name among these firms.</p> : null}
      </div>
    </div>
  );
}

/** The More-panel's own filters, blank: what its Clear button sets. */
const MORE_BLANK: Partial<DirectoryFilters> = {
  types: [],
  empMin: null,
  empMax: null,
  foundedMin: null,
  foundedMax: null,
  adv: [],
  providers: [],
  ticketMin: null,
  ticketMax: null,
  allocClass: null,
  allocMin: null,
  allocMax: null,
  altsMin: null,
  altsMax: null,
  hasContacts: false,
  connectable: false,
  hasWebsite: false,
  discloses: false,
  hasPlans: false,
  portfolio: false,
  hasOperators: false,
  hasPortcos: false,
  includeInactive: false,
};

type Flag = "hasContacts" | "connectable" | "hasWebsite" | "discloses" | "hasPlans" | "portfolio" | "hasOperators" | "hasPortcos";

const FLAGS: [Flag, string][] = [
  ["hasContacts", "Has key contacts"],
  ["connectable", "Direct email on file"],
  ["hasWebsite", "Has website"],
  ["discloses", "Discloses commitments (LPs)"],
  ["hasPlans", "Has a plan for the next 12 months"],
  ["portfolio", "In portfolio"],
  ["hasOperators", "Operating partners on file"],
  ["hasPortcos", "Portfolio companies on file"],
];

/** How many of the panel's filters are set, for the button's badge. */
function moreCount(f: DirectoryFilters): number {
  return (
    f.types.length +
    (f.empMin != null || f.empMax != null ? 1 : 0) +
    (f.foundedMin != null || f.foundedMax != null ? 1 : 0) +
    f.adv.length +
    f.providers.length +
    (f.ticketMin != null || f.ticketMax != null ? 1 : 0) +
    (f.allocClass != null ? 1 : 0) +
    (f.altsMin != null || f.altsMax != null ? 1 : 0) +
    FLAGS.filter(([k]) => f[k]).length +
    (f.includeInactive ? 1 : 0)
  );
}

const PANEL_WIDTH = 760;

/**
 * The long tail behind one button: headcount, founding year, Form ADV status,
 * service providers, ticket size, allocations, a custom size range, the
 * data-on-file toggles, the type as recorded. Opens below the button, or
 * right-aligned when the panel would run off the viewport; on a phone it is
 * a bottom sheet, one column, portaled to the body like FacetMenu's.
 */
export function MoreFilters({
  dir,
  filters,
  facets,
  onChange,
}: {
  dir: Directory;
  filters: DirectoryFilters;
  facets: Facets;
  onChange: (next: DirectoryFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const set = (patch: Partial<DirectoryFilters>) => onChange({ ...filters, ...patch });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The sheet is portaled, so it is outside the button's subtree in the DOM.
      if (ref.current?.contains(t) || sheetRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A sheet holds the page behind it still, as the header's drawer does.
  useEffect(() => {
    if (!open || !phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, phone]);

  const count = moreCount(filters);
  const empSelected = bandsIn(EMP_BANDS, filters.empMin, filters.empMax);
  const ticketSelected = bandsIn(TICKET_BANDS, filters.ticketMin, filters.ticketMax);

  // The panel's sections and its footer, the same in the dropdown and the sheet.
  const panel = (
    <>
      <div className="grid max-h-[70vh] gap-x-6 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 max-md:max-h-none max-md:min-h-0 max-md:flex-1">
            <Section title="Headcount">
              {EMP_BANDS.map((b) => (
                <Option
                  key={b.key}
                  on={empSelected.includes(b.key)}
                  label={b.label}
                  count={facets.empBands.get(b.key) ?? 0}
                  onClick={() => {
                    const [empMin, empMax] = spanOf(EMP_BANDS, toggle(empSelected, b.key));
                    set({ empMin, empMax });
                  }}
                />
              ))}
            </Section>

            <Section title="Founded">
              <div key={`${filters.foundedMin}-${filters.foundedMax}`} className="grid grid-cols-2 gap-2">
                <YearInput value={filters.foundedMin} placeholder="From" onCommit={(v) => set({ foundedMin: v })} />
                <YearInput value={filters.foundedMax} placeholder="To" onCommit={(v) => set({ foundedMax: v })} />
              </div>
            </Section>

            <Section title="Form ADV">
              {(
                [
                  ["Registered", "SEC registered adviser"],
                  ["ERA", "Exempt reporting adviser"],
                  ["None", "No ADV on record"],
                ] as const
              ).map(([k, label]) => (
                <Option key={k} on={filters.adv.includes(k)} label={label} count={facets.adv.get(k) ?? 0} onClick={() => set({ adv: toggle(filters.adv, k) })} />
              ))}
            </Section>

            <Section title="Service providers" hint="Managers whose Form ADV names this auditor, administrator, custodian, prime broker or placement agent.">
              {filters.providers.length ? (
                <div className="mb-2 flex flex-wrap gap-1">
                  {filters.providers.map((p) => (
                    <span key={`${p.key}:${p.role ?? ""}`} className="inline-flex items-center gap-1 rounded-[4px] border bg-card py-0.5 pl-2 pr-1 text-[12px]">
                      {dir.brandByKey.get(p.key)?.name ?? p.key}
                      {p.role ? <span className="text-muted-foreground">· {ROLE_LABEL[p.role].toLowerCase()}</span> : null}
                      <button
                        type="button"
                        onClick={() => set({ providers: filters.providers.filter((q) => !(q.key === p.key && q.role === p.role)) })}
                        aria-label={`Remove ${p.key}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <ProviderPicker
                dir={dir}
                onAdd={(key, role) => {
                  if (!filters.providers.some((p) => p.key === key && p.role === role)) set({ providers: [...filters.providers, { key, role }] });
                }}
              />
            </Section>

            <Section title="Ticket size" hint="The commitment an investor writes per fund, in USD as it states it. Investors with no stated range are left out.">
              {TICKET_BANDS.map((b) => (
                <Option
                  key={b.key}
                  on={ticketSelected.includes(b.key)}
                  label={b.label}
                  onClick={() => {
                    const [ticketMin, ticketMax] = spanOf(TICKET_BANDS, toggle(ticketSelected, b.key));
                    set({ ticketMin, ticketMax });
                  }}
                />
              ))}
              <div key={`${filters.ticketMin}-${filters.ticketMax}`} className="mt-2 grid grid-cols-2 gap-2">
                <MoneyInput value={filters.ticketMin} placeholder="Min, e.g. 10m" onCommit={(v) => set({ ticketMin: v })} />
                <MoneyInput value={filters.ticketMax} placeholder="Max, e.g. 100m" onCommit={(v) => set({ ticketMax: v })} />
              </div>
            </Section>

            <Section title="Allocation" hint="Shares as the investor publishes them. A firm with no stated figure is left out while a bound is set.">
              <select
                value={filters.allocClass ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  set(isAssetClassKey(v) ? { allocClass: v } : { allocClass: null, allocMin: null, allocMax: null });
                }}
                className={INPUT}
                aria-label="Asset class allocated to"
              >
                <option value="">Current allocation to any class</option>
                {ASSET_CLASSES.map((c) => (
                  <option key={c.key} value={c.key}>
                    Allocates to {c.name.toLowerCase()}
                  </option>
                ))}
              </select>
              <div key={`${filters.allocClass}-${filters.allocMin}-${filters.allocMax}`} className="mt-2 grid grid-cols-2 gap-2">
                <PercentInput value={filters.allocMin} placeholder="Min" label="Minimum allocation" onCommit={(v) => set({ allocMin: v })} />
                <PercentInput value={filters.allocMax} placeholder="Max" label="Maximum allocation" onCommit={(v) => set({ allocMax: v })} />
              </div>
              <p className="desk-label mt-3 pb-1.5">Alternatives, % of portfolio</p>
              <div key={`${filters.altsMin}-${filters.altsMax}`} className="grid grid-cols-2 gap-2">
                <PercentInput value={filters.altsMin} placeholder="Min" label="Minimum alternatives share" onCommit={(v) => set({ altsMin: v })} />
                <PercentInput value={filters.altsMax} placeholder="Max" label="Maximum alternatives share" onCommit={(v) => set({ altsMax: v })} />
              </div>
            </Section>

            <Section title="Size, any range" hint="Regulatory AUM from Form ADV for managers; total assets for LPs. The Size menu offers the bands.">
              <div key={`${filters.aumMin}-${filters.aumMax}`} className="grid grid-cols-2 gap-2">
                <MoneyInput value={filters.aumMin} placeholder="Min, e.g. 500m" onCommit={(v) => set({ aumMin: v })} />
                <MoneyInput value={filters.aumMax} placeholder="Max, e.g. 10b" onCommit={(v) => set({ aumMax: v })} />
              </div>
            </Section>

            <Section title="Data on file">
              {FLAGS.map(([k, label]) => (
                <Option key={k} on={filters[k]} label={label} onClick={() => set({ [k]: !filters[k] } as Partial<DirectoryFilters>)} />
              ))}
              <Option
                on={filters.includeInactive}
                label="Include investors no longer in alternatives"
                title="Investors whose own statements say they have stopped investing in alternatives are hidden unless this is on"
                onClick={() => set({ includeInactive: !filters.includeInactive })}
              />
            </Section>

        <Section title="Type as recorded" hint="The directory's own type words, before the taxonomy places them.">
          <TypeList filters={filters} facets={facets} onToggle={(t) => set({ types: toggle(filters.types, t) })} />
        </Section>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        <button
          type="button"
          onClick={() => set(MORE_BLANK)}
          className="rounded-[4px] px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground max-md:h-11 max-md:px-3 max-md:text-[13px]"
          disabled={!count}
        >
          Clear these
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-[4px] bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover max-md:h-11 max-md:flex-1 max-md:text-[14px]"
        >
          Done
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          setAlignRight(Boolean(r && r.left + PANEL_WIDTH > window.innerWidth && r.right - PANEL_WIDTH >= 0));
          setOpen(!open);
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] transition-colors hover:bg-accent",
          count ? "border-foreground/60 text-foreground" : "text-muted-foreground",
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        More filters
        {count ? <span className="figure rounded-[3px] bg-primary px-1 text-[10.5px] leading-4 text-primary-foreground">{count}</span> : null}
        <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        phone ? (
          createPortal(
            <>
              <button type="button" className="facet-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
              <div ref={sheetRef} role="dialog" aria-label="More filters" className="facet-sheet desk">
                <span className="facet-handle" aria-hidden />
                <p className="px-4 pb-1 pt-1 text-[14px] font-medium">More filters</p>
                {panel}
              </div>
            </>,
            document.body,
          )
        ) : (
          <div
            role="dialog"
            aria-label="More filters"
            className={cn(POP, "absolute top-[calc(100%+4px)] z-40 rounded-[4px] border bg-popover text-popover-foreground shadow-[var(--shadow-pop)]", alignRight ? "right-0" : "left-0")}
            style={{ width: `min(${PANEL_WIDTH}px, calc(100vw - 32px))` }}
          >
            {panel}
          </div>
        )
      ) : null}
    </div>
  );
}
