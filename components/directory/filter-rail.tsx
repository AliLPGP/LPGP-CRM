"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Plus, RotateCcw, Search } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { ASSET_CLASSES, isAssetClassKey } from "@/lib/directory/asset-classes";
import { EMPTY_FILTERS, hasStructuredFilters, toggle, type DirectoryFilters } from "@/lib/directory/filters";
import { AUM_PRESETS, EMPLOYEE_PRESETS, parseMoney } from "@/lib/directory/format";
import { ZONES, ZONE_LABEL } from "@/lib/directory/geo";
import { PROVIDER_ROLES, ROLE_LABEL, type ProviderRole } from "@/lib/directory/providers";
import { STRATEGIES_BY_CLASS, type Strategy } from "@/lib/directory/strategies";
import {
  INDUSTRIES,
  INVESTOR_TYPE_GROUPS,
  INVESTOR_TYPES,
  MANAGER_TYPES,
  PROVIDER_TYPES,
  REGIONS,
  TICKET_BANDS,
} from "@/lib/directory/taxonomy";
import { cn, formatUsd } from "@/lib/utils";
import type { Facets } from "./use-results";
import type { Directory } from "./use-directory";

function Section({
  title,
  children,
  defaultOpen = true,
  count,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="eyebrow">
          {title}
          {count ? <span className="ml-1.5 text-[var(--brass)]">· {count}</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

function Option({
  on,
  label,
  count,
  onClick,
  muted,
  title,
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  muted?: boolean;
  /** For a label the rail is too narrow for. */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-accent/60",
        muted && !on && "opacity-50",
      )}
      aria-pressed={on}
    >
      <span
        className={cn(
          "grid h-4 w-4 shrink-0 place-items-center rounded border",
          on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
        )}
      >
        {on ? <Check className="h-3 w-3" /> : null}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? <span className="tabular text-xs text-muted-foreground">{count.toLocaleString("en-US")}</span> : null}
    </button>
  );
}

function Pill({ on, children, onClick }: { on: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** A collapsible group inside a section: an asset class's strategies, a family of investor types. */
function Group({
  title,
  size,
  ticked,
  defaultOpen,
  children,
}: {
  title: string;
  /** How many options the group holds, shown while it is folded. */
  size: number;
  /** How many of them are ticked. */
  ticked: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-[12.5px] font-medium hover:bg-accent/60"
        aria-expanded={open}
      >
        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {ticked ? <span className="tabular text-xs text-[var(--brass)]">{ticked}</span> : null}
        {!open ? <span className="tabular text-xs text-muted-foreground">{size}</span> : null}
      </button>
      {open ? <div className="ml-2 space-y-0.5 border-l pl-1.5">{children}</div> : null}
    </div>
  );
}

function sorted<K>(map: Map<K, number>): [K, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function MoneyInput({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
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
      className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:border-ring"
      inputMode="decimal"
    />
  );
}

function YearInput({
  value,
  placeholder,
  onCommit,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
}) {
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
      className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none focus-visible:border-ring"
      inputMode="numeric"
    />
  );
}

/** A share of a portfolio, 0–100. Anything else commits as "no bound". */
function PercentInput({
  value,
  placeholder,
  onCommit,
  label,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (v: number | null) => void;
  label: string;
}) {
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
        className="h-8 w-full rounded-md border border-input bg-card pl-2 pr-6 text-xs outline-none focus-visible:border-ring"
        inputMode="decimal"
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
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
    return [...hits].sort((a, b) => b.clients - a.clients).slice(0, 8);
  }, [q, dir.brands]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="KPMG, Citco, J.P. Morgan…"
          className="h-8 w-full rounded-md border border-input bg-card pl-7 pr-2 text-xs outline-none focus-visible:border-ring"
        />
      </div>
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as ProviderRole | "")}
        className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none"
        aria-label="As"
      >
        <option value="">In any role</option>
        {PROVIDER_ROLES.map((r) => (
          <option key={r} value={r}>
            As {ROLE_LABEL[r].toLowerCase()}
          </option>
        ))}
      </select>
      <div className="space-y-0.5">
        {matchesQ.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              onAdd(b.key, role || null);
              setQ("");
            }}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-accent/60"
          >
            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{b.name}</span>
            <span className="tabular text-xs text-muted-foreground" title="GP clients on Form ADV">
              {b.clients}
            </span>
          </button>
        ))}
        {matchesQ.length === 0 ? <p className="px-1.5 text-xs text-muted-foreground">No provider by that name.</p> : null}
      </div>
    </div>
  );
}

