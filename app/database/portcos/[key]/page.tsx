import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/company-logo";
import { PositionTable } from "@/components/intel/filings-tables";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel, SignalList } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { borrowerPositions, getBorrower, getPortcoIntel, portcoHolders } from "@/lib/directory/filings-queries";
import { signalsNaming } from "@/lib/directory/intelligence-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { LEAD_ROLE_LABEL, leadership, type PortcoIntel } from "@/lib/directory/portco-intel";
import { DEAL_BASIS_LABEL } from "@/lib/directory/portfolio";
import { getPortcoDeals } from "@/lib/directory/portco-queries";
import { InvestmentLedger, InvestmentStrip, moneyFacts } from "@/components/intel/investments";
import { ProfileFacts } from "@/components/intel/portco-profile";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { AMOUNT_BASIS_LABEL } from "@/lib/directory/intelligence-types";
import { formatUsd } from "@/lib/utils";

// A company behind the deals: a sponsor's portfolio company, a lender's
// borrower, or both. Everything here is on file somewhere -- the sponsor's
// own site, a lender's schedule of investments, the UK register's filed
// accounts, a people-database preview -- and each panel says where.

export const dynamic = "force-dynamic";

const REGISTER = "https://find-and-update.company-information.service.gov.uk/company/";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const k = decodeURIComponent(key);
  const [intel, borrower, holders, deals] = await Promise.all([getPortcoIntel([k]), getBorrower(k), portcoHolders(k), getPortcoDeals(k)]);
  const name = holders[0]?.name ?? intel.get(k)?.name ?? borrower?.borrower ?? deals[0]?.target;
  return { title: name ? `${name} — LPGP Intelligence` : "Company — LPGP Intelligence" };
}

function Money({ v, ccy }: { v: number | null; ccy: string | null }) {
  return <>{v == null ? "—" : formatMoney(v, ccy)}</>;
}

function Accounts({ intel }: { intel: PortcoIntel }) {
  const period = intel.accounts_period_end ? `accounts to ${dateLabel(intel.accounts_period_end)}` : "latest filed accounts";
  const has = intel.revenue != null || intel.operating_profit != null || intel.net_assets != null;
  if (!has) return null;
  return (
    <StatStrip>
      <Stat label="Turnover" value={<Money v={intel.revenue} ccy={intel.currency} />} basis={period} href={intel.accounts_url ?? undefined} defn="Turnover as tagged in the accounts filed at Companies House." />
      <Stat label="EBITDA" value={<Money v={intel.ebitda_derived} ccy={intel.currency} />} basis="operating profit + D&A, arithmetic" defn="Operating profit plus depreciation and amortisation, each as filed. Not a stated figure; blank when any of the three is not tagged." />
      <Stat label="Operating profit" value={<Money v={intel.operating_profit} ccy={intel.currency} />} basis={period} />
      <Stat label="Profit before tax" value={<Money v={intel.profit_before_tax} ccy={intel.currency} />} basis={period} />
      <Stat label="Net assets" value={<Money v={intel.net_assets} ccy={intel.currency} />} basis={period} />
      <Stat label="Cash" value={<Money v={intel.cash} ccy={intel.currency} />} basis={period} />
      <Stat label="Employees" value={intel.employees != null ? intel.employees.toLocaleString("en-US") : "—"} basis="average over the period" />
    </StatStrip>
  );
}

