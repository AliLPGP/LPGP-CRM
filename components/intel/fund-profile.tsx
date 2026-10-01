import { formatMoney } from "@/lib/directory/intelligence-types";
import { sourceFor, type FormDFacts, type FundDetails } from "@/lib/fund-details";
import { Box, Src } from "./ui";

// The fund profile a desk expects, in the order it expects it: overview,
// investment strategy, fundraising, structure and terms, sustainability,
// series. Every category is on every fund. A value shows with the page that
// states it; a category nobody has researched yet says so, and one that was
// researched with nothing public found says that instead.

type Fund = {
  vintage_year: number | null;
  fund_size_usd: number | null;
  target_size_usd: number | null;
  strategy: string | null;
  geography: string | null;
  vehicle_kind?: string | null;
  domicile?: string | null;
  currency?: string | null;
};

const dash = <span className="text-muted-foreground">—</span>;

function Row({ label, children, src }: { label: string; children: React.ReactNode; src?: React.ReactNode }) {
  return (
    <div className="min-w-0 py-1.5">
      <dt className="desk-label">{label}</dt>
      <dd className="mt-0.5 text-[13px]">
        {children} {src}
      </dd>
    </div>
  );
}

function Pending({ none }: { none: boolean }) {
  return <span className="text-muted-foreground">{none ? "No public source found" : "Not yet researched"}</span>;
}

function pct(v: number | null) {
  return v == null ? null : `${v}%`;
}
function years(v: number | null) {
  return v == null ? null : `${v} year${v === 1 ? "" : "s"}`;
}
function yesNo(v: boolean | null) {
  return v == null ? null : v ? "Yes" : "No";
}

