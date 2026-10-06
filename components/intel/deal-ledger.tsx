"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Search, X } from "lucide-react";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney, SPORT_LABEL } from "@/lib/directory/intelligence-types";
import type { DealSearchResult } from "@/lib/directory/intelligence-queries";
import { cn } from "@/lib/utils";
import { FacetChips, FacetMenu } from "./facet-menu";
import { dateLabel } from "./tables";
import { Box, Empty } from "./ui";
import { ClassIcon } from "@/components/story/story";

// The Deals page: every sourced transaction, filtered and sorted in the
// database, one page of rows at a time. The toolbar is the desk's: search,
// a dropdown per facet, the sort, the count; the chips under it say what is
// on. Money is shown in the currency the source states and never summed
// across currencies.

type Sort = "date" | "amount" | "valuation";
const PAGE = 100;

type Filters = { cls: AssetClassKey | null; kind: string | null; year: number | null; q: string; sort: Sort };

function paramsFor(f: Filters, offset: number): string {
  const p = new URLSearchParams();
  if (f.cls) p.set("class", f.cls);
  if (f.kind) p.set("kind", f.kind);
  if (f.year) p.set("year", String(f.year));
  if (f.q.trim()) p.set("q", f.q.trim());
  p.set("sort", f.sort);
  p.set("offset", String(offset));
  p.set("limit", String(PAGE));
  return p.toString();
}

/** One value or none: a facet menu ticks, the ledger keeps the newest tick. */
function one<T extends string>(selected: T[], next: string[]): T | null {
  const added = next.find((k) => !selected.includes(k as T));
  return (added ?? (next.length ? next[0] : null)) as T | null;
}

// What is on screen: the rows the database returned for one set of filters.
// The answer carries the filters it belongs to, so a slow reply never lands
// on a newer click; while the next answer is in flight the last one stays up.
type Shown = DealSearchResult & { key: string };

