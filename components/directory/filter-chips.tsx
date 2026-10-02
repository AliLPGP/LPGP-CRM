"use client";

import { X } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { ASSET_CLASS_BY_KEY } from "@/lib/directory/asset-classes";
import type { DirectoryFilters } from "@/lib/directory/filters";
import { rangeLabel } from "@/lib/directory/format";
import { ZONE_LABEL } from "@/lib/directory/geo";
import { ROLE_LABEL } from "@/lib/directory/providers";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import {
  INDUSTRY_BY_CODE,
  INVESTOR_TYPE_BY_CODE,
  MANAGER_TYPE_BY_CODE,
  PROVIDER_TYPE_BY_CODE,
  REGION_BY_CODE,
} from "@/lib/directory/taxonomy";
import type { Directory } from "./use-directory";

export type Chip = { key: string; group: string; label: string; remove: (f: DirectoryFilters) => DirectoryFilters };

const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v);

/** A type code's name whichever book it belongs to. */
function typeCodeName(code: string): string {
  return INVESTOR_TYPE_BY_CODE[code]?.name ?? MANAGER_TYPE_BY_CODE[code]?.name ?? PROVIDER_TYPE_BY_CODE[code]?.name ?? code;
}

const pct = (n: number) => `${n}%`;

/** The filters as removable chips, in reading order. */
export function describeFilters(f: DirectoryFilters, dir: Directory): Chip[] {
  const chips: Chip[] = [];
  for (const id of f.like) {
    const name = dir.byId.get(id)?.name ?? "a firm";
    chips.push({ key: `like:${id}`, group: "Like", label: name, remove: (x) => ({ ...x, like: without(x.like, id) }) });
  }
  for (const b of f.books) {
    chips.push({ key: `book:${b}`, group: "Book", label: CATEGORIES[b].name, remove: (x) => ({ ...x, books: without(x.books, b) }) });
  }
  for (const t of f.types) {
    chips.push({ key: `type:${t}`, group: "Type", label: t, remove: (x) => ({ ...x, types: without(x.types, t) }) });
  }
  for (const t of f.typeCodes) {
    chips.push({ key: `itype:${t}`, group: "Investor type", label: typeCodeName(t), remove: (x) => ({ ...x, typeCodes: without(x.typeCodes, t) }) });
  }
  for (const c of f.classes) {
    chips.push({
      key: `class:${c}`,
      group: "Asset class",
      label: ASSET_CLASS_BY_KEY[c]?.name ?? c,
      remove: (x) => ({ ...x, classes: without(x.classes, c) }),
    });
  }
  for (const s of f.strategies) {
    chips.push({
      key: `strategy:${s}`,
      group: STRATEGY_BY_KEY[s]?.axis === "sector" ? "Sector" : "Strategy",
      label: STRATEGY_BY_KEY[s]?.name ?? s,
      remove: (x) => ({ ...x, strategies: without(x.strategies, s) }),
    });
  }
  for (const s of f.sectors) {
    chips.push({
      key: `sector:${s}`,
      group: "Industry",
      label: INDUSTRY_BY_CODE[s]?.name ?? s,
      remove: (x) => ({ ...x, sectors: without(x.sectors, s) }),
    });
  }
  for (const t of f.clientTypes) {
    chips.push({ key: `serves:${t}`, group: "Serves", label: t, remove: (x) => ({ ...x, clientTypes: without(x.clientTypes, t) }) });
  }
  for (const p of f.providers) {
    const name = dir.brandByKey.get(p.key)?.name ?? p.key;
    chips.push({
      key: `uses:${p.key}:${p.role ?? ""}`,
      group: p.role ? ROLE_LABEL[p.role] : "Uses",
      label: name,
      remove: (x) => ({ ...x, providers: x.providers.filter((q) => !(q.key === p.key && q.role === p.role)) }),
    });
  }
  for (const z of f.zones) {
    chips.push({ key: `zone:${z}`, group: "Region", label: ZONE_LABEL[z], remove: (x) => ({ ...x, zones: without(x.zones, z) }) });
  }
  for (const r of f.regions) {
    chips.push({ key: `region:${r}`, group: "Region", label: r, remove: (x) => ({ ...x, regions: without(x.regions, r) }) });
  }
  for (const r of f.prefRegions) {
    chips.push({
      key: `pref:${r}`,
      group: "Geographic preference",
      label: REGION_BY_CODE[r]?.name ?? r,
      remove: (x) => ({ ...x, prefRegions: without(x.prefRegions, r) }),
    });
  }
  if (f.countries.length > 3) {
    chips.push({
      key: "countries",
      group: "Country",
      label: `${f.countries.slice(0, 2).join(", ")} +${f.countries.length - 2}`,
      remove: (x) => ({ ...x, countries: [] }),
    });
  } else {
    for (const c of f.countries) {
      chips.push({ key: `country:${c}`, group: "Country", label: c, remove: (x) => ({ ...x, countries: without(x.countries, c) }) });
    }
  }
  for (const s of f.states) {
    chips.push({ key: `state:${s}`, group: "State", label: s, remove: (x) => ({ ...x, states: without(x.states, s) }) });
  }
  if (f.cities.length > 3) {
    chips.push({
      key: "cities",
      group: "City",
      label: `${f.cities.slice(0, 2).join(", ")} +${f.cities.length - 2}`,
      remove: (x) => ({ ...x, cities: [] }),
    });
  } else {
    for (const c of f.cities) {
      chips.push({ key: `city:${c}`, group: "City", label: c, remove: (x) => ({ ...x, cities: without(x.cities, c) }) });
    }
  }
  if (f.aumMin != null || f.aumMax != null) {
    chips.push({ key: "aum", group: "Size", label: rangeLabel(f.aumMin, f.aumMax), remove: (x) => ({ ...x, aumMin: null, aumMax: null }) });
  }
  if (f.empMin != null || f.empMax != null) {
    chips.push({
      key: "emp",
      group: "Headcount",
      label: rangeLabel(f.empMin, f.empMax, (n) => n.toLocaleString("en-US")),
      remove: (x) => ({ ...x, empMin: null, empMax: null }),
    });
  }
  if (f.foundedMin != null || f.foundedMax != null) {
    const label =
      f.foundedMin != null && f.foundedMin === f.foundedMax
        ? `${f.foundedMin}`
        : rangeLabel(f.foundedMin, f.foundedMax, (n) => String(n));
    chips.push({ key: "founded", group: "Founded", label, remove: (x) => ({ ...x, foundedMin: null, foundedMax: null }) });
  }
  if (f.ticketMin != null || f.ticketMax != null) {
    chips.push({
      key: "ticket",
      group: "Ticket",
      label: rangeLabel(f.ticketMin, f.ticketMax),
      remove: (x) => ({ ...x, ticketMin: null, ticketMax: null }),
    });
  }
  if (f.allocClass != null || f.allocMin != null || f.allocMax != null) {
    const cls = f.allocClass ? (ASSET_CLASS_BY_KEY[f.allocClass]?.name ?? f.allocClass) : "Any class";
    const range = f.allocMin != null || f.allocMax != null ? ` ${rangeLabel(f.allocMin, f.allocMax, pct)}` : "";
    chips.push({
      key: "alloc",
      group: "Allocation",
      label: `${cls}${range}`,
      remove: (x) => ({ ...x, allocClass: null, allocMin: null, allocMax: null }),
    });
  }
  if (f.altsMin != null || f.altsMax != null) {
    chips.push({
      key: "alts",
      group: "Allocation",
      label: `Alternatives ${rangeLabel(f.altsMin, f.altsMax, pct)}`,
      remove: (x) => ({ ...x, altsMin: null, altsMax: null }),
    });
  }
  for (const a of f.adv) {
    const label = a === "ERA" ? "Exempt reporting" : a === "Registered" ? "SEC registered" : "No ADV";
    chips.push({ key: `adv:${a}`, group: "Form ADV", label, remove: (x) => ({ ...x, adv: without(x.adv, a) }) });
  }
  const flags: [keyof DirectoryFilters, string][] = [
    ["hasContacts", "Has key contacts"],
    ["connectable", "Email on file"],
    ["hasWebsite", "Has website"],
    ["discloses", "Discloses commitments"],
    ["hasPlans", "Plan for the next 12 months"],
    ["portfolio", "In portfolio"],
    ["hasOperators", "Operating partners"],
    ["hasPortcos", "Portfolio companies"],
  ];
  for (const [k, label] of flags) {
    if (f[k]) chips.push({ key: k, group: "Has", label, remove: (x) => ({ ...x, [k]: false }) });
  }
  if (f.includeInactive) {
    chips.push({ key: "inactive", group: "Showing", label: "Inactive investors", remove: (x) => ({ ...x, includeInactive: false }) });
  }
  if (f.keywords.trim()) {
    chips.push({ key: "kw", group: "Keywords", label: f.keywords.trim(), remove: (x) => ({ ...x, keywords: "" }) });
  }
  return chips;
}

/** The selections across every facet, as removable chips under the bar — the
 *  same chips every desk list wears, with the facet named before the value
 *  because Discover has thirty of them. */
export function FilterChips({
  chips,
  onChange,
  onClearAll,
  filters,
}: {
  chips: Chip[];
  filters: DirectoryFilters;
  onChange: (next: DirectoryFilters) => void;
  onClearAll: () => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-[4px] border bg-card py-0.5 pl-2 pr-1">
          <span className="text-muted-foreground">{c.group}</span>
          <span className="truncate">{c.label}</span>
          <button
            type="button"
            onClick={() => onChange(c.remove(filters))}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label={`Remove ${c.group} ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="px-1 text-muted-foreground hover:text-foreground">
        Clear all
      </button>
    </div>
  );
}
