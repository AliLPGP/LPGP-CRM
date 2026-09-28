"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus, RotateCcw, Search } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { EMPTY_FILTERS, hasStructuredFilters, toggle, type DirectoryFilters } from "@/lib/directory/filters";
import { AUM_PRESETS, EMPLOYEE_PRESETS, parseMoney } from "@/lib/directory/format";
import { ZONES, ZONE_LABEL } from "@/lib/directory/geo";
import { PROVIDER_ROLES, ROLE_LABEL, type ProviderRole } from "@/lib/directory/providers";
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
}: {
  on: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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

      <Section title="Data on file" defaultOpen={false}>
        <div className="space-y-0.5">
          <Option on={filters.hasContacts} label="Has key contacts" onClick={() => set({ hasContacts: !filters.hasContacts })} />
          <Option on={filters.connectable} label="Direct email on file" onClick={() => set({ connectable: !filters.connectable })} />
          <Option on={filters.hasWebsite} label="Has website" onClick={() => set({ hasWebsite: !filters.hasWebsite })} />
          <Option on={filters.discloses} label="Discloses commitments (LPs)" onClick={() => set({ discloses: !filters.discloses })} />
          <Option on={filters.portfolio} label="In portfolio" onClick={() => set({ portfolio: !filters.portfolio })} />
        </div>
      </Section>
    </div>
  );
}
