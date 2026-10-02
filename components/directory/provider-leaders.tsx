"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
 * use. This shows that ranking beside the results, on the desk register: a
 * boxed league table with a magnitude bar per brand and a short row of role
 * toggles (five at most, so pills rather than a menu).
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
    <section className="sheen rounded-[4px] border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h3 className="desk-label text-foreground">
          {ROLE_PLURAL[role]} named on Form ADV by {league.covered.toLocaleString("en-US")} {scopeLabel} managers
        </h3>
        {roles.length > 1 ? (
          <div className="ml-auto flex flex-wrap gap-1">
            {roles.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setPicked(r)}
                aria-pressed={r === role}
                className={cn("tag hover:text-foreground", r === role && "border-foreground bg-foreground text-background hover:text-background")}
              >
                {ROLE_PLURAL[r]}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <ol className="divide-y">
        {league.rows.map((row, i) => (
          <li key={row.brand.key} className="flex items-center gap-3 px-3 py-1.5 text-[12.5px]">
            <span className="figure w-4 text-[11px] text-muted-foreground">{i + 1}</span>
            <Link href={`/database/providers/${row.brand.key}`} className="w-44 truncate font-medium hover:underline">
              {row.brand.name}
            </Link>
            <span className="bar-track h-[5px] flex-1 overflow-hidden rounded-[2px]">
              <span className="bar-fill block h-full" style={{ width: `${Math.max(1.5, (row.clients / top) * 100)}%` }} />
            </span>
            <span className="figure w-24 text-right text-[11px] text-muted-foreground">
              {row.clients} · {Math.round(row.share * 100)}%
            </span>
          </li>
        ))}
      </ol>
      <div className="border-t px-3 py-2">
        <Link href={`/database/market?${params}`} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
          Full league table <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </section>
  );
}
