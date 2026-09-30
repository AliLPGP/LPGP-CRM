import Link from "next/link";
import { getBookSummary, listCreditLenders, searchBook } from "@/lib/directory/filings-queries";
import { INSTRUMENT_HUE } from "@/lib/directory/filings-types";
import { LenderTable, PositionTable } from "@/components/intel/filings-tables";
import { Columns, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { Box, Empty, Stat, StatStrip } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Loan books — LPGP Connect" };

export default async function LendersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const [lenders, summary, hits] = await Promise.all([listCreditLenders(), getBookSummary(), query ? searchBook(query) : Promise.resolve([])]);
  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes/private-credit", label: "Private credit" }, { label: "Loan books" }]}
      kicker="Private credit"
      title="Loan books"
      description="Every loan the listed and non-traded business development companies hold, position by position, as each lender tags it in its own 10-Q and 10-K: borrower, instrument, coupon, principal, cost and fair value. Read straight from EDGAR; nothing is estimated."
      actions={
        <form action="/database/lenders" className="flex items-center gap-1.5">
          <input
            id="borrower-search"
            name="q"
            defaultValue={query}
            placeholder="Find a borrower across every book…"
            className="h-8 w-64 rounded-[4px] border bg-card px-2.5 text-[12px] outline-none focus:border-foreground"
          />
          <button type="submit" className="h-8 rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent">
            Search
          </button>
        </form>
      }
    >
      <StatStrip>
        <Stat label="Lenders" value={summary.lenders.toLocaleString("en-US")} basis="BDCs with a parsed book" />
        <Stat label="Positions" value={summary.positions.toLocaleString("en-US")} basis="at each lender's latest period" />
        <Stat label="Fair value" value={summary.fairValue ? formatUsd(summary.fairValue) : "—"} basis="totals per borrower excluded" defn="The sum of every position's fair value as filed. A lender's own per-borrower subtotal is left out so a loan is counted once." />
        <Stat label="Avg. spread" value={summary.avgSpread != null ? `${Math.round(summary.avgSpread * 100)} bp` : "—"} basis="weighted by fair value" defn="Spread over the reference rate, weighted by each position's fair value, across positions that tag one." />
        <Stat label="Avg. coupon" value={summary.avgRate != null ? `${summary.avgRate.toFixed(2)}%` : "—"} basis="all-in rate, weighted" />
      </StatStrip>

      {query ? (
        <Box title={`Borrower search · “${query}”`} count={hits.length} flush action={<Link href="/database/lenders" className="text-[11.5px] text-muted-foreground hover:text-foreground">Clear</Link>}>
          <PositionTable rows={hits} showLender />
        </Box>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Box title="Lenders" count={lenders.length} flush defn="Business development companies whose schedule of investments the database has parsed. Ranked by portfolio fair value at the latest period.">
            <LenderTable rows={lenders} />
          </Box>
        </div>
        <div className="space-y-4">
          <Box title="Fair value by seniority" defn="Positions grouped by what their tagged instrument says: first lien and senior secured, second lien, subordinated, preferred, equity and warrants.">
            <ShareBar segments={summary.byInstrument.map((s) => ({ key: s.label, label: s.label, value: s.value, hue: INSTRUMENT_HUE[s.label] }))} format={(v) => formatUsd(v)} />
          </Box>
          <Box title="Spread distribution" defn="Positions by spread over the reference rate, in 100 bp bins, across every parsed book.">
            {summary.spreadBins.length ? <Columns rows={summary.spreadBins.map((b) => ({ label: b.label, value: b.count }))} height={100} /> : <Empty>No spreads tagged yet.</Empty>}
          </Box>
          <Box title="Borrowers held by several lenders" count={summary.shared.length} flush defn="Borrowers that appear in more than one lender's book at the latest period, matched by name. Club deals and syndications show up here.">
            {summary.shared.length ? (
              <ul className="divide-y">
                {summary.shared.slice(0, 15).map((b) => (
                  <li key={b.borrower} className="flex items-center gap-2 px-3 py-1.5 text-[12px]">
                    <Link href={`/database/lenders?q=${encodeURIComponent(b.borrower)}`} className="min-w-0 flex-1 truncate font-medium">
                      {b.borrower}
                    </Link>
                    <span className="figure text-[11px] text-muted-foreground">{b.lenders} lenders</span>
                    <span className="figure w-16 text-right text-[11px]">{formatUsd(b.fairValue)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing shared yet.</Empty>
            )}
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
