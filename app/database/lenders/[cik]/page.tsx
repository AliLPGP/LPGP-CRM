import Link from "next/link";
import { notFound } from "next/navigation";
import { getCreditLender, getLenderBook, getLenderPeriods } from "@/lib/directory/filings-queries";
import { INSTRUMENT_HUE, instrumentGroup } from "@/lib/directory/filings-types";
import { PositionTable } from "@/components/intel/filings-tables";
import { Columns, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Src, Stat, StatStrip, SubTabs } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ cik: string }> }) {
  const { cik } = await params;
  const lender = await getCreditLender(cik);
  return { title: lender ? `${lender.name} — loan book — LPGP Intelligence` : "Loan book — LPGP Intelligence" };
}

export default async function LenderPage({ params, searchParams }: { params: Promise<{ cik: string }>; searchParams: Promise<{ as_of?: string; group?: string; q?: string }> }) {
  const [{ cik }, { as_of, group, q }] = await Promise.all([params, searchParams]);
  const lender = await getCreditLender(cik);
  if (!lender) notFound();
  const period = as_of && /^\d{4}-\d\d-\d\d$/.test(as_of) ? as_of : lender.latest_period;
  const [book, periods] = await Promise.all([getLenderBook(cik, period), getLenderPeriods(cik)]);
  const query = (q ?? "").trim().toLowerCase();
  const groups = new Map<string, { value: number; count: number }>();
  const spreads = new Map<number, number>();
  let fv = 0, wSpread = 0, wBase = 0;
  for (const p of book) {
    const v = Number(p.fair_value ?? 0);
    fv += v;
    const g = instrumentGroup(p.instrument ?? p.identifier);
    const gi = groups.get(g) ?? { value: 0, count: 0 };
    gi.value += v; gi.count += 1; groups.set(g, gi);
    if (p.spread != null && p.spread > 0 && p.spread < 30) {
      const bin = Math.min(12, Math.floor(p.spread));
      spreads.set(bin, (spreads.get(bin) ?? 0) + 1);
      wSpread += p.spread * Math.max(v, 1); wBase += Math.max(v, 1);
    }
  }
  const groupList = [...groups.entries()].sort((a, b) => b[1].value - a[1].value);
  const rows = book.filter((p) => (!group || instrumentGroup(p.instrument ?? p.identifier) === group) && (!query || p.borrower.toLowerCase().includes(query) || p.identifier.toLowerCase().includes(query)));
  const borrowers = new Set(book.map((p) => p.borrower.toLowerCase())).size;
  const base = `/database/lenders/${cik}`;
  const withPeriod = (extra: string) => `${base}?${[period && period !== lender.latest_period ? `as_of=${period}` : "", extra].filter(Boolean).join("&")}`;

  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes/private-credit", label: "Private credit" }, { href: "/database/lenders", label: "Loan books" }, { label: lender.name }]}
      kicker={`Business development company${lender.ticker ? ` · ${lender.ticker}` : ""}`}
      title={lender.name}
      description={
        <>
          Schedule of investments as tagged in the lender&rsquo;s {lender.latest_form ?? "filing"} for {dateLabel(period)}.
          {lender.company_id ? (
            <>
              {" "}Managed by a firm in the directory: <Link href={`/companies/${lender.company_id}`} className="text-foreground underline-offset-2 hover:underline">open the manager</Link>.
            </>
          ) : null}
        </>
      }
      actions={
        <>
          <Src url={lender.source_url} name={`${lender.latest_form ?? "Filing"} on EDGAR`} className="text-[12px]" />
          <form action={base} className="flex items-center gap-1.5">
            {period && period !== lender.latest_period ? <input type="hidden" name="as_of" value={period} /> : null}
            <input id="book-search" name="q" defaultValue={q ?? ""} placeholder="Borrower or instrument…" className="h-8 w-52 rounded-[4px] border bg-card px-2.5 text-[12px] outline-none focus:border-foreground" />
          </form>
        </>
      }
      tabs={
        periods.length > 1 ? (
          <SubTabs items={periods.map((p) => ({ href: p.as_of === lender.latest_period ? base : `${base}?as_of=${p.as_of}`, label: dateLabel(p.as_of), count: p.positions, active: p.as_of === period }))} />
        ) : null
      }
    >
      <StatStrip>
        <Stat label="Positions" value={book.length.toLocaleString("en-US")} basis={`${borrowers.toLocaleString("en-US")} borrowers`} />
        <Stat label="Fair value" value={fv ? formatUsd(fv) : "—"} basis="per-borrower totals excluded" />
        <Stat label="Avg. spread" value={wBase ? `${Math.round((wSpread / wBase) * 100)} bp` : "—"} basis="weighted by fair value" />
        <Stat label="First lien" value={groupList.length ? `${Math.round(((groups.get("First lien / senior secured")?.value ?? 0) / (fv || 1)) * 100)}%` : "—"} basis="of fair value" />
        <Stat label="Periods" value={periods.length} basis="parsed so far" />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Box title="Fair value by seniority">
          <ShareBar segments={groupList.map(([label, v]) => ({ key: label, label, value: v.value, hue: INSTRUMENT_HUE[label] }))} format={(v) => formatUsd(v)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {group ? (
              <Link href={withPeriod("")} className="tag hover:text-foreground">
                All instruments
              </Link>
            ) : null}
            {groupList.map(([label, v]) => (
              <Link key={label} href={withPeriod(`group=${encodeURIComponent(label)}`)} className={`tag hover:text-foreground ${group === label ? "bg-foreground text-background" : ""}`}>
                {label} <span className="figure opacity-70">{v.count}</span>
              </Link>
            ))}
          </div>
        </Box>
        <Box title="Spread distribution" defn="Positions by spread over the reference rate, in 100 bp bins.">
          <Columns rows={[...spreads.entries()].sort((a, b) => a[0] - b[0]).map(([bin, count]) => ({ label: bin >= 12 ? "1200+" : `${bin * 100}`, value: count }))} height={100} />
        </Box>
      </div>

      <Box title={group ? `Positions · ${group}` : "Positions"} count={rows.length} flush defn="One row per tagged position. Coupon reads reference rate plus spread in basis points, then the all-in rate the filer states. Mark is fair value over cost.">
        <PositionTable rows={rows} />
      </Box>
    </IntelShell>
  );
}
