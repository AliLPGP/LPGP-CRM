"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Search } from "lucide-react";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney, SPORT_LABEL, type Deal } from "@/lib/directory/intelligence-types";
import { cn } from "@/lib/utils";
import { dateLabel } from "./tables";
import { Empty, Src, Tag } from "./ui";

// The Deals page: every sourced transaction, filtered and sorted in the
// browser. Money is shown in the currency the source states and never
// summed across currencies.

type Sort = "date" | "amount" | "valuation";

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-[3px] border px-2 py-0.5 text-[11.5px] transition-colors",
        on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function DealLedger({ deals, initialClass }: { deals: Deal[]; initialClass?: AssetClassKey | null }) {
  const [cls, setCls] = useState<AssetClassKey | null>(initialClass ?? null);
  const [kind, setKind] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("date");
  const [shown, setShown] = useState(100);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of deals) if (!cls || d.asset_class === cls) m.set(d.kind, (m.get(d.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [deals, cls]);
  const years = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of deals) {
      const y = d.date ? Number(d.date.slice(0, 4)) : d.date_text ? Number((d.date_text.match(/\b(19|20)\d{2}\b/) ?? [])[0]) : NaN;
      if (Number.isFinite(y)) m.set(y, (m.get(y) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]).slice(0, 8);
  }, [deals]);

  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const list = deals.filter((d) => {
      if (cls && d.asset_class !== cls) return false;
      if (kind && d.kind !== kind) return false;
      if (year) {
        const y = d.date ? Number(d.date.slice(0, 4)) : Number((d.date_text?.match(/\b(19|20)\d{2}\b/) ?? [])[0]);
        if (y !== year) return false;
      }
      if (words.length) {
        const hay = `${d.headline} ${d.investor} ${d.target} ${d.seller ?? ""} ${d.summary ?? ""} ${d.target_country ?? ""}`.toLowerCase();
        if (!words.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if (sort === "date") {
      const when = (d: Deal) => (d.date ? Date.parse(d.date) : -1);
      return list.sort((a, b) => when(b) - when(a) || a.headline.localeCompare(b.headline));
    }
    // Money sorts within its currency: a £150M deal is never ranked against
    // a $160M one. Rows without the figure follow, newest first.
    const money = (d: Deal): [string, number] | null =>
      sort === "amount" ? (d.amount != null ? [d.currency ?? "", d.amount] : null) : d.valuation != null ? [d.valuation_currency ?? "", d.valuation] : null;
    return list.sort((a, b) => {
      const ma = money(a);
      const mb = money(b);
      if (ma && mb) return ma[0].localeCompare(mb[0]) || mb[1] - ma[1] || a.headline.localeCompare(b.headline);
      if (ma || mb) return ma ? -1 : 1;
      return (b.date ? Date.parse(b.date) : -1) - (a.date ? Date.parse(a.date) : -1) || a.headline.localeCompare(b.headline);
    });
  }, [deals, cls, kind, year, q, sort]);

  const investors = useMemo(() => {
    const m = new Map<string, { name: string; n: number; companyId: string | null; investorId: string | null }>();
    for (const d of rows) {
      const k = d.investor.toLowerCase();
      const e = m.get(k) ?? { name: d.investor, n: 0, companyId: d.investor_company_id, investorId: d.investor_id };
      e.n += 1;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [rows]);

  return (
    <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(100);
            }}
            placeholder="Investor, target, words…"
            className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-2 text-[12.5px] outline-none focus-visible:border-ring"
          />
        </div>
        <div>
          <div className="desk-label mb-1.5">Asset class</div>
          <div className="flex flex-wrap gap-1">
            <Pill on={!cls} onClick={() => setCls(null)}>
              All
            </Pill>
            {ASSET_CLASSES.map((c) => (
              <Pill key={c.key} on={cls === c.key} onClick={() => setCls(cls === c.key ? null : c.key)}>
                {c.short}
              </Pill>
            ))}
          </div>
        </div>
        <div>
          <div className="desk-label mb-1.5">Kind</div>
          <div className="flex flex-wrap gap-1">
            <Pill on={!kind} onClick={() => setKind(null)}>
              Any
            </Pill>
            {kinds.map(([k, n]) => (
              <Pill key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)}>
                {DEAL_KIND_LABEL[k] ?? k} <span className="figure opacity-70">{n}</span>
              </Pill>
            ))}
          </div>
        </div>
        <div>
          <div className="desk-label mb-1.5">Year</div>
          <div className="flex flex-wrap gap-1">
            <Pill on={!year} onClick={() => setYear(null)}>
              Any
            </Pill>
            {years.map(([y, n]) => (
              <Pill key={y} on={year === y} onClick={() => setYear(year === y ? null : y)}>
                {y} <span className="figure opacity-70">{n}</span>
              </Pill>
            ))}
          </div>
        </div>
        {investors.length ? (
          <div>
            <div className="desk-label mb-1.5">Most active in this view</div>
            <ul className="space-y-0.5 text-[12px]">
              {investors.map((i) => (
                <li key={i.name} className="flex items-center gap-2">
                  {i.companyId ? (
                    <Link href={`/companies/${i.companyId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {i.name}
                    </Link>
                  ) : i.investorId ? (
                    <Link href={`/database/sports/investors/${i.investorId}`} className="min-w-0 flex-1 truncate hover:underline">
                      {i.name}
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                  )}
                  <span className="figure text-[11px] text-muted-foreground">{i.n}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </aside>

      <section className="min-w-0">
        <div className="sheen overflow-hidden rounded-[4px] border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-[12px]">
            <span>
              <span className="figure">{rows.length.toLocaleString("en-US")}</span> <span className="text-muted-foreground">deals</span>
            </span>
            <label className="flex items-center gap-1.5 text-muted-foreground">
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-7 rounded-[4px] border border-input bg-card px-1.5 text-[12px] text-foreground">
                <option value="date">Newest</option>
                <option value="amount">Largest amount, per currency</option>
                <option value="valuation">Highest valuation, per currency</option>
              </select>
            </label>
          </div>
          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Deal · investor → target</th>
                    <th>Kind</th>
                    <th>Class</th>
                    <th className="num">Stake</th>
                    <th className="num">Amount</th>
                    <th className="num">Valuation</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, shown).map((d) => {
                    const c = ASSET_CLASS_BY_KEY[d.asset_class as AssetClassKey];
                    return (
                      <tr key={d.id} className="linked">
                        <td className="whitespace-nowrap text-muted-foreground">{dateLabel(d.date, d.date_text)}</td>
                        <td className="min-w-[260px] max-w-[380px]">
                          <Link href={`/database/deals/${d.id}`} className="cover block font-medium leading-snug">
                            {d.headline}
                          </Link>
                          <div className="mt-0.5 text-[11.5px] leading-snug">
                            {d.investor_company_id ? (
                              <Link href={`/companies/${d.investor_company_id}`}>{d.investor}</Link>
                            ) : d.investor_id ? (
                              <Link href={`/database/sports/investors/${d.investor_id}`}>{d.investor}</Link>
                            ) : (
                              <span>{d.investor}</span>
                            )}
                            {d.investor_type ? <span className="text-muted-foreground"> ({INVESTOR_TYPE_LABEL[d.investor_type] ?? d.investor_type})</span> : null}
                            <span className="text-muted-foreground"> → </span>
                            {d.target_team_id ? <Link href={`/database/sports/${d.target_team_id}`}>{d.target}</Link> : d.target_company_id ? <Link href={`/companies/${d.target_company_id}`}>{d.target}</Link> : <span>{d.target}</span>}
                            <span className="text-muted-foreground">{[d.sport ? SPORT_LABEL[d.sport] ?? d.sport : null, d.target_country].filter(Boolean).map((s) => ` · ${s}`).join("")}</span>
                          </div>
                          {d.summary ? <div className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground">{d.summary}</div> : null}
                        </td>
                        <td>
                          <Tag>{DEAL_KIND_LABEL[d.kind] ?? d.kind}</Tag>
                        </td>
                        <td>{c ? <Link href={`/database/asset-classes/${c.slug}`} className="tag hover:text-foreground">{c.short}</Link> : null}</td>
                        <td className="num">{d.stake_pct != null ? `${d.stake_pct}%` : "—"}</td>
                        <td className="num">{formatMoney(d.amount, d.currency)}</td>
                        <td className="num">{formatMoney(d.valuation, d.valuation_currency)}</td>
                        <td>
                          <Src url={d.source_url} name={d.source_name} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No deals match.</Empty>
          )}
          {rows.length > shown ? (
            <div className="border-t px-3 py-2">
              <button type="button" onClick={() => setShown(shown + 200)} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
                Show {Math.min(200, rows.length - shown)} more
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