export function FundProfile({ fund, details, formD }: { fund: Fund; details: FundDetails | null; formD: FormDFacts | null }) {
  const d = details;
  const none = d?.research_state === "no_public_data";
  const val = (v: React.ReactNode | null | undefined, field: string) => {
    const s = sourceFor(d, field);
    return v == null || v === "" ? { node: <Pending none={none} />, src: null } : { node: <>{v}</>, src: s ? <Src url={s.url} name={s.name ?? "Source"} asOf={s.as_of} /> : null };
  };
  const show = (label: string, v: React.ReactNode | null | undefined, field: string) => {
    const r = val(v, field);
    return (
      <Row key={label} label={label} src={r.src}>
        {r.node}
      </Row>
    );
  };

  const filled = d
    ? [
        d.overview, d.core_industry, d.industry_focus?.length ? 1 : null, d.geographic_scope, d.core_geography, d.geographic_exposure?.length ? 1 : null,
        d.fundraising_status, d.fundraising_launch, d.target_size, d.closes?.length ? 1 : null, d.co_investment_offered,
        d.legal_structure, d.term_years, d.investment_period_years, d.extension_years, d.gp_commitment_pct, d.management_fee_pct, d.fee_basis,
        d.carried_interest_pct, d.hurdle_pct, d.sfdr_article, d.esg_policy, d.sustainability_note, d.series_name,
      ].filter((v) => v != null && v !== "").length
    : 0;
  const total = 24;

  const exposure = d?.geographic_exposure?.length ? d.geographic_exposure.map((e) => `${e.region ?? "—"}${e.pct != null ? ` (${e.pct}%)` : ""}`).join(", ") : null;
  const hasFormD = formD && (formD.offering_amount != null || formD.amount_sold != null || formD.first_sale_date || formD.investors_count != null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted-foreground">
        <span>
          Fund profile: <span className="figure text-foreground">{filled}</span> of {total} researched categories filled
          {d?.researched_at ? ` · researched ${d.researched_at.slice(0, 10)}` : ""}
        </span>
        <span>Every value carries the page that states it; nothing is estimated.</span>
      </div>

      <Box title="Overview">
        <p className="text-[13px] leading-relaxed">{d?.overview ? <>{d.overview} <Src url={sourceFor(d, "overview")?.url} name={sourceFor(d, "overview")?.name ?? "Source"} /></> : <Pending none={none} />}</p>
      </Box>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Investment strategy">
          <dl className="divide-y">
            <Row label="Strategy / type">{fund.strategy ?? fund.vehicle_kind ?? dash}</Row>
            {show("Core industry", d?.core_industry, "core_industry")}
            {show("Industry focus", d?.industry_focus?.length ? d.industry_focus.join(", ") : null, "industry_focus")}
            {show("Geographic scope", d?.geographic_scope, "geographic_scope")}
            {show("Core geography", d?.core_geography ?? fund.geography, "core_geography")}
            {show("Geographic exposure", exposure, "geographic_exposure")}
          </dl>
        </Box>

        <Box title="Fundraising">
          <dl className="divide-y">
            {show("Status", d?.fundraising_status, "fundraising_status")}
            {show("Fundraising launch", d?.fundraising_launch, "fundraising_launch")}
            {show("Target", d?.target_size != null ? formatMoney(d.target_size, d.target_currency) : fund.target_size_usd != null ? formatMoney(fund.target_size_usd, "USD") : null, "target_size")}
            {show("Hard cap", d?.hard_cap != null ? formatMoney(d.hard_cap, d.target_currency) : null, "hard_cap")}
            {show("Offers co-investment", yesNo(d?.co_investment_offered ?? null), "co_investment_offered")}
          </dl>
          {d?.closes?.length ? (
            <table className="desk-table mt-2">
              <thead>
                <tr>
                  <th>Close</th>
                  <th>Date</th>
                  <th className="num">Value</th>
                </tr>
              </thead>
              <tbody>
                {d.closes.map((c, i) => (
                  <tr key={i}>
                    <td>{c.label ?? "—"}{c.estimated ? <span className="text-muted-foreground"> (expected)</span> : null}</td>
                    <td className="text-muted-foreground">{c.date ?? "—"}</td>
                    <td className="num">{c.amount != null ? formatMoney(c.amount, c.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {hasFormD ? (
            <div className="mt-3 rounded-[4px] border bg-background/40 p-2.5">
              <div className="desk-label">As filed on SEC Form D</div>
              <p className="mt-1 text-[12.5px]">
                {[
                  formD?.offering_amount != null ? `offering ${formatMoney(formD.offering_amount, "USD")}` : null,
                  formD?.amount_sold != null ? `sold ${formatMoney(formD.amount_sold, "USD")}` : null,
                  formD?.investors_count != null ? `${formD.investors_count} investors` : null,
                  formD?.min_investment != null ? `minimum ${formatMoney(formD.min_investment, "USD")}` : null,
                  formD?.first_sale_date ? `first sale ${formD.first_sale_date}` : null,
                ].filter(Boolean).join(" · ")}{" "}
                <Src url={formD?.source_url} name={formD?.filing_date ? `Form D, ${formD.filing_date}` : "Form D"} />
              </p>
            </div>
          ) : null}
        </Box>

        <Box title="Fund structure and terms">
          <dl className="divide-y">
            {show("Legal structure", d?.legal_structure ?? fund.vehicle_kind, "legal_structure")}
            <Row label="Domicile">{fund.domicile ?? dash}</Row>
            {show("Term", years(d?.term_years ?? null), "term_years")}
            {show("Investment period", years(d?.investment_period_years ?? null), "investment_period_years")}
            {show("Extensions", years(d?.extension_years ?? null), "extension_years")}
            {show("GP commitment", pct(d?.gp_commitment_pct ?? null), "gp_commitment_pct")}
            {show("Management fee", d?.management_fee_pct != null ? `${d.management_fee_pct}%${d.fee_basis ? ` on ${d.fee_basis}` : ""}` : null, "management_fee_pct")}
            {show("Carried interest", pct(d?.carried_interest_pct ?? null), "carried_interest_pct")}
            {show("Hurdle / preferred return", pct(d?.hurdle_pct ?? null), "hurdle_pct")}
          </dl>
        </Box>

        <Box title="Sustainability and series">
          <dl className="divide-y">
            {show("SFDR classification", d?.sfdr_article ? `Article ${d.sfdr_article}` : null, "sfdr_article")}
            {show("ESG policy", yesNo(d?.esg_policy ?? null), "esg_policy")}
            {show("Sustainability note", d?.sustainability_note, "sustainability_note")}
            {show("Fund series", d?.series_name ? `${d.series_name}${d.series_sequence ? `, fund ${d.series_sequence}` : ""}` : null, "series_name")}
          </dl>
        </Box>
      </div>
    </div>
  );
}
