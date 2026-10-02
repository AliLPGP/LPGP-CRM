import Link from "next/link";
import { Download } from "lucide-react";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import {
  filterPerformance,
  managerPerformance,
  PERFORMANCE_LATEST_MONTHS,
  PERFORMANCE_SORT_LABEL,
  PERFORMANCE_SORTS,
  PERFORMANCE_STATUS_GROUPS,
  performanceFilters,
  performanceQuery,
  performanceSample,
  performanceStatusKey,
  sortPerformance,
  type FundPerformanceRow,
  type ManagerPerformanceRow,
  type PerformanceFilters,
} from "@/lib/directory/investor-queries";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { FUND_SIZE_BANDS } from "@/lib/directory/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance — LPGP Connect" };

// What limited partners report about the funds they hold. Every figure here
// is LP-reported: the net IRR and multiple an LP's own performance review
// states for a fund, folded to a median across the LPs that report it, with
// the range when they differ. DPI, RVPI and the share called are arithmetic
// on each LP's own stated cash figures and say so. A rank is only ever
// within our own sample of the same class and vintage — "Q1 of 12 on file" —
// and never called a market quartile; published market benchmarks live on
// the asset-class pages. The URL is the state: every facet is a link.

type Search = Record<string, string | string[] | undefined>;

const TABS = ["funds", "managers", "benchmark"] as const;
type Tab = (typeof TABS)[number];
const STEP = 100;

