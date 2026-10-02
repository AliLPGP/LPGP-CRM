import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { ASSET_CLASS_BY_KEY, type AssetClassKey } from "@/lib/directory/asset-classes";
import { FUND_TYPE_LABEL, couponLabel, instrumentGroup, type BookPosition, type CreditLender, type CreditPosition, type FundOffering } from "@/lib/directory/filings-types";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { Empty, Src, Tag } from "./ui";
import { dateLabel } from "./tables";

// Ledgers for the SEC filings layer: Form D raises and BDC loan books.
// Server components in the desk register.

function classTag(key: string | null) {
  const c = key ? ASSET_CLASS_BY_KEY[key as AssetClassKey] : null;
  return c ? (
    <Link href={`/database/asset-classes/${c.slug}`} className="tag hover:text-foreground">
      {c.short}
    </Link>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

export function OfferingTable({ rows, showClass = true, limit }: { rows: FundOffering[]; showClass?: boolean; limit?: number }) {
  const list = limit ? rows.slice(0, limit) : rows;
  if (!list.length) return <Empty>No Form D filings here yet. The database reads EDGAR a batch a minute; new filings land as they are parsed.</Empty>;
  return (
    <div className="desk-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Filed</th>
            <th>Fund · general partner</th>
            <th>Type</th>
            {showClass ? <th>Class</th> : null}
            <th className="num">Sold to date</th>
            <th className="num">Offering</th>
            <th className="num">Investors</th>
            <th>Placement agent</th>
            <th>Filing</th>
          </tr>
        </thead>
        <tbody>
          {list.map((o) => {
            const agent = o.placement_agents.find((a) => a.broker_dealer || a.name);
            return (
              <tr key={o.id} className={o.fund_id ? "linked" : undefined}>
                <td className="whitespace-nowrap text-muted-foreground">
                  {dateLabel(o.filing_date)}
                  {o.form === "D/A" ? <span className="ml-1 text-[10px]">amend.</span> : null}
                </td>
                <td className="min-w-[260px] max-w-[460px]">
                  {o.fund_id ? (
                    <Link href={`/funds/${o.fund_id}`} className="cover block truncate font-medium leading-snug" title={o.issuer_name}>
                      {o.issuer_name}
                    </Link>
                  ) : (
                    <span className="block truncate font-medium leading-snug" title={o.issuer_name}>
                      {o.issuer_name}
                    </span>
                  )}
                  <div className="mt-0.5 truncate text-[11.5px] leading-snug text-muted-foreground">
                    {o.gp_company_id ? <Link href={`/companies/${o.gp_company_id}`} className="text-foreground">{o.general_partner ?? "Manager"}</Link> : (o.general_partner ?? "GP not named")}
                    {o.state ? ` · ${o.state}` : ""}
                    {o.first_sale_date ? ` · first sale ${dateLabel(o.first_sale_date)}` : o.first_sale_pending ? " · no sale yet" : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap">
                  <Tag>{o.fund_type ? (FUND_TYPE_LABEL[o.fund_type] ?? o.fund_type) : (o.industry_group ?? "—")}</Tag>
                </td>
                {showClass ? <td>{classTag(o.asset_class)}</td> : null}
                <td className="num">{o.amount_sold ? formatMoney(o.amount_sold, "USD") : <span className="text-muted-foreground">0</span>}</td>
                <td className="num text-muted-foreground">{o.offering_indefinite ? "Indefinite" : o.offering_amount ? formatMoney(o.offering_amount, "USD") : "—"}</td>
                <td className="num text-muted-foreground">{o.investors_count ?? "—"}</td>
                <td className="max-w-[200px] truncate text-[11.5px] text-muted-foreground">{agent ? (agent.broker_dealer || agent.name) : "—"}</td>
                <td>
                  <Src url={o.source_url} name={`Form ${o.form}`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function LenderTable({ rows }: { rows: CreditLender[] }) {
  if (!rows.length) return <Empty>No loan books parsed yet. Lenders appear as their 10-Q and 10-K filings are read.</Empty>;
  const max = rows[0]?.fair_value_total ?? 1;
  return (
    <div className="desk-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Lender</th>
            <th>Ticker</th>
            <th>As of</th>
            <th className="num">Positions</th>
            <th className="num">Portfolio at fair value</th>
            <th />
            <th>Filing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.cik} className="linked">
              <td className="min-w-[220px]">
                <Link href={`/database/lenders/${l.cik}`} className="cover block font-medium">
                  {l.name}
                </Link>
                {l.company_id ? (
                  <Link href={`/companies/${l.company_id}`} className="relative z-[1] text-[11px] text-muted-foreground hover:text-foreground">
                    manager in the directory
                  </Link>
                ) : null}
              </td>
              <td className="figure text-muted-foreground">{l.ticker ?? "—"}</td>
              <td className="whitespace-nowrap text-muted-foreground">{dateLabel(l.latest_period)}</td>
              <td className="num">{l.positions_count?.toLocaleString("en-US") ?? "—"}</td>
              <td className="num">{formatMoney(l.fair_value_total, "USD")}</td>
              <td className="w-24">
                <span className="inline-block h-[4px] w-full overflow-hidden rounded-[2px] bar-track">
                  <span className="block h-full bar-fill" style={{ width: `${Math.round(((l.fair_value_total ?? 0) / (max || 1)) * 100)}%` }} />
                </span>
              </td>
              <td className="relative z-[1]">
                <Src url={l.source_url} name={l.latest_form ?? "filing"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PositionTable({ rows, showLender = false, limit }: { rows: (CreditPosition | BookPosition)[]; showLender?: boolean; limit?: number }) {
  const list = limit ? rows.slice(0, limit) : rows;
  if (!list.length) return <Empty>No position matches. Books tag the borrower&rsquo;s legal name, so a shorter name finds more.</Empty>;
  return (
    <div className="desk-scroll">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Borrower</th>
            {showLender ? <th>Lender</th> : null}
            <th>Instrument</th>
            <th>Coupon</th>
            <th className="num">Principal</th>
            <th className="num">Cost</th>
            <th className="num">Fair value</th>
            <th className="num">Mark</th>
            <th>Maturity</th>
          </tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const mark = p.cost && p.fair_value != null ? (p.fair_value / p.cost) * 100 : null;
            return (
              <tr key={p.id} className="linked">
                <td className="min-w-[220px] max-w-[380px]">
                  {p.borrower_company_id ? (
                    <Link href={`/companies/${p.borrower_company_id}`} className="cover block truncate font-medium leading-snug" title={p.borrower}>
                      {p.borrower}
                    </Link>
                  ) : (
                    <Link href={`/database/lenders?q=${encodeURIComponent(p.borrower)}`} className="cover block truncate font-medium leading-snug" title={`${p.borrower} — every lender holding this borrower`}>
                      {p.borrower}
                    </Link>
                  )}
                  {p.industry ? <div className="truncate text-[11px] text-muted-foreground">{p.industry}</div> : null}
                </td>
                {showLender ? (
                  <td className="whitespace-nowrap">
                    <Link href={`/database/lenders/${p.lender_cik}`} className="inline-flex items-center gap-1.5">
                      <CompanyLogo name={"lender_name" in p ? p.lender_name : p.lender_cik} domain={null} size={16} />
                      {"lender_name" in p ? p.lender_name : p.lender_cik}
                    </Link>
                  </td>
                ) : null}
                <td className="max-w-[240px]">
                  <span className="block truncate" title={p.instrument ?? undefined}>{p.instrument ?? "—"}</span>
                  <span className="text-[10.5px] text-muted-foreground">{instrumentGroup(p.instrument ?? p.identifier)}</span>
                </td>
                <td className="figure whitespace-nowrap text-[11.5px]">{couponLabel(p)}</td>
                <td className="num">{formatMoney(p.principal, "USD")}</td>
                <td className="num text-muted-foreground">{formatMoney(p.cost, "USD")}</td>
                <td className="num">{formatMoney(p.fair_value, "USD")}</td>
                <td className={`num ${mark != null && mark < 90 ? "text-[var(--destructive)]" : "text-muted-foreground"}`}>{mark != null ? `${mark.toFixed(0)}%` : "—"}</td>
                <td className="whitespace-nowrap text-muted-foreground">{p.maturity ? dateLabel(p.maturity) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