export function FilterRail({
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
  const [countryQ, setCountryQ] = useState("");
  const [allCountries, setAllCountries] = useState(false);
  const [allTypes, setAllTypes] = useState(false);
  const set = (patch: Partial<DirectoryFilters>) => onChange({ ...filters, ...patch });

  const types = sorted(facets.types);
  const shownTypes = allTypes ? types : types.slice(0, 10);
  const countries = sorted(facets.countries).filter(([c]) => c.toLowerCase().includes(countryQ.trim().toLowerCase()));
  // Keep ticked values visible even when a narrower search has zero of them.
  for (const c of filters.countries) if (!countries.some(([x]) => x === c)) countries.push([c, 0]);
  const shownCountries = allCountries || countryQ ? countries : countries.slice(0, 8);
  const hasAny = hasStructuredFilters(filters);

  // The data-product facets. Each shows what the current results carry (or
  // what is ticked), never the whole vocabulary.
  const classRows = ASSET_CLASSES.filter((c) => (facets.classes.get(c.key) ?? 0) > 0 || filters.classes.includes(c.key));
  const strategyGroups = ASSET_CLASSES.map((cls) => {
    const present = STRATEGIES_BY_CLASS[cls.key].filter(
      (s) => (facets.strategies.get(s.key) ?? 0) > 0 || filters.strategies.includes(s.key),
    );
    return {
      cls,
      strategies: present.filter((s) => s.axis === "strategy"),
      sectors: present.filter((s) => s.axis === "sector"),
    };
  }).filter((g) => g.strategies.length || g.sectors.length);
  const industryRows = INDUSTRIES.filter((i) => (facets.sectors.get(i.code) ?? 0) > 0 || filters.sectors.includes(i.code));
  const typeGroups: { title: string; entries: { code: string; name: string }[] }[] = [];
  {
    // A code is one facet value whichever book it belongs to ("bank" is an
    // investor type and a provider type), so it is listed once.
    const listed = new Set<string>();
    const wanted = (code: string) => !listed.has(code) && ((facets.typeCodes.get(code) ?? 0) > 0 || filters.typeCodes.includes(code));
    const families: [string, { code: string; name: string }[]][] = [
      ...INVESTOR_TYPE_GROUPS.map((g): [string, { code: string; name: string }[]] => [g, INVESTOR_TYPES.filter((t) => t.group === g)]),
      ["Fund managers", MANAGER_TYPES],
      ["Service providers", PROVIDER_TYPES],
    ];
    for (const [title, list] of families) {
      const entries = list.filter((t) => wanted(t.code));
      for (const t of entries) listed.add(t.code);
      if (entries.length) typeGroups.push({ title, entries });
    }
  }
  const ticketOn = filters.ticketMin != null || filters.ticketMax != null;
  const allocOn = filters.allocClass != null || filters.allocMin != null || filters.allocMax != null;
  const altsOn = filters.altsMin != null || filters.altsMax != null;

  const strategyOption = (s: Strategy) => (
    <Option
      key={s.key}
      on={filters.strategies.includes(s.key)}
      label={s.name}
      count={facets.strategies.get(s.key) ?? 0}
      muted={!facets.strategies.get(s.key)}
      onClick={() => set({ strategies: toggle(filters.strategies, s.key) })}
    />
  );

  return (
    <div className="sheen overflow-hidden rounded-2xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Filters</span>
        {hasAny ? (
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, keywords: filters.keywords, like: filters.like })}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        ) : null}
      </div>

      <Section title="Book" count={filters.books.length}>
        <div className="space-y-0.5">
          {(["LP", "GP", "SP", "UN"] as const).map((b) => (
            <Option
              key={b}
              on={filters.books.includes(b)}
              label={CATEGORIES[b].name}
              count={facets.books.get(b) ?? 0}
              muted={!facets.books.get(b)}
              onClick={() => set({ books: toggle(filters.books, b) })}
            />
          ))}
        </div>
      </Section>

      <Section title="Type" count={filters.types.length}>
        <div className="space-y-0.5">
          {shownTypes.map(([t, n]) => (
            <Option key={t} on={filters.types.includes(t)} label={t} count={n} onClick={() => set({ types: toggle(filters.types, t) })} />
          ))}
          {filters.types
            .filter((t) => !types.some(([x]) => x === t))
            .map((t) => (
              <Option key={t} on label={t} count={0} onClick={() => set({ types: toggle(filters.types, t) })} />
            ))}
          {types.length > 10 ? (
            <button type="button" onClick={() => setAllTypes(!allTypes)} className="px-1.5 pt-1 text-xs text-muted-foreground hover:text-foreground">
              {allTypes ? "Fewer" : `All ${types.length} types`}
            </button>
          ) : null}
          {types.length === 0 && filters.types.length === 0 ? (
            <p className="px-1.5 text-xs text-muted-foreground">No types recorded for these firms.</p>
          ) : null}
        </div>
      </Section>

      <Section title="Asset class" count={filters.classes.length}>
        <div className="space-y-0.5">
          {classRows.map((c) => (
            <Option
              key={c.key}
              on={filters.classes.includes(c.key)}
              label={c.name}
              count={facets.classes.get(c.key) ?? 0}
              muted={!facets.classes.get(c.key)}
              onClick={() => set({ classes: toggle(filters.classes, c.key) })}
            />
          ))}
          {classRows.length === 0 ? <p className="px-1.5 text-xs text-muted-foreground">No asset class on file for these firms.</p> : null}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Managers by their type and the strategies they state; investors by the classes they allocate to or plan for.
        </p>
      </Section>

      <Section title="Strategy" count={filters.strategies.length}>
        <div className="space-y-0.5">
          {strategyGroups.map((g) => {
            const ticked = [...g.strategies, ...g.sectors].filter((s) => filters.strategies.includes(s.key)).length;
            return (
              <Group
                key={g.cls.key}
                title={g.cls.name}
                size={g.strategies.length + g.sectors.length}
                ticked={ticked}
                defaultOpen={ticked > 0 || filters.classes.includes(g.cls.key)}
              >
                {g.strategies.map(strategyOption)}
                {g.sectors.length ? (
                  <>
                    <p className={cn("desk-label px-1.5 pb-0.5", g.strategies.length && "pt-1.5")}>Sectors</p>
                    {g.sectors.map(strategyOption)}
                  </>
                ) : null}
              </Group>
            );
          })}
          {strategyGroups.length === 0 ? (
            <p className="px-1.5 text-xs text-muted-foreground">No strategy stated by these firms.</p>
          ) : null}
        </div>
      </Section>

      <Section title="Industry" defaultOpen={filters.sectors.length > 0} count={filters.sectors.length}>
        <div className="space-y-0.5">
          {industryRows.map((i) => (
            <Option
              key={i.code}
              on={filters.sectors.includes(i.code)}
              label={i.name}
              count={facets.sectors.get(i.code) ?? 0}
              muted={!facets.sectors.get(i.code)}
              onClick={() => set({ sectors: toggle(filters.sectors, i.code) })}
            />
          ))}
          {industryRows.length === 0 ? <p className="px-1.5 text-xs text-muted-foreground">No industry named by these firms.</p> : null}
        </div>
      </Section>

      <Section title="Investor type" count={filters.typeCodes.length}>
        <div className="space-y-0.5">
          {typeGroups.map((g) => {
            const ticked = g.entries.filter((t) => filters.typeCodes.includes(t.code)).length;
            return (
              <Group key={g.title} title={g.title} size={g.entries.length} ticked={ticked} defaultOpen={ticked > 0}>
                {g.entries.map((t) => (
                  <Option
                    key={t.code}
                    on={filters.typeCodes.includes(t.code)}
                    label={t.name}
                    count={facets.typeCodes.get(t.code) ?? 0}
                    muted={!facets.typeCodes.get(t.code)}
                    onClick={() => set({ typeCodes: toggle(filters.typeCodes, t.code) })}
                  />
                ))}
              </Group>
            );
          })}
          {typeGroups.length === 0 ? <p className="px-1.5 text-xs text-muted-foreground">No classified type for these firms.</p> : null}
        </div>
      </Section>

      <Section title="Geographic preference" defaultOpen={filters.prefRegions.length > 0} count={filters.prefRegions.length}>
        <div className="space-y-0.5">
          {REGIONS.map((r) => (
            <Option
              key={r.code}
              on={filters.prefRegions.includes(r.code)}
              label={r.name}
              count={facets.prefRegions.get(r.code) ?? 0}
              muted={!facets.prefRegions.get(r.code)}
              onClick={() => set({ prefRegions: toggle(filters.prefRegions, r.code) })}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Where a firm sits, and the regions its stated focus or an investor&apos;s own preferences name.
        </p>
      </Section>

      <Section title="Ticket size" defaultOpen={ticketOn} count={ticketOn ? 1 : 0}>
        <div className="flex flex-wrap gap-1.5">
          {TICKET_BANDS.map((b) => {
            const on = filters.ticketMin === b.min && filters.ticketMax === b.max;
            return (
              <Pill key={b.key} on={on} onClick={() => set(on ? { ticketMin: null, ticketMax: null } : { ticketMin: b.min, ticketMax: b.max })}>
                {b.label}
              </Pill>
            );
          })}
        </div>
        <div key={`${filters.ticketMin}-${filters.ticketMax}`} className="mt-2.5 grid grid-cols-2 gap-2">
          <MoneyInput value={filters.ticketMin} placeholder="Min, e.g. 10m" onCommit={(v) => set({ ticketMin: v })} />
          <MoneyInput value={filters.ticketMax} placeholder="Max, e.g. 100m" onCommit={(v) => set({ ticketMax: v })} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          The commitment an investor writes per fund, in USD as it states it. Investors with no stated range are left out.
        </p>
      </Section>

      <Section title="Allocation" defaultOpen={allocOn || altsOn} count={(allocOn ? 1 : 0) + (altsOn ? 1 : 0)}>
        <p className="desk-label px-0.5 pb-1.5">Current allocation to</p>
        <select
          value={filters.allocClass ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            set(isAssetClassKey(v) ? { allocClass: v } : { allocClass: null, allocMin: null, allocMax: null });
          }}
          className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs outline-none"
          aria-label="Asset class allocated to"
        >
          <option value="">Any asset class</option>
          {ASSET_CLASSES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.name}
            </option>
          ))}
        </select>
        <div key={`${filters.allocClass}-${filters.allocMin}-${filters.allocMax}`} className="mt-2 grid grid-cols-2 gap-2">
          <PercentInput value={filters.allocMin} placeholder="Min" label="Minimum allocation" onCommit={(v) => set({ allocMin: v })} />
          <PercentInput value={filters.allocMax} placeholder="Max" label="Maximum allocation" onCommit={(v) => set({ allocMax: v })} />
        </div>
        <p className="desk-label mt-3 px-0.5 pb-1.5">Alternatives, % of portfolio</p>
        <div key={`${filters.altsMin}-${filters.altsMax}`} className="grid grid-cols-2 gap-2">
          <PercentInput value={filters.altsMin} placeholder="Min" label="Minimum alternatives share" onCommit={(v) => set({ altsMin: v })} />
          <PercentInput value={filters.altsMax} placeholder="Max" label="Maximum alternatives share" onCommit={(v) => set({ altsMax: v })} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Shares as the investor publishes them. A firm with no stated figure is left out while a bound is set.
        </p>
      </Section>

      <Section title="Location" count={filters.zones.length + filters.countries.length + filters.cities.length + filters.regions.length + filters.states.length}>
        <div className="flex flex-wrap gap-1.5">
          {ZONES.map((z) => (
            <Pill key={z} on={filters.zones.includes(z)} onClick={() => set({ zones: toggle(filters.zones, z) })}>
              <span title={ZONE_LABEL[z]}>{z}</span>
              <span className="ml-1 tabular opacity-70">{facets.zones.get(z) ?? 0}</span>
            </Pill>
          ))}
        </div>
        <div className="relative mt-3">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={countryQ}
            onChange={(e) => setCountryQ(e.target.value)}
            placeholder="Country"
            className="h-8 w-full rounded-md border border-input bg-card pl-7 pr-2 text-xs outline-none focus-visible:border-ring"
          />
        </div>
        <div className="mt-2 space-y-0.5">
          {shownCountries.map(([c, n]) => (
            <Option key={c} on={filters.countries.includes(c)} label={c} count={n} onClick={() => set({ countries: toggle(filters.countries, c) })} />
          ))}
          {!countryQ && countries.length > 8 ? (
            <button type="button" onClick={() => setAllCountries(!allCountries)} className="px-1.5 pt-1 text-xs text-muted-foreground hover:text-foreground">
              {allCountries ? "Fewer" : `All ${countries.length} countries`}
            </button>
          ) : null}
        </div>
      </Section>

      <Section title="Size" count={filters.aumMin != null || filters.aumMax != null ? 1 : 0}>
        <div className="flex flex-wrap gap-1.5">
          {AUM_PRESETS.map((p) => {
            const on = filters.aumMin === p.min && filters.aumMax === p.max;
            return (
              <Pill key={p.label} on={on} onClick={() => set(on ? { aumMin: null, aumMax: null } : { aumMin: p.min, aumMax: p.max })}>
                {p.label}
              </Pill>
            );
          })}
        </div>
        <div key={`${filters.aumMin}-${filters.aumMax}`} className="mt-2.5 grid grid-cols-2 gap-2">
          <MoneyInput value={filters.aumMin} placeholder="Min, e.g. 500m" onCommit={(v) => set({ aumMin: v })} />
          <MoneyInput value={filters.aumMax} placeholder="Max, e.g. 10b" onCommit={(v) => set({ aumMax: v })} />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
          Regulatory AUM from Form ADV for managers; total assets for LPs.
        </p>
      </Section>

      <Section title="Headcount" defaultOpen={false} count={filters.empMin != null || filters.empMax != null ? 1 : 0}>
        <div className="flex flex-wrap gap-1.5">
          {EMPLOYEE_PRESETS.map((p) => {
            const on = filters.empMin === p.min && filters.empMax === p.max;
            return (
              <Pill key={p.label} on={on} onClick={() => set(on ? { empMin: null, empMax: null } : { empMin: p.min, empMax: p.max })}>
                {p.label}
              </Pill>
            );
          })}
        </div>
      </Section>

      <Section title="Founded" defaultOpen={false} count={filters.foundedMin != null || filters.foundedMax != null ? 1 : 0}>
        <div key={`${filters.foundedMin}-${filters.foundedMax}`} className="grid grid-cols-2 gap-2">
          <YearInput value={filters.foundedMin} placeholder="From" onCommit={(v) => set({ foundedMin: v })} />
          <YearInput value={filters.foundedMax} placeholder="To" onCommit={(v) => set({ foundedMax: v })} />
        </div>
      </Section>

      <Section title="Form ADV" defaultOpen={false} count={filters.adv.length}>
        <div className="space-y-0.5">
          {(
            [
              ["Registered", "SEC registered adviser"],
              ["ERA", "Exempt reporting adviser"],
              ["None", "No ADV on record"],
            ] as const
          ).map(([k, label]) => (
            <Option key={k} on={filters.adv.includes(k)} label={label} count={facets.adv.get(k) ?? 0} onClick={() => set({ adv: toggle(filters.adv, k) })} />
          ))}
        </div>
      </Section>

      <Section title="Service providers" defaultOpen={filters.providers.length > 0} count={filters.providers.length}>
        <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
          Managers whose Form ADV names this auditor, administrator, custodian, prime broker or placement agent.
        </p>
        <ProviderPicker
          dir={dir}
          onAdd={(key, role) => {
            if (!filters.providers.some((p) => p.key === key && p.role === role)) {
              set({ providers: [...filters.providers, { key, role }] });
            }
          }}
        />
      </Section>

      <Section title="Data on file" defaultOpen={filters.hasOperators || filters.hasPortcos || filters.hasPlans || filters.includeInactive}>
        <div className="space-y-0.5">
          <Option on={filters.hasContacts} label="Has key contacts" onClick={() => set({ hasContacts: !filters.hasContacts })} />
          <Option on={filters.connectable} label="Direct email on file" onClick={() => set({ connectable: !filters.connectable })} />
          <Option on={filters.hasWebsite} label="Has website" onClick={() => set({ hasWebsite: !filters.hasWebsite })} />
          <Option on={filters.discloses} label="Discloses commitments (LPs)" onClick={() => set({ discloses: !filters.discloses })} />
          <Option on={filters.hasPlans} label="Has a plan for the next 12 months" onClick={() => set({ hasPlans: !filters.hasPlans })} />
          <Option on={filters.portfolio} label="In portfolio" onClick={() => set({ portfolio: !filters.portfolio })} />
          <Option on={filters.hasOperators} label="Operating partners on file" onClick={() => set({ hasOperators: !filters.hasOperators })} />
          <Option on={filters.hasPortcos} label="Portfolio companies on file" onClick={() => set({ hasPortcos: !filters.hasPortcos })} />
          <Option
            on={filters.includeInactive}
            label="Include investors no longer investing in alternatives"
            title="Investors whose own statements say they have stopped investing in alternatives are hidden unless this is on"
            onClick={() => set({ includeInactive: !filters.includeInactive })}
          />
        </div>
      </Section>
    </div>
  );
}