function pct(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(1)}%`;
}
function mult(v: number | null): string {
  return v == null ? "—" : `${v.toFixed(2)}x`;
}

/** The median with its range beneath when the LPs disagree. */
function Figure({ median, min, max, format }: { median: number | null; min: number | null; max: number | null; format: (v: number | null) => string }) {
  if (median == null) return <span className="text-muted-foreground">—</span>;
  const spread = min != null && max != null && min !== max;
  return (
    <>
      <span className={median < 0 ? "text-[var(--destructive)]" : undefined}>{format(median)}</span>
      {spread ? (
        <div className="text-[10px] text-muted-foreground" title="The lowest and highest figure the reporting LPs give.">
          {format(min)} – {format(max)}
        </div>
      ) : null}
    </>
  );
}

function Quartile({ q }: { q: FundPerformanceRow["quartile"] }) {
  if (!q) return <span className="text-muted-foreground">—</span>;
  return (
    <Tag strong={q.q === 1} title={`Rank by median net IRR among the ${q.of} funds of the same class and vintage we hold a figure for. Our own sample, not a market quartile.`}>
      Q{q.q} of {q.of} on file
    </Tag>
  );
}

/** One facet pill: a link that toggles a value in the URL. */
function Pill({ href, on, children, title }: { href: string; on: boolean; children: React.ReactNode; title?: string }) {
  return (
    <Link href={href} scroll={false} className={`tag hover:text-foreground ${on ? "bg-foreground text-background" : ""}`} title={title}>
      {children}
    </Link>
  );
}

function FacetRow({ label, defn, children }: { label: string; defn?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`desk-label mr-1 w-[72px] shrink-0 ${defn ? "defn" : ""}`} data-tip={defn}>
        {label}
      </span>
      {children}
    </div>
  );
}

/** Five-year vintage bands the sample covers, oldest first. */
function vintageBands(rows: FundPerformanceRow[]): { min: number; max: number; label: string }[] {
  const years = rows.map((r) => r.vintage_year).filter((y): y is number => y != null);
  if (!years.length) return [];
  const lo = Math.floor(Math.min(...years) / 5) * 5;
  const hi = Math.floor(Math.max(...years) / 5) * 5;
  const out: { min: number; max: number; label: string }[] = [];
  for (let y = lo; y <= hi; y += 5) out.push({ min: y, max: y + 4, label: y + 4 >= hi + 4 ? `${y}+` : `${y}–${y + 4}` });
  return out;
}

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "funds";
  const filters = performanceFilters(sp);
  const { cls, status, size, vintageMin, vintageMax, latest, sort } = filters;
  const nParam = Array.isArray(sp.n) ? sp.n[0] : sp.n;
  const limit = Math.min(2000, Math.max(STEP, Math.floor(Number(nParam)) || STEP));
  const base = "/database/performance";
  const href = (patch: Partial<PerformanceFilters>, extra: Record<string, string | undefined> = {}) =>
    `${base}${performanceQuery({ ...filters, ...patch }, { tab: tab === "funds" ? undefined : tab, ...extra })}`;
  const filtered = Boolean(cls || status || size || vintageMin != null || vintageMax != null || latest);

  // The funds tab reads the whole sample once so the facets can count under
  // the other filters and the quartiles stand on every fund of a class and
  // vintage; the managers tab folds the same sample per manager.
  const [sample, managers] = await Promise.all([
    tab === "funds" ? performanceSample() : Promise.resolve({ rows: [] as FundPerformanceRow[], newest: null as string | null }),
    tab === "managers" ? managerPerformance() : Promise.resolve([] as ManagerPerformanceRow[]),
  ]);
  const allFunds = sample.rows;
  const newest = sample.newest;
  const funds = sortPerformance(filterPerformance(allFunds, filters, newest), sort);
  const shownFunds = funds.slice(0, limit);
  const shownManagers = managers.slice(0, limit);

  // Each facet counts under every other filter but its own, so a pill says
  // what choosing it would leave.
  const countBy = <K extends string>(omit: keyof PerformanceFilters, keyOf: (r: FundPerformanceRow) => K | null) => {
    const m = new Map<K, number>();
    for (const r of filterPerformance(allFunds, { ...filters, [omit]: omit === "latest" ? false : null }, newest)) {
      const k = keyOf(r);
      if (k != null) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const classCounts = countBy("cls", (r) => r.class);
  const statusCounts = countBy("status", (r) => performanceStatusKey(r.fundraising_status));
  const sizeCounts = countBy("size", (r) => r.sizeBand);
  const latestCount = filterPerformance(allFunds, { ...filters, latest: true }, newest).length;
  const bands = vintageBands(allFunds);
  const customVintage = (vintageMin != null || vintageMax != null) && !bands.some((b) => b.min === vintageMin && b.max === vintageMax);

  const withIrr = funds.filter((f) => f.net_irr_median != null).length;
  const withMultiple = funds.filter((f) => f.multiple_median != null).length;
  const withCash = funds.filter((f) => f.dpi_median != null || f.rvpi_median != null || f.called_pct_median != null).length;
  const ranked = funds.filter((f) => f.quartile).length;
  const lpsReporting = new Set(funds.flatMap((f) => f.sources.map((s) => s.lp_id ?? s.lp ?? ""))).size;
  const exportHref = `/api/directory/performance/export${performanceQuery(filters)}`;

  return (
    <IntelShell
      crumbs={[{ href: base, label: "Performance" }, { label: tab === "funds" ? "Best performing funds" : tab === "managers" ? "Best performing managers" : "Market benchmarks" }]}
      kicker="Performance"
      title={tab === "funds" ? "Best performing funds" : tab === "managers" ? "Best performing managers" : "Market benchmarks"}
      description="What limited partners report about the funds they hold: the net IRR and multiple each LP's own performance review states, by fund and by manager. Every figure is LP-reported — the median across the LPs that report it, with the range when they differ — and DPI, RVPI and the share called are arithmetic on each LP's own cash figures. A rank is only ever within the funds we hold of the same class and vintage, never a market quartile."
      actions={
        tab === "funds" ? (
          <a
            href={exportHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-transparent px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            title="The funds tab under the current filters, as CSV. Fund size is USD as filed; every other figure is LP-reported or arithmetic on LP-reported figures."
          >
            <Download className="h-3.5 w-3.5" /> Export
          </a>
        ) : null
      }
      tabs={
        <SubTabs
          items={[
            { href: base, label: "Funds", active: tab === "funds" },
            { href: `${base}?tab=managers`, label: "Managers", active: tab === "managers" },
            { href: `${base}?tab=benchmark`, label: "Benchmark", active: tab === "benchmark" },
          ]}
        />
      }
    >
      {tab === "funds" ? (
        <>
          <StatStrip>
            <Stat label="Funds with a figure" value={funds.length.toLocaleString("en-US")} basis="named with a net IRR or multiple by an LP" />
            <Stat label="With a net IRR" value={withIrr.toLocaleString("en-US")} basis={`${withMultiple.toLocaleString("en-US")} with a multiple`} />
            <Stat label="With cash figures" value={withCash.toLocaleString("en-US")} basis="an LP states paid-in, distributed or value" defn="DPI, RVPI and the share called are arithmetic on the cash figures an LP's own review states — distributed, residual value and paid-in against the commitment — never on a figure the review leaves blank." />
            <Stat label="LPs reporting" value={lpsReporting.toLocaleString("en-US")} basis="from their own fund-by-fund reviews" />
            <Stat label="Ranked" value={ranked.toLocaleString("en-US")} basis="in a class and vintage with eight or more on file" defn="A fund is ranked only against the other funds of its class and vintage we hold a net IRR for, and only when there are at least eight of them. Fewer than that and a quartile would say more than the sample does." />
            <Stat label="Newest as of" value={newest ? dateLabel(newest) : "—"} basis={`up to date = within ${PERFORMANCE_LATEST_MONTHS} months of this`} />
          </StatStrip>

          <div className="flex flex-col gap-1.5">
            <FacetRow label="Class" defn="Placed by the fund's own name first, its manager's type second.">
              {ASSET_CLASSES.filter((c) => classCounts.has(c.key) || c.key === cls).map((c) => (
                <Pill key={c.key} href={href({ cls: cls === c.key ? null : c.key })} on={cls === c.key}>
                  {c.short} <span className="figure opacity-70">{classCounts.get(c.key) ?? 0}</span>
                </Pill>
              ))}
            </FacetRow>
            <FacetRow
              label="Status"
              defn="Fund type and status as the researched fund profile states it; a fund with no profile is 'Not on file'. Liquidated, and commingled against separate account, are not offered: nothing on file states them."
            >
              {PERFORMANCE_STATUS_GROUPS.map((g) => (
                <Pill key={g.key} href={href({ status: status === g.key ? null : g.key })} on={status === g.key} title={g.statuses.length ? g.statuses.join(", ") : "No researched profile for the fund"}>
                  {g.label} <span className="figure opacity-70">{statusCounts.get(g.key) ?? 0}</span>
                </Pill>
              ))}
            </FacetRow>
            <FacetRow label="Size" defn="Final close size in USD, as filed. Most LP reviews do not state it, so most funds carry no band.">
              {FUND_SIZE_BANDS.filter((b) => sizeCounts.has(b.key) || b.key === size).map((b) => (
                <Pill key={b.key} href={href({ size: size === b.key ? null : b.key })} on={size === b.key}>
                  {b.label} <span className="figure opacity-70">{sizeCounts.get(b.key) ?? 0}</span>
                </Pill>
              ))}
              {!sizeCounts.size ? <span className="text-[11.5px] text-muted-foreground">No fund in this sample has a filed size.</span> : null}
            </FacetRow>
            <FacetRow label="Vintage">
              {bands.map((b) => {
                const on = vintageMin === b.min && vintageMax === b.max;
                return (
                  <Pill key={b.min} href={href({ vintageMin: on ? null : b.min, vintageMax: on ? null : b.max })} on={on}>
                    {b.label}
                  </Pill>
                );
              })}
              {customVintage ? (
                <Pill href={href({ vintageMin: null, vintageMax: null })} on title="Clear the vintage range">
                  {vintageMin ?? "…"}–{vintageMax ?? "…"} ×
                </Pill>
              ) : null}
            </FacetRow>
            <FacetRow label="Sort">
              {PERFORMANCE_SORTS.map((s) => (
                <Pill key={s} href={href({ sort: s })} on={sort === s}>
                  {PERFORMANCE_SORT_LABEL[s]}
                </Pill>
              ))}
              <span className="mx-1 h-4 border-l" />
              <Pill href={href({ latest: !latest })} on={latest} title={`An as-of date within ${PERFORMANCE_LATEST_MONTHS} months of the newest one in the sample${newest ? ` (${newest})` : ""}.`}>
                Only funds with up-to-date performance <span className="figure opacity-70">{latestCount}</span>
              </Pill>
              {filtered ? (
                <Link href={base} className="text-[11.5px] text-muted-foreground hover:text-foreground">
                  Clear
                </Link>
              ) : null}
            </FacetRow>
          </div>

          <Box
            title={cls ? `${ASSET_CLASS_BY_KEY[cls].name} funds` : filtered ? "Matching funds" : "Funds by LP-reported performance"}
            count={funds.length}
            flush
            defn={`${PERFORMANCE_SORT_LABEL[sort]} first, blanks last, then most LPs reporting, ${STEP} at a time.`}
          >
            {shownFunds.length ? (
              <div className="desk-scroll">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th>Manager</th>
                      {!cls ? <th>Class</th> : null}
                      <th className="defn" data-tip="A strategy the fund's own legal name states, within its class. Blank when the name says none.">Strategy</th>
                      <th className="num">Vintage</th>
                      <th className="num defn" data-tip="Final close size as filed, USD. Blank when no filing states it.">Size (USD)</th>
                      <th className="num defn" data-tip="Median of the net IRRs the reporting LPs state, as each states it. The range beneath shows when they differ.">Net IRR</th>
                      <th className="num defn" data-tip="Median of the net multiples (TVPI or as the LP labels it) the reporting LPs state.">Net multiple</th>
                      <th className="num defn" data-tip="Arithmetic: residual value over paid-in capital from each LP's own stated figures, median across the LPs that state both. Not a figure any LP prints.">RVPI</th>
                      <th className="num defn" data-tip="Arithmetic: distributions over paid-in capital from each LP's own stated figures, median across the LPs that state both. Not a figure any LP prints.">DPI</th>
                      <th className="num defn" data-tip="Arithmetic: paid-in capital over the commitment from each LP's own stated figures, median across the LPs that state both. Can pass 100% where an LP reports recycled capital.">Called</th>
                      <th className="num defn" data-tip="Limited partners reporting a figure for this fund; beneath, how many of their rows state cash figures.">LPs reporting</th>
                      <th className="defn" data-tip="Rank by median net IRR within the funds of the same class and vintage we hold, only when eight or more are on file. Never a market quartile.">Quartile on file</th>
                      <th>As of</th>
                      <th>Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownFunds.map((f) => (
                      <tr key={f.fund_id}>
                        <td className="min-w-[220px] max-w-[320px]">
                          <Link href={`/funds/${f.fund_id}`} className="block truncate font-medium hover:underline" title={f.fund_name}>
                            {f.fund_name}
                          </Link>
                          {f.fundraising_status ? <div className="text-[10px] text-muted-foreground">{f.fundraising_status}</div> : null}
                        </td>
                        <td className="max-w-[200px] truncate">
                          {f.company_id ? (
                            <Link href={`/companies/${f.company_id}`} className="hover:underline">
                              {f.manager_name ?? "Manager"}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{f.manager_name ?? "—"}</span>
                          )}
                        </td>
                        {!cls ? (
                          <td className="whitespace-nowrap">
                            {f.class ? (
                              <Link href={href({ cls: f.class })} className="tag hover:text-foreground">
                                {ASSET_CLASS_BY_KEY[f.class].short}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="max-w-[180px] truncate text-muted-foreground">{f.strategyKey ? (STRATEGY_BY_KEY[f.strategyKey]?.name ?? f.strategyKey) : "—"}</td>
                        <td className="num text-muted-foreground">{f.vintage_year ?? "—"}</td>
                        <td className="num whitespace-nowrap">
                          {f.fund_size_usd != null ? (
                            <>
                              <span className="figure">{formatMoney(f.fund_size_usd, "USD")}</span>
                              <div className="text-[10px] text-muted-foreground">USD, as filed</div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="num">
                          <Figure median={f.net_irr_median} min={f.net_irr_min} max={f.net_irr_max} format={pct} />
                        </td>
                        <td className="num">
                          <Figure median={f.multiple_median} min={f.multiple_min} max={f.multiple_max} format={mult} />
                        </td>
                        <td className="num" title="Arithmetic on the LP's stated figures">{mult(f.rvpi_median)}</td>
                        <td className="num" title="Arithmetic on the LP's stated figures">{mult(f.dpi_median)}</td>
                        <td className="num" title="Arithmetic on the LP's stated figures">{f.called_pct_median == null ? "—" : `${f.called_pct_median.toFixed(0)}%`}</td>
                        <td className="num">
                          {f.lps}
                          {f.lps_with_cash ? <div className="text-[10px] text-muted-foreground">{f.lps_with_cash} with cash figures</div> : null}
                        </td>
                        <td className="whitespace-nowrap">
                          <Quartile q={f.quartile} />
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">{dateLabel(f.as_of)}</td>
                        <td className="max-w-[260px]">
                          <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                            {f.sources.length ? (
                              f.sources.map((s, i) => <Src key={`${s.lp_id ?? s.lp ?? i}-${s.url ?? i}`} url={s.url} name={s.lp ?? "LP"} asOf={s.as_of} />)
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : filtered ? (
              <Empty>No fund matches these filters.</Empty>
            ) : (
              <Empty>No LP-reported performance on file yet. Figures arrive with the LP disclosures loaded into commitments: an LP&rsquo;s own fund-by-fund review gives a net IRR or a multiple, and that fund appears here.</Empty>
            )}
            {funds.length > limit ? (
              <div className="border-t px-3 py-2">
                <Link href={href({}, { n: String(limit + STEP) })} scroll={false} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
                  Show {Math.min(STEP, funds.length - limit)} more
                </Link>
              </div>
            ) : null}
          </Box>
        </>
      ) : null}

      {tab === "managers" ? (
        <>
          <StatStrip>
            <Stat label="Managers" value={managers.length.toLocaleString("en-US")} basis="with at least one fund an LP reports on" />
            <Stat label="Funds with a figure" value={managers.reduce((n, m) => n + m.funds, 0).toLocaleString("en-US")} basis="across those managers" />
            <Stat label="Several funds reported" value={managers.filter((m) => m.funds >= 3).length.toLocaleString("en-US")} basis="three or more funds with a figure" />
            <Stat label="With a filed size" value={managers.filter((m) => m.sized > 0).length.toLocaleString("en-US")} basis="a fund in the sample with a size as filed" />
          </StatStrip>
          <Box title="Managers by LP-reported performance" count={managers.length} flush defn="Most funds with a figure first, then the median of those funds' median net IRRs. A manager with one fund on file ranks by that one fund alone.">
            {shownManagers.length ? (
              <div className="desk-scroll">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Manager</th>
                      <th>Type</th>
                      <th className="num">Funds with a figure</th>
                      <th className="num">LPs reporting</th>
                      <th className="num defn" data-tip="The median of the manager's funds' median net IRRs, each as the reporting LPs state it.">Median net IRR</th>
                      <th className="num defn" data-tip="The median of the manager's funds' median DPIs — arithmetic on each LP's own stated distributions and paid-in capital.">Median DPI</th>
                      <th className="num defn" data-tip="The sizes as filed, USD, of the manager's funds in this sample that carry one, added up; beneath, how many of its funds here do. Not what the manager has raised in all.">Raised in sample (USD)</th>
                      <th>Best fund on file</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownManagers.map((m) => (
                      <tr key={m.company_id}>
                        <td className="min-w-[200px] max-w-[300px]">
                          <Link href={`/companies/${m.company_id}`} className="block truncate font-medium hover:underline" title={m.manager_name ?? undefined}>
                            {m.manager_name ?? "Manager"}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">{m.manager_sub_type ?? "—"}</td>
                        <td className="num">{m.funds}</td>
                        <td className="num text-muted-foreground">{m.lps}</td>
                        <td className={`num ${m.net_irr_median != null && m.net_irr_median < 0 ? "text-[var(--destructive)]" : ""}`}>{pct(m.net_irr_median)}</td>
                        <td className="num" title="Arithmetic on the LPs' stated figures">{mult(m.dpi_median)}</td>
                        <td className="num whitespace-nowrap">
                          {m.raised_usd != null ? (
                            <>
                              <span className="figure">{formatMoney(m.raised_usd, "USD")}</span>
                              <div className="text-[10px] text-muted-foreground">
                                {m.sized} of {m.funds} as filed
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="max-w-[360px]">
                          {m.best ? (
                            <>
                              <Link href={`/funds/${m.best.fund_id}`} className="block truncate hover:underline" title={m.best.fund_name}>
                                {m.best.fund_name}
                              </Link>
                              <div className="text-[10.5px] text-muted-foreground">
                                {[m.best.vintage_year ? `vintage ${m.best.vintage_year}` : null, m.best.net_irr_median != null ? `net IRR ${pct(m.best.net_irr_median)}` : null, m.best.multiple_median != null ? mult(m.best.multiple_median) : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No manager has a fund with an LP-reported figure yet.</Empty>
            )}
            {managers.length > limit ? (
              <div className="border-t px-3 py-2">
                <Link href={`${base}?tab=managers&n=${limit + STEP}`} scroll={false} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
                  Show {Math.min(STEP, managers.length - limit)} more
                </Link>
              </div>
            ) : null}
          </Box>
        </>
      ) : null}

      {tab === "benchmark" ? (
        <Box title="Market benchmarks" defn="Published figures, each with its publisher, period and page.">
          <p className="max-w-3xl text-[13px] leading-relaxed">
            Published market benchmarks — fundraising totals, dry powder, median net IRRs, index returns, default rates and spreads — live on each asset-class page, with the publisher, the period and the page every figure came from. The Funds and Managers tabs here are our own sample: what limited partners report about the funds they hold, and nothing more.
          </p>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {ASSET_CLASSES.map((c) => (
              <li key={c.key}>
                <Link href={`/database/asset-classes/${c.slug}`} className="flex items-baseline gap-2 rounded-[4px] border bg-background/40 px-3 py-2 text-[12.5px] hover:bg-accent/40">
                  <span className="font-medium">{c.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">benchmarks and strategies</span>
                </Link>
              </li>
            ))}
          </ul>
        </Box>
      ) : null}
    </IntelShell>
  );
}
