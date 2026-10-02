import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Link2, ListChecks, Mail, MapPin } from "lucide-react";
import { getCompany, getContactsForCompany, getNotes } from "@/lib/queries";
import {
  getCompanyFunds,
  getDisclosedCommitments,
  getFiledProviders,
  getPortfolioCompanies,
  getProviderClients,
  listDirectoryLists,
  listsForCompany,
  nameCommitments,
} from "@/lib/directory/queries";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getDeals, getSignals, teamsHeldBy } from "@/lib/directory/intelligence-queries";
import { getInvestorPlans, getInvestorProfile } from "@/lib/directory/investor-queries";
import { getFundOfferings, getPortcoIntel, lendersManagedBy } from "@/lib/directory/filings-queries";
import { LenderTable, OfferingTable } from "@/components/intel/filings-tables";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { filers, leagueTable } from "@/lib/directory/market";
import { isOperatingRole } from "@/lib/directory/operating";
import { PROVIDER_ROLES } from "@/lib/directory/providers";
import { similarFirms } from "@/lib/directory/similar-server";
import { getSessionUser } from "@/lib/auth";
import { getParticipationForCompany } from "@/lib/event-participants";
import { CompanyEvents } from "@/components/events/event-history";
import { CATEGORIES } from "@/lib/categories";
import { lushaConfigured } from "@/lib/lusha";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { EditableField } from "@/components/editable-field";
import { NotesPanel } from "@/components/notes-panel";
import { PortfolioButton } from "@/components/portfolio-button";
import { ReportButton } from "@/components/report-button";
import { DeleteButton } from "@/components/delete-button";
import { AddToPipelineButton } from "@/components/add-to-pipeline-button";
import { AddToListButton, ClassifyControl, FindSimilarButton } from "@/components/directory/profile-actions";
import {
  AdvPanel,
  Commitments,
  ConnectableBadge,
  FiledProviders,
  headlineSize,
  Overview,
  ProviderClients,
  SimilarFirms,
  type RoleRank,
} from "@/components/directory/profile-sections";
import { FundLineup } from "@/components/directory/fund-lineup";
import { InvestorProfile, ManagerProfile } from "@/components/directory/investor-profile";
import { OperatingPartners, PortfolioCompanies } from "@/components/directory/operators-portfolio";
import { PeerBenchmark } from "@/components/directory/peer-benchmark";
import { IntelShell } from "@/components/intel/shell";
import { DealTable, SignalList } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

const TABS = ["overview", "investor", "manager", "deals", "funds", "portfolio", "people", "events", "providers", "clients", "signals", "peers", "notes"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  return { title: company ? `${company.name} — LPGP Connect` : "Company — LPGP Connect" };
}

