"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Search } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { OWNERSHIP_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { formatCount, formatMoney, type ClubRow } from "@/lib/directory/intelligence-types";
import { cn } from "@/lib/utils";
import { Empty, Src, Tag } from "./ui";

// The clubs league table, sorted and filtered in the browser. Revenue and
// valuation are shown as the source states them — mixed currencies, never
// converted — so a sort by revenue orders within each currency.

export type { ClubRow } from "@/lib/directory/intelligence-types";

type Sort = "revenue" | "valuation" | "followers" | "capacity" | "name";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn("rounded-[3px] border px-2 py-0.5 text-[11.5px] transition-colors", on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground")}
    >
      {children}
    </button>
  );
}

export function ClubTable({ clubs }: { clubs: ClubRow[] }) {
  const [league, setLeague] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [backed, setBacked] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("revenue");

  const leagues = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clubs) if (c.league) m.set(c.league, (m.get(c.league) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clubs]);
  const ownerTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clubs) if (c.ownership_type) m.set(c.ownership_type, (m.get(c.ownership_type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [clubs]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = clubs.filter(
      (c) =>
        (!league || c.league === league) &&
        (!owner || c.ownership_type === owner) &&
        (!backed || c.institutional > 0) &&
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
  }, [clubs, league, owner, backed, q, sort]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Club, city, investor…" className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-2 text-[12.5px] outline-none focus-visible:border-ring" />
        </div>
        <Pill on={backed} onClick={() => setBacked(!backed)}>
          Institutional money on the cap table
        </Pill>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-7 rounded-[4px] border border-input bg-card px-1.5 text-[12px] text-foreground">
            <option value="revenue">Revenue</option>
            <option value="valuation">Valuation</option>
            <option value="followers">Following</option>
            <option value="capacity">Stadium capacity</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-1">
        <Pill on={!league} onClick={() => setLeague(null)}>
          All leagues
        </Pill>
        {leagues.map(([l, n]) => (
          <Pill key={l} on={league === l} onClick={() => setLeague(league === l ? null : l)}>
            {l} <span className="figure opacity-70">{n}</span>
          </Pill>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        <Pill on={!owner} onClick={() => setOwner(null)}>
          Any ownership
        </Pill>
        {ownerTypes.map(([t, n]) => (
          <Pill key={t} on={owner === t} onClick={() => setOwner(owner === t ? null : t)}>
            {OWNERSHIP_TYPE_LABEL[t] ?? t} <span className="figure opacity-70">{n}</span>
          </Pill>
        ))}
      </div>

      <div className="sheen overflow-hidden rounded-[4px] border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2 text-[12px]">
          <span>
            <span className="figure">{rows.length}</span> <span className="text-muted-foreground">clubs</span>
          </span>
          <span className="text-[11px] text-muted-foreground">Figures as each source states them; hover a figure for its season or year.</span>
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
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
                  <tr key={c.id}>
                    <td className="num text-muted-foreground">{i + 1}</td>
                    <td>
                      <Link href={`/database/sports/${c.id}`} className="flex items-center gap-2 font-medium">
                        <CompanyLogo name={c.short_name ?? c.name} domain={c.domain} size={22} />
                        <span className="truncate">{c.short_name ?? c.name}</span>
                      </Link>
                      <div className="pl-[30px] text-[10.5px] text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ")}</div>
                    </td>
                    <td className="whitespace-nowrap text-muted-foreground">{c.league ?? "—"}</td>
                    <td>
                      <Tag strong={c.ownership_type === "private_equity" || c.ownership_type === "sovereign_state"}>{OWNERSHIP_TYPE_LABEL[c.ownership_type ?? "unknown"] ?? c.ownership_type}</Tag>
                    </td>
                    <td className="max-w-[220px]">
                      {c.topInvestor ? (
                        <span className="truncate">
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
          <Empty>No clubs match.</Empty>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Revenue is the latest season a source states (club accounts or the Deloitte Football Money League); a valuation is from the
        publisher shown on hover, for the year shown (Forbes and Sportico where available); following is the total across platforms where a source gives one. <Src url={null} name="Every figure links to its page on the club's profile." />
      </p>
    </div>
  );
}
