import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { OfferingTable } from "@/components/intel/filings-tables";
import { FundProfile as FundProfileSections } from "@/components/intel/fund-profile";
import { dateLabel } from "@/components/intel/tables";
import { Box, Src } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { BackLink, Chapter, Chip, ClassIcon, Figure, Figures, Meter, StoryPage } from "@/components/story/story";
import { ASSET_CLASS_BY_KEY, classStatedByFundName, isAssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import { getFundOfferings } from "@/lib/directory/filings-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { FundPerformanceRow } from "@/lib/directory/investor-queries";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/directory/providers";
import { getCompanyFunds, nameCommitments, type DisclosedCommitment, type NamedCommitment } from "@/lib/directory/queries";
import { getFundDetails, getFundFormD } from "@/lib/fund-details";
import { getFund } from "@/lib/queries";
import { getReadClient } from "@/lib/supabase/server";
import { formatUsd } from "@/lib/utils";

// A fund's page, read as a story like a firm's: who it is, its figures, then
// the chapters there is data for — who is in it, how it has done as they
// report it, the manager and its other funds, its providers and filings.
// Every investor leads to the investor, the manager to the manager. Nothing
// on it is estimated; a category nobody has researched is not drawn.

export const dynamic = "force-dynamic";

/** What the performance view says about one fund: medians across the LPs that report it. */
type Perf = Pick<FundPerformanceRow, "lps" | "net_irr_median" | "net_irr_min" | "net_irr_max" | "multiple_median" | "multiple_min" | "multiple_max" | "dpi_median" | "rvpi_median" | "called_pct_median" | "as_of" | "lps_with_cash" | "sources">;

const num = (v: unknown): number | null => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

const PERF_COLUMNS = "lps, net_irr_median, net_irr_min, net_irr_max, multiple_median, multiple_min, multiple_max, dpi_median, rvpi_median, called_pct_median, as_of, lps_with_cash, sources";

/** The fund's row in `fund_performance` (migrations 0033/0034), read with the anon client; null on an older database or any error. */
async function fundPerformance(fundId: string): Promise<Perf | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from("fund_performance_mv").select(PERF_COLUMNS).eq("fund_id", fundId).limit(1);
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
  return { title: fund ? `${fund.name} — LPGP Intelligence` : "Fund — LPGP Intelligence" };
}

function Amount({ c }: { c: NamedCommitment }) {
  if (c.amount != null && c.currency) return <span title={c.amount_text ?? undefined}>{formatMoney(c.amount, c.currency)}</span>;
  if (c.amount_usd != null) return <>{formatUsd(c.amount_usd)}</>;
  return <span className="text-[11px] font-normal text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>;
}