export function DealLedger({
  initial,
  initialClass,
  initialKind,
  classCounts,
}: {
  initial: DealSearchResult;
  initialClass?: AssetClassKey | null;
  initialKind?: string | null;
  /** Deals per asset class across the whole ledger, for the class menu's counts. */
  classCounts: Partial<Record<AssetClassKey, number>>;
}) {
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
  const filtered = Boolean(cls || kind || year);

  const classOptions = ASSET_CLASSES.filter((c) => (classCounts[c.key] ?? 0) > 0 || c.key === cls).map((c) => ({ key: c.key, label: c.name, count: classCounts[c.key] ?? 0 }));
  const kindOptions = kinds.map(([k, n]) => ({ key: k, label: DEAL_KIND_LABEL[k] ?? k, count: n }));
  const yearOptions = years.map(([y, n]) => ({ key: String(y), label: String(y), count: n }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Investor, target, words…"
            aria-label="Search deals"
            className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-7 text-[12.5px] outline-none focus-visible:border-ring"
          />
          {q ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <FacetMenu label="Asset class" groups={[{ label: "", options: classOptions }]} selected={cls ? [cls] : []} onChange={(next) => setCls(one(cls ? [cls] : [], next))} searchable={false} width={220} />
        <FacetMenu label="Kind" groups={[{ label: "", options: kindOptions }]} selected={kind ? [kind] : []} onChange={(next) => setKind(one(kind ? [kind] : [], next))} searchable={false} width={240} />
        <FacetMenu label="Year" groups={[{ label: "", options: yearOptions }]} selected={year ? [String(year)] : []} onChange={(next) => setYear(Number(one(year ? [String(year)] : [], next)) || null)} searchable={false} width={180} />
        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent" title="Sort">
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="bg-transparent text-[12.5px] text-foreground outline-none" aria-label="Sort by">
            <option value="date">Newest</option>
            <option value="amount">Largest amount, per currency</option>
            <option value="valuation">Highest valuation, per currency</option>
          </select>
        </label>
        <span className="px-1 text-[12px]" aria-live="polite">
          <span className={cn("figure", loading && "opacity-50")}>{total.toLocaleString("en-US")}</span> <span className="text-muted-foreground">deals{loading ? " …" : ""}</span>
        </span>
      </div>
      <FacetChips
        chips={[
          ...(cls ? [{ key: "c", label: ASSET_CLASS_BY_KEY[cls].name, remove: () => setCls(null) }] : []),
          ...(kind ? [{ key: "k", label: DEAL_KIND_LABEL[kind] ?? kind, remove: () => setKind(null) }] : []),
          ...(year ? [{ key: "y", label: String(year), remove: () => setYear(null) }] : []),
        ]}
        onClearAll={() => setF((x) => ({ ...x, cls: null, kind: null, year: null }))}
      />

      <div className={cn("overflow-hidden rounded-[14px] border bg-card transition-opacity duration-150 ease-out", loading && "opacity-60")} aria-busy={loading || undefined}>
        {rows.length ? (
          <ol className="story story-rows">
            {rows.map((d) => {
              const c = ASSET_CLASS_BY_KEY[d.asset_class as AssetClassKey];
              const when = d.date ? new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : dateLabel(d.date, d.date_text);
              return (
                <li key={d.id} className="group relative">
                  <div className="story-row items-start">
                    <ClassIcon cls={d.asset_class} className="mt-0.5 h-9 w-9 shrink-0 rounded-[10px]" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/database/deals/${d.id}`} className="line-clamp-2 text-[14.5px] font-semibold leading-snug after:absolute after:inset-0 after:content-['']" title={d.headline}>
                        {d.headline}
                      </Link>
                      <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
                        {d.investor_company_id ? (
                          <Link href={`/companies/${d.investor_company_id}`} className="relative z-[1] text-foreground hover:underline">
                            {d.investor}
                          </Link>
                        ) : d.investor_id ? (
                          <Link href={`/database/sports/investors/${d.investor_id}`} className="relative z-[1] text-foreground hover:underline">
                            {d.investor}
                          </Link>
                        ) : (
                          <span className="text-foreground">{d.investor}</span>
                        )}
                        {d.investor_type ? <span>({INVESTOR_TYPE_LABEL[d.investor_type] ?? d.investor_type})</span> : null}
                        <span aria-hidden>→</span>
                        {d.target_team_id ? (
                          <Link href={`/database/sports/${d.target_team_id}`} className="relative z-[1] text-foreground hover:underline">
                            {d.target}
                          </Link>
                        ) : d.target_company_id ? (
                          <Link href={`/companies/${d.target_company_id}`} className="relative z-[1] text-foreground hover:underline">
                            {d.target}
                          </Link>
                        ) : (
                          <span className="text-foreground">{d.target}</span>
                        )}
                        {[d.sport ? (SPORT_LABEL[d.sport] ?? d.sport) : null, d.target_country].filter(Boolean).map((x) => (
                          <span key={x}>· {x}</span>
                        ))}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="story-chip">{when}</span>
                        <span className="story-chip">{DEAL_KIND_LABEL[d.kind] ?? d.kind}</span>
                        {c ? <span className="story-chip max-sm:hidden">{c.name}</span> : null}
                      </span>
                    </span>
                    <span className="w-[130px] shrink-0 text-right">
                      {d.amount != null ? <span className="figure block text-[15px]">{formatMoney(d.amount, d.currency)}</span> : d.stake_pct != null ? null : <span className="block text-[12px] text-muted-foreground">Amount not stated</span>}
                      {d.stake_pct != null ? <span className="block text-[12px] text-muted-foreground">{d.amount != null ? "for " : ""}{d.stake_pct}% stake</span> : null}
                      {d.valuation != null ? <span className="block text-[11.5px] text-muted-foreground">valued at {formatMoney(d.valuation, d.valuation_currency)}</span> : null}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty>
            {filtered || q ? (
              <>
                No deal matches this cut.{" "}
                <button type="button" onClick={() => setF((x) => ({ ...x, cls: null, kind: null, year: null, q: "" }))} className="underline underline-offset-2 hover:text-foreground">
                  Clear the filters
                </button>{" "}
                to see every sourced transaction.
              </>
            ) : (
              <>
                No deals on file yet. The deals research job fills this ledger from announcements and articles, one asset class at a time, from each class&rsquo;s page.
              </>
            )}
          </Empty>
        )}
        {rows.length < total ? (
          <div className="border-t px-3 py-2">
            <button type="button" disabled={more || loading} onClick={showMore} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent disabled:opacity-50">
              {more ? "Loading…" : `Show ${Math.min(PAGE, total - rows.length)} more`}
              {!more ? <span className="ml-1 text-muted-foreground">of {(total - rows.length).toLocaleString("en-US")} left</span> : null}
            </button>
          </div>
        ) : null}
      </div>

      {investors.length ? (
        <Box title="Most active in this view" count={investors.length} flush defn="The investors named most often in the deals the filters leave, with how many each.">
          <ul className="grid gap-x-4 gap-y-0.5 px-3 py-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
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
        </Box>
      ) : null}
    </div>
  );
}
