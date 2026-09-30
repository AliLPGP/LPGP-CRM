import Link from "next/link";
import { getBorrowerSummary, searchBorrowers, type BorrowerFilter } from "@/lib/directory/filings-queries";
import { Columns } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Empty, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Borrowers — LPGP Connect" };

const FILTERS: { key: BorrowerFilter; label: string; defn: string }[] = [
  { key: "", label: "All", defn: "Every borrower in a parsed lender's latest book." },
  { key: "stressed", label: "Marked under 90", defn: "Lenders carry the debt below 90 cents on the dollar of cost." },
  { key: "pik", label: "Paying in kind", defn: "Part of the coupon is paid in kind rather than cash." },
  { key: "maturing", label: "Maturing within 18 months", defn: "The earliest tagged maturity falls within eighteen months." },
  { key: "clubbed", label: "Several lenders", defn: "Held by more than one of the parsed lenders." },
];

export default async function BorrowersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  const { q, f } = await searchParams;
  const query = (q ?? "").trim();
  const filter = (FILTERS.some((x) => x.key === f) ? f : "") as BorrowerFilter;
  const [summary, rows] = await Promise.all([getBorrowerSummary(), searchBorrowers(query, filter)]);
  const href = (nf: BorrowerFilter) => `/database/borrowers?${[query ? `q=${encodeURIComponent(query)}` : "", nf ? `f=${nf}` : ""].filter(Boolean).join("&")}`;

  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes/private-credit", label: "Private credit" }, { label: "Borrowers" }]}
      kicker="Private credit"
      title="Borrowers"
      description="The private companies behind the loan books: who lends to each, how much, at what spread, whether any of it is paid in kind, when it matures, and how the lenders mark it. Folded from every parsed lender's latest schedule of investments; every figure is one a lender tagged in its own filing."
      actions={
        <form action="/database/borrowers" className="flex items-center gap-1.5">
          {filter ? <input type="hidden" name="f" value={filter} /> : null}
          <input id="borrower-q" name="q" defaultValue={query} placeholder="Company name…" className="h-8 w-56 rounded-[4px] border bg-card px-2.5 text-[12px] outline-none focus:border-foreground" />
          <button type="submit" className="h-8 rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent">
            Search
          </button>
        </form>
      }
    >
      <StatStrip>
        <Stat label="Borrowers" value={summary.borrowers.toLocaleString("en-US")} basis={`${formatUsd(summary.fairValue)} at fair value`} />
        <Stat label="Marked under 90" value={summary.stressed.toLocaleString("en-US")} basis="fair value below 90% of cost" href={href("stressed")} />
        <Stat label="Paying in kind" value={summary.pik.toLocaleString("en-US")} basis="a PIK component tagged" href={href("pik")} />
        <Stat label="Maturing" value={summary.maturing.toLocaleString("en-US")} basis="within 18 months" href={href("maturing")} />
        <Stat label="Several lenders" value={summary.clubbed.toLocaleString("en-US")} basis="held by more than one" href={href("clubbed")} />
      </StatStrip>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <Link key={x.key || "all"} href={href(x.key)} className={`tag defn hover:text-foreground ${filter === x.key ? "bg-foreground text-background" : ""}`} data-tip={x.defn}>
            {x.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Box title={query ? `Borrowers matching “${query}”` : FILTERS.find((x) => x.key === filter)?.label === "All" ? "Largest borrowers" : FILTERS.find((x) => x.key === filter)?.label} count={rows.length} flush defn="Weighted by fair value. Mark is fair value over cost across the lenders that state both. Spread is over the reference rate.">
          {rows.length ? (
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Borrower</th>
                    <th>Instruments</th>
                    <th className="num">Lenders</th>
                    <th className="num">Fair value</th>
                    <th className="num">Mark</th>
                    <th className="num">Spread</th>
                    <th className="num">Rate</th>
                    <th className="num">PIK</th>
                    <th>Next maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.key}>
                      <td className="min-w-[220px] max-w-[360px]">
                        <Link href={`/database/lenders?q=${encodeURIComponent(b.borrower)}`} className="font-medium leading-snug" title="Every position in this borrower, by lender">
                          {b.borrower}
                        </Link>
                        <div className="truncate text-[11px] text-muted-foreground">{b.lender_names?.slice(0, 3).join(" · ")}{(b.lender_names?.length ?? 0) > 3 ? " …" : ""}</div>
                      </td>
                      <td className="max-w-[220px] text-[11.5px] text-muted-foreground">{b.instruments ?? "—"}</td>
                      <td className="num">{b.lenders}</td>
                      <td className="num">{formatUsd(b.fair_value ?? 0)}</td>
                      <td className={`num ${b.mark != null && b.mark < 0.9 ? "text-[var(--destructive)]" : ""}`}>{b.mark != null ? `${Math.round(b.mark * 100)}` : "—"}</td>
                      <td className="num">{b.spread != null ? `${Math.round(b.spread * 100)} bp` : "—"}</td>
                      <td className="num">{b.rate != null ? `${b.rate.toFixed(2)}%` : "—"}</td>
                      <td className="num">{b.pik_rate != null && b.pik_rate > 0 ? <Tag strong>{b.pik_rate.toFixed(2)}%</Tag> : "—"}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{b.next_maturity ? dateLabel(b.next_maturity) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No borrowers match.</Empty>
          )}
        </Box>
        <div className="space-y-4">
          <Box title="How lenders mark their books" defn="Borrowers by mark (fair value over cost, in cents on the dollar) across every parsed book.">
            <Columns rows={summary.markBins.map((b) => ({ label: b.label, value: b.count }))} height={100} />
          </Box>
          <Box title="Held by the most lenders" count={summary.mostLenders.length} flush defn="Club deals and syndications: the borrowers most of the parsed lenders share.">
            <ul className="divide-y">
              {summary.mostLenders.map((b) => (
                <li key={b.key} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                  <Link href={`/database/lenders?q=${encodeURIComponent(b.borrower)}`} className="min-w-0 flex-1 truncate font-medium">
                    {b.borrower}
                  </Link>
                  <span className="figure text-[11px] text-muted-foreground">{b.lenders} lenders</span>
                  <span className="figure w-16 text-right text-[11px]">{formatUsd(b.fairValue)}</span>
                </li>
              ))}
            </ul>
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
