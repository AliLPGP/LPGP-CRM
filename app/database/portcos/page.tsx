import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { Columns, DEAL_KIND_ORDER, KIND_HUE, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Bar, Box, Empty, Src, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { getPortcoIntel } from "@/lib/directory/filings-queries";
import { AMOUNT_BASIS_LABEL, formatMoney } from "@/lib/directory/intelligence-types";
import { financeLead, operationsLead, portcoHref } from "@/lib/directory/portco-intel";
import { dealCountsFor, getPortcoSummary, portcoSponsors, searchPortcos } from "@/lib/directory/portco-queries";
import { DEAL_BASIS_LABEL } from "@/lib/directory/portfolio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Portfolio companies — LPGP Connect" };

// The companies sponsors hold, and the money announced around them. Every
// company carries the page that names it as the sponsor's investment; every
// figure the announcement that states it, with what the figure is. Money is
// shown per currency and never added across currencies.

type Search = { q?: string; sponsor?: string; status?: string; priced?: string };

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
  const [summary, sponsors, rows] = await Promise.all([
    getPortcoSummary(),
    portcoSponsors(),
    searchPortcos({ q: query, sponsor: sp.sponsor, status, priced, limit: 300 }),
  ]);
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
  const sponsorName = sponsors.find((s) => s.id === sp.sponsor)?.name;

  return (
    <IntelShell
      crumbs={[{ href: "/database/workflows/portfolio-management", label: "Portfolio management" }, { label: "Portfolio companies" }]}
      kicker="Private equity"
      title="Portfolio companies"
      description="The companies sponsors hold and have held, each with the page that names it as the sponsor's investment, and the announcements that put money into them: buyouts, stakes, funding rounds with every named investor, add-ons, financings and exits. Every figure is as the announcement states it, with what the figure is; checked figures were re-read against their page before they were stored."
      actions={
        <form action="/database/portcos" className="flex flex-wrap items-center gap-1.5">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          {priced ? <input type="hidden" name="priced" value="1" /> : null}
          <select name="sponsor" defaultValue={sp.sponsor ?? ""} className="h-8 max-w-[200px] rounded-[4px] border bg-card px-2 text-[12px]">
            <option value="">All sponsors</option>
            {sponsors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input name="q" defaultValue={query} placeholder="Company, sector, country…" className="h-8 w-52 rounded-[4px] border bg-card px-2.5 text-[12px] outline-none focus:border-foreground" />
          <button type="submit" className="h-8 rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent">
            Search
          </button>
        </form>
      }
    >
      <StatStrip>
        <Stat label="Portfolio companies" value={summary.companies.toLocaleString("en-US")} basis={`${summary.holdings.toLocaleString("en-US")} holdings across sponsors`} />
        <Stat label="Sponsors" value={summary.sponsors.toLocaleString("en-US")} basis="with a portfolio on file" />
        <Stat label="Current" value={summary.current.toLocaleString("en-US")} basis={`${summary.realized.toLocaleString("en-US")} realized`} href={href({ status: "current" })} />
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
            href={(id) => href({ sponsor: id })}
          />
        </Box>
        <Box title="Sectors" flush defn="As each sponsor labels the company; sponsors use different taxonomies.">
          <CountList rows={summary.bySector.map((s) => ({ key: s.sector, label: s.sector, count: s.companies }))} href={(s) => href({ q: s })} />
        </Box>
        <Box title="Headquarters" flush defn="The country (or last part of the location) the sponsor gives for the company.">
          <CountList rows={summary.byCountry.map((s) => ({ key: s.country, label: s.country, count: s.companies }))} href={(s) => href({ q: s })} />
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
                    <tr key={d.id}>
                      <td className="font-medium">
                        <Link href={portcoHref(d.target_key)} className="hover:underline">
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
                        <Link href={`/database/deals/${d.id}`} className="hover:underline">
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

      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { label: "All", patch: { status: undefined, priced: undefined } },
          { label: "Current", patch: { status: "current", priced: undefined } },
          { label: "Realized", patch: { status: "realized", priced: undefined } },
          { label: "With a stated deal value", patch: { priced: "1" } },
        ].map((x) => {
          const active = x.label === "All" ? !status && !priced : x.label === "With a stated deal value" ? priced : status === x.patch.status && !priced;
          return (
            <Link key={x.label} href={href(x.patch as Partial<Search>)} className={`tag hover:text-foreground ${active ? "bg-foreground text-background" : ""}`}>
              {x.label}
            </Link>
          );
        })}
        {sponsorName ? (
          <Link href={href({ sponsor: undefined })} className="tag hover:text-foreground" title="Clear the sponsor filter">
            {sponsorName} ×
          </Link>
        ) : null}
      </div>

      <Box
        title={query ? `Companies matching “${query}”` : sponsorName ? `${sponsorName} portfolio` : "Most recent investments"}
        count={rows.length}
        flush
        defn="Up to 300 at a time, most recent investment first (largest stated deal first when filtered to those with a value). Search narrows by company, sector or country."
      >
        {rows.length ? (
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sponsor</th>
                  <th>Sector</th>
                  <th>HQ</th>
                  <th className="num">Since</th>
                  <th>Status</th>
                  <th className="num">Deal value</th>
                  <th>CFO · COO</th>
                  <th className="num">Deals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const ci = r.intel_key ? intel.get(r.intel_key) : undefined;
                  const cfo = financeLead(ci);
                  const coo = operationsLead(ci);
                  return (
                    <tr key={r.id}>
                      <td className="min-w-[200px] max-w-[300px]">
                        <span className="flex items-center gap-2">
                          <CompanyLogo name={r.name} domain={r.domain} size={18} />
                          {r.intel_key ? (
                            <Link href={portcoHref(r.intel_key)} className="truncate font-medium hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="truncate font-medium">{r.name}</span>
                          )}
                        </span>
                      </td>
                      <td className="max-w-[180px] truncate">
                        <Link href={`/companies/${r.gp_company_id}?tab=portfolio`} className="hover:underline">
                          {r.gp?.name ?? "Sponsor"}
                        </Link>
                      </td>
                      <td className="max-w-[160px] truncate text-muted-foreground">{r.sector ?? "—"}</td>
                      <td className="max-w-[160px] truncate text-muted-foreground">{r.hq ?? "—"}</td>
                      <td className="num text-muted-foreground">
                        {r.invested_year ?? "—"}
                        {r.exit_year ? <span> → {r.exit_year}</span> : null}
                      </td>
                      <td>{r.status ? <Tag>{r.status}</Tag> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="num whitespace-nowrap">
                        {r.deal_value != null ? (
                          <>
                            {formatMoney(r.deal_value, r.deal_currency)}
                            <div className="text-[10px] text-muted-foreground">{DEAL_BASIS_LABEL[r.deal_value_basis ?? "unspecified"] ?? "as reported"}</div>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="max-w-[220px] text-[11.5px]">
                        {cfo || coo ? (
                          <>
                            {cfo ? (
                              <div className="truncate" title={cfo.title}>
                                <span className="text-muted-foreground">CFO </span>
                                {cfo.name}
                              </div>
                            ) : null}
                            {coo ? (
                              <div className="truncate" title={coo.title}>
                                <span className="text-muted-foreground">COO </span>
                                {coo.name}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="num">{(r.intel_key && counts.get(r.intel_key)) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No portfolio company matches.</Empty>
        )}
      </Box>
    </IntelShell>
  );
}
