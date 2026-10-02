import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { TabPanel } from "@/components/directory/profile-sections";
import { OfferingTable } from "@/components/intel/filings-tables";
import { FundProfile as FundProfileSections } from "@/components/intel/fund-profile";
import { IntelShell } from "@/components/intel/shell";
import { dateLabel } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import { getFundOfferings } from "@/lib/directory/filings-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { FundPerformanceRow } from "@/lib/directory/investor-queries";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/directory/providers";
import { nameCommitments, type DisclosedCommitment, type NamedCommitment } from "@/lib/directory/queries";
import { getFundDetails, getFundFormD } from "@/lib/fund-details";
import { getFund } from "@/lib/queries";
import { getReadClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/utils";

// A fund's page, laid out like a firm's: the header, its numbers, then the
// sections under tabs. Everything on it is something a filing, an LP's own
// report or the researched profile states, with the page beside the figure.

export const dynamic = "force-dynamic";

const TABS = ["profile", "investors", "performance", "providers", "filings"] as const;
type Tab = (typeof TABS)[number];

/** What the performance view says about one fund: medians across the LPs that report it. */
type Perf = Pick<FundPerformanceRow, "lps" | "net_irr_median" | "net_irr_min" | "net_irr_max" | "multiple_median" | "multiple_min" | "multiple_max" | "dpi_median" | "rvpi_median" | "called_pct_median" | "as_of" | "lps_with_cash" | "sources">;

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

const PERF_COLUMNS = "lps, net_irr_median, net_irr_min, net_irr_max, multiple_median, multiple_min, multiple_max, dpi_median, rvpi_median, called_pct_median, as_of, lps_with_cash, sources";

/** The fund's row in `fund_performance` (migrations 0033/0034), read with the anon client; null on an older database or any error. */
async function fundPerformance(fundId: string): Promise<Perf | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("fund_performance").select(PERF_COLUMNS).eq("fund_id", fundId).limit(1);
  const r = (data as Record<string, unknown>[] | null)?.[0];
  if (error || !r) return null;
  return {
    lps: num(r.lps) ?? 0,
    net_irr_median: num(r.net_irr_median),
    net_irr_min: num(r.net_irr_min),
    net_irr_max: num(r.net_irr_max),
    multiple_median: num(r.multiple_median),
    multiple_min: num(r.multiple_min),
    multiple_max: num(r.multiple_max),
    dpi_median: num(r.dpi_median),
    rvpi_median: num(r.rvpi_median),
    called_pct_median: num(r.called_pct_median),
    as_of: (r.as_of as string | null) ?? null,
    lps_with_cash: num(r.lps_with_cash) ?? 0,
    sources: Array.isArray(r.sources)
      ? (r.sources as Record<string, unknown>[]).map((s) => ({ lp: (s.lp as string | null) ?? null, lp_id: (s.lp_id as string | null) ?? null, url: (s.url as string | null) ?? null, as_of: (s.as_of as string | null) ?? null }))
      : [],
  };
}

const LP_COLUMNS = "id, lp_company_id, gp_company_id, fund_id, lp_name, gp_name, fund_name, amount, amount_usd, currency, amount_text, commitment_date, commitment_date_text, commitment_year, disclosure_type, source, source_url";
const LP_PERF_COLUMNS = `${LP_COLUMNS}, asset_class, contributed, distributed, remaining_value, net_irr, multiple, as_of`;

/** The LPs on file for this fund, named. The 0019 performance columns are asked for first; an older database answers with an error and the base columns are read instead. */
async function fundInvestors(fundId: string): Promise<NamedCommitment[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const full = await supabase.from("commitments").select(LP_PERF_COLUMNS).eq("fund_id", fundId).limit(1000);
  const base = full.error ? await supabase.from("commitments").select(LP_COLUMNS).eq("fund_id", fundId).limit(1000) : full;
  if (base.error || !base.data) return [];
  const rows = await nameCommitments(base.data as unknown as DisclosedCommitment[]);
  // Largest first within each currency; amounts in different currencies are never compared.
  return rows.sort((a, b) => (a.currency ?? "USD").localeCompare(b.currency ?? "USD") || (b.amount_usd ?? b.amount ?? 0) - (a.amount_usd ?? a.amount ?? 0));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fund = await getFund(id);
  return { title: fund ? `${fund.name} — LPGP Connect` : "Fund — LPGP Connect" };
}

