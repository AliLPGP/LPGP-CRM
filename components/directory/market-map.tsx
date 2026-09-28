"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowUpRight, Building2 } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { AUM_PRESETS } from "@/lib/directory/format";
import { ZONES, type Zone } from "@/lib/directory/geo";
import { filers, leagueTable } from "@/lib/directory/market";
import { PROVIDER_ROLES, ROLE_PLURAL, type ProviderRole } from "@/lib/directory/providers";
import { unpackIndex, type DirectoryBrand, type DirectoryRecord, type PackedIndex } from "@/lib/directory/records";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import { cn, formatUsd } from "@/lib/utils";
import type { Category } from "@/lib/types";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-3 py-1 text-[13px] transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function list(v: string | null): string[] {
  return v ? v.split(",").filter(Boolean) : [];
}

/**
 * Form ADV market structure. The URL holds the view (role, manager types,
 * region, size, tab) so a league table can be shared as a link.
 */
export function MarketMap({ packed }: { packed: PackedIndex }) {
  const index = useMemo(() => unpackIndex(packed), [packed]);
  const params = useSearchParams();
  const pathname = usePathname();
  const tabParam = params.get("tab");
  // The poster first; a shared league-table link (it carries a role) opens there.
  const tab: "map" | "providers" | "landscape" =
    tabParam === "landscape" ? "landscape" : tabParam === "league" || (!tabParam && params.get("role")) ? "providers" : "map";
  const roleParam = params.get("role") as ProviderRole | null;
  const role: ProviderRole = roleParam && PROVIDER_ROLES.includes(roleParam) ? roleParam : "administrator";
  const types = list(params.get("type"));
  const zones = list(params.get("zone")) as Zone[];
  const aumKey = params.get("aum") ?? "";
  const book = (params.get("book") as Category | null) ?? "GP";
  const [showAll, setShowAll] = useState(false);

  function set(patch: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    const qs = sp.toString();
    window.history.replaceState(null, "", `${pathname}${qs ? `?${qs}` : ""}`);
  }

  const managers = useMemo(() => filers(index.records), [index]);
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of managers) if (r.subType) m.set(r.subType, (m.get(r.subType) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [managers]);

  const preset = AUM_PRESETS.find((p) => p.label === aumKey) ?? null;
  const scope = useMemo(
    () =>
      managers.filter(
        (r) =>
          (!types.length || (r.subType && types.includes(r.subType))) &&
          (!zones.length || (r.zone && zones.includes(r.zone))) &&
          (!preset ||
            (r.aum != null && (preset.min == null || r.aum >= preset.min) && (preset.max == null || r.aum <= preset.max))),
      ),
    [managers, types, zones, preset],
  );
  const league = useMemo(() => leagueTable(scope, index.brands, role, 200), [scope, index.brands, role]);
  const top3 = league.rows.slice(0, 3).reduce((a, r) => a + r.share, 0);
  const byId = useMemo(() => new Map(index.records.map((r) => [r.id, r])), [index]);
  const shown = showAll ? league.rows : league.rows.slice(0, 25);
  const max = league.rows[0]?.clients ?? 1;

  return (
    <div className="space-y-5">
      <div className="inline-flex rounded-lg border bg-card p-1">
        {(
          [
            ["map", "Provider map"],
            ["providers", "League tables"],
            ["landscape", "Manager landscape"],
          ] as const
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => set({ tab: t === "map" ? null : t === "providers" ? "league" : t })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "map" ? (
        <ProviderPoster
          managers={managers}
          brands={index.brands}
          domainOf={(companyId) => (companyId ? (byId.get(companyId)?.domain ?? null) : null)}
          onRole={(r) => set({ tab: "league", role: r })}
        />
      ) : tab === "providers" ? (
        <>
          <div className="sheen space-y-4 rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1 w-24">Role</span>
              {PROVIDER_ROLES.map((r) => (
                <Pill key={r} on={role === r} onClick={() => set({ role: r })}>
                  {ROLE_PLURAL[r]}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1 w-24">Managers</span>
              <Pill on={!types.length} onClick={() => set({ type: null })}>
                All types
              </Pill>
              {typeCounts.slice(0, 9).map(([t, n]) => (
                <Pill
                  key={t}
                  on={types.includes(t)}
                  onClick={() => set({ type: (types.includes(t) ? types.filter((x) => x !== t) : [...types, t]).join(",") || null })}
                >
                  {t} <span className="tabular opacity-70">{n}</span>
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1 w-24">Region</span>
              <Pill on={!zones.length} onClick={() => set({ zone: null })}>
                Anywhere
              </Pill>
              {ZONES.map((z) => (
                <Pill
                  key={z}
                  on={zones.includes(z)}
                  onClick={() => set({ zone: (zones.includes(z) ? zones.filter((x) => x !== z) : [...zones, z]).join(",") || null })}
                >
                  {z}
                </Pill>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="eyebrow mr-1 w-24">Size</span>
              <Pill on={!preset} onClick={() => set({ aum: null })}>
                Any
              </Pill>
              {AUM_PRESETS.map((p) => (
                <Pill key={p.label} on={preset?.label === p.label} onClick={() => set({ aum: preset?.label === p.label ? null : p.label })}>
                  {p.label}
                </Pill>
              ))}
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
            {[
              { label: "Managers in scope", value: scope.length.toLocaleString("en-US"), sub: "filing Form ADV provider links" },
              { label: `Naming ${ROLE_PLURAL[role].toLowerCase()}`, value: league.covered.toLocaleString("en-US"), sub: `${league.rows.length} distinct providers` },
              { label: "Top three hold", value: `${Math.round(top3 * 100)}%`, sub: "of those managers (a manager can use several)" },
            ].map((s) => (
              <div key={s.label} className="bg-card p-5">
                <p className="eyebrow">{s.label}</p>
                <p className="figure mt-2 text-3xl">{s.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="sheen overflow-hidden rounded-2xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 px-5 py-2.5 text-left font-medium">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">{ROLE_PLURAL[role].slice(0, -1)}</th>
                    <th className="w-[34%] px-3 py-2.5 text-left font-medium">Managers</th>
                    <th className="hidden px-5 py-2.5 text-left font-medium lg:table-cell">Largest clients</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row, i) => (
                    <tr key={row.brand.key} className="border-t hover:bg-muted/30">
                      <td className="px-5 py-2.5 tabular text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <CompanyLogo
                            name={row.brand.name}
                            domain={brandDomain(row.brand.key, row.brand.companyId ? (byId.get(row.brand.companyId)?.domain ?? null) : null)}
                            size={26}
                          />
                          <Link href={`/database/providers/${row.brand.key}`} className="font-medium hover:text-primary">
                            {row.brand.name}
                          </Link>
                          {row.brand.companyId ? (
                            <Link
                              href={`/companies/${row.brand.companyId}`}
                              className="rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                              title="This provider has a profile in the directory"
                            >
                              <Building2 className="mr-0.5 inline h-2.5 w-2.5" /> Profile
                            </Link>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--chart-track)]">
                            <span className="block h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${(row.clients / max) * 100}%` }} />
                          </span>
                          <span className="w-20 text-right tabular text-xs">
                            {row.clients} · {Math.round(row.share * 100)}%
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-5 py-2.5 text-xs text-muted-foreground lg:table-cell">
                        {row.topClients.map((c, j) => (
                          <span key={c.id}>
                            <Link href={`/companies/${c.id}`} className="hover:text-foreground">
                              {c.name}
                            </Link>
                            {j < row.topClients.length - 1 ? ", " : ""}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                  {!shown.length ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-muted-foreground">
                        No manager in this scope names a {ROLE_PLURAL[role].toLowerCase().slice(0, -1)} on Form ADV.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {league.rows.length > 25 ? (
              <div className="border-t px-5 py-2.5 text-xs">
                <button type="button" onClick={() => setShowAll(!showAll)} className="font-medium text-muted-foreground hover:text-foreground">
                  {showAll ? "Top 25 only" : `Show all ${league.rows.length}`}
                </button>
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Counts distinct managers per provider brand from Form ADV Schedule D (March–April 2026 filings), with every legal
            entity a brand files under collapsed into one. A manager that names two custodians counts for both.
          </p>
        </>
      ) : (
        <Landscape records={index.records} book={book} onBook={(b) => set({ book: b === "GP" ? null : b })} />
      )}
    </div>
  );
}

function Landscape({
  records,
  book,
  onBook,
}: {
  records: DirectoryRecord[];
  book: Category;
  onBook: (b: Category) => void;
}) {
  const segments = useMemo(() => {
    const byType = new Map<string, DirectoryRecord[]>();
    for (const r of records) {
      if (r.category !== book || !r.subType) continue;
      byType.set(r.subType, [...(byType.get(r.subType) ?? []), r]);
    }
    return [...byType.entries()]
      .map(([type, list]) => ({
        type,
        count: list.length,
        top: [...list]
          .sort((a, b) => (b.aum ?? -1) - (a.aum ?? -1) || (b.domain ? 1 : 0) - (a.domain ? 1 : 0) || a.name.localeCompare(b.name))
          .slice(0, 12),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [records, book]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(["GP", "LP", "SP"] as const).map((b) => (
          <Pill key={b} on={book === b} onClick={() => onBook(b)}>
            {CATEGORIES[b].name}
          </Pill>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {segments.map((s) => (
          <div key={s.type} className="sheen flex flex-col rounded-2xl border bg-card">
            <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3">
              <h3 className="font-semibold">{s.type}</h3>
              <span className="tabular text-xs text-muted-foreground">{s.count}</span>
            </div>
            <ul className="grid flex-1 grid-cols-3 gap-px bg-border">
              {s.top.map((r) => (
                <li key={r.id} className="bg-card">
                  <Link
                    href={`/companies/${r.id}`}
                    className="flex h-full flex-col items-center gap-1.5 px-2 py-3 text-center hover:bg-muted/40"
                    title={r.aum != null ? `${r.name} · ${formatUsd(r.aum)}` : r.name}
                  >
                    <CompanyLogo name={r.name} domain={r.domain} size={36} />
                    <span className="line-clamp-2 text-[11.5px] leading-tight">{r.name}</span>
                    {r.aum != null ? <span className="figure text-[10.5px] text-muted-foreground">{formatUsd(r.aum)}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/database?book=${book}&type=${encodeURIComponent(s.type)}`}
              className="flex items-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              All {s.count} in Discover <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The market on one page: for every role, the providers most managers name,
 * as logo tiles in rank order — the view a sponsorship pitch starts from.
 */
function ProviderPoster({
  managers,
  brands,
  domainOf,
  onRole,
}: {
  managers: DirectoryRecord[];
  brands: DirectoryBrand[];
  domainOf: (companyId: string | null) => string | null;
  onRole: (role: ProviderRole) => void;
}) {
  const leagues = useMemo(
    () => PROVIDER_ROLES.map((role) => leagueTable(managers, brands, role, 12)),
    [managers, brands],
  );
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {leagues.map((l) => {
        const max = l.rows[0]?.clients ?? 1;
        return (
          <section key={l.role} className="sheen flex flex-col overflow-hidden rounded-2xl border bg-card">
            <header className="border-b px-4 py-3">
              <p className="eyebrow">{l.covered.toLocaleString("en-US")} managers</p>
              <h3 className="display mt-0.5 text-[15px]">{ROLE_PLURAL[l.role]}</h3>
            </header>
            <ol className="grid flex-1 grid-cols-2 gap-px bg-border">
              {l.rows.map((row, i) => (
                <li key={row.brand.key} className="bg-card">
                  <Link
                    href={`/database/providers/${row.brand.key}`}
                    className="group relative flex h-full flex-col items-center gap-1.5 px-2 pb-2.5 pt-3 text-center hover:bg-muted/40"
                    title={`${row.brand.name}: ${row.clients} managers (${Math.round(row.share * 100)}%)`}
                  >
                    <span className="figure absolute left-2 top-1.5 text-[10px] text-muted-foreground">{i + 1}</span>
                    <CompanyLogo name={row.brand.name} domain={brandDomain(row.brand.key, domainOf(row.brand.companyId))} size={38} />
                    <span className="line-clamp-1 text-[12px] font-medium">{row.brand.name}</span>
                    <span className="flex w-full items-center gap-1.5 px-1">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bar-track">
                        <span className="block h-full rounded-full bar-fill" style={{ width: `${(row.clients / max) * 100}%` }} />
                      </span>
                      <span className="figure text-[10.5px] text-muted-foreground">{row.clients}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => onRole(l.role)}
              className="flex items-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Full league table <ArrowUpRight className="h-3 w-3" />
            </button>
          </section>
        );
      })}
    </div>
  );
}
