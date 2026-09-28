"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Landmark } from "lucide-react";
import { matches, type DirectoryFilters } from "@/lib/directory/filters";
import { filers, leagueTable, rolesForTypes } from "@/lib/directory/market";
import { PROVIDER_ROLES, ROLE_PLURAL, type ProviderRole } from "@/lib/directory/providers";
import { cn } from "@/lib/utils";
import type { Directory } from "./use-directory";

/** The managers a provider question is about: the "serves" types and the
 *  place filters, applied to GPs rather than to the providers themselves. */
export function managerScope(dir: Directory, filters: DirectoryFilters) {
  const scope: DirectoryFilters = {
    ...filters,
    books: [],
    types: filters.clientTypes,
    clientTypes: [],
    providers: [],
    aumMin: null,
    aumMax: null,
    empMin: null,
    empMax: null,
    foundedMin: null,
    foundedMax: null,
    adv: [],
    hasContacts: false,
    connectable: false,
    hasWebsite: false,
    discloses: false,
    portfolio: false,
    keywords: "",
    like: [],
  };
  return filers(dir.records).filter((r) => matches(r, scope, dir.ctx));
}

/**
 * "Fund administrators serving venture firms": the directory holds a handful
 * of administrators as firms, but Form ADV names every one those managers
 * use. This shows that ranking beside the results.
 */
export function ProviderLeaders({ dir, filters }: { dir: Directory; filters: DirectoryFilters }) {
  const fromTypes = rolesForTypes(filters.types);
  const roles: ProviderRole[] = fromTypes.length ? fromTypes : filters.clientTypes.length ? PROVIDER_ROLES : [];
  const [picked, setPicked] = useState<ProviderRole | null>(null);
  const role = picked && roles.includes(picked) ? picked : roles[0];
  if (!role) return null;

  const managers = managerScope(dir, filters);
  const league = leagueTable(managers, dir.brands, role, 6);
  if (!league.rows.length) return null;
  const top = league.rows[0].clients;
  const scopeLabel = filters.clientTypes.length ? filters.clientTypes.join(" / ").toLowerCase() : "all";
  const params = new URLSearchParams({ role });
  if (filters.clientTypes.length) params.set("type", filters.clientTypes.join(","));

  return (
    <div className="sheen rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
        <Landmark className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">
          {ROLE_PLURAL[role]} named on Form ADV by {league.covered.toLocaleString("en-US")} {scopeLabel} managers
        </h3>
        {roles.length > 1 ? (
          <div className="ml-auto flex flex-wrap gap-1">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPicked(r)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs",
                  r === role ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ROLE_PLURAL[r]}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <ol className="divide-y">
        {league.rows.map((row, i) => (
          <li key={row.brand.key} className="flex items-center gap-3 px-5 py-2 text-sm">
            <span className="w-4 tabular text-xs text-muted-foreground">{i + 1}</span>
            <Link href={`/database/providers/${row.brand.key}`} className="w-44 truncate font-medium hover:text-primary">
              {row.brand.name}
            </Link>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
              <span className="block h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${(row.clients / top) * 100}%` }} />
            </span>
            <span className="w-24 text-right tabular text-xs text-muted-foreground">
              {row.clients} · {Math.round(row.share * 100)}%
            </span>
          </li>
        ))}
      </ol>
      <div className="border-t px-5 py-2.5">
        <Link href={`/database/market?${params}`} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          Full league table <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