function Amount({ c }: { c: NamedCommitment }) {
  if (c.amount != null && c.currency) return <span title={c.amount_text ?? undefined}>{formatMoney(c.amount, c.currency)}</span>;
  if (c.amount_usd != null) return <>{formatUsd(c.amount_usd)}</>;
  return <span className="text-[11px] font-normal text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>;
}

function LpCell({ c }: { c: NamedCommitment }) {
  const name = c.lp_label ?? c.lp_name ?? "—";
  return c.lp_company_id ? (
    <Link href={`/companies/${c.lp_company_id}?tab=investor`} className="font-medium hover:underline">
      {name}
    </Link>
  ) : (
    <span className="font-medium">{name}</span>
  );
}

export default async function FundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const fund = await getFund(id);
  if (!fund) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "profile";

  const [investors, details, formD, perf, offerings] = await Promise.all([
    fundInvestors(id),
    getFundDetails(id),
    getFundFormD(id),
    fundPerformance(id),
    getFundOfferings({ fundId: id, pooledOnly: false, limit: 50 }),
  ]);
  const disclosed = investors.filter((c) => c.source !== "sample");
  const reporting = disclosed.filter((c) => c.net_irr != null || c.multiple != null || c.contributed != null || c.distributed != null || c.remaining_value != null);
  const providers = (Array.isArray(fund.service_providers) ? fund.service_providers : [])
    .map((p) => ({ ...p, norm: normalizeRole(p.role) }))
    .sort((a, b) => PROVIDER_ROLES.indexOf(a.norm as (typeof PROVIDER_ROLES)[number]) - PROVIDER_ROLES.indexOf(b.norm as (typeof PROVIDER_ROLES)[number]) || a.brand.localeCompare(b.brand));
  const base = `/funds/${fund.id}`;
  const tabs = [
    { key: "profile", label: "Profile", count: null as number | null },
    { key: "investors", label: "Investors", count: disclosed.length },
    { key: "performance", label: "Performance", count: perf?.lps ?? (reporting.length || null) },
    { key: "providers", label: "Service providers", count: providers.length },
    { key: "filings", label: "Filings", count: offerings.length + (fund.source === "form_adv" ? 1 : 0) },
  ].map((t) => ({ href: t.key === "profile" ? base : `${base}?tab=${t.key}`, label: t.label, count: t.count, active: tab === t.key }));

  // The headline size and what it is: the filed size first, a target second, the researched target third.
  const size =
    fund.fund_size_usd != null
      ? { value: formatUsd(fund.fund_size_usd), basis: "fund size, USD as filed" }
      : fund.target_size_usd != null
        ? { value: formatUsd(fund.target_size_usd), basis: "target, USD · fundraising" }
        : details?.target_size != null
          ? { value: formatMoney(details.target_size, details.target_currency), basis: "target, as researched" }
          : { value: "—", basis: "no filing or page states a size" };
  const irrRange = perf && perf.net_irr_min != null && perf.net_irr_max != null && perf.net_irr_min !== perf.net_irr_max ? `${perf.net_irr_min}% to ${perf.net_irr_max}%` : null;

  return (
    <IntelShell
      crumbs={[{ href: "/funds", label: "Funds" }, ...(fund.manager ? [{ href: `/companies/${fund.manager.id}?tab=funds`, label: fund.manager.name }] : []), { label: fund.name }]}
      kicker={`Fund · ${fund.strategy ?? fund.vehicle_kind ?? "Private markets"}`}
      title={
        <span className="flex items-center gap-3">
          {fund.manager ? <CompanyLogo name={fund.manager.name} domain={fund.manager.domain} size={44} /> : null}
          <span className="min-w-0">
            <span className="block">{fund.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal tracking-normal">
              {fund.manager ? (
                <Link href={`/companies/${fund.manager.id}`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
                  <CategoryBadge category={fund.manager.category} className="rounded-[3px] px-1.5 py-0 text-[10px]" />
                  {fund.manager.name}
                </Link>
              ) : fund.manager_name ? (
                <span className="text-muted-foreground">{fund.manager_name}</span>
              ) : null}
              {fund.vintage_year ? <Tag>Vintage {fund.vintage_year}</Tag> : null}
              {fund.status ? <Tag strong>{fund.status}</Tag> : null}
              {fund.geography ? <Tag>{fund.geography}</Tag> : null}
              {fund.vehicle_kind ? <Tag>{fund.vehicle_kind}</Tag> : null}
              {fund.domicile ? <Tag>{fund.domicile}</Tag> : null}
              {fund.currency ? <Tag>{fund.currency} class</Tag> : null}
            </span>
          </span>
        </span>
      }
      description={
        fund.name_filed && fund.name_filed !== fund.name ? (
          <>
            Filed as <span className="font-mono text-[12px]">{fund.name_filed}</span>
            {fund.source === "form_adv" ? ` on the manager's Form ADV Schedule D${fund.filed ? ` (${fund.filed})` : ""}.` : "."}
          </>
        ) : fund.source === "form_adv" ? (
          `Named on the manager's Form ADV Schedule D${fund.filed ? ` (${fund.filed})` : ""}.`
        ) : null
      }
      actions={
        <>
          {fund.manager ? (
            <Link href={`/companies/${fund.manager.id}?tab=funds`} className="inline-flex h-8 items-center rounded-[4px] border bg-card px-2.5 text-[12px] hover:bg-accent">
              Manager&rsquo;s lineup
            </Link>
          ) : null}
          {fund.source_url ? <Src url={fund.source_url} name="IAPD" className="text-[12px]" /> : null}
        </>
      }
      tabs={<SubTabs items={tabs} />}
    >
      <StatStrip>
        <Stat label="Size" value={size.value} basis={size.basis} defn="The fund's size as filed, in USD. When no filing states one, the target the manager or the researched profile gives." />
        <Stat label="Vintage" value={fund.vintage_year ?? "—"} basis={details?.fundraising_status ?? fund.status ?? undefined} />
        <Stat label="LPs on file" value={disclosed.length} basis={disclosed.length ? `${reporting.length} report performance` : "no public disclosure names it"} href={`${base}?tab=investors`} />
        <Stat
          label="Net IRR, median"
          value={perf?.net_irr_median != null ? `${perf.net_irr_median}%` : "—"}
          basis={perf?.net_irr_median != null ? `${perf.lps} LP${perf.lps === 1 ? "" : "s"}${irrRange ? ` · ${irrRange}` : ""}` : "no LP reports one"}
          href={`${base}?tab=performance`}
          defn="The median of the net IRRs the reporting LPs each state for this fund, as of each one's own date. Never an estimate."
        />
        <Stat label="Multiple, median" value={perf?.multiple_median != null ? `${perf.multiple_median}x` : "—"} basis={perf?.as_of ? `as of ${dateLabel(perf.as_of)}` : perf ? "reporting dates vary" : "no LP reports one"} href={`${base}?tab=performance`} defn="TVPI as the reporting LPs state it, median across them." />
        <Stat
          label="Form D sold"
          value={formD?.amount_sold != null ? formatMoney(formD.amount_sold, "USD") : "—"}
          basis={formD ? [formD.offering_amount != null ? `of ${formatMoney(formD.offering_amount, "USD")} offered` : null, formD.filing_date ? `filed ${dateLabel(formD.filing_date)}` : null].filter(Boolean).join(" · ") || "latest Form D" : "no Form D on file"}
          href={`${base}?tab=filings`}
        />
      </StatStrip>

      <TabPanel key={tab}>
        {tab === "profile" ? <FundProfileSections fund={fund} details={details} formD={formD} /> : null}

        {tab === "investors" ? (
          <Box
            title="Limited partners"
            count={disclosed.length}
            flush
            defn="LPs whose own disclosures — board papers, annual reports, holdings lists, FOIA releases — name this fund. Amounts keep their own currency; a figure the document does not print is blank."
            action={<span className="text-[11px] text-muted-foreground">Amounts in their own currency, never converted</span>}
          >
            {disclosed.length ? (
              <div className="desk-scroll">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Limited partner</th>
                      <th>Programme</th>
                      <th>When</th>
                      <th className="num">Commitment</th>
                      <th>Disclosure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disclosed.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <LpCell c={c} />
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">
                          {c.asset_class ? (isAssetClassKey(c.asset_class) ? <Link href={`/database/asset-classes/${ASSET_CLASS_BY_KEY[c.asset_class].slug}`} className="tag hover:text-foreground">{ASSET_CLASS_BY_KEY[c.asset_class].short}</Link> : c.asset_class) : "—"}
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">{c.commitment_date_text ?? dateLabel(c.commitment_date)}</td>
                        <td className="num whitespace-nowrap">
                          <Amount c={c} />
                        </td>
                        <td>
                          <Src url={c.source_url} name={c.disclosure_type ?? "Source"} asOf={c.as_of ? dateLabel(c.as_of) : null} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No LP has disclosed a commitment to this fund. The monthly LP-disclosure load adds one the first time a public report names it.</Empty>
            )}
          </Box>
        ) : null}

        {tab === "performance" ? (
          <div className="space-y-4">
            {perf ? (
              <StatStrip>
                <Stat label="Net IRR, median" value={perf.net_irr_median != null ? `${perf.net_irr_median}%` : "—"} basis={irrRange ? `range ${irrRange}` : `${perf.lps} LP${perf.lps === 1 ? "" : "s"} reporting`} />
                <Stat label="Multiple, median" value={perf.multiple_median != null ? `${perf.multiple_median}x` : "—"} basis={perf.multiple_min != null && perf.multiple_max != null && perf.multiple_min !== perf.multiple_max ? `range ${perf.multiple_min}x to ${perf.multiple_max}x` : "TVPI as stated"} />
                <Stat label="DPI, median" value={perf.dpi_median != null ? `${perf.dpi_median.toFixed(2)}x` : "—"} basis="distributed ÷ contributed, arithmetic" defn="Each LP's own stated distributions over its own stated contributions, then the median. Not a figure any LP prints." />
                <Stat label="RVPI, median" value={perf.rvpi_median != null ? `${perf.rvpi_median.toFixed(2)}x` : "—"} basis="remaining ÷ contributed, arithmetic" defn="Each LP's own stated remaining value over its contributions, then the median. CalPERS prints cash out and remaining together, so its remaining value has distributions subtracted first." />
                <Stat label="Called, median" value={perf.called_pct_median != null ? `${Math.round(perf.called_pct_median)}%` : "—"} basis="contributed ÷ commitment, arithmetic" />
                <Stat label="LPs reporting" value={perf.lps} basis={`${perf.lps_with_cash} with cash figures${perf.as_of ? ` · latest ${dateLabel(perf.as_of)}` : ""}`} />
              </StatStrip>
            ) : null}
            <Box
              title="As each LP reports it"
              count={reporting.length}
              flush
              defn="One row per LP that states a figure for this fund, as of its own reporting date, in its own currency. The medians above are across these rows."
              action={
                <Link href="/database/performance?tab=funds" className="text-[11.5px] text-muted-foreground hover:text-foreground">
                  Performance desk
                </Link>
              }
            >
              {reporting.length ? (
                <div className="desk-scroll">
                  <table className="desk-table">
                    <thead>
                      <tr>
                        <th>Limited partner</th>
                        <th>As of</th>
                        <th className="num">Commitment</th>
                        <th className="num">Contributed</th>
                        <th className="num">Distributed</th>
                        <th className="num">Remaining</th>
                        <th className="num">Net IRR</th>
                        <th className="num">Multiple</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reporting.map((c) => (
                        <tr key={c.id}>
                          <td>
                            <LpCell c={c} />
                          </td>
                          <td className="whitespace-nowrap text-muted-foreground">{dateLabel(c.as_of)}</td>
                          <td className="num whitespace-nowrap">
                            <Amount c={c} />
                          </td>
                          <td className="num whitespace-nowrap">{c.contributed != null ? formatMoney(c.contributed, c.currency) : "—"}</td>
                          <td className="num whitespace-nowrap">{c.distributed != null ? formatMoney(c.distributed, c.currency) : "—"}</td>
                          <td className="num whitespace-nowrap">{c.remaining_value != null ? formatMoney(c.remaining_value, c.currency) : "—"}</td>
                          <td className="num">{c.net_irr != null ? `${c.net_irr}%` : "—"}</td>
                          <td className="num">{c.multiple != null ? `${c.multiple}x` : "—"}</td>
                          <td>
                            <Src url={c.source_url} name={c.disclosure_type ?? "Source"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No LP discloses a net IRR, multiple or cash figure for this fund. One appears when an LP&rsquo;s fund-by-fund review names it; nothing here is estimated.</Empty>
              )}
            </Box>
          </div>
        ) : null}

        {tab === "providers" ? (
          <Box
            title="Service providers"
            count={providers.length}
            flush
            defn="Named with this fund on the manager's Form ADV Schedule D: the auditor, administrator, custodian, prime broker and marketer it reports for the fund."
            action={fund.source === "form_adv" ? <Src url={fund.source_url} name={fund.filed ? `Schedule D, ${fund.filed}` : "Schedule D"} /> : null}
          >
            {providers.length ? (
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Provider</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((p) => (
                    <tr key={`${p.role}:${p.key}`} className="linked">
                      <td className="whitespace-nowrap text-muted-foreground">{ROLE_LABEL[p.norm]}</td>
                      <td>
                        <Link href={`/database/providers/${p.key}`} className="cover flex items-center gap-2 font-medium">
                          <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={20} />
                          {p.brand}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>No service provider is named with this fund. Schedule D lists them only for the private funds an SEC-registered adviser reports.</Empty>
            )}
          </Box>
        ) : null}

        {tab === "filings" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Box title="Form D" count={offerings.length || null} flush defn="Every Form D naming this fund, as the database read it from EDGAR: the offering, what has been sold to date and to how many investors, per its latest filing.">
              {offerings.length ? <OfferingTable rows={offerings} showClass={false} /> : <Empty>No Form D on file names this fund. The database reads EDGAR quarter by quarter; a US private fund&rsquo;s filing lands as it is parsed.</Empty>}
            </Box>
            <div className="space-y-4">
              <Box title="Form ADV Schedule D" flush defn="The manager's own listing of this fund among the private funds it advises, as filed.">
                <dl className="kv px-3 py-1 text-[12.5px]">
                  <dt>Named as</dt>
                  <dd className="font-mono text-[12px]">{fund.name_filed ?? fund.name}</dd>
                  <dt>Filed</dt>
                  <dd>{fund.filed ?? "—"}</dd>
                  <dt>Vehicle</dt>
                  <dd>{fund.vehicle_kind ?? "—"}</dd>
                  <dt>Domicile</dt>
                  <dd>{fund.domicile ?? "—"}</dd>
                  <dt>Currency</dt>
                  <dd>{fund.currency ?? "—"}</dd>
                  <dt>Source</dt>
                  <dd>{fund.source === "form_adv" ? <Src url={fund.source_url} name="IAPD" className="text-[12px]" /> : (fund.source ?? "—")}</dd>
                </dl>
              </Box>
              {formD ? (
                <Box title="Latest Form D" flush defn="The facts the fund's most recent Form D states.">
                  <dl className="kv px-3 py-1 text-[12.5px]">
                    <dt>Offering</dt>
                    <dd className="figure">{formD.offering_amount != null ? formatMoney(formD.offering_amount, "USD") : "—"}</dd>
                    <dt>Sold to date</dt>
                    <dd className="figure">{formD.amount_sold != null ? formatMoney(formD.amount_sold, "USD") : "—"}</dd>
                    <dt>Investors</dt>
                    <dd className="figure">{formD.investors_count != null ? formD.investors_count.toLocaleString("en-US") : "—"}</dd>
                    <dt>Minimum</dt>
                    <dd className="figure">{formD.min_investment != null ? formatMoney(formD.min_investment, "USD") : "—"}</dd>
                    <dt>First sale</dt>
                    <dd>{dateLabel(formD.first_sale_date)}</dd>
                    <dt>Filed</dt>
                    <dd>
                      {dateLabel(formD.filing_date)} <Src url={formD.source_url} name="EDGAR" />
                    </dd>
                  </dl>
                </Box>
              ) : null}
            </div>
          </div>
        ) : null}
      </TabPanel>
    </IntelShell>
  );
}
