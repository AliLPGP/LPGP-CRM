import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { OfferingTable, PositionTable } from "@/components/intel/filings-tables";
import { FundProfile as FundProfileSections } from "@/components/intel/fund-profile";
import { dateLabel } from "@/components/intel/tables";
import { Box, Src } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { BackLink, Chapter, Chip, ClassIcon, Figure, Figures, Meter, StoryPage } from "@/components/story/story";
import { ASSET_CLASS_BY_KEY, classStatedByFundName, isAssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import { getFundOfferings, getLenderBook, listCreditLenders } from "@/lib/directory/filings-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { FundPerformanceRow } from "@/lib/directory/investor-queries";
import { normalizeRole, providerBrand, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/directory/providers";
import { getCompanyFunds, nameCommitments, type DisclosedCommitment, type NamedCommitment } from "@/lib/directory/queries";
import { getFundDetails, getFundFormD } from "@/lib/fund-details";
import { fundCards, fundHoldings } from "@/lib/directory/fund-portfolio";
import { FUND_STAGE_LABEL, fundKey, fundStage } from "@/lib/directory/fund-match";
import { FundFamilies } from "@/components/story/fund-families";
import { PortcoCard } from "@/components/story/portco-card";
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
async function fundPerformance(fundIds: string[]): Promise<Perf | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  // One fund filed as several vehicles: the vehicle the most investors report on speaks for it.
  const { data, error } = await supabase.from("fund_performance_mv").select(PERF_COLUMNS).in("fund_id", fundIds).order("lps", { ascending: false }).limit(1);
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
async function fundInvestors(fundIds: string[]): Promise<NamedCommitment[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const full = await supabase.from("commitments").select(LP_PERF_COLUMNS).in("fund_id", fundIds).limit(1000);
  const base = full.error ? await supabase.from("commitments").select(LP_COLUMNS).in("fund_id", fundIds).limit(1000) : full;
  if (base.error || !base.data) return [];
  const rows = await nameCommitments(base.data as unknown as DisclosedCommitment[]);
  // Largest first within each currency; amounts in different currencies are never compared.
  return rows.sort((a, b) => (a.currency ?? "USD").localeCompare(b.currency ?? "USD") || (b.amount_usd ?? b.amount ?? 0) - (a.amount_usd ?? a.amount ?? 0));
}

/** The fund as its adviser reports it on Form ADV Schedule D 7.B.(1), one row per vehicle on file (migration 0046). */
type AdvFund = {
  adv_fund_id: string;
  name: string;
  adviser_crd: string | null;
  submitted: string | null;
  fund_type: string | null;
  fund_type_other: string | null;
  gross_asset_value: number | null;
  minimum_investment: number | null;
  owners: number | null;
  pct_non_us: number | null;
  annual_audit: boolean | null;
  providers: { role: string; name: string; key?: string; brand?: string }[];
};

async function advFunds(fundIds: string[]): Promise<AdvFund[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("adv_private_funds")
    .select("adv_fund_id, name, adviser_crd, submitted, fund_type, fund_type_other, gross_asset_value, minimum_investment, owners, pct_non_us, annual_audit, providers")
    .in("fund_id", fundIds)
    .order("gross_asset_value", { ascending: false, nullsFirst: false })
    .limit(20);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    adv_fund_id: String(r.adv_fund_id),
    name: String(r.name),
    adviser_crd: (r.adviser_crd as string | null) ?? null,
    submitted: (r.submitted as string | null) ?? null,
    fund_type: (r.fund_type as string | null) ?? null,
    fund_type_other: (r.fund_type_other as string | null) ?? null,
    gross_asset_value: num(r.gross_asset_value),
    minimum_investment: num(r.minimum_investment),
    owners: num(r.owners),
    pct_non_us: num(r.pct_non_us),
    annual_audit: (r.annual_audit as boolean | null) ?? null,
    providers: Array.isArray(r.providers) ? (r.providers as AdvFund["providers"]) : [],
  }));
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

  const manager = fund.manager ? { id: fund.manager.id, name: fund.manager.name } : null;
  const [details, formD, siblings] = await Promise.all([
    getFundDetails(id),
    getFundFormD(id),
    manager ? getCompanyFunds(manager.id) : Promise.resolve([]),
  ]);
  // The same fund filed more than once (a parallel vehicle, a second spelling) reads as one.
  const key = fundKey(fund.name);
  const vehicles = siblings.filter((f) => f.id === id || (key && fundKey(f.name) === key));
  const ids = [...new Set([id, ...vehicles.map((v) => v.id)])];
  // A fund that files its own schedule of investments (a BDC) is the lender of that name.
  const lender = (await listCreditLenders()).find((l) => {
    const k = fundKey(l.name);
    return k.length >= 6 && (k === key || vehicles.some((v) => fundKey(v.name) === k));
  });
  const [investors, perf, holdings, cards, adv, book, offeringSets] = await Promise.all([
    fundInvestors(ids),
    fundPerformance(ids),
    fundHoldings(vehicles.length ? vehicles : [fund], manager),
    manager ? fundCards(manager, siblings.filter((f) => !ids.includes(f.id))) : Promise.resolve([]),
    advFunds(ids),
    lender ? getLenderBook(lender.cik) : Promise.resolve([]),
    // Every vehicle's Form Ds: the parallel vehicle often names the agent the main one does not.
    Promise.all(ids.map((v) => getFundOfferings({ fundId: v, pooledOnly: false, limit: 50 }))),
  ]);
  const offerings = [...new Map(offeringSets.flat().map((o) => [o.accession_no, o])).values()].sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""));
  // What the latest Form D says about the fund itself: who runs it, where it sits, who sells it, what selling it costs.
  const latestD = offerings[0] ?? null;
  const roleOf = (re: RegExp) =>
    [...new Set(offerings.flatMap((o) => (o.related_persons ?? []).filter((p) => re.test(p.clarification ?? "")).map((p) => p.name.replace(/^[-\s]+/, "").trim())))].filter(Boolean);
  const investmentManagers = roleOf(/investment (manager|adviser|advisor)/i);
  const generalPartners = roleOf(/general partner/i);
  const commissions = offerings.map((o) => o.sales_commissions).find((v) => v != null && v > 0) ?? null;
  const qpOnly = offerings.some((o) => (o.exemptions ?? []).includes("3C.7"));
  const domicile = fund.domicile ?? (latestD?.jurisdiction ? latestD.jurisdiction.replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase()) : null);
  const bookFv = book.reduce((t, p) => t + (p.fair_value ?? 0), 0);
  const bookCost = book.reduce((t, p) => t + (p.cost ?? 0), 0);
  const bookIndustries = new Set(book.map((p) => p.industry).filter(Boolean)).size;
  // Companies the manager's portfolio puts in this fund by name; the programme-level ones are told apart.
  const named = holdings.filter((h) => h.match === "fund");
  const programme = holdings.filter((h) => h.match === "programme");
  const heldNow = named.filter((h) => (h.status ?? "").toLowerCase().startsWith("current")).length;
  const stage = fundStage(fund.status ?? vehicles.find((v) => v.status)?.status);
  const disclosed = investors.filter((c) => c.source !== "sample");
  const reporting = disclosed.filter((c) => c.net_irr != null || c.multiple != null || c.contributed != null || c.distributed != null || c.remaining_value != null);
  // Every vehicle's providers, the adviser's Form ADV report and the placement agents its Form Ds name, once each.
  const providerRows: { role: string; key: string; brand: string }[] = [
    ...(Array.isArray(fund.service_providers) ? fund.service_providers : []),
    ...vehicles.flatMap((v) => (Array.isArray(v.service_providers) ? v.service_providers : [])),
    ...adv.flatMap((a) => a.providers.filter((p) => p.key && p.brand).map((p) => ({ role: p.role, key: p.key as string, brand: p.brand as string }))),
    ...offerings.flatMap((o) =>
      (o.placement_agents ?? []).flatMap((a) => {
        const raw = a.broker_dealer || a.name;
        if (!raw) return [];
        const b = providerBrand(raw);
        return [{ role: "placement_agent", key: b.key, brand: b.name }];
      }),
    ),
  ];
  const providers = [...new Map(providerRows.map((p) => [`${normalizeRole(p.role)}:${p.key}`, p])).values()]
    .map((p) => ({ ...p, norm: normalizeRole(p.role) }))
    .sort((a, b) => PROVIDER_ROLES.indexOf(a.norm as (typeof PROVIDER_ROLES)[number]) - PROVIDER_ROLES.indexOf(b.norm as (typeof PROVIDER_ROLES)[number]) || a.brand.localeCompare(b.brand));
  const cls = (fund.strategy && isAssetClassKey(fund.strategy) ? fund.strategy : null) ?? classStatedByFundName(fund.name_filed ?? fund.name);
  const clsName = cls && isAssetClassKey(cls) ? ASSET_CLASS_BY_KEY[cls].name : null;
  const managerName = fund.manager?.name ?? fund.manager_name ?? null;
  const researched = details && details.research_state !== "no_public_data" && [details.overview, details.fundraising_status, details.target_size, details.management_fee_pct, details.carried_interest_pct, details.term_years, details.legal_structure].some((v) => v != null && v !== "");

  const gav = adv.reduce((t, a) => t + (a.gross_asset_value ?? 0), 0);
  const advFiled = adv.map((a) => a.submitted).filter(Boolean).sort().at(-1) ?? null;
  const size =
    fund.fund_size_usd != null && fund.fund_size_usd > 0
      ? { value: formatUsd(fund.fund_size_usd), basis: "fund size, USD as filed" }
      : fund.target_size_usd != null && fund.target_size_usd > 0
        ? { value: formatUsd(fund.target_size_usd), basis: "target, USD" }
        : details?.target_size != null
          ? { value: formatMoney(details.target_size, details.target_currency), basis: "target, as researched" }
          : null;
  const irrRange = perf && perf.net_irr_min != null && perf.net_irr_max != null && perf.net_irr_min !== perf.net_irr_max ? `${perf.net_irr_min}% to ${perf.net_irr_max}%` : null;

  const chapters: ChapterLink[] = [];
  const next = (id: string, label: string, count?: number | null) => chapters.push({ id, label, count });
  // The order a client reads a fund in: how it has done, what it owns, who is in it, the manager's other funds, then the paper trail.
  const nPerf = next("performance", "Performance", null);
  const nServices = providers.length || investmentManagers.length || generalPartners.length ? next("services", "Who services it", providers.length || null) : 0;
  const nPortfolio = holdings.length ? next("portfolio", "Companies", holdings.length) : 0;
  const nBook = book.length ? next("book", "Loan book", book.length) : 0;
  const nInvestors = disclosed.length ? next("investors", "Investors", disclosed.length) : 0;
  const nManager = cards.length ? next("manager", "Other funds", cards.length) : 0;
  const nSources = offerings.length || formD || fund.source === "form_adv" || adv.length ? next("sources", "Sources", null) : 0;
  const nTerms = researched ? next("terms", "Terms", null) : 0;
  const topIrr = Math.max(1, ...reporting.map((c) => (c.net_irr != null ? Number(c.net_irr) : 0)));
  const vintage = fund.vintage_year ?? vehicles.find((v) => v.vintage_year)?.vintage_year ?? null;

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
              {vintage ? `A ${vintage} ` : "A "}
              {clsName ? `${clsName.toLowerCase()} ` : ""}fund{managerName ? ` managed by ${managerName}` : ""}.
            </strong>{" "}
            {[
              perf?.net_irr_median != null ? `Its investors report a median net IRR of ${perf.net_irr_median}%.` : null,
              named.length ? `It has invested in ${named.length} compan${named.length === 1 ? "y" : "ies"} on file.` : null,
            ]
              .filter(Boolean)
              .join(" ")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {stage ? <Chip strong={stage === "active"}>{FUND_STAGE_LABEL[stage]}</Chip> : null}
            {fund.geography ? <Chip>{fund.geography}</Chip> : null}
            {fund.currency ? <Chip>{fund.currency}</Chip> : null}
            {vehicles.length > 1 ? <Chip title={vehicles.map((v) => v.name).join(" · ")}>{vehicles.length} vehicles</Chip> : null}
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
        {perf?.net_irr_median != null ? <Figure label="Net IRR, median" value={`${perf.net_irr_median}%`} basis={irrRange ?? `${perf.lps} investor${perf.lps === 1 ? "" : "s"} reporting`} href="#performance" /> : null}
        {perf?.multiple_median != null ? <Figure label="Multiple, median" value={`${perf.multiple_median}x`} basis={perf.as_of ? `as of ${dateLabel(perf.as_of)}` : undefined} href="#performance" /> : null}
        {named.length ? <Figure label="Companies" value={named.length} basis={heldNow ? `${heldNow} still held` : "as its manager lists them"} href="#portfolio" /> : null}
        {size ? <Figure label="Size" value={size.value} basis={size.basis} /> : null}
        {gav > 0 ? <Figure label="Gross assets" value={formatUsd(gav)} basis={`Form ADV${adv.length > 1 ? `, ${adv.length} vehicles` : ""}${advFiled ? `, filed ${dateLabel(advFiled)}` : ""}`} href="#sources" /> : null}
        {vintage ? <Figure label="Vintage" value={vintage} /> : null}
        {domicile ? <Figure label="Domicile" value={domicile} basis={latestD?.entity_type ?? undefined} /> : null}
        {commissions ? <Figure label="Sales commissions" value={formatUsd(commissions)} basis="as estimated on its Form D" href="#services" /> : null}
        {disclosed.length ? <Figure label="Investors on file" value={disclosed.length} href="#investors" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />

      {nPerf ? (
        <Chapter
          id="performance"
          n={nPerf}
          eyebrow="Performance"
          title={perf?.net_irr_median != null ? `A median net IRR of ${perf.net_irr_median}%.` : "How its investors report it."}
          lead={
            perf || reporting.length
              ? "Each investor's own figure as of its own date. DPI, RVPI and the share called are arithmetic on each one's stated cash; nothing is estimated."
              : `No investor has published a figure for this fund yet. A private fund's returns are public only when a public investor (a pension, a sovereign or super fund) reports its holding${latestD?.first_sale_pending ? "; its Form D says it had not yet made its first sale" : ""}. The figure appears here as soon as one does.`
          }
          more={{ href: "/database/performance?tab=funds", label: "How other funds compare" }}
        >
          {perf && (perf.dpi_median != null || perf.rvpi_median != null || perf.called_pct_median != null) ? (
            <Figures>
              {perf.dpi_median != null ? <Figure label="DPI, median" value={`${perf.dpi_median.toFixed(2)}x`} basis="distributed ÷ contributed" /> : null}
              {perf.rvpi_median != null ? <Figure label="RVPI, median" value={`${perf.rvpi_median.toFixed(2)}x`} basis="remaining ÷ contributed" /> : null}
              {perf.called_pct_median != null ? <Figure label="Called, median" value={`${Math.round(perf.called_pct_median)}%`} basis="contributed ÷ commitment" /> : null}
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

      {nServices ? (
        <Chapter id="services" n={nServices} eyebrow="Who services it" title={providers.length ? `${providers.length} service provider${providers.length === 1 ? "" : "s"} on file.` : "Who runs and sells it."} lead="As its own filings name them: the general partner and investment manager on its Form D, its placement agents, and the auditor, administrator, custodian and prime broker its adviser reports on Form ADV.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {generalPartners.map((g) => (
              <div key={`gp:${g}`} className="story-card p-4">
                <div className="text-[11.5px] text-muted-foreground">General partner</div>
                <div className="mt-1 text-[14px] font-medium">{g}</div>
                {latestD ? <div className="mt-2 text-[12px] text-muted-foreground">Form D, {dateLabel(latestD.filing_date)} <Src url={latestD.source_url} name="EDGAR" /></div> : null}
              </div>
            ))}
            {investmentManagers.map((m) => (
              <div key={`im:${m}`} className="story-card p-4">
                <div className="text-[11.5px] text-muted-foreground">Investment manager</div>
                <div className="mt-1 text-[14px] font-medium">{m}</div>
                {latestD ? <div className="mt-2 text-[12px] text-muted-foreground">Form D, {dateLabel(latestD.filing_date)} <Src url={latestD.source_url} name="EDGAR" /></div> : null}
              </div>
            ))}
            {providers.map((p) => (
              <Link key={`${p.role}:${p.key}`} href={`/database/providers/${p.key}`} className="story-card flex items-center gap-3 p-4">
                <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] text-muted-foreground">{ROLE_LABEL[p.norm]}</span>
                  <span className="block truncate text-[14px] font-medium">{p.brand}</span>
                  {p.norm === "placement_agent" && commissions ? <span className="block text-[12px] text-muted-foreground">{formatUsd(commissions)} sales commissions, as filed</span> : null}
                </span>
                <ArrowUpRight className="story-card-arrow h-4 w-4" />
              </Link>
            ))}
          </div>
          {!adv.length ? (
            <p className="chapter-lead mt-5">
              Its auditor, administrator and custodian are reported on its adviser&rsquo;s Form ADV. {vintage && vintage >= 2025 ? "The SEC's published Form ADV data runs to December 2024, so a fund launched since then is not in it yet." : "This fund is not matched to a Form ADV report yet."}
            </p>
          ) : null}
          {qpOnly || latestD?.offering_indefinite ? (
            <p className="mt-4 text-[12.5px] text-muted-foreground">{[qpOnly ? "Offered to qualified purchasers only (Investment Company Act 3(c)(7))" : null, latestD?.offering_indefinite ? "offering size indefinite" : null].filter(Boolean).join(" · ")}</p>
          ) : null}
        </Chapter>
      ) : null}

      {nPortfolio ? (
        <Chapter
          id="portfolio"
          n={nPortfolio}
          eyebrow="Companies"
          title={named.length ? `${named.length} compan${named.length === 1 ? "y" : "ies"} in this fund.` : "Companies in its programme."}
          lead={`As ${managerName ?? "the manager"}'s own portfolio names the fund behind each holding. Each opens the company.`}
          more={fund.manager ? { href: `/companies/${fund.manager.id}?view=portfolio`, label: "The whole portfolio" } : null}
        >
          {named.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {named.map((h) => (
                <PortcoCard key={h.id} p={h} />
              ))}
            </div>
          ) : null}
          {programme.length ? (
            <>
              <p className={`chapter-lead ${named.length ? "mt-8" : ""}`}>
                {programme.length === 1 ? "One more company is" : `${programme.length} more companies are`} listed under the {[...new Set(programme.map((h) => h.fund_name))].slice(0, 2).join(" and ")} programme, which this fund belongs to. The manager does not say which of the programme&rsquo;s funds made {programme.length === 1 ? "that investment" : "each investment"}.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {programme.map((h) => (
                  <PortcoCard key={h.id} p={h} note={<Chip title={`Listed under "${h.fund_name}"`}>Programme</Chip>} />
                ))}
              </div>
            </>
          ) : null}
        </Chapter>
      ) : null}

      {nBook && lender ? (
        <Chapter
          id="book"
          n={nBook}
          eyebrow="Loan book"
          title={`${book.length.toLocaleString("en-US")} positions, ${formatUsd(bookFv)} at fair value.`}
          lead={`Its own schedule of investments as of ${lender.latest_period ? dateLabel(lender.latest_period) : "its latest filing"}: every position with its instrument, terms, cost and mark${bookIndustries ? `, across ${bookIndustries} industries` : ""}. Marked at ${bookCost > 0 ? `${Math.round((bookFv / bookCost) * 100)}% of cost` : "—"}.`}
          more={{ href: `/database/lenders/${lender.cik}`, label: "Full loan book" }}
        >
          <div className="desk">
            <PositionTable rows={book} limit={25} />
          </div>
        </Chapter>
      ) : null}

      {nInvestors ? (
        <Chapter id="investors" n={nInvestors} eyebrow="Investors" title={`${disclosed.length} investor${disclosed.length === 1 ? " has" : "s have"} disclosed a commitment.`} lead="From each investor's own reports, in its own currency.">
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

      {nManager && fund.manager ? (
        <Chapter id="manager" n={nManager} eyebrow="Other funds" title={`${fund.manager.name}'s other funds.`} more={{ href: `/companies/${fund.manager.id}`, label: fund.manager.name }}>
          <FundFamilies funds={cards} cls={cls} moreHref={`/companies/${fund.manager.id}?view=funds`} />
        </Chapter>
      ) : null}

      {nSources ? (
        <Chapter id="sources" n={nSources} eyebrow="Sources" title="The filings behind it.">
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
            {adv.length ? (
              <div className="story-card p-4">
                <div className="text-[12px] text-muted-foreground">Form ADV Schedule D 7.B.(1), as its adviser reports it</div>
                {adv.map((a) => (
                  <div key={a.adv_fund_id} className="mt-3 border-t border-[var(--border)] pt-3 first:border-t-0 first:pt-0">
                    <p className="font-mono text-[12px]">
                      {a.name} <span className="text-muted-foreground">· {a.adv_fund_id}</span>
                    </p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Gross assets</dt>
                        <dd className="figure">{a.gross_asset_value != null ? formatUsd(a.gross_asset_value) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Fund type</dt>
                        <dd>{a.fund_type === "Other Private Fund" && a.fund_type_other ? a.fund_type_other : (a.fund_type ?? "—")}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Beneficial owners</dt>
                        <dd className="figure">{a.owners != null ? a.owners.toLocaleString("en-US") : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Minimum investment</dt>
                        <dd className="figure">{a.minimum_investment != null && a.minimum_investment > 0 ? formatUsd(a.minimum_investment) : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Owned outside the US</dt>
                        <dd className="figure">{a.pct_non_us != null ? `${a.pct_non_us}%` : "—"}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Filed</dt>
                        <dd>
                          {a.submitted ? dateLabel(a.submitted) : "—"}{" "}
                          {a.adviser_crd ? <Src url={`https://adviserinfo.sec.gov/firm/summary/${a.adviser_crd}`} name="IAPD" /> : null}
                        </dd>
                      </div>
                    </dl>
                  </div>
                ))}
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
        <Chapter id="terms" n={nTerms} eyebrow="Terms" title="What its documents say.">
          <div className="desk">
            <FundProfileSections fund={fund} details={details} formD={formD} />
          </div>
        </Chapter>
      ) : null}
    </StoryPage>
  );
}
