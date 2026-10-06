import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { Columns, DEAL_KIND_ORDER, KIND_HUE, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel, ShowMore } from "@/components/intel/tables";
import { Bar, Box, Empty, Src, Stat, StatStrip } from "@/components/intel/ui";
import { UrlFacets } from "@/components/intel/url-facets";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { getPortcoIntel } from "@/lib/directory/filings-queries";
import { AMOUNT_BASIS_LABEL, formatMoney } from "@/lib/directory/intelligence-types";
import { portcoHref } from "@/lib/directory/portco-intel";
import { dealCountsFor, getPortcoSummary, searchPortcos } from "@/lib/directory/portco-queries";
import { DEAL_BASIS_LABEL } from "@/lib/directory/portfolio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio companies — LPGP Intelligence" };

// The companies sponsors hold, and the money announced around them. Every
// company carries the page that names it as the sponsor's investment; every
// figure the announcement that states it, with what the figure is. Money is
// shown per currency and never added across currencies. The URL is the
// state: the toolbar writes it, the page reads it.

type Search = { q?: string; sponsor?: string; status?: string; priced?: string; n?: string };

const STEP = 100;

function CountList({ rows, href }: { rows: { key: string; label: React.ReactNode; count: number; title?: string }[]; href?: (key: string) => string }) {
  const max = rows[0]?.count ?? 1;
  if (!rows.length) return <Empty>Nothing on file yet.</Empty>;
  return (
    <ul className="space-y-1 px-3 py-2 text-[12px]">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2" title={r.title}>
          {href ? (
            <Link href={href(r.key)} className="min-w-0 flex-1 truncate hover:underline">
              {r.label}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate">{r.label}</span>
          )}
          <Bar value={r.count} max={max} />
          <span className="figure w-10 text-right text-[11px] text-muted-foreground">{r.count.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PortcosPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const status = sp.status === "current" || sp.status === "realized" ? sp.status : "";
  const priced = sp.priced === "1";
  const query = (sp.q ?? "").trim();
  const limit = Math.min(1000, Math.max(STEP, Math.floor(Number(sp.n)) || STEP));
  const [summary, rows] = await Promise.all([getPortcoSummary(), searchPortcos({ q: query, sponsor: sp.sponsor, status, priced, limit: limit + 1 })]);
  // One row past the page says whether there is more.
  const hasMore = rows.length > limit;
  if (hasMore) rows.length = limit;
  const keys = rows.map((r) => r.intel_key ?? "").filter(Boolean);
  const [intel, counts] = await Promise.all([getPortcoIntel(keys), dealCountsFor(keys)]);
  const href = (patch: Partial<Search>) => {
    const next = { q: query || undefined, sponsor: sp.sponsor || undefined, status: status || undefined, priced: priced ? "1" : undefined, ...patch };
    const qs = Object.entries(next)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `/database/portcos${qs ? `?${qs}` : ""}`;
  };
  const thisYear = new Date().getUTCFullYear();
  const years = summary.byYear.filter((y) => y.year >= thisYear - 14);
  const dealYears = summary.dealsByYear.filter((y) => y.year >= thisYear - 10);
  const kinds = [...DEAL_KIND_ORDER.filter((k) => summary.byKind.some((b) => b.kind === k)), ...summary.byKind.map((b) => b.kind).filter((k) => !KIND_HUE[k])];
  const largest = ["USD", "EUR", "GBP"].map((c) => ({ currency: c, rows: summary.largest.filter((d) => d.currency === c) })).filter((g) => g.rows.length);
  const sponsors = [...summary.bySponsor].sort((a, b) => b.companies - a.companies || a.name.localeCompare(b.name));
  const sponsorName = sponsors.find((s) => s.id === sp.sponsor)?.name;
  const filtered = Boolean(query || sp.sponsor || status || priced);

  return (
    <IntelShell
      crumbs={[{ href: "/database/workflows/portfolio-management", label: "Portfolio management" }, { label: "Portfolio companies" }]}
      kicker="Private equity"
      title="Portfolio companies"
      description="The companies sponsors hold and have held, each with the page that names it as the sponsor's investment, and the announcements that put money into them: buyouts, stakes, funding rounds with every named investor, add-ons, financings and exits. Every figure is as the announcement states it, with what the figure is; checked figures were re-read against their page before they were stored."
    >
      <StatStrip>
        <Stat label="Portfolio companies" value={summary.companies.toLocaleString("en-US")} basis={`${summary.holdings.toLocaleString("en-US")} holdings across sponsors`} />
        <Stat label="Sponsors" value={summary.sponsors.toLocaleString("en-US")} basis="with a portfolio on file" />
        <Stat label="Current" value={summary.current.toLocaleString("en-US")} basis={`${summary.realized.toLocaleString("en-US")} realized`} href={href({ status: "current", n: undefined })} />
        <Stat label="Deals on file" value={summary.deals.toLocaleString("en-US")} basis={`${summary.verifiedDeals.toLocaleString("en-US")} checked against their page`} />
        {summary.amountByCurrency.slice(0, 2).map((c) => (
          <Stat
            key={c.currency}
            label={`Disclosed deal value, ${c.currency}`}
            value={formatMoney(c.total, c.currency)}
            basis={`across ${c.deals.toLocaleString("en-US")} deals`}
            defn="Deal volume: the stated values of the announced deals in this currency, added together (enterprise values, round sizes and stake prices; debt left out). A measure of activity, not of capital invested. Other currencies are shown on their own, never converted in."
          />
        ))}
      </StatStrip>

      <UrlFacets
        search={{ param: "q", placeholder: "Company, sector, country…" }}
        facets={[
          { param: "sponsor", label: "Sponsor", groups: [{ label: "", options: sponsors.map((s) => ({ key: s.id, label: s.name, count: s.companies })) }], width: 300 },
          {
            param: "status",
            label: "Status",
            searchable: false,
            width: 200,
            groups: [
              {
                label: "",
                options: [
                  { key: "current", label: "Current", count: summary.current },
                  { key: "realized", label: "Realized", count: summary.realized },
                ],
              },
            ],
          },
        ]}
        sort={{
          param: "priced",
          defaultKey: "",
          options: [
            { key: "", label: "Most recent investment" },
            { key: "1", label: "Largest stated deal value — priced only" },
          ],
        }}
        count={{ value: rows.length, noun: hasMore ? "companies shown" : "companies" }}
        right={
          <a
            href={`/api/directory/portcos/export${sp.sponsor ? `?sponsor=${sp.sponsor}` : ""}`}
            className="inline-flex h-8 items-center rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent"
            title="The sheet: name, status, class, deal type, sector, country, website, email, description, business model, CEO, CFO, COO, managing director, employees, revenue, EBITDA, value creation plan, notes and sources"
          >
            Download sheet
          </a>
        }
      >
        <Box
          title={query ? `Companies matching “${query}”` : sponsorName ? `${sponsorName} portfolio` : priced ? "Largest stated deal values" : "Most recent investments"}
          count={rows.length}
          flush
          defn="A hundred at a time, most recent investment first (largest stated deal first when sorted by value, which keeps only companies with one). Search narrows by company, sector or country."
        >
          {rows.length ? (
            <ol className="story story-rows">
              {rows.map((r) => {
                const ci = r.intel_key ? intel.get(r.intel_key) : undefined;
                const revenue = ci?.revenue_stated ?? ci?.revenue ?? null;
                const deals = (r.intel_key && counts.get(r.intel_key)) || 0;
                const status = (r.status ?? "").toLowerCase();
                const held = status.startsWith("current");
                const exited = status.startsWith("realized") || status.startsWith("realised") || status.startsWith("exit");
                return (
                  <li key={r.id} className="group relative">
                    <div className="story-row">
                      <span className="story-logo shrink-0" style={{ borderRadius: 11 }}>
                        <CompanyLogo name={r.name} domain={r.domain} size={40} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-2">
                          {r.intel_key ? (
                            <Link href={portcoHref(r.intel_key)} className="truncate text-[14.5px] font-semibold after:absolute after:inset-0 after:content-['']" title={r.name}>
                              {r.name}
                            </Link>
                          ) : (
                            <span className="truncate text-[14.5px] font-semibold" title={r.name}>
                              {r.name}
                            </span>
                          )}
                          {r.sector ? <span className="truncate text-[12.5px] text-muted-foreground">{r.sector}</span> : null}
                        </span>
                        <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                          Backed by{" "}
                          <Link href={`/companies/${r.gp_company_id}#portfolio`} className="relative z-[1] text-foreground hover:underline">
                            {r.gp?.name ?? "its sponsor"}
                          </Link>
                          {r.invested_year ? ` since ${r.invested_year}` : ""}
                          {r.exit_year ? `, exited ${r.exit_year}` : ""}
                          {r.hq ? ` · ${r.hq}` : ""}
                        </span>
                      </span>
                      <span className="hidden items-center gap-1.5 md:flex">
                        {held ? <span className="story-chip story-chip-strong">Held</span> : exited ? <span className="story-chip">Exited</span> : null}
                        {deals ? <span className="story-chip">{deals} deal{deals === 1 ? "" : "s"}</span> : null}
                      </span>
                      <span className="w-[120px] shrink-0 text-right">
                        {r.deal_value != null ? (
                          <>
                            <span className="figure block text-[14px]">{formatMoney(r.deal_value, r.deal_currency)}</span>
                            <span className="block text-[10.5px] text-muted-foreground">{DEAL_BASIS_LABEL[r.deal_value_basis ?? "unspecified"] ?? "as reported"}</span>
                          </>
                        ) : revenue != null ? (
                          <>
                            <span className="figure block text-[14px]">{formatMoney(revenue, ci?.revenue_stated != null ? ci?.revenue_currency : ci?.currency)}</span>
                            <span className="block text-[10.5px] text-muted-foreground">revenue</span>
                          </>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">No price stated</span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : filtered ? (
            <Empty>
              No portfolio company matches this cut.{" "}
              <Link href="/database/portcos" className="underline underline-offset-2 hover:text-foreground">
                Clear the filters
              </Link>{" "}
              to see every company on file.
            </Empty>
          ) : (
            <Empty>No portfolio companies on file yet. “Research portfolio” on a manager&rsquo;s profile reads its own site; Import → Master directory runs it for every sponsor.</Empty>
          )}
          {hasMore ? <ShowMore href={href({ n: String(limit + STEP) })} step={STEP} left={STEP} /> : null}
        </Box>
      </UrlFacets>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="New investments per year" defn="Portfolio companies by the year the sponsor's site or the announcement gives for the investment, last fifteen years.">
          <Columns rows={years.map((y) => ({ label: String(y.year), value: y.investments }))} height={110} />
        </Box>
        <Box title="Announcements per year" defn="Deals on file by announcement date. The hint on each column says how many state an amount.">
          <Columns rows={dealYears.map((y) => ({ label: String(y.year), value: y.deals, hint: `${y.withAmount} with a stated amount` }))} height={110} />
        </Box>
      </div>

      <Box title="What the announcements are" count={summary.deals} defn="The kind of each deal on file, as the announcement describes it.">
        <ShareBar segments={kinds.map((k) => ({ key: k, label: DEAL_KIND_LABEL[k] ?? k, value: summary.byKind.find((b) => b.kind === k)?.deals ?? 0, hue: KIND_HUE[k] ?? "var(--chart-bar)" }))} />
      </Box>

      <div className="grid gap-4 lg:grid-cols-3">
        <Box title="Sponsors by holdings" count={summary.bySponsor.length} flush defn="Companies on file per sponsor, current and realized.">
          <CountList
            rows={summary.bySponsor.slice(0, 20).map((s) => ({
              key: s.id,
              label: (
                <span className="flex items-center gap-2">
                  <CompanyLogo name={s.name} domain={s.domain} size={16} />
                  {s.name}
                </span>
              ),
              count: s.companies,
              title: `${s.companies} companies, ${s.current} current`,
            }))}
            href={(id) => href({ sponsor: id, n: undefined })}
          />
        </Box>
        <Box title="Sectors" flush defn="As each sponsor labels the company; sponsors use different taxonomies.">
          <CountList rows={summary.bySector.map((s) => ({ key: s.sector, label: s.sector, count: s.companies }))} href={(s) => href({ q: s, n: undefined })} />
        </Box>
        <Box title="Headquarters" flush defn="The country (or last part of the location) the sponsor gives for the company.">
          <CountList rows={summary.byCountry.map((s) => ({ key: s.country, label: s.country, count: s.companies }))} href={(s) => href({ q: s, n: undefined })} />
        </Box>
      </div>

      {largest.length ? (
        <Box title="Largest disclosed deals" flush defn="The biggest stated figures per currency. An enterprise value is the price of the whole company, not one investor's cheque.">
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Kind</th>
                  <th>Date</th>
                  <th>Investor</th>
                  <th className="num">Amount</th>
                  <th>What it is</th>
                  <th>Source</th>
                </tr>
              </thead>
              {largest.map((g) => (
                <tbody key={g.currency}>
                  <tr>
                    <td colSpan={7} className="desk-label bg-muted/40">
                      {g.currency}
                    </td>
                  </tr>
                  {g.rows.map((d) => (
                    <tr key={d.id} className="linked">
                      <td className="max-w-[260px] truncate font-medium" title={d.target}>
                        <Link href={portcoHref(d.target_key)} className="cover">
                          {d.target}
                        </Link>
                      </td>
                      <td>
                        <span className="flex items-center gap-1.5 whitespace-nowrap">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: KIND_HUE[d.kind] ?? "var(--chart-bar)" }} />
                          {DEAL_KIND_LABEL[d.kind] ?? d.kind}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-muted-foreground">{dateLabel(d.date)}</td>
                      <td className="max-w-[260px] truncate" title={[d.investor, ...(d.co_investors ?? [])].join(", ")}>
                        {d.investor}
                        {d.co_investors?.length ? <span className="text-muted-foreground"> +{d.co_investors.length}</span> : null}
                      </td>
                      <td className="num">
                        <Link href={`/database/deals/${d.id}`} title="The deal's own page">
                          {formatMoney(d.amount, d.currency)}
                        </Link>
                      </td>
                      <td className="text-[11.5px] text-muted-foreground">{AMOUNT_BASIS_LABEL[d.amount_basis ?? "unspecified"] ?? "as reported"}</td>
                      <td>
                        <Src url={d.source_url} name={d.source_name ?? "Source"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </Box>
      ) : null}
    </IntelShell>
  );
}
