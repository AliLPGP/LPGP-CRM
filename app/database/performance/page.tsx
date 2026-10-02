import Link from "next/link";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { listFundPerformance, managerPerformance, type FundPerformanceRow, type ManagerPerformanceRow } from "@/lib/directory/investor-queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Performance — LPGP Connect" };

// What limited partners report about the funds they hold. Every figure here
// is LP-reported: the net IRR and multiple an LP's own performance review
// states for a fund, folded to a median across the LPs that report it, with
// the range when they differ. A rank is only ever within our own sample of
// the same class and vintage — "Q1 of 12 on file" — and never called a
// market quartile; published market benchmarks live on the asset-class pages.

type Search = { tab?: string; class?: string; n?: string };

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

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as Tab) : "funds";
  const cls: AssetClassKey | null = isAssetClassKey(sp.class) ? sp.class : null;
  const limit = Math.min(2000, Math.max(STEP, Math.floor(Number(sp.n)) || STEP));
  const base = "/database/performance";
  const href = (patch: Partial<Search>) => {
    const next = { tab: tab === "funds" ? undefined : tab, class: cls ?? undefined, ...patch };
    const qs = Object.entries(next)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `${base}${qs ? `?${qs}` : ""}`;
  };

  // The funds tab reads the whole sample once so the class tags can count
  // and the quartiles stand on every fund of a class and vintage.
  const [allFunds, managers] = await Promise.all([
    tab === "funds" ? listFundPerformance({ limit: 5000 }) : Promise.resolve([] as FundPerformanceRow[]),
    tab === "managers" ? managerPerformance() : Promise.resolve([] as ManagerPerformanceRow[]),
  ]);
  const funds = cls ? allFunds.filter((f) => f.class === cls) : allFunds;
  const shownFunds = funds.slice(0, limit);
  const shownManagers = managers.slice(0, limit);
  const classCounts = new Map<string, number>();
  for (const f of allFunds) if (f.class) classCounts.set(f.class, (classCounts.get(f.class) ?? 0) + 1);
  const withIrr = funds.filter((f) => f.net_irr_median != null).length;
  const withMultiple = funds.filter((f) => f.multiple_median != null).length;
  const ranked = funds.filter((f) => f.quartile).length;
  const lpsReporting = new Set(funds.flatMap((f) => f.sources.map((s) => s.lp_id ?? s.lp ?? ""))).size;

  return (
    <IntelShell
      crumbs={[{ href: base, label: "Performance" }, { label: tab === "funds" ? "Best performing funds" : tab === "managers" ? "Best performing managers" : "Market benchmarks" }]}
      kicker="Performance"
      title={tab === "funds" ? "Best performing funds" : tab === "managers" ? "Best performing managers" : "Market benchmarks"}
      description="What limited partners report about the funds they hold: the net IRR and multiple each LP's own performance review states, by fund and by manager. Every figure is LP-reported — the median across the LPs that report it, with the range when they differ. A rank is only ever within the funds we hold of the same class and vintage, never a market quartile."
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
            <Stat label="LPs reporting" value={lpsReporting.toLocaleString("en-US")} basis="from their own fund-by-fund reviews" />
            <Stat label="Ranked" value={ranked.toLocaleString("en-US")} basis="in a class and vintage with eight or more on file" defn="A fund is ranked only against the other funds of its class and vintage we hold a net IRR for, and only when there are at least eight of them. Fewer than that and a quartile would say more than the sample does." />
            <Stat label="Classes" value={classCounts.size.toLocaleString("en-US")} basis="placed by the fund's name, else its manager's type" />
          </StatStrip>

          <div className="flex flex-wrap items-center gap-1.5">
            {ASSET_CLASSES.filter((c) => classCounts.has(c.key)).map((c) => (
              <Link key={c.key} href={href({ class: cls === c.key ? undefined : c.key, n: undefined })} className={`tag hover:text-foreground ${cls === c.key ? "bg-foreground text-background" : ""}`}>
                {c.short} <span className="figure opacity-70">{classCounts.get(c.key)}</span>
              </Link>
            ))}
            {cls ? (
              <Link href={href({ class: undefined, n: undefined })} className="text-[11.5px] text-muted-foreground hover:text-foreground">
                Clear
              </Link>
            ) : null}
          </div>

          <Box title={cls ? `${ASSET_CLASS_BY_KEY[cls].name} funds` : "Funds by LP-reported performance"} count={funds.length} flush defn={`Most LPs reporting first, then median net IRR, ${STEP} at a time.`}>
            {shownFunds.length ? (
              <div className="desk-scroll">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th>Manager</th>
                      {!cls ? <th>Class</th> : null}
                      <th className="num">Vintage</th>
                      <th className="num defn" data-tip="Median of the net IRRs the reporting LPs state, as each states it. The range beneath shows when they differ.">Net IRR</th>
                      <th className="num defn" data-tip="Median of the multiples (TVPI or as the LP labels it) the reporting LPs state.">Multiple</th>
                      <th className="defn" data-tip="Rank by median net IRR within the funds of the same class and vintage we hold, only when eight or more are on file. Never a market quartile.">Quartile on file</th>
                      <th className="num">LPs reporting</th>
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
                              <Link href={href({ class: f.class, n: undefined })} className="tag hover:text-foreground">
                                {ASSET_CLASS_BY_KEY[f.class].short}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="num text-muted-foreground">{f.vintage_year ?? "—"}</td>
                        <td className="num">
                          <Figure median={f.net_irr_median} min={f.net_irr_min} max={f.net_irr_max} format={pct} />
                        </td>
                        <td className="num">
                          <Figure median={f.multiple_median} min={f.multiple_min} max={f.multiple_max} format={mult} />
                        </td>
                        <td className="whitespace-nowrap">
                          <Quartile q={f.quartile} />
                        </td>
                        <td className="num">{f.lps}</td>
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
            ) : cls ? (
              <Empty>No fund in this class carries an LP-reported figure yet.</Empty>
            ) : (
              <Empty>No LP-reported performance on file yet. Figures arrive with the LP disclosures loaded into commitments: an LP&rsquo;s own fund-by-fund review gives a net IRR or a multiple, and that fund appears here.</Empty>
            )}
            {funds.length > limit ? (
              <div className="border-t px-3 py-2">
                <Link href={href({ n: String(limit + STEP) })} scroll={false} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
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
                <Link href={href({ n: String(limit + STEP) })} scroll={false} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
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
