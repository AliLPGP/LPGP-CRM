import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/company-logo";
import { IntelShell } from "@/components/intel/shell";
import { DealTable, SignalList, dateLabel } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL, OWNERSHIP_TYPE_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getDeal, getSportsTeam, getTeamOwners, relatedDeals, signalsNaming } from "@/lib/directory/intelligence-queries";
import { AMOUNT_BASIS_LABEL, formatCount, formatMoney, SPORT_LABEL } from "@/lib/directory/intelligence-types";
import { portcoHref } from "@/lib/directory/portco-intel";
import { getCompany } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  return { title: deal ? `${deal.headline} — LPGP Intelligence` : "Deal — LPGP Intelligence" };
}

const TARGET_KIND: Record<string, string> = { club: "Club", team: "Team", league: "League", competition: "Competition", company: "Company", fund: "Fund", asset: "Asset", other: "Other" };
const RECORD_SOURCE: Record<string, string> = { web_research: "Web research, with the page that states it", manual: "Entered by hand", refresh: "Daily refresh", sec_edgar: "SEC EDGAR filing, read by the database" };

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDeal(id);
  if (!deal) notFound();
  const [related, signals, team, targetCompany, investorCompany] = await Promise.all([
    relatedDeals(deal),
    signalsNaming([deal.investor, deal.target, deal.seller ?? ""]),
    deal.target_team_id ? getSportsTeam(deal.target_team_id) : null,
    deal.target_company_id ? getCompany(deal.target_company_id) : null,
    deal.investor_company_id ? getCompany(deal.investor_company_id) : null,
  ]);
  const owners = team ? await getTeamOwners([team.id]) : [];
  const cls = ASSET_CLASS_BY_KEY[deal.asset_class as AssetClassKey];
  // Arithmetic only, and labelled as such: a stake and the price paid for it
  // imply the whole. Shown when both are stated in one currency.
  const implied = deal.amount != null && deal.stake_pct != null && deal.stake_pct > 0 && deal.currency ? deal.amount / (deal.stake_pct / 100) : null;
  const targetHref = deal.target_team_id
    ? `/database/sports/${deal.target_team_id}`
    : deal.target_company_id
      ? `/companies/${deal.target_company_id}`
      : deal.target_fund_id
        ? `/funds/${deal.target_fund_id}`
        : deal.target_key && (deal.target_kind === "company" || deal.source === "web_research")
          ? portcoHref(deal.target_key)
          : null;
  const basis = deal.amount_basis ? (AMOUNT_BASIS_LABEL[deal.amount_basis] ?? deal.amount_basis) : null;
  const investorHref = deal.investor_company_id ? `/companies/${deal.investor_company_id}` : deal.investor_id ? `/database/sports/investors/${deal.investor_id}` : null;
  const timeline = [...related.target, deal].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  return (
    <IntelShell
      crumbs={[{ href: "/database/deals", label: "Deals" }, ...(cls ? [{ href: `/database/asset-classes/${cls.slug}?tab=deals`, label: cls.name }] : []), { label: DEAL_KIND_LABEL[deal.kind] ?? deal.kind }]}
      kicker={
        <span className="flex flex-wrap items-center gap-1.5">
          <span>{dateLabel(deal.date, deal.date_text)}</span>
          <Tag strong>{DEAL_KIND_LABEL[deal.kind] ?? deal.kind}</Tag>
          {cls ? (
            <Link href={`/database/asset-classes/${cls.slug}`} className="tag hover:text-foreground">
              {cls.short}
            </Link>
          ) : null}
          {deal.sport ? <Tag>{SPORT_LABEL[deal.sport] ?? deal.sport}</Tag> : null}
        </span>
      }
      title={deal.headline}
      description={deal.summary}
      actions={<Src url={deal.source_url} name={deal.source_name ?? "Source"} className="text-[12px]" />}
    >
      <StatStrip>
        <Stat
          label="Amount"
          value={formatMoney(deal.amount, deal.currency)}
          basis={deal.currency ? `${basis ? basis + ", " : ""}in ${deal.currency}, as the source states it` : "not stated"}
          defn={deal.verified ? "Re-read against the source page before it was stored." : deal.verified === false ? "The source page could not be re-read when the figure was checked." : undefined}
        />
        <Stat label="Stake" value={deal.stake_pct != null ? `${deal.stake_pct}%` : "—"} basis={deal.seller ? `from ${deal.seller}` : undefined} />
        <Stat label="Valuation" value={formatMoney(deal.valuation, deal.valuation_currency)} basis={deal.valuation != null ? "as the source states it" : "not stated"} />
        <Stat
          label="Implied whole"
          value={implied != null ? formatMoney(implied, deal.currency) : "—"}
          basis={implied != null ? `${formatMoney(deal.amount, deal.currency)} ÷ ${deal.stake_pct}%` : "needs amount and stake"}
          defn="Arithmetic, not a reported figure: the price paid divided by the stake it bought. A stated valuation, when the source gives one, is the better number."
        />
        <Stat label="Investor" value={<span className="text-[15px]">{deal.investor}</span>} basis={deal.investor_type ? (INVESTOR_TYPE_LABEL[deal.investor_type] ?? deal.investor_type) : undefined} href={investorHref ?? undefined} />
        <Stat label="Target" value={<span className="text-[15px]">{deal.target}</span>} basis={[deal.target_kind ? TARGET_KIND[deal.target_kind] : null, deal.target_country].filter(Boolean).join(" · ") || undefined} href={targetHref ?? undefined} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Box title="Terms" flush defn="Everything the source states about the transaction. A dash is a term the page did not give; nothing here is estimated.">
            <dl className="kv px-3 py-1">
              <dt>Date</dt>
              <dd>{dateLabel(deal.date, deal.date_text)}{deal.date && deal.date_text ? <span className="text-muted-foreground"> · {deal.date_text}</span> : null}</dd>
              <dt>Kind</dt>
              <dd>{DEAL_KIND_LABEL[deal.kind] ?? deal.kind}</dd>
              <dt>Investor</dt>
              <dd>
                {investorHref ? <Link href={investorHref} className="font-medium">{deal.investor}</Link> : deal.investor}
                {deal.investor_type ? <span className="text-muted-foreground"> · {INVESTOR_TYPE_LABEL[deal.investor_type] ?? deal.investor_type}</span> : null}
                {investorCompany ? <span className="tag ml-1.5">Directory firm</span> : null}
              </dd>
              <dt>Target</dt>
              <dd>
                {targetHref ? <Link href={targetHref} className="font-medium">{deal.target}</Link> : deal.target}
                {deal.target_kind ? <span className="text-muted-foreground"> · {TARGET_KIND[deal.target_kind] ?? deal.target_kind}</span> : null}
                {deal.target_country ? <span className="text-muted-foreground"> · {deal.target_country}</span> : null}
                {targetCompany ? <span className="tag ml-1.5">Directory firm</span> : null}
              </dd>
              {deal.co_investors?.length ? (
                <>
                  <dt>Alongside</dt>
                  <dd>{deal.co_investors.join(", ")}</dd>
                </>
              ) : null}
              {deal.round ? (
                <>
                  <dt>Round</dt>
                  <dd>{deal.round}</dd>
                </>
              ) : null}
              <dt>Seller</dt>
              <dd>{deal.seller ?? "—"}</dd>
              <dt>Stake</dt>
              <dd className="figure">{deal.stake_pct != null ? `${deal.stake_pct}%` : "—"}</dd>
              <dt>Amount</dt>
              <dd className="figure">
                {formatMoney(deal.amount, deal.currency)}
                {deal.amount != null && deal.currency ? <span className="text-muted-foreground"> {deal.currency}{basis ? ` · ${basis}` : ""}</span> : null}
              </dd>
              <dt>Valuation</dt>
              <dd className="figure">{formatMoney(deal.valuation, deal.valuation_currency)}{deal.valuation != null && deal.valuation_currency ? <span className="text-muted-foreground"> {deal.valuation_currency}</span> : null}</dd>
              <dt>Asset class</dt>
              <dd>{cls ? <Link href={`/database/asset-classes/${cls.slug}`}>{cls.name}</Link> : deal.asset_class}{deal.sport ? <span className="text-muted-foreground"> · {SPORT_LABEL[deal.sport] ?? deal.sport}</span> : null}</dd>
              <dt>Source</dt>
              <dd>
                <Src url={deal.source_url} name={deal.source_name ?? "page"} className="text-[12.5px]" />
                {deal.source_url ? <div className="truncate text-[11px] text-muted-foreground" title={deal.source_url}>{deal.source_url.replace(/^https?:\/\//, "")}</div> : null}
              </dd>
              {deal.evidence ? (
                <>
                  <dt>The page says</dt>
                  <dd>
                    <blockquote className="border-l-2 pl-2 text-[12.5px] leading-snug">{deal.evidence}</blockquote>
                  </dd>
                </>
              ) : null}
              {deal.verified != null ? (
                <>
                  <dt>Checked</dt>
                  <dd className="text-muted-foreground">{deal.verified ? "Re-read against the source page before it was stored" : "The source page could not be re-read at the check; shown as the release reported it"}</dd>
                </>
              ) : null}
              <dt>On record</dt>
              <dd className="text-muted-foreground">{RECORD_SOURCE[deal.source] ?? deal.source} · added {dateLabel(deal.created_at.slice(0, 10))}</dd>
            </dl>
          </Box>

          <Box title={`${deal.target} — deal history`} count={timeline.length} flush defn="Every transaction on file for the target, this one included, newest first.">
            <DealTable deals={timeline} showClass={false} compact />
          </Box>

          <Box title={`${deal.investor} — other deals`} count={related.investor.length} flush>
            {related.investor.length ? <DealTable deals={related.investor} compact /> : <Empty>No other deals on file for this investor.</Empty>}
          </Box>
        </div>

        <div className="space-y-4">
          {team ? (
            <Box title="The club today" flush defn="From the club's own record: the latest figures on file, each with its source on the profile.">
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <CompanyLogo name={team.short_name ?? team.name} domain={team.domain} size={24} />
                <Link href={`/database/sports/${team.id}`} className="min-w-0 flex-1 truncate font-medium">
                  {team.name}
                </Link>
                <span className="text-[11px] text-muted-foreground">{[team.league, team.country].filter(Boolean).join(" · ")}</span>
              </div>
              <dl className="kv px-3 py-1">
                <dt>Revenue</dt>
                <dd className="figure">{formatMoney(team.revenue, team.revenue_currency)}{team.revenue_season ? <span className="text-muted-foreground"> · {team.revenue_season}</span> : null}</dd>
                <dt>Valuation</dt>
                <dd className="figure">{formatMoney(team.valuation, team.valuation_currency)}{team.valuation_year ? <span className="text-muted-foreground"> · {team.valuation_year}</span> : null}</dd>
                <dt>Following</dt>
                <dd className="figure">{formatCount(team.social_followers)}</dd>
                <dt>Stadium</dt>
                <dd className="figure">{team.stadium_capacity != null ? team.stadium_capacity.toLocaleString("en-US") : "—"}{team.stadium ? <span className="text-muted-foreground"> · {team.stadium}</span> : null}</dd>
                <dt>Ownership</dt>
                <dd>{OWNERSHIP_TYPE_LABEL[team.ownership_type ?? "unknown"]}</dd>
                <dt>Institutional</dt>
                <dd>{owners.filter((o) => o.institutional).map((o) => `${o.name}${o.stake_pct != null ? ` ${o.stake_pct}%` : ""}`).join(" · ") || "—"}</dd>
              </dl>
            </Box>
          ) : null}

          {targetCompany || investorCompany ? (
            <Box title="In the directory" flush>
              <ul className="divide-y">
                {[investorCompany, targetCompany].filter(Boolean).map((c) => (
                  <li key={c!.id}>
                    <Link href={`/companies/${c!.id}`} className="flex items-center gap-2 px-3 py-2 text-[12.5px] hover:bg-accent/40">
                      <CompanyLogo name={c!.name} domain={c!.domain} size={22} />
                      <span className="min-w-0 flex-1 truncate font-medium">{c!.name}</span>
                      <span className="text-[11px] text-muted-foreground">{c!.category}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}

          <Box title="Signals naming the parties" count={signals.length} flush>
            {signals.length ? <SignalList signals={signals} limit={8} /> : <Empty>No news items on file name {deal.investor} or {deal.target}.</Empty>}
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
