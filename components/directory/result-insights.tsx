"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { DirectoryFilters } from "@/lib/directory/filters";
import { summarize } from "@/lib/directory/insights";
import { ROLE_PLURAL, type ProviderRole } from "@/lib/directory/providers";
import { cn, formatUsd } from "@/lib/utils";
import type { Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

function MiniBars({
  title,
  items,
  onPick,
}: {
  title: string;
  items: { key: string; count: number }[];
  onPick?: (key: string) => void;
}) {
  const max = items[0]?.count ?? 1;
  return (
    <div className="min-w-0">
      <p className="eyebrow">{title}</p>
      <div className="mt-2 space-y-1">
        {items.slice(0, 4).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onPick?.(t.key)}
            className="group flex w-full items-center gap-2 text-left text-[12px]"
          >
            <span className="min-w-0 flex-1 truncate group-hover:underline">{t.key}</span>
            <span className="h-1 w-14 shrink-0 overflow-hidden rounded-full bar-track">
              <span className="block h-full rounded-full bar-fill" style={{ width: `${Math.round((t.count / max) * 100)}%` }} />
            </span>
            <span className="figure w-8 shrink-0 text-right text-[11px] text-muted-foreground">{t.count}</span>
          </button>
        ))}
        {items.length === 0 ? <p className="text-xs text-muted-foreground">—</p> : null}
      </div>
    </div>
  );
}

/** What a result set adds up to — the "so what" above the table. */
export function ResultInsights({
  dir,
  rows,
  filters,
  onChange,
}: {
  dir: Directory;
  rows: ResultRow[];
  filters: DirectoryFilters;
  onChange: (next: DirectoryFilters) => void;
}) {
  const [open, setOpen] = useState(true);
  const s = useMemo(() => summarize(rows.map((r) => r.record), 3), [rows]);
  if (rows.length < 2) return null;

  const roles: ProviderRole[] = ["auditor", "administrator", "custodian"];

  return (
    <section className="sheen rounded-2xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="figure text-xl">{s.total.toLocaleString("en-US")}</span>
          <span className="text-xs text-muted-foreground">firms</span>
        </span>
        {s.raum.firms ? (
          <span className="flex items-baseline gap-1.5" title="Form ADV regulatory AUM, summed only across firms that report it">
            <span className="figure text-xl">{formatUsd(s.raum.sum)}</span>
            <span className="text-xs text-muted-foreground">regulatory AUM · {s.raum.firms} filers</span>
          </span>
        ) : null}
        {s.people ? (
          <span className="flex items-baseline gap-1.5">
            <span className="figure text-xl">{s.people.toLocaleString("en-US")}</span>
            <span className="text-xs text-muted-foreground">key contacts · {s.connectable} with email</span>
          </span>
        ) : null}
        {s.funds ? (
          <span className="flex items-baseline gap-1.5">
            <span className="figure text-xl">{s.funds.toLocaleString("en-US")}</span>
            <span className="text-xs text-muted-foreground">funds on file</span>
          </span>
        ) : null}
        <ChevronDown className={cn("ml-auto h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="grid gap-5 border-t px-4 py-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniBars
            title="Type"
            items={s.types}
            onPick={(t) => onChange({ ...filters, types: filters.types.includes(t) ? filters.types : [...filters.types, t] })}
          />
          <MiniBars
            title="Country"
            items={s.countries}
            onPick={(c) => onChange({ ...filters, countries: filters.countries.includes(c) ? filters.countries : [...filters.countries, c] })}
          />
          <div className="min-w-0 sm:col-span-2">
            <p className="eyebrow">Most-used providers among these</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {roles.map((role) => (
                <div key={role} className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">{ROLE_PLURAL[role]}</p>
                  <div className="mt-1 space-y-1">
                    {s.leaders[role].map((l) => {
                      const b = dir.brands[l.brand];
                      return (
                        <button
                          key={b.key}
                          type="button"
                          onClick={() =>
                            onChange({
                              ...filters,
                              providers: [...filters.providers.filter((p) => !(p.key === b.key && p.role === role)), { key: b.key, role }],
                            })
                          }
                          className="flex w-full items-center gap-1.5 text-left text-[12px] hover:underline"
                          title={`${l.clients} of ${s.roleFilers[role]} filers`}
                        >
                          <CompanyLogo name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={18} />
                          <span className="min-w-0 flex-1 truncate">{b.name}</span>
                          <span className="figure text-[11px] text-muted-foreground">{l.clients}</span>
                        </button>
                      );
                    })}
                    {s.leaders[role].length === 0 ? <p className="text-xs text-muted-foreground">—</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
