import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe, Link2, ListChecks, MapPin } from "lucide-react";
import { listDirectoryListNames, listsForCompany } from "@/lib/directory/queries";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getProfileCounts, profileCompany } from "@/lib/directory/profile-queries";
import { filers, leagueTable } from "@/lib/directory/market";
import { PROVIDER_ROLES } from "@/lib/directory/providers";
import { CATEGORIES } from "@/lib/categories";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { PortfolioButton } from "@/components/portfolio-button";
import { ReportButton } from "@/components/report-button";
import { AddToPipelineButton } from "@/components/add-to-pipeline-button";
import { AddToListButton, ClassifyControl, FindSimilarButton } from "@/components/directory/profile-actions";
import { headlineSize, type RoleRank } from "@/components/directory/profile-sections";
import { ProfileTabBar, ProfileTabPanel, type ProfileTab } from "@/components/directory/profile-tabs";
import { IntelShell } from "@/components/intel/shell";
import { Stat, StatStrip, Tag } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";
import {
  ClientsTab,
  DealsTab,
  EventsTab,
  FundsTab,
  InvestorTab,
  ManagerTab,
  NotesTab,
  OverviewTab,
  PeersTab,
  PeopleTab,
  PortfolioTab,
  ProvidersTab,
  SignalsTab,
  TabSkeleton,
} from "./tabs";

export const dynamic = "force-dynamic";

// A firm's profile. The shell — header, stat strip, tab bar — draws from
// the firm's own row, one count function (migration 0037) and the
// directory index that is already in memory; every tab's rows come behind
// a Suspense boundary. The light tabs come with the page and switch in the
// browser; the heavy ones (deals, the investor profile, the fund lineup,
// the portfolio, a provider's clients) are fetched when asked for and
// stream in behind the header.

const TABS = ["overview", "investor", "manager", "deals", "funds", "portfolio", "people", "events", "providers", "clients", "signals", "peers", "notes"] as const;
type Tab = (typeof TABS)[number];
const EAGER: ReadonlySet<Tab> = new Set<Tab>(["overview", "manager", "people", "events", "providers", "signals", "notes"]);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await profileCompany(id);
  return { title: company ? `${company.name} — LPGP Intelligence` : "Company — LPGP Intelligence" };
}

