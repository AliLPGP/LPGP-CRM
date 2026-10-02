"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Search, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { OWNERSHIP_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { formatCount, formatMoney, type ClubRow } from "@/lib/directory/intelligence-types";
import { FacetChips, FacetMenu } from "./facet-menu";
import { Empty, Src, Tag } from "./ui";

// The clubs league table, sorted and filtered in the browser: the desk's
// toolbar (search, a dropdown per facet, the sort, the count), chips, then
// the table. Revenue and valuation are shown as the source states them —
// mixed currencies, never converted — so a sort by revenue orders within
// each currency.

export type { ClubRow } from "@/lib/directory/intelligence-types";

type Sort = "revenue" | "valuation" | "followers" | "capacity" | "name";

function counts(rows: ClubRow[], key: (c: ClubRow) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const c of rows) {
    const k = key(c);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function ClubTable({ clubs }: { clubs: ClubRow[] }) {
  const [leagues_, setLeagues] = useState<string[]>([]);
  const [owners_, setOwners] = useState<string[]>([]);
  const [backed_, setBacked] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("revenue");

  // Each facet counts under every other filter but its own. A few hundred
  // clubs: counted on every render, no memo needed.
  const passes = (c: ClubRow, omit?: "league" | "owner" | "backed") =>
    (omit === "league" || !leagues_.length || leagues_.includes(c.league ?? "")) &&
    (omit === "owner" || !owners_.length || owners_.includes(c.ownership_type ?? "")) &&
    (omit === "backed" || !backed_.length || c.institutional > 0);
  const leagues = counts(clubs.filter((c) => passes(c, "league")), (c) => c.league);
  const ownerTypes = counts(clubs.filter((c) => passes(c, "owner")), (c) => c.ownership_type);
  const backedCount = clubs.filter((c) => passes(c, "backed") && c.institutional > 0).length;

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = clubs.filter(
      (c) =>
        (!leagues_.length || leagues_.includes(c.league ?? "")) &&
        (!owners_.length || owners_.includes(c.ownership_type ?? "")) &&
        (!backed_.length || c.institutional > 0) &&
        (!needle || `${c.name} ${c.short_name ?? ""} ${c.city ?? ""} ${c.topInvestor?.name ?? ""} ${c.ownership_summary ?? ""}`.toLowerCase().includes(needle)),
    );
    const cur = (c: string | null) => c ?? "";
    const key = (c: ClubRow): [string, number] =>
      sort === "revenue"
        ? [cur(c.revenue_currency), c.revenue ?? -1]
        : sort === "valuation"
          ? [cur(c.valuation_currency), c.valuation ?? -1]
          : sort === "followers"
            ? ["", c.social_followers ?? -1]
            : sort === "capacity"
              ? ["", c.stadium_capacity ?? -1]
              : ["", 0];
    return list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const [ca, va] = key(a);
      const [cb, vb] = key(b);
      // Within a currency, largest first; currencies grouped USD, EUR, GBP, then the rest.
      const order = ["USD", "EUR", "GBP"];
      const ra = va < 0 ? 99 : order.indexOf(ca) < 0 ? 50 : order.indexOf(ca);
      const rb = vb < 0 ? 99 : order.indexOf(cb) < 0 ? 50 : order.indexOf(cb);
      if (sort === "followers" || sort === "capacity") return vb - va || a.name.localeCompare(b.name);
      return ra - rb || vb - va || a.name.localeCompare(b.name);
    });
  }, [clubs, leagues_, owners_, backed_, q, sort]);

  const filtered = Boolean(leagues_.length || owners_.length || backed_.length || q);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Club, city, investor…" aria-label="Search clubs" className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-7 text-[12.5px] outline-none focus-visible:border-ring" />
          {q ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <FacetMenu label="League" groups={[{ label: "", options: leagues.map(([k, n]) => ({ key: k, label: k, count: n })) }]} selected={leagues_} onChange={setLeagues} width={260} />
        <FacetMenu label="Ownership" groups={[{ label: "", options: ownerTypes.map(([k, n]) => ({ key: k, label: OWNERSHIP_TYPE_LABEL[k] ?? k, count: n })) }]} selected={owners_} onChange={setOwners} searchable={false} width={220} />
        <FacetMenu label="Cap table" groups={[{ label: "", options: [{ key: "1", label: "Institutional money on the cap table", count: backedCount }] }]} selected={backed_} onChange={setBacked} searchable={false} width={260} />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent" title="Sort">
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent text-[12.5px] text-foreground outline-none" aria-label="Sort by">
            <option value="revenue">Revenue</option>
            <option value="valuation">Valuation</option>
            <option value="followers">Following</option>
            <option value="capacity">Stadium capacity</option>
            <option value="name">Name</option>
          </select>
        </label>
        <span className="px-1 text-[12px]">
          <span className="figure">{rows.length.toLocaleString("en-US")}</span> <span className="text-muted-foreground">clubs</span>
        </span>
      </div>
      <FacetChips
        chips={[
          ...leagues_.map((k) => ({ key: `l:${k}`, label: k, remove: () => setLeagues(leagues_.filter((x) => x !== k)) })),
          ...owners_.map((k) => ({ key: `o:${k}`, label: OWNERSHIP_TYPE_LABEL[k] ?? k, remove: () => setOwners(owners_.filter((x) => x !== k)) })),
          ...backed_.map((k) => ({ key: `b:${k}`, label: "Institutional money on the cap table", remove: () => setBacked([]) })),
        ]}
        onClearAll={() => {
          setLeagues([]);
          setOwners([]);
          setBacked([]);
        }}
      />

      <div className="sheen overflow-hidden rounded-[4px] border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2 text-[12px]">
          <span className="desk-label text-foreground">Clubs</span>
          <span className="text-[11px] text-muted-foreground">Figures as each source states them; hover a figure for its season or year.</span>
        </div>
        {rows.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th>Club</th>
                  <th>League</th>
                  <th>Ownership</th>
                  <th>Institutional investor</th>
                  <th className="num">Revenue</th>
                  <th className="num">Valuation</th>
                  <th className="num">Following</th>
                  <th className="num">Stadium</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.id} className="linked">
                    <td className="num text-muted-foreground">{i + 1}</td>
                    <td className="min-w-[180px] max-w-[260px]">
                      <span className="flex items-center gap-2 font-medium">
                        <CompanyLogo name={c.short_name ?? c.name} domain={c.domain} size={22} />
                        <Link href={`/database/sports/${c.id}`} className="cover truncate" title={c.name}>
                          {c.short_name ?? c.name}
                        </Link>
                      </span>
                      <div className="truncate pl-[30px] text-[10.5px] text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ")}</div>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">{c.league ?? "—"}</td>
                    <td>
                      <Tag strong={c.ownership_type === "private_equity" || c.ownership_type === "sovereign_state"}>{OWNERSHIP_TYPE_LABEL[c.ownership_type ?? "unknown"] ?? c.ownership_type}</Tag>
                    </td>
                    <td className="max-w-[220px]">
                      {c.topInvestor ? (
                        <span className="block truncate" title={c.topInvestor.name}>
                          {c.topInvestor.companyId ? (
                            <Link href={`/companies/${c.topInvestor.companyId}`} className="font-medium">
                              {c.topInvestor.name}
                            </Link>
                          ) : c.topInvestor.investorId ? (
                            <Link href={`/database/sports/investors/${c.topInvestor.investorId}`} className="font-medium">
                              {c.topInvestor.name}
                            </Link>
                          ) : (
                            c.topInvestor.name
                          )}
                          {c.topInvestor.stake != null ? <span className="figure ml-1 text-[11px] text-muted-foreground">{c.topInvestor.stake}%</span> : null}
                          {c.institutional > 1 ? <span className="ml-1 text-[10.5px] text-muted-foreground">+{c.institutional - 1}</span> : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="num" title={c.revenue_season ? `${c.revenue_season} · ${c.revenue_source_name ?? ""}` : undefined}>
                      {formatMoney(c.revenue, c.revenue_currency)}
                    </td>
                    <td className="num" title={c.valuation_year ? `${c.valuation_year} · ${c.valuation_source_name ?? ""}` : undefined}>
                      {formatMoney(c.valuation, c.valuation_currency)}
                    </td>
                    <td className="num" title={c.social_as_of ?? undefined}>
                      {formatCount(c.social_followers)}
                    </td>
                    <td className="num" title={c.stadium ?? undefined}>
                      {c.stadium_capacity != null ? c.stadium_capacity.toLocaleString("en-US") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            No club matches this cut.{" "}
            {filtered ? (
              <button
                type="button"
                onClick={() => {
                  setLeagues([]);
                  setOwners([]);
                  setBacked([]);
                  setQ("");
                }}
                className="underline underline-offset-2 hover:text-foreground"
              >
                Clear the filters
              </button>
            ) : null}{" "}
            to see every club on file.
          </Empty>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Revenue is the latest season a source states (club accounts or the Deloitte Football Money League); a valuation is from the
        publisher shown on hover, for the year shown (Forbes and Sportico where available); following is the total across platforms where a source gives one. <Src url={null} name="Every figure links to its page on the club's profile." />
      </p>
    </div>
  );
}
