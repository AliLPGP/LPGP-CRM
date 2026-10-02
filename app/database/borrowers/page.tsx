import Link from "next/link";
import { financeLead, getBorrowerSummary, getPortcoIntel, portcoIntelCounts, searchBorrowers, type BorrowerFilter } from "@/lib/directory/filings-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { portcoHref } from "@/lib/directory/portco-intel";
import { getSessionUser } from "@/lib/auth";
import { Columns } from "@/components/intel/charts";
import { EnrichPortcosButton } from "@/components/intel/research-buttons";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Empty, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { UrlFacets } from "@/components/intel/url-facets";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Borrowers — LPGP Connect" };

// The companies behind the loan books, folded from every parsed lender's
// latest schedule of investments. The URL is the state: one flag at a time
// (`f`), a name search (`q`); the toolbar writes both.

const FILTERS: { key: Exclude<BorrowerFilter, "">; label: string; defn: string }[] = [
  { key: "stressed", label: "Marked under 90", defn: "Lenders carry the debt below 90 cents on the dollar of cost." },
  { key: "pik", label: "Paying in kind", defn: "Part of the coupon is paid in kind rather than cash." },
  { key: "maturing", label: "Maturing within 18 months", defn: "The earliest tagged maturity falls within eighteen months." },
  { key: "clubbed", label: "Held by several lenders", defn: "Held by more than one of the parsed lenders." },
];
const LIMIT = 300;