export default async function CompanyProfile({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const [{ id }, { tab: tabParam }] = await Promise.all([params, searchParams]);
  const [company, counts, index, lists, onLists] = await Promise.all([
    profileCompany(id),
    getProfileCounts(id),
    getDirectoryIndex(),
    listDirectoryListNames(),
    listsForCompany(id),
  ]);
  if (!company) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";

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
  const record = index.records.find((r) => r.id === id) ?? null;
  const ownsCompanies = company.category === "GP" || company.category === "UN" || counts.portcos > 0;
  const size = headlineSize(company);
  const staff = company.employee_count ?? company.adv_employee_count ?? null;
  const adv = company.adv_firm_type === "ERA" ? "Exempt reporting" : company.adv_firm_type === "Registered" ? "SEC registered" : null;
  const hq = [company.city, company.country === "United States" ? company.state : company.country].filter(Boolean).join(", ") || company.hq_location || company.region || null;
  const providerClients = company.category === "SP" ? counts.clients : 0;
  const dealCount = counts.deals + counts.asLp + counts.asGp + counts.held + counts.offerings + counts.lenders;
  const base = `/companies/${company.id}`;

  const tabs: ProfileTab[] = [
    { key: "overview", label: "Overview", count: null as number | null },
    ...(company.category === "LP" ? [{ key: "investor", label: "Investor profile", count: null as number | null }] : []),
    ...(company.category === "GP" ? [{ key: "manager", label: "Manager profile", count: null as number | null }] : []),
    { key: "deals", label: "Deals", count: dealCount },
    ...(counts.funds || company.category === "GP" ? [{ key: "funds", label: "Funds", count: counts.funds }] : []),
    ...(ownsCompanies ? [{ key: "portfolio", label: "Portfolio", count: counts.portcos }] : []),
    { key: "people", label: "People", count: counts.contacts },
    ...(counts.events ? [{ key: "events", label: "Events", count: counts.events }] : []),
    ...(counts.providers ? [{ key: "providers", label: "Service providers", count: counts.providers }] : []),
    ...(providerClients ? [{ key: "clients", label: "Clients", count: providerClients }] : []),
    { key: "signals", label: "Signals", count: counts.signals },
    ...(record ? [{ key: "peers", label: "Peers", count: null as number | null }] : []),
    { key: "notes", label: "Notes", count: counts.notes },
  ].map((t) => ({ key: t.key, href: t.key === "overview" ? base : `${base}?tab=${t.key}`, label: t.label, count: t.count, eager: EAGER.has(t.key as Tab) }));

  // The tabs whose rows come with the page: each behind its own boundary,
  // so the one on screen streams in as soon as its own reads are done.
  const panel = (key: Tab, node: React.ReactNode) => [key, <Suspense key={key} fallback={<TabSkeleton />}>{node}</Suspense>] as const;
  const panels = Object.fromEntries(
    [
      panel("overview", <OverviewTab company={company} dealCount={dealCount} base={base} />),
      ...(company.category === "GP" ? [panel("manager", <ManagerTab company={company} />)] : []),
      panel("people", <PeopleTab companyId={company.id} />),
      ...(counts.events ? [panel("events", <EventsTab companyId={company.id} />)] : []),
      ...(counts.providers ? [panel("providers", <ProvidersTab companyId={company.id} />)] : []),
      panel("signals", <SignalsTab companyId={company.id} />),
      panel("notes", <NotesTab companyId={company.id} />),
    ].filter(([key]) => tabs.some((t) => t.key === key)),
  );

  // The tab fetched on request, when that is the one asked for.
  const current =
    tab === "investor" && company.category === "LP" ? <InvestorTab company={company} />
    : tab === "deals" ? <DealsTab company={company} />
    : tab === "funds" && tabs.some((t) => t.key === "funds") ? <FundsTab company={company} />
    : tab === "portfolio" && ownsCompanies ? <PortfolioTab company={company} />
    : tab === "clients" && providerClients ? <ClientsTab companyId={company.id} ranks={ranks} brandKey={brandIndex >= 0 ? index.brands[brandIndex].key : null} />
    : tab === "peers" && record ? <PeersTab record={record} />
    : null;

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
          <AddToListButton companyId={company.id} lists={lists} onLists={onLists.map((l) => l.id)} />
          <FindSimilarButton companyId={company.id} />
          <ReportButton />
          <PortfolioButton id={company.id} initial={company.in_portfolio} />
        </div>
      }
      tabs={<ProfileTabBar tabs={tabs} />}
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
          <Stat label="Commitments" value={counts.asLpDisclosed} basis={company.discloses_commitments ? company.discloses_commitments.split(" - ")[0] : "public disclosures"} href={`${base}?tab=deals`} />
        ) : (
          <Stat label="Form ADV" value={<span className="text-[15px]">{adv ?? "Not on file"}</span>} basis={company.private_fund_count != null ? `${company.private_fund_count} private funds` : company.adv_last_filed ? `Filed ${company.adv_last_filed}` : undefined} />
        )}
        <Stat label="Deals" value={dealCount} basis={counts.held ? `${counts.held} sports stake${counts.held === 1 ? "" : "s"}` : "on record"} href={`${base}?tab=deals`} />
        <Stat label="People" value={counts.contacts} basis={counts.connectable ? `${counts.connectable} with a direct email` : counts.contacts ? "names and titles" : undefined} href={`${base}?tab=people`} />
      </StatStrip>

      {company.category === "UN" ? (
        <div data-no-print>
          <ClassifyControl companyId={company.id} />
        </div>
      ) : null}

      <ProfileTabPanel
        tabs={tabs}
        panels={panels}
        serverTab={tab}
        current={current ? <Suspense fallback={<TabSkeleton />}>{current}</Suspense> : null}
        fallback={<TabSkeleton />}
      />
    </IntelShell>
  );
}