export default async function FundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }] = await Promise.all([params, searchParams]);
  const fund = await getFund(id);
  if (!fund) notFound();

  const [investors, details, formD, perf, offerings, siblings] = await Promise.all([
    fundInvestors(id),
    getFundDetails(id),
    getFundFormD(id),
    fundPerformance(id),
    getFundOfferings({ fundId: id, pooledOnly: false, limit: 50 }),
    fund.manager ? getCompanyFunds(fund.manager.id) : Promise.resolve([]),
  ]);
  const disclosed = investors.filter((c) => c.source !== "sample");
  const reporting = disclosed.filter((c) => c.net_irr != null || c.multiple != null || c.contributed != null || c.distributed != null || c.remaining_value != null);
  const providers = (Array.isArray(fund.service_providers) ? fund.service_providers : [])
    .map((p) => ({ ...p, norm: normalizeRole(p.role) }))
    .sort((a, b) => PROVIDER_ROLES.indexOf(a.norm as (typeof PROVIDER_ROLES)[number]) - PROVIDER_ROLES.indexOf(b.norm as (typeof PROVIDER_ROLES)[number]) || a.brand.localeCompare(b.brand));
  const cls = (fund.strategy && isAssetClassKey(fund.strategy) ? fund.strategy : null) ?? classStatedByFundName(fund.name_filed ?? fund.name);
  const clsName = cls && isAssetClassKey(cls) ? ASSET_CLASS_BY_KEY[cls].name : null;
  const managerName = fund.manager?.name ?? fund.manager_name ?? null;
  const researched = details && details.research_state !== "no_public_data" && [details.overview, details.fundraising_status, details.target_size, details.management_fee_pct, details.carried_interest_pct, details.term_years, details.legal_structure].some((v) => v != null && v !== "");

  const size =
    fund.fund_size_usd != null
      ? { value: formatUsd(fund.fund_size_usd), basis: "fund size, USD as filed" }
      : fund.target_size_usd != null
        ? { value: formatUsd(fund.target_size_usd), basis: "target, USD" }
        : details?.target_size != null
          ? { value: formatMoney(details.target_size, details.target_currency), basis: "target, as researched" }
          : null;
  const irrRange = perf && perf.net_irr_min != null && perf.net_irr_max != null && perf.net_irr_min !== perf.net_irr_max ? `${perf.net_irr_min}% to ${perf.net_irr_max}%` : null;

  const chapters: ChapterLink[] = [];
  let n = 0;
  const next = (id: string, label: string, count?: number | null) => {
    n += 1;
    chapters.push({ id, label, count });
    return n;
  };
  const nInvestors = disclosed.length ? next("investors", "Investors", disclosed.length) : 0;
  const nPerf = perf || reporting.length ? next("performance", "Performance", perf?.lps ?? reporting.length) : 0;
  const others = siblings.filter((f) => f.id !== fund.id);
  const nManager = fund.manager ? next("manager", "Manager", null) : 0;
  const nProviders = providers.length ? next("providers", "Providers", providers.length) : 0;
  const nFilings = offerings.length || formD || fund.source === "form_adv" ? next("filings", "Filings", offerings.length || null) : 0;
  const nTerms = researched ? next("terms", "Terms", null) : 0;
  const topIrr = Math.max(1, ...reporting.map((c) => (c.net_irr != null ? Number(c.net_irr) : 0)));

  return (
    <StoryPage>
      <BackLink href={fund.manager ? `/companies/${fund.manager.id}#funds` : "/funds"} label={fund.manager ? `${fund.manager.name}'s funds` : "Funds"} />
      <header className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <ClassIcon cls={cls} className="h-[72px] w-[72px] rounded-[18px]" />
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">Fund{clsName ? ` · ${clsName}` : ""}</div>
          <h1 className="story-name mt-2">{fund.name}</h1>
          <p className="story-lede mt-3">
            <strong>
              {fund.vintage_year ? `A ${fund.vintage_year} ` : "A "}
              {clsName ? `${clsName.toLowerCase()} ` : ""}fund{managerName ? ` managed by ${managerName}` : ""}
              {fund.domicile ? `, domiciled in ${fund.domicile}` : ""}.
            </strong>{" "}
            {disclosed.length
              ? `${disclosed.length} limited partner${disclosed.length === 1 ? " has" : "s have"} disclosed a commitment to it${perf?.net_irr_median != null ? `, and the ones that report put its net IRR at a median of ${perf.net_irr_median}%` : ""}.`
              : "No limited partner has disclosed a commitment to it yet."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {fund.status ? <Chip strong>{fund.status}</Chip> : null}
            {fund.vehicle_kind ? <Chip>{fund.vehicle_kind}</Chip> : null}
            {fund.currency ? <Chip>{fund.currency} class</Chip> : null}
            {fund.geography ? <Chip>{fund.geography}</Chip> : null}
            {fund.name_filed && fund.name_filed !== fund.name ? <Chip title="As named on the manager's Form ADV">Filed as {fund.name_filed}</Chip> : null}
          </div>
        </div>
        {fund.manager ? (
          <Link href={`/companies/${fund.manager.id}`} className="story-card flex w-full items-center gap-3 p-3 md:w-[280px]">
            <CompanyLogo name={fund.manager.name} domain={fund.manager.domain} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] text-muted-foreground">Managed by</span>
              <span className="block truncate text-[14px] font-medium">{fund.manager.name}</span>
            </span>
            <ArrowUpRight className="story-card-arrow h-4 w-4" />
          </Link>
        ) : null}
      </header>

      <Figures>
        {size ? <Figure label="Size" value={size.value} basis={size.basis} /> : null}
        {fund.vintage_year ? <Figure label="Vintage" value={fund.vintage_year} basis={details?.fundraising_status ?? undefined} /> : null}
        {disclosed.length ? <Figure label="Investors on file" value={disclosed.length} basis={reporting.length ? `${reporting.length} report performance` : undefined} href="#investors" /> : null}
        {perf?.net_irr_median != null ? <Figure label="Median net IRR" value={`${perf.net_irr_median}%`} basis={irrRange ?? `${perf.lps} LP${perf.lps === 1 ? "" : "s"} reporting`} href="#performance" /> : null}
        {perf?.multiple_median != null ? <Figure label="Median multiple" value={`${perf.multiple_median}x`} basis={perf.as_of ? `as of ${dateLabel(perf.as_of)}` : undefined} href="#performance" /> : null}
        {formD?.amount_sold != null ? <Figure label="Sold on Form D" value={formatMoney(formD.amount_sold, "USD")} basis={formD.offering_amount != null ? `of ${formatMoney(formD.offering_amount, "USD")} offered` : undefined} href="#filings" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />

      {nInvestors ? (
        <Chapter id="investors" n={nInvestors} eyebrow="Who's in it" title={`${disclosed.length} investor${disclosed.length === 1 ? " is" : "s are"} in this fund.`} lead="Limited partners whose own reports, board papers or holdings lists name it, with what each committed in its own currency and the figures it reports.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {disclosed.map((c, i) => {
              const name = c.lp_label ?? c.lp_name ?? "Investor not named";
              const body = (
                <>
                  <div className="flex items-start gap-3">
                    <CompanyLogo name={name} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{name}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{[c.commitment_date_text ?? (c.commitment_year ? String(c.commitment_year) : null), c.disclosure_type].filter(Boolean).join(" · ") || "Disclosed"}</span>
                    </span>
                    {c.lp_company_id ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-2">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Committed</dt>
                      <dd className="figure truncate text-[14px]">
                        <Amount c={c} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Net IRR</dt>
                      <dd className="figure text-[14px]">{c.net_irr != null ? `${c.net_irr}%` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Multiple</dt>
                      <dd className="figure text-[14px]">{c.multiple != null ? `${c.multiple}x` : "—"}</dd>
                    </div>
                  </dl>
                </>
              );
              return c.lp_company_id ? (
                <Link key={c.id} href={`/companies/${c.lp_company_id}`} className={`story-card p-4 ${i === 0 ? "story-card-hero" : ""}`}>
                  {body}
                </Link>
              ) : (
                <div key={c.id} className="story-card p-4">
                  {body}
                </div>
              );
            })}
          </div>
        </Chapter>
      ) : null}

      {nPerf ? (
        <Chapter
          id="performance"
          n={nPerf}
          eyebrow="Performance"
          title={perf?.net_irr_median != null ? `A median net IRR of ${perf.net_irr_median}%, as its investors report it.` : "How its investors report it."}
          lead="Each investor's own figure as of its own date, in its own currency. DPI, RVPI and the share called are arithmetic on each one's stated cash; nothing is estimated."
        >
          {perf ? (
            <Figures>
              {perf.dpi_median != null ? <Figure label="DPI, median" value={`${perf.dpi_median.toFixed(2)}x`} basis="distributed ÷ contributed" /> : null}
              {perf.rvpi_median != null ? <Figure label="RVPI, median" value={`${perf.rvpi_median.toFixed(2)}x`} basis="remaining ÷ contributed" /> : null}
              {perf.called_pct_median != null ? <Figure label="Called, median" value={`${Math.round(perf.called_pct_median)}%`} basis="contributed ÷ commitment" /> : null}
              <Figure label="Investors reporting" value={perf.lps} basis={`${perf.lps_with_cash} with cash figures`} />
            </Figures>
          ) : null}
          {reporting.length ? (
            <div className="story-card story-rows mt-5 overflow-hidden">
              {[...reporting]
                .sort((a, b) => Number(b.net_irr ?? -999) - Number(a.net_irr ?? -999))
                .map((c) => (
                  <div key={c.id} className="story-row">
                    <CompanyLogo name={c.lp_label ?? c.lp_name ?? "?"} size={30} />
                    <span className="min-w-0 flex-1">
                      {c.lp_company_id ? (
                        <Link href={`/companies/${c.lp_company_id}`} className="block truncate text-[14px] font-medium hover:underline">
                          {c.lp_label ?? c.lp_name}
                        </Link>
                      ) : (
                        <span className="block truncate text-[14px] font-medium">{c.lp_label ?? c.lp_name}</span>
                      )}
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {[c.as_of ? `as of ${dateLabel(c.as_of)}` : null, c.contributed != null ? `${formatMoney(c.contributed, c.currency)} in` : null, c.distributed != null ? `${formatMoney(c.distributed, c.currency)} out` : null].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="hidden w-[160px] sm:block">{c.net_irr != null ? <Meter pct={(Math.max(0, Number(c.net_irr)) / topIrr) * 100} /> : null}</span>
                    <span className="figure w-[60px] text-right text-[14px]">{c.net_irr != null ? `${c.net_irr}%` : "—"}</span>
                    <span className="figure w-[52px] text-right text-[12px] text-muted-foreground">{c.multiple != null ? `${c.multiple}x` : ""}</span>
                    <Src url={c.source_url} name="source" />
                  </div>
                ))}
            </div>
          ) : null}
        </Chapter>
      ) : null}

      {nManager && fund.manager ? (
        <Chapter
          id="manager"
          n={nManager}
          eyebrow="The manager"
          title={`${fund.manager.name}${others.length ? ` runs ${others.length} other fund${others.length === 1 ? "" : "s"} on file` : ""}.`}
          more={{ href: `/companies/${fund.manager.id}`, label: `${fund.manager.name}'s story` }}
        >
          {others.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {others
                .sort((a, b) => (b.vintage_year ?? 0) - (a.vintage_year ?? 0) || a.name.localeCompare(b.name))
                .slice(0, 8)
                .map((f) => (
                  <Link key={f.id} href={`/funds/${f.id}`} className="story-card p-3.5">
                    <ClassIcon cls={classStatedByFundName(f.name_filed ?? f.name) ?? cls} className="h-8 w-8 rounded-[9px]" />
                    <div className="mt-3 line-clamp-2 text-[13.5px] font-medium leading-snug">{f.name}</div>
                    <div className="mt-1 text-[12px] text-muted-foreground">{f.vintage_year ? `Vintage ${f.vintage_year}` : (f.vehicle_kind ?? "Form ADV")}</div>
                  </Link>
                ))}
            </div>
          ) : (
            <Link href={`/companies/${fund.manager.id}`} className="story-card flex items-center gap-3 p-4">
              <CompanyLogo name={fund.manager.name} domain={fund.manager.domain} size={40} />
              <span className="text-[14px] font-medium">{fund.manager.name}</span>
            </Link>
          )}
        </Chapter>
      ) : null}

      {nProviders ? (
        <Chapter id="providers" n={nProviders} eyebrow="Service providers" title="Who services it." lead={`As ${managerName ?? "the manager"} names them for this fund on Form ADV Schedule D.`}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {providers.map((p) => (
              <Link key={`${p.role}:${p.key}`} href={`/database/providers/${p.key}`} className="story-card flex items-center gap-3 p-3.5">
                <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] text-muted-foreground">{ROLE_LABEL[p.norm]}</span>
                  <span className="block truncate text-[14px] font-medium">{p.brand}</span>
                </span>
                <ArrowUpRight className="story-card-arrow h-4 w-4" />
              </Link>
            ))}
          </div>
        </Chapter>
      ) : null}

      {nFilings ? (
        <Chapter id="filings" n={nFilings} eyebrow="Filings" title="What it has filed.">
          <div className="grid gap-3 lg:grid-cols-2">
            {formD ? (
              <div className="story-card p-4">
                <div className="text-[12px] text-muted-foreground">Latest Form D</div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Offering</dt>
                    <dd className="figure">{formD.offering_amount != null ? formatMoney(formD.offering_amount, "USD") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Sold to date</dt>
                    <dd className="figure">{formD.amount_sold != null ? formatMoney(formD.amount_sold, "USD") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Investors</dt>
                    <dd className="figure">{formD.investors_count != null ? formD.investors_count.toLocaleString("en-US") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Filed</dt>
                    <dd>
                      {dateLabel(formD.filing_date)} <Src url={formD.source_url} name="EDGAR" />
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {fund.source === "form_adv" ? (
              <div className="story-card p-4">
                <div className="text-[12px] text-muted-foreground">Form ADV Schedule D</div>
                <p className="mt-2 font-mono text-[12.5px]">{fund.name_filed ?? fund.name}</p>
                <p className="mt-2 text-[12.5px] text-muted-foreground">
                  {[fund.vehicle_kind, fund.domicile, fund.currency, fund.filed ? `filed ${fund.filed}` : null].filter(Boolean).join(" · ")} <Src url={fund.source_url} name="IAPD" />
                </p>
              </div>
            ) : null}
          </div>
          {offerings.length > 1 ? (
            <div className="desk mt-4">
              <Box title="Every Form D" count={offerings.length} flush>
                <OfferingTable rows={offerings} showClass={false} />
              </Box>
            </div>
          ) : null}
        </Chapter>
      ) : null}

      {nTerms ? (
        <Chapter id="terms" n={nTerms} eyebrow="Terms and strategy" title="What its documents say.">
          <div className="desk">
            <FundProfileSections fund={fund} details={details} formD={formD} />
          </div>
        </Chapter>
      ) : null}
    </StoryPage>
  );
}