export default async function PortcoPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const k = decodeURIComponent(key);
  const [intelMap, borrower, holders, deals] = await Promise.all([getPortcoIntel([k]), getBorrower(k), portcoHolders(k), getPortcoDeals(k)]);
  const intel = intelMap.get(k) ?? null;
  if (!intel && !borrower && !holders.length && !deals.length) notFound();
  const name = holders[0]?.name ?? intel?.name ?? borrower?.borrower ?? deals[0].target;
  const money = moneyFacts(deals);
  const backers = new Set(deals.flatMap((d) => [d.investor, ...(d.co_investors ?? [])]).filter((x) => x && x !== "Undisclosed"));
  const firstYear = deals.map((d) => (d.date ? Number(d.date.slice(0, 4)) : null)).filter((y): y is number => y != null).sort()[0];
  const domain = intel?.domain ?? holders.find((h) => h.domain)?.domain ?? null;
  const [positions, signals] = await Promise.all([borrower ? borrowerPositions(k) : [], signalsNaming([name], 12)]);
  const people = intel ? leadership(intel) : [];
  const ukName = /\b(limited|ltd|plc|llp)\b/i.test(name);

  const registerLine = intel?.ch_number
    ? [intel.ch_status ? intel.ch_status.replace(/-/g, " ") : null, intel.ch_type ? intel.ch_type.replace(/-/g, " ") : null, intel.incorporated_on ? `incorporated ${dateLabel(intel.incorporated_on)}` : null].filter(Boolean).join(" · ")
    : null;

  return (
    <IntelShell
      crumbs={borrower ? [{ href: "/database/asset-classes/private-credit", label: "Private credit" }, { href: "/database/borrowers", label: "Borrowers" }, { label: name }] : [{ href: "/database/portcos", label: "Portfolio companies" }, { label: name }]}
      kicker={holders.length && borrower ? "Portfolio company · borrower" : holders.length ? "Portfolio company" : "Borrower"}
      title={
        <span className="flex items-center gap-3">
          <CompanyLogo name={name} domain={domain} size={32} />
          {name}
        </span>
      }
      description={
        registerLine ??
        (holders.length
          ? [holders[0].description, holders[0].sector, holders[0].hq].filter(Boolean).join(" · ") || `Held by ${holders.map((h) => h.gp_name).filter(Boolean).join(", ")}.`
          : `In ${borrower?.lenders ?? 0} lender${borrower?.lenders === 1 ? "" : "s"}' latest schedule of investments.`)
      }
    >
      {deals.length ? (
        <StatStrip>
          <Stat label="Deals on file" value={String(deals.length)} basis={`${deals.filter((d) => d.verified).length} checked against their page`} />
          {money.largest.slice(0, 2).map((t) => (
            <Stat
              key={t.currency}
              label={`Largest stated, ${t.currency}`}
              value={formatMoney(t.amount, t.currency)}
              basis={`${AMOUNT_BASIS_LABEL[t.basis ?? "unspecified"] ?? "as reported"} · ${(DEAL_KIND_LABEL[t.kind] ?? t.kind).toLowerCase()}`}
              href={`/database/deals/${t.id}`}
              defn="The biggest figure any announcement states for a deal around this company, in its own currency. An enterprise value is the whole company's price, not the sponsor's cheque."
            />
          ))}
          {money.raised.slice(0, 2).map((t) => (
            <Stat key={`r-${t.currency}`} label={`Raised in rounds, ${t.currency}`} value={formatMoney(t.total, t.currency)} basis={`${t.n} round${t.n === 1 ? "" : "s"} with a stated size`} defn="Funding rounds whose size the announcement states, added together within one currency. Currencies are never converted into each other." />
          ))}
          {!money.largest.length ? <Stat label="Stated amounts" value="—" basis="no announcement states a figure" /> : null}
          <Stat label="Investors named" value={String(backers.size)} basis="leads and co-investors" />
          <Stat label="First on file" value={firstYear ? String(firstYear) : "—"} basis="earliest dated announcement" />
        </StatStrip>
      ) : null}
      {intel ? <Accounts intel={intel} /> : null}

      {borrower ? (
        <StatStrip>
          <Stat label="Lenders" value={String(borrower.lenders)} basis={`${borrower.positions} positions`} defn="Parsed lenders whose latest schedule of investments names this borrower." />
          <Stat label="Fair value" value={formatUsd(borrower.fair_value ?? 0)} basis={borrower.as_of ? `as of ${dateLabel(borrower.as_of)}` : "latest books"} />
          <Stat label="Mark" value={borrower.mark != null ? String(Math.round(borrower.mark * 100)) : "—"} basis="fair value over cost, cents on the dollar" />
          <Stat label="Spread" value={borrower.spread != null ? `${Math.round(borrower.spread * 100)} bp` : "—"} basis="fair-value weighted, over the reference rate" />
          <Stat label="Rate" value={borrower.rate != null ? `${borrower.rate.toFixed(2)}%` : "—"} basis="fair-value weighted" />
          <Stat label="PIK" value={borrower.pik_rate != null && borrower.pik_rate > 0 ? `${borrower.pik_rate.toFixed(2)}%` : "none tagged"} basis="highest tagged PIK component" />
          <Stat label="Next maturity" value={borrower.next_maturity ? dateLabel(borrower.next_maturity) : "—"} basis="earliest tagged" />
        </StatStrip>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Box
            title="Profile"
            flush
            action={
              holders.length ? (
                <a href={`/api/directory/portcos/export?sponsor=${holders[0].gp_company_id}`} className="text-[11px] text-muted-foreground hover:text-foreground">
                  Sponsor sheet ↓
                </a>
              ) : null
            }
            defn="The company as an adviser's sheet lays it out. Revenue, EBITDA, employees and named executives appear only from primary sources (filings, the company, the sponsor, their releases) or major financial press; each value links to its page, and the check mark means the source is primary or major press. Hover a source for the sentence it states."
          >
            <ProfileFacts intel={intel} holdings={holders} />
          </Box>
          <Box title="Investments and commitments" count={deals.length || null} flush defn="Every announcement on file that commits money to this company: buyouts, stakes, rounds with each named investor, add-ons it made, financings and exits. Each figure is as the page states it, with what it is; a checked mark means it was re-read against the page before it was stored.">
            {deals.length ? <InvestmentStrip deals={deals} /> : null}
            <InvestmentLedger deals={deals} />
          </Box>
          <Box title="People" count={people.length || null} flush defn="Finance and operations first. A people-database preview names executives by title; the register lists the appointed officers with the occupation each declared.">
            {people.length ? (
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Runs</th>
                    <th>Since</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p, i) => (
                    <tr key={`${p.source}-${p.name}-${i}`}>
                      <td className="font-medium">
                        {p.linkedin_url ? (
                          <a href={p.linkedin_url} target="_blank" rel="noreferrer" className="hover:underline">
                            {p.name}
                          </a>
                        ) : (
                          p.name
                        )}
                      </td>
                      <td className="text-muted-foreground">{p.title}</td>
                      <td>{p.role !== "other" ? <Tag strong={p.role !== "chief"}>{LEAD_ROLE_LABEL[p.role]}</Tag> : "—"}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{p.since ? dateLabel(p.since) : "—"}</td>
                      <td className="text-[11px] text-muted-foreground">{p.source === "lusha" ? "People search preview" : "Companies House"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>
                {intel?.ch_at
                  ? "The register lists no current officers, and no executive preview names anyone for this domain."
                  : ukName
                    ? "Not looked up yet. The daily enrichment reads the register's officers and the latest accounts; an admin can run it now from the Borrowers desk."
                    : "No UK register entry to read. Executive previews need the company's domain on file."}
              </Empty>
            )}
          </Box>

          {borrower ? (
            <Box title="In the loan books" count={positions.length} flush defn="Every position naming this borrower in each parsed lender's latest schedule of investments, as the lender tagged it.">
              <PositionTable rows={positions} showLender limit={100} />
            </Box>
          ) : null}
        </div>

        <div className="space-y-4">
          {holders.length ? (
            <Box title="Held by" count={holders.length} flush defn="Sponsors whose own site or press names this company in their portfolio.">
              <ul className="divide-y">
                {holders.map((h) => (
                  <li key={h.id} className="px-3 py-2 text-[12px]">
                    <Link href={`/companies/${h.gp_company_id}?tab=portfolio`} className="flex items-center gap-2 font-medium hover:underline">
                      <CompanyLogo name={h.gp_name ?? "Sponsor"} domain={h.gp_domain} size={18} />
                      {h.gp_name ?? "Sponsor"}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {h.status ? <Tag>{h.status}</Tag> : null}
                      {h.invested_year ? <span>since {h.invested_year}</span> : null}
                      {h.exit_year ? <span>exited {h.exit_year}</span> : null}
                      {h.fund_name ? <span>{h.fund_name}</span> : null}
                      <Src url={h.source_url} name="Source" />
                    </div>
                    {h.deal_value != null || h.equity_invested != null || h.stake_pct != null ? (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px]">
                        {h.deal_value != null ? (
                          <span>
                            <span className="figure">{formatMoney(h.deal_value, h.deal_currency)}</span>
                            <span className="text-muted-foreground"> {DEAL_BASIS_LABEL[h.deal_value_basis ?? "unspecified"]}</span>
                          </span>
                        ) : null}
                        {h.equity_invested != null ? (
                          <span>
                            <span className="figure">{formatMoney(h.equity_invested, h.deal_currency)}</span>
                            <span className="text-muted-foreground"> equity invested</span>
                          </span>
                        ) : null}
                        {h.stake_pct != null ? <span className="text-muted-foreground">{h.stake_pct}% stake</span> : null}
                        {h.co_investors?.length ? <span className="text-muted-foreground">with {h.co_investors.join(", ")}</span> : null}
                        <Src url={h.deal_source_url} name="Stated by" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}

          <Box title="On the register" defn="Companies House, the UK register. Facts as the register states them.">
            {intel?.ch_number ? (
              <dl className="kv text-[12px]">
                <dt>Company</dt>
                <dd>
                  <a href={`${REGISTER}${intel.ch_number}`} target="_blank" rel="noreferrer" className="hover:underline">
                    {intel.ch_name ?? name} · {intel.ch_number}
                  </a>
                </dd>
                <dt>Status</dt>
                <dd>{intel.ch_status?.replace(/-/g, " ") ?? "—"}</dd>
                <dt>Type</dt>
                <dd>{intel.ch_type?.replace(/-/g, " ") ?? "—"}</dd>
                <dt>Incorporated</dt>
                <dd>{intel.incorporated_on ? dateLabel(intel.incorporated_on) : "—"}</dd>
                <dt>SIC</dt>
                <dd>{intel.sic_codes.length ? intel.sic_codes.join(", ") : "—"}</dd>
                <dt>Registered office</dt>
                <dd>{intel.registered_address ?? "—"}</dd>
                <dt>Accounts</dt>
                <dd>
                  {intel.accounts_url ? (
                    <a href={intel.accounts_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {intel.accounts_type ?? "Filed"}
                      {intel.accounts_period_end ? `, to ${dateLabel(intel.accounts_period_end)}` : ""}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
                {intel.gross_profit != null || intel.creditors_over_year != null ? (
                  <>
                    <dt>Gross profit</dt>
                    <dd>
                      <Money v={intel.gross_profit} ccy={intel.currency} />
                    </dd>
                    <dt>Creditors over a year</dt>
                    <dd>
                      <Money v={intel.creditors_over_year} ccy={intel.currency} />
                    </dd>
                  </>
                ) : null}
                <dt>Read</dt>
                <dd>{intel.ch_at ? dateLabel(intel.ch_at) : "—"}</dd>
              </dl>
            ) : (
              <Empty>{intel?.ch_at ? "No register entry matched this name." : ukName ? "Not looked up yet." : "Not a UK-registered name; the register only holds UK companies."}</Empty>
            )}
          </Box>

          <Box title="Signals naming it" count={signals.length || null} flush>
            {signals.length ? <SignalList signals={signals} limit={12} /> : <Empty>No signal names this company.</Empty>}
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
