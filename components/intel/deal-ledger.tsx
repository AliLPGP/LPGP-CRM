"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Search } from "lucide-react";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney, SPORT_LABEL } from "@/lib/directory/intelligence-types";
import type { DealSearchResult } from "@/lib/directory/intelligence-queries";
import { cn } from "@/lib/utils";
import { dateLabel } from "./tables";
import { Empty, Tag } from "./ui";

// The Deals page: every sourced transaction, filtered and sorted in the
// database. Money is shown in the currency the source states and never
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

type Filters = { cls: AssetClassKey | null; kind: string | null; year: number | null; q: string; sort: Sort };

function paramsFor(f: Filters, offset: number): string {
  const p = new URLSearchParams();
  if (f.cls) p.set("class", f.cls);
  if (f.kind) p.set("kind", f.kind);
  if (f.year) p.set("year", String(f.year));
  if (f.q.trim()) p.set("q", f.q.trim());
  p.set("sort", f.sort);
  p.set("offset", String(offset));
  p.set("limit", "100");
  return p.toString();
}

// What is on screen: the rows the database returned for one set of filters.
// The answer carries the filters it belongs to, so a slow reply never lands
// on a newer click; while the next answer is in flight the last one stays up.
type Shown = DealSearchResult & { key: string };

export function DealLedger({ initial, initialClass, initialKind }: { initial: DealSearchResult; initialClass?: AssetClassKey | null; initialKind?: string | null }) {
  const [f, setF] = useState<Filters>({ cls: initialClass ?? null, kind: initialKind ?? null, year: null, q: "", sort: "date" });
  const key = JSON.stringify(f);
  const [shown, setShown] = useState<Shown>(() => ({ ...initial, key }));
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (shown.key === key) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/directory/deals/search?${paramsFor(f, 0)}`);
        const json = (await res.json()) as DealSearchResult;
        if (live) setShown({ ...json, key });
      } catch {
        /* keep what is on screen */
      }
    }, f.q === "" || shown.key.includes(`"q":"${f.q}"`) ? 0 : 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, f, shown.key]);

  async function showMore() {
    setMore(true);
    try {
      const res = await fetch(`/api/directory/deals/search?${paramsFor(f, shown.rows.length)}`);
      const json = (await res.json()) as DealSearchResult;
      setShown((cur) => (cur.key === key ? { ...cur, rows: [...cur.rows, ...json.rows] } : cur));
    } finally {
      setMore(false);
    }
  }

  const loading = shown.key !== key;
  const rows = shown.rows;
  const total = shown.total;
  const kinds = shown.kinds;
  const years = shown.years;
  const investors = shown.investors;
  const { cls, kind, year, q, sort } = f;
  const setCls = (v: AssetClassKey | null) => setF((x) => ({ ...x, cls: v, kind: null }));
  const setKind = (v: string | null) => setF((x) => ({ ...x, kind: v }));
  const setYear = (v: number | null) => setF((x) => ({ ...x, year: v }));
  const setQ = (v: string) => setF((x) => ({ ...x, q: v }));
  const setSort = (v: Sort) => setF((x) => ({ ...x, sort: v }));

  return (
    <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
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
              <span className={cn("figure", loading && "opacity-50")}>{total.toLocaleString("en-US")}</span> <span className="text-muted-foreground">deals{loading ? " …" : ""}</span>
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
            <div className="desk-scroll">
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
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No deals match.</Empty>
          )}
          {rows.length < total ? (
            <div className="border-t px-3 py-2">
              <button type="button" disabled={more || loading} onClick={showMore} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent disabled:opacity-50">
                {more ? "Loading…" : `Show ${Math.min(100, total - rows.length)} more`}
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