export default async function CompanyProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; n?: string }>;
}) {
  const [{ id }, { tab: tabParam, n: nParam }] = await Promise.all([params, searchParams]);
  const portcoShown = Math.min(2000, Math.max(120, Math.floor(Number(nParam)) || 120));
  const company = await getCompany(id);
  if (!company) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";

  const [contacts, funds, providers, providerClients, commitments, notes, lists, onLists, similar, index, portcos, deals, signals, held, user, offerings, lenders, eventRows, investorProfile, investorPlans] =
    await Promise.all([
      getContactsForCompany(id),
      getCompanyFunds(id),
      getFiledProviders(id),
      company.category === "SP" ? getProviderClients(id) : Promise.resolve([]),
      getDisclosedCommitments(id),
      getNotes("company", id),
      listDirectoryLists(),
      listsForCompany(id),
      similarFirms(id),
      getDirectoryIndex(),
      getPortfolioCompanies(id),
      getDeals({ companyId: id, limit: 300 }),
      getSignals({ companyId: id, limit: 100 }),
      teamsHeldBy({ companyId: id }),
      getSessionUser(),
      getFundOfferings({ gpCompanyId: id, limit: 200 }),
      lendersManagedBy(id),
      getParticipationForCompany(id),
      // The researched investor profile and plans (migration 0033); null and
      // empty until the research job has been by, or on an older database.
      company.category === "LP" ? getInvestorProfile(id) : Promise.resolve(null),
      company.category === "LP" ? getInvestorPlans(id) : Promise.resolve([]),
    ]);
  const [asLp, asGp] = await Promise.all([nameCommitments(commitments.asLp), nameCommitments(commitments.asGp)]);

  // Where this provider ranks among the managers that file Form ADV.
  const ranks: RoleRank[] = [];
  const brandIndex = index.brands.findIndex((b) => b.companyId === id);
  if (brandIndex >= 0) {
    const managers = filers(index.records);
    for (const role of PROVIDER_ROLES) {
      const league = leagueTable(managers, index.brands, role, 10_000);
      const at = league.rows.findIndex((r) => r.brandIndex === brandIndex);
      if (at >= 0) ranks.push({ role, rank: at + 1, clients: league.rows[at].clients, of: league.covered });
    }
  }

  const meta = CATEGORIES[company.category];
  const connectable = contacts.filter((c) => c.connectable).length;
  const record = index.records.find((r) => r.id === id) ?? null;
  const operators = contacts.filter((c) => isOperatingRole(c.job_title));
  const ownsCompanies = company.category === "GP" || company.category === "UN" || portcos.length > 0;
  const size = headlineSize(company);
  const staff = company.employee_count ?? company.adv_employee_count ?? null;
  const adv = company.adv_firm_type === "ERA" ? "Exempt reporting" : company.adv_firm_type === "Registered" ? "SEC registered" : null;
  const hq = [company.city, company.country === "United States" ? company.state : company.country].filter(Boolean).join(", ") || company.hq_location || company.region || null;
  const dealCount = deals.length + asLp.length + asGp.length + held.length + offerings.length + lenders.length;
  const base = `/companies/${company.id}`;
  const isAdmin = user?.role === "admin";

  const tabs = [
    { key: "overview", label: "Overview", count: null as number | null },
    ...(company.category === "LP" ? [{ key: "investor", label: "Investor profile", count: null as number | null }] : []),
    ...(company.category === "GP" ? [{ key: "manager", label: "Manager profile", count: null as number | null }] : []),
    { key: "deals", label: "Deals", count: dealCount },
    ...(funds.length || company.category === "GP" ? [{ key: "funds", label: "Funds", count: funds.length }] : []),
    ...(ownsCompanies ? [{ key: "portfolio", label: "Portfolio", count: portcos.length }] : []),
    { key: "people", label: "People", count: contacts.length },
    ...(eventRows.length ? [{ key: "events", label: "Events", count: new Set(eventRows.map((r) => r.event_name)).size }] : []),
    ...(providers.length ? [{ key: "providers", label: "Service providers", count: providers.length }] : []),
    ...(providerClients.length ? [{ key: "clients", label: "Clients", count: providerClients.length }] : []),
    { key: "signals", label: "Signals", count: signals.length },
    ...(record ? [{ key: "peers", label: "Peers", count: null as number | null }] : []),
    { key: "notes", label: "Notes", count: notes.length },
  ].map((t) => ({ href: t.key === "overview" ? base : `${base}?tab=${t.key}`, label: t.label, count: t.count, active: tab === t.key }));

  return (
    <IntelShell
      crumbs={[{ href: "/database?view=table", label: "Firms" }, { href: `/database?book=${company.category}`, label: meta.name }, { label: company.name }]}
      title={
        <span className="flex items-center gap-3">
          <CompanyLogo name={company.name} domain={company.domain} size={44} />
          <span className="min-w-0">
            <span className="block">{company.name}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] font-normal tracking-normal">
              <CategoryBadge category={company.category} showName className="rounded-[3px] px-1.5 py-0 text-[10px]" />
              {company.sub_type ? <Tag>{company.sub_type}</Tag> : null}
              {hq ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <MapPin className="h-3 w-3" /> {hq}
                </span>
              ) : null}
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <Globe className="h-3 w-3" /> {company.domain ?? "Website"}
                </a>
              ) : null}
              {company.linkedin_url ? (
                <a href={company.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <Link2 className="h-3 w-3" /> LinkedIn
                </a>
              ) : null}
              {onLists.length ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground" data-no-print>
                  <ListChecks className="h-3 w-3" />
                  {onLists.map((l, i) => (
                    <span key={l.id}>
                      <Link href={`/database/lists/${l.id}`} className="hover:underline">
                        {l.name}
                      </Link>
                      {i < onLists.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      }
      actions={
        <div className="flex flex-wrap gap-1.5" data-no-print>
          <AddToPipelineButton companyId={company.id} />
          <AddToListButton companyId={company.id} lists={lists.map((l) => ({ id: l.id, name: l.name }))} onLists={onLists.map((l) => l.id)} />
          <FindSimilarButton companyId={company.id} />
          <ReportButton />
          <PortfolioButton id={company.id} initial={company.in_portfolio} />
        </div>
      }
      tabs={<SubTabs items={tabs} />}
    >
      <StatStrip>
        <Stat
          label="Size"
          value={size.value != null ? formatUsd(size.value) : (company.aum ?? "—")}
          basis={size.basis}
          defn="The best size figure on record and what it measures. Regulatory AUM is what an SEC-registered adviser reports on Form ADV; exempt advisers report private fund gross assets; LPs show total assets."
        />
        <Stat label="Team" value={staff != null ? staff.toLocaleString("en-US") : (company.employee_range ?? "—")} basis={company.employee_count ? "Lusha" : company.adv_employee_count ? "Form ADV" : undefined} />
        <Stat label="Founded" value={company.founded_year ?? "—"} basis={company.years_active ? `${company.years_active} years active` : undefined} />
        {company.category === "SP" && brandIndex >= 0 ? (
          <Stat label="Form ADV clients" value={index.brands[brandIndex].clients} basis={ranks[0] ? `#${ranks[0].rank} ${ranks[0].role.replace("_", " ")} by managers` : undefined} href={`${base}?tab=clients`} />
        ) : company.category === "LP" ? (
          <Stat label="Commitments" value={asLp.filter((c) => c.source !== "sample").length} basis={company.discloses_commitments ? company.discloses_commitments.split(" - ")[0] : "public disclosures"} href={`${base}?tab=deals`} />
        ) : (
          <Stat label="Form ADV" value={<span className="text-[15px]">{adv ?? "Not on file"}</span>} basis={company.private_fund_count != null ? `${company.private_fund_count} private funds` : company.adv_last_filed ? `Filed ${company.adv_last_filed}` : undefined} />
        )}
        <Stat label="Deals" value={dealCount} basis={held.length ? `${held.length} sports stake${held.length === 1 ? "" : "s"}` : "on record"} href={`${base}?tab=deals`} />
        <Stat label="People" value={contacts.length} basis={connectable ? `${connectable} with a direct email` : contacts.length ? "names and titles" : undefined} href={`${base}?tab=people`} />
      </StatStrip>

      {company.category === "UN" ? (
        <div data-no-print>
          <ClassifyControl companyId={company.id} />
        </div>
      ) : null}

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <Overview company={company} />
            {deals.length ? (
              <Box title="Latest deals" count={dealCount} action={<Link href={`${base}?tab=deals`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All deals</Link>} flush>
                <DealTable deals={deals.slice(0, 6)} compact />
              </Box>
            ) : null}
            {providers.length ? <FiledProviders rows={providers} /> : null}
            <AdvPanel company={company} />
          </div>
          <div className="space-y-4">
            {signals.length ? (
              <Box title="Signals" count={signals.length} action={<Link href={`${base}?tab=signals`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All</Link>} flush>
                <SignalList signals={signals} limit={5} />
              </Box>
            ) : null}
            <SimilarFirms hits={similar} companyId={company.id} />
            {contacts.length ? (
              <Box title="Key people" count={contacts.length} action={<Link href={`${base}?tab=people`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All</Link>} flush>
                <ul className="divide-y">
                  {contacts.slice(0, 6).map((c) => (
                    <li key={c.id}>
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40">
                        <PersonAvatar name={c.full_name} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px] font-medium">{c.full_name ?? "—"}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{c.job_title ?? "—"}</span>
                        </span>
                        {c.connectable ? <Mail className="h-3.5 w-3.5 text-[var(--success)]" /> : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Box>
            ) : null}
            {isAdmin ? (
              <details className="rounded-[4px] border bg-card" data-no-print>
                <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">Edit firm details</summary>
                <div className="divide-y border-t px-3 pb-3">
                  <EditableField entity="company" id={company.id} field="sub_type" value={company.sub_type} label="Type" placeholder={meta.subTypes[0]} />
                  <EditableField entity="company" id={company.id} field="status" value={company.status} label="Status" placeholder="e.g. Active Allocator" />
                  <EditableField entity="company" id={company.id} field="website" value={company.website} label="Website" link="url" />
                  <EditableField entity="company" id={company.id} field="domain" value={company.domain} label="Domain" />
                  <EditableField entity="company" id={company.id} field="linkedin_url" value={company.linkedin_url} label="LinkedIn" link="url" />
                  <EditableField entity="company" id={company.id} field="country" value={company.country} label="Country" />
                  <EditableField entity="company" id={company.id} field="city" value={company.city} label="City" />
                  <EditableField entity="company" id={company.id} field="aum_usd" value={company.aum_usd?.toString()} label="AUM override (USD)" placeholder="only when no filing states it" />
                  <EditableField entity="company" id={company.id} field="description" value={company.description} label="Description" multiline placeholder="What does this firm do?" />
                  <div className="pt-3">
                    <DeleteButton kind="company" id={company.id} />
                  </div>
                </div>
              </details>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "investor" && company.category === "LP" ? <InvestorProfile company={company} profile={investorProfile} plans={investorPlans} commitments={asLp} /> : null}
      {tab === "manager" && company.category === "GP" ? <ManagerProfile company={company} funds={funds} /> : null}

      {tab === "deals" ? (
        <div className="space-y-4">
          <Box title="Deals" count={deals.length} flush defn="Sourced transactions where this firm is the investor or the target: fund closes, acquisitions, stake sales, financings.">
            <DealTable deals={deals} />
          </Box>
          {held.length ? (
            <Box title="Sports holdings" count={held.length} flush>
              <div className="overflow-x-auto">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Club / team</th>
                      <th>League</th>
                      <th className="num">Stake</th>
                      <th className="num">Since</th>
                      <th className="num">Invested</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {held.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <Link href={`/database/sports/${h.team.id}`} className="flex items-center gap-2 font-medium">
                            <CompanyLogo name={h.team.short_name ?? h.team.name} domain={h.team.domain} size={20} />
                            {h.team.short_name ?? h.team.name}
                          </Link>
                        </td>
                        <td className="text-muted-foreground">{h.team.league}</td>
                        <td className="num">{h.stake_pct != null ? `${h.stake_pct}%` : "—"}</td>
                        <td className="num">{h.since_year ?? "—"}</td>
                        <td className="num">{formatMoney(h.amount, h.currency)}</td>
                        <td>
                          <Src url={h.source_url} name="source" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
          ) : null}
          {lenders.length ? (
            <Box title="Lends through" count={lenders.length} flush defn="Business development companies this firm manages, with the loan book each tags in its own 10-Q and 10-K.">
              <LenderTable rows={lenders} />
            </Box>
          ) : null}
          {offerings.length ? (
            <Box title="Form D raises" count={offerings.length} flush defn="Funds whose Form D names this firm, or one of its entities, as general partner or manager: what each has sold to date, per its latest filing.">
              <OfferingTable rows={offerings} />
            </Box>
          ) : null}
          <Commitments rows={asLp} as="lp" />
          <Commitments rows={asGp} as="gp" />
        </div>
      ) : null}

      {tab === "funds" ? (
        funds.length ? (
          <FundLineup funds={funds} reported={company.private_fund_count ?? null} sourceUrl={company.adv_source_url ?? null} />
        ) : (
          <Box title="Funds">
            <Empty>No funds on file for this firm.</Empty>
          </Box>
        )
      ) : null}

      {tab === "portfolio" ? (
        <div className="space-y-4">
          <PortfolioCompanies
            companyId={company.id}
            rows={portcos.slice(0, portcoShown)}
            total={portcos.length}
            moreHref={`${base}?tab=portfolio&n=${portcoShown + 120}`}
            aiReady={Boolean(process.env.ANTHROPIC_API_KEY)}
            intel={Object.fromEntries(await getPortcoIntel(portcos.slice(0, portcoShown).map((p) => p.intel_key ?? "")))}
          />
          <OperatingPartners
            companyId={company.id}
            hasDomain={Boolean(company.domain)}
            lushaReady={lushaConfigured()}
            rows={operators.map((c) => ({ id: c.id, full_name: c.full_name, job_title: c.job_title, city: c.city, country: c.country, linkedin_url: c.linkedin_url, source: c.source ?? null }))}
          />
        </div>
      ) : null}

      {tab === "people" ? (
        <Box
          title="People"
          count={contacts.length}
          flush
          action={
            connectable ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Mail className="h-3 w-3 text-[var(--success)]" /> {connectable} with a direct email
              </span>
            ) : null
          }
        >
          {contacts.length ? (
            <div className="overflow-x-auto">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Email</th>
                    <th>Location</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/contacts/${c.id}`} className="flex items-center gap-2 font-medium">
                          <PersonAvatar name={c.full_name} size={22} />
                          {c.full_name ?? "—"}
                          {isOperatingRole(c.job_title) ? <Tag>Operating</Tag> : null}
                        </Link>
                      </td>
                      <td className="max-w-[300px] text-muted-foreground">{c.job_title ?? "—"}</td>
                      <td className="text-muted-foreground">{c.email ?? (c.connectable ? <ConnectableBadge /> : "—")}</td>
                      <td className="whitespace-nowrap text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="text-muted-foreground">{c.source === "master_directory" ? "Master Directory" : c.source === "lusha" ? "Lusha" : (c.source ?? "—")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No contacts yet. Use Import to add people.</Empty>
          )}
        </Box>
      ) : null}

      {tab === "events" ? (
        <Box title="Events" count={new Set(eventRows.map((r) => r.event_name)).size} flush>
          <CompanyEvents rows={eventRows} />
        </Box>
      ) : null}

      {tab === "providers" ? <FiledProviders rows={providers} /> : null}
      {tab === "clients" ? <ProviderClients clients={providerClients} ranks={ranks} brandKey={brandIndex >= 0 ? index.brands[brandIndex].key : null} /> : null}

      {tab === "signals" ? (
        <Box title="Signals naming this firm" count={signals.length} flush>
          <SignalList signals={signals} />
        </Box>
      ) : null}

      {tab === "peers" && record ? <PeerBenchmark firm={record} records={index.records} /> : null}

      {tab === "notes" ? (
        <Box title="Notes" count={notes.length}>
          <NotesPanel entityType="company" entityId={company.id} notes={notes} />
        </Box>
      ) : null}
    </IntelShell>
  );
}
