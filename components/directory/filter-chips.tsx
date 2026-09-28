"use client";

import { X } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import type { DirectoryFilters } from "@/lib/directory/filters";
import { rangeLabel } from "@/lib/directory/format";
import { ZONE_LABEL } from "@/lib/directory/geo";
import { ROLE_LABEL } from "@/lib/directory/providers";
import type { Directory } from "./use-directory";

export type Chip = { key: string; group: string; label: string; remove: (f: DirectoryFilters) => DirectoryFilters };

const without = <T,>(list: T[], v: T) => list.filter((x) => x !== v);

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
  for (const a of f.adv) {
    const label = a === "ERA" ? "Exempt reporting" : a === "Registered" ? "SEC registered" : "No ADV";
    chips.push({ key: `adv:${a}`, group: "Form ADV", label, remove: (x) => ({ ...x, adv: without(x.adv, a) }) });
  }
  const flags: [keyof DirectoryFilters, string][] = [
    ["hasContacts", "Has key contacts"],
    ["connectable", "Email on file"],
    ["hasWebsite", "Has website"],
    ["discloses", "Discloses commitments"],
    ["portfolio", "In portfolio"],
  ];
  for (const [k, label] of flags) {
    if (f[k]) chips.push({ key: k, group: "Has", label, remove: (x) => ({ ...x, [k]: false }) });
  }
  if (f.keywords.trim()) {
    chips.push({ key: "kw", group: "Keywords", label: f.keywords.trim(), remove: (x) => ({ ...x, keywords: "" }) });
  }
  return chips;
}

export function FilterChips({
  chips,
  onChange,
  filters,
}: {
  chips: Chip[];
  filters: DirectoryFilters;
  onChange: (next: DirectoryFilters) => void;
}) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border bg-card py-1 pl-2.5 pr-1 text-[12.5px] shadow-xs"
        >
          <span className="text-muted-foreground">{c.group}</span>
          <span className="truncate font-medium">{c.label}</span>
          <button
            type="button"
            onClick={() => onChange(c.remove(filters))}
            className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Remove ${c.group} ${c.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