export default async function BorrowersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q, f } = await searchParams;
  const query = (q ?? "").trim();
  const filter = (FILTERS.some((x) => x.key === f) ? f : "") as BorrowerFilter;
  const [summary, rows, intelCounts, user] = await Promise.all([getBorrowerSummary(), searchBorrowers(query, filter, LIMIT), portcoIntelCounts(), getSessionUser()]);
  const intel = await getPortcoIntel(rows.map((r) => r.key));
  const enrichReady = user?.role === "admin" && Boolean(process.env.COMPANIES_HOUSE_API_KEY || process.env.LUSHA_API_KEY);
  const href = (nf: BorrowerFilter) => `/database/borrowers?${[query ? `q=${encodeURIComponent(query)}` : "", nf ? `f=${nf}` : ""].filter(Boolean).join("&")}`;
  const flagCount: Record<Exclude<BorrowerFilter, "">, number> = { stressed: summary.stressed, pik: summary.pik, maturing: summary.maturing, clubbed: summary.clubbed };
  const flagLabel = FILTERS.find((x) => x.key === filter)?.label;

  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes/private-credit", label: "Private credit" }, { label: "Borrowers" }]}
      kicker="Private credit"
      title="Borrowers"
      description="The private companies behind the loan books: who lends to each, how much, at what spread, whether any of it is paid in kind, when it matures, and how the lenders mark it. Folded from every parsed lender's latest schedule of investments; every figure is one a lender tagged in its own filing."
    >
      <StatStrip>
        <Stat label="Borrowers" value={summary.borrowers.toLocaleString("en-US")} basis={`${formatUsd(summary.fairValue)} at fair value`} />
        <Stat label="Marked under 90" value={summary.stressed.toLocaleString("en-US")} basis="fair value below 90% of cost" href={href("stressed")} />
        <Stat label="Paying in kind" value={summary.pik.toLocaleString("en-US")} basis="a PIK component tagged" href={href("pik")} />
        <Stat label="Maturing" value={summary.maturing.toLocaleString("en-US")} basis="within 18 months" href={href("maturing")} />
        <Stat label="Several lenders" value={summary.clubbed.toLocaleString("en-US")} basis="held by more than one" href={href("clubbed")} />
        <Stat label="Filed accounts" value={intelCounts.accounts.toLocaleString("en-US")} basis={`${intelCounts.rows.toLocaleString("en-US")} on the UK register`} defn="Borrowers and portfolio companies whose latest accounts filed at Companies House state a turnover or operating profit." />
      </StatStrip>

      <UrlFacets
        search={{ param: "q", placeholder: "Company name…" }}
        facets={[
          {
            param: "f",
            label: "Flag",
            searchable: false,
            width: 260,
            groups: [{ label: "", options: FILTERS.map((x) => ({ key: x.key, label: x.label, count: flagCount[x.key] })) }],
          },
        ]}
        count={{ value: rows.length, noun: rows.length >= LIMIT ? "borrowers shown, largest first" : "borrowers" }}
        right={<EnrichPortcosButton ready={enrichReady} />}
      >
        <Box
          title={query ? `Borrowers matching “${query}”` : flagLabel ?? "Largest borrowers"}
          count={rows.length}
          flush
          defn={`${FILTERS.find((x) => x.key === filter)?.defn ?? "Every borrower in a parsed lender's latest book."} Weighted by fair value. Mark is fair value over cost across the lenders that state both. Spread is over the reference rate.`}
        >
          {rows.length ? (
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th className="whitespace-nowrap">Instruments</th>
                    <th className="num">Lenders</th>
                    <th className="num">Fair value</th>
                    <th className="num defn" data-tip="Turnover in the latest accounts filed at Companies House, in the filer's currency.">Turnover</th>
                    <th className="num defn" data-tip="Operating profit plus depreciation and amortisation, each as filed; arithmetic, not a stated figure. Blank when any of the three is not tagged.">EBITDA</th>
                    <th className="num">Mark</th>
                    <th className="num">Spread</th>
                    <th className="num">Rate</th>
                    <th className="num">PIK</th>
                    <th>Next maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => {
                    const ci = intel.get(b.key);
                    const lead = financeLead(ci);
                    return (
                      <tr key={b.key} className="linked">
                        <td className="min-w-[220px] max-w-[360px]">
                          <Link href={portcoHref(b.key)} className="cover block truncate font-medium leading-snug" title={`${b.borrower} — the company: people, filed accounts, every lender's line`}>
                            {b.borrower}
                          </Link>
                          <div className="truncate text-[11px] text-muted-foreground" title={b.lender_names?.join(" · ")}>
                            {b.lender_names?.slice(0, 3).join(" · ")}
                            {(b.lender_names?.length ?? 0) > 3 ? " …" : ""}
                          </div>
                          {lead ? (
                            <div className="truncate text-[11px]" title={lead.title}>
                              <span className="text-muted-foreground">Finance: </span>
                              {lead.name}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-[260px] truncate whitespace-nowrap text-[11.5px] text-muted-foreground" title={b.instruments ?? undefined}>
                          {b.instruments ?? "—"}
                        </td>
                        <td className="num">{b.lenders}</td>
                        <td className="num">{formatUsd(b.fair_value ?? 0)}</td>
                        <td className="num">
                          {ci?.revenue != null ? (
                            <a href={ci.accounts_url ?? undefined} target="_blank" rel="noreferrer" className="hover:underline" title={`Accounts to ${ci.accounts_period_end ?? "latest period"}`}>
                              {formatMoney(ci.revenue, ci.currency)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="num">{ci?.ebitda_derived != null ? formatMoney(ci.ebitda_derived, ci.currency) : "—"}</td>
                        <td className={`num ${b.mark != null && b.mark < 0.9 ? "text-[var(--destructive)]" : ""}`}>{b.mark != null ? `${Math.round(b.mark * 100)}` : "—"}</td>
                        <td className="num">{b.spread != null ? `${Math.round(b.spread * 100)} bp` : "—"}</td>
                        <td className="num">{b.rate != null ? `${b.rate.toFixed(2)}%` : "—"}</td>
                        <td className="num">{b.pik_rate != null && b.pik_rate > 0 ? <Tag strong>{b.pik_rate.toFixed(2)}%</Tag> : "—"}</td>
                        <td className="whitespace-nowrap text-muted-foreground">{b.next_maturity ? dateLabel(b.next_maturity) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : query || filter ? (
            <Empty>
              No borrower matches this cut.{" "}
              <Link href="/database/borrowers" className="underline underline-offset-2 hover:text-foreground">
                Clear the filters
              </Link>{" "}
              to see the largest borrowers across every book.
            </Empty>
          ) : (
            <Empty>No borrowers on file yet. They appear as the database parses each lender&rsquo;s 10-Q and 10-K schedule of investments from EDGAR.</Empty>
          )}
        </Box>
      </UrlFacets>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="How lenders mark their books" defn="Borrowers by mark (fair value over cost, in cents on the dollar) across every parsed book.">
          <Columns rows={summary.markBins.map((b) => ({ label: b.label, value: b.count }))} height={100} />
        </Box>
        <Box title="Held by the most lenders" count={summary.mostLenders.length} flush defn="Club deals and syndications: the borrowers most of the parsed lenders share.">
          {summary.mostLenders.length ? (
            <ul className="divide-y">
              {summary.mostLenders.map((b) => (
                <li key={b.key} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <Link href={portcoHref(b.key)} className="min-w-0 flex-1 truncate font-medium">
                    {b.borrower}
                  </Link>
                  <span className="figure text-[11px] text-muted-foreground">{b.lenders} lenders</span>
                  <span className="figure w-16 text-right text-[11px]">{formatUsd(b.fairValue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No borrower is held by more than one parsed lender yet.</Empty>
          )}
        </Box>
      </div>
    </IntelShell>
  );
}
