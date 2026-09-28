import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Globe, Link2, ListChecks, Mail, MapPin, PieChart, Users } from "lucide-react";
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
import { filers, leagueTable } from "@/lib/directory/market";
import { PROVIDER_ROLES } from "@/lib/directory/providers";
import { similarFirms } from "@/lib/directory/similar-server";
import { CATEGORIES } from "@/lib/categories";
import { formatAumLong } from "@/lib/utils";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { EditableField } from "@/components/editable-field";
import { NotesPanel } from "@/components/notes-panel";
import { PortfolioButton } from "@/components/portfolio-button";
import { ReportButton } from "@/components/report-button";
import { AllocationEditor } from "@/components/allocation-editor";
import { DeleteButton } from "@/components/delete-button";
import { AddToPipelineButton } from "@/components/add-to-pipeline-button";
import { Donut, allocationShade } from "@/components/charts/donut";
import { AllocationBars } from "@/components/charts/allocation-bars";
import {
  AddToListButton,
  ClassifyControl,
  FindSimilarButton,
} from "@/components/directory/profile-actions";
import {
  AdvPanel,
  Commitments,
  ConnectableBadge,
  FiledProviders,
  KeyFacts,
  Overview,
  ProviderClients,
  SimilarFirms,
  Sources,
  type RoleRank,
} from "@/components/directory/profile-sections";
import { FundLineup } from "@/components/directory/fund-lineup";
import { OperatingPartners, PortfolioCompanies } from "@/components/directory/operators-portfolio";
import { isOperatingRole } from "@/lib/directory/operating";
import { lushaConfigured } from "@/lib/lusha";
import { PeerBenchmark } from "@/components/directory/peer-benchmark";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground/80">
      {children}
    </span>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  return { title: company ? `${company.name} — LPGP Connect` : "Company — LPGP Connect" };
}

export default async function CompanyProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const [contacts, funds, providers, providerClients, commitments, notes, lists, onLists, similar, index, portcos] =
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
  const allocations = Array.isArray(company.allocations) ? company.allocations : [];
  const aum = formatAumLong(company.aum_usd) ?? company.aum;
  const hasInvestmentProfile = Boolean(
    allocations.length ||
      company.investment_thesis ||
      company.check_size ||
      company.preferred_stages ||
      company.geographic_focus ||
      company.active_funds,
  );
  const connectable = contacts.filter((c) => c.connectable).length;
  const record = index.records.find((r) => r.id === id) ?? null;
  const operators = contacts.filter((c) => isOperatingRole(c.job_title));
  // Managers own companies; other books only show these when someone added some.
  const ownsCompanies = company.category === "GP" || company.category === "UN" || portcos.length > 0;
  const sections: [string, string][] = [
    ["#overview", "Overview"],
    ...(providers.length ? ([["#providers", "Service providers"]] as [string, string][]) : []),
    ...(providerClients.length ? ([["#clients", "Clients"]] as [string, string][]) : []),
    ...(funds.length ? ([["#funds", `Funds · ${funds.length.toLocaleString("en-US")}`]] as [string, string][]) : []),
    ["#people", `People · ${contacts.length}`],
    ...(ownsCompanies ? ([["#operators", `Operating partners · ${operators.length}`], ["#portfolio", `Portfolio · ${portcos.length}`]] as [string, string][]) : []),
    ...(asLp.length || asGp.length ? ([["#commitments", "Commitments"]] as [string, string][]) : []),
    ...(record ? ([["#peers", "Peers"]] as [string, string][]) : []),
    ["#similar", "Similar"],
    ["#notes", "Notes"],
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
      <Link
        href="/database"
        data-no-print
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      {/* Cover: the firm on the stand, its numbers along the bottom. */}
      <header className="stand rounded-3xl px-5 pb-5 pt-6 md:px-8 md:pt-8">
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 gap-5">
              <CompanyLogo name={company.name} domain={company.domain} size={76} />
              <div className="min-w-0">
                <p className="wordmark text-[10.5px] text-[var(--brass)]">
                  {meta.name}
                  {company.sub_type ? ` · ${company.sub_type}` : ""}
                </p>
                <h1 className="display mt-2 text-[28px] leading-tight md:text-[40px]">{company.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <CategoryBadge category={company.category} showName />
                  {company.city || company.country || company.region ? (
                    <Chip>
                      <MapPin className="h-3 w-3" />
                      {[company.city, company.country].filter(Boolean).join(", ") || company.region}
                    </Chip>
                  ) : null}
                  {company.status ? (
                    <Chip>
                      <PieChart className="h-3 w-3" /> {company.status}
                    </Chip>
                  ) : null}
                  {company.website ? (
                    <a href={company.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Globe className="h-3.5 w-3.5" /> {company.domain ?? "Website"}
                    </a>
                  ) : null}
                  {company.linkedin_url ? (
                    <a href={company.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                      <Link2 className="h-3.5 w-3.5" /> LinkedIn
                    </a>
                  ) : null}
                </div>
                {onLists.length ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-no-print>
                    <ListChecks className="h-3.5 w-3.5" />
                    On{" "}
                    {onLists.map((l, i) => (
                      <span key={l.id}>
                        <Link href={`/database/lists/${l.id}`} className="font-medium text-foreground hover:underline">
                          {l.name}
                        </Link>
                        {i < onLists.length - 1 ? "," : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2" data-no-print>
              <AddToPipelineButton companyId={company.id} />
              <AddToListButton
                companyId={company.id}
                lists={lists.map((l) => ({ id: l.id, name: l.name }))}
                onLists={onLists.map((l) => l.id)}
              />
              <FindSimilarButton companyId={company.id} />
              <ReportButton />
              <PortfolioButton id={company.id} initial={company.in_portfolio} />
            </div>
          </div>

          <KeyFacts
            company={company}
            contacts={contacts.length}
            connectable={connectable}
            signal={
              company.category === "SP" && brandIndex >= 0
                ? {
                    label: "Form ADV clients",
                    value: index.brands[brandIndex].clients,
                    hint: ranks[0] ? `#${ranks[0].rank} ${ranks[0].role.replace("_", " ")} by managers` : null,
                  }
                : company.category === "LP"
                  ? {
                      label: "Commitments",
                      value: asLp.filter((c) => c.source !== "sample").length,
                      hint: company.discloses_commitments ? company.discloses_commitments.split(" - ")[0] : "public disclosures",
                    }
                  : undefined
            }
          />
        </div>
      </header>

      {/* Section nav: only what this firm has. */}
      <nav
        data-no-print
        className="sticky top-0 z-20 -mx-4 flex gap-1 overflow-x-auto border-b bg-background/85 px-4 py-2 backdrop-blur md:-mx-6 md:px-6"
      >
        {sections.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="shrink-0 rounded-full px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      {company.category === "UN" ? (
        <div data-no-print>
          <ClassifyControl companyId={company.id} />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div id="overview" className="scroll-mt-20">
            <Overview company={company} />
          </div>
          {/* People: the reason anyone opens a profile in a sales CRM. */}
          <section id="people" className="sheen scroll-mt-20 rounded-2xl border bg-card">
            <div className="flex items-center gap-2 border-b px-5 py-3.5">
              <Users className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">People</h2>
              <span className="text-sm text-muted-foreground">({contacts.length})</span>
              {connectable ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 text-[var(--success)]" /> {connectable} with a direct email
                </span>
              ) : null}
            </div>
            {contacts.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                No contacts yet. Use the Import tab to add people.
              </p>
            ) : (
              <ul className="grid gap-px bg-border sm:grid-cols-2">
                {contacts.map((c) => (
                  <li key={c.id} className="bg-card">
                    <Link href={`/contacts/${c.id}`} className="flex h-full items-center gap-3 px-5 py-3.5 hover:bg-muted/40">
                      <PersonAvatar name={c.full_name} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{c.full_name ?? "—"}</span>
                          {c.connectable ? <ConnectableBadge /> : null}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">{c.job_title ?? "—"}</div>
                        {c.email ? <div className="truncate text-xs text-muted-foreground">{c.email}</div> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {ownsCompanies ? (
            <>
              <PortfolioCompanies companyId={company.id} rows={portcos} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
              <OperatingPartners
                companyId={company.id}
                hasDomain={Boolean(company.domain)}
                lushaReady={lushaConfigured()}
                rows={operators.map((c) => ({
                  id: c.id,
                  full_name: c.full_name,
                  job_title: c.job_title,
                  city: c.city,
                  country: c.country,
                  linkedin_url: c.linkedin_url,
                  source: c.source ?? null,
                }))}
              />
            </>
          ) : null}
          <div id="providers" className="scroll-mt-20">
            <FiledProviders rows={providers} />
          </div>
          <div id="clients" className="scroll-mt-20">
            <ProviderClients clients={providerClients} ranks={ranks} brandKey={brandIndex >= 0 ? index.brands[brandIndex].key : null} />
          </div>
          <FundLineup funds={funds} reported={company.private_fund_count ?? null} sourceUrl={company.adv_source_url ?? null} />
          <div id="commitments" className="scroll-mt-20 space-y-6">
            <Commitments rows={asLp} as="lp" />
            <Commitments rows={asGp} as="gp" />
          </div>
          {record ? <PeerBenchmark firm={record} records={index.records} /> : null}
          <AdvPanel company={company} />
        </div>
        <div className="space-y-6">
          <div id="similar" className="scroll-mt-20">
            <SimilarFirms hits={similar} companyId={company.id} />
          </div>
          <Sources company={company} />
        </div>
      </div>

      {hasInvestmentProfile ? (
        <>
          {/* Investment profile */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border bg-card p-6 flex flex-col justify-center">
              <p className="eyebrow">Total AUM</p>
              <div className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight tabular">
                {aum ?? <span className="text-muted-foreground text-2xl">Not set</span>}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <p className="eyebrow">Total asset allocation</p>
              <div className="mt-3 flex items-center gap-5">
                <Donut data={allocations} size={120} thickness={18} />
                {allocations.length ? (
                  <ul className="space-y-1.5 text-sm min-w-0">
                    {allocations.map((a, i) => (
                      <li key={`${a.label}-${i}`} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: allocationShade(i) }} />
                        <span className="truncate text-foreground/80">{a.label}</span>
                        <span className="ml-auto tabular font-medium">{Math.round(a.value)}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Set the allocation below to populate this chart.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 flex flex-col justify-center">
              <p className="eyebrow">Active funds</p>
              <div className="mt-2 text-4xl md:text-5xl font-semibold tracking-tight tabular">
                {company.active_funds ?? 0}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">Core GP relationships</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-xl border bg-secondary p-6">
              <h2 className="text-lg font-semibold">Investment Thesis Summary</h2>
              {company.investment_thesis ? (
                <p className="mt-2 text-sm text-foreground/80 whitespace-pre-wrap">{company.investment_thesis}</p>
              ) : null}
              <div className="mt-5 grid gap-5 sm:grid-cols-3">
                <div>
                  <p className="eyebrow">Typical check size</p>
                  <p className="mt-1.5 font-semibold">{company.check_size ?? "—"}</p>
                </div>
                <div>
                  <p className="eyebrow">Preferred stages</p>
                  <p className="mt-1.5 font-semibold">{company.preferred_stages ?? "—"}</p>
                </div>
                <div>
                  <p className="eyebrow">Geographic focus</p>
                  <p className="mt-1.5 font-semibold">{company.geographic_focus ?? "—"}</p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 rounded-xl border bg-card p-6">
              <p className="eyebrow mb-4">Asset allocation breakdown</p>
              <AllocationBars data={allocations} />
            </div>
          </div>
        </>
      ) : null}

      {/* Editable data + notes */}
      <div className="grid gap-6 lg:grid-cols-3" data-no-print>
        <aside className="rounded-xl border bg-card p-5 h-fit space-y-5">
          <div>
            <h2 className="font-semibold">Investment profile</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {hasInvestmentProfile ? "Drives the charts above." : "Fill these in to add the AUM, allocation and thesis panels."} Hover a field to edit.
            </p>
            <Separator className="my-3" />
            <div className="divide-y">
              <EditableField entity="company" id={company.id} field="aum_usd" value={company.aum_usd?.toString()} label="Total AUM (USD)" placeholder="e.g. 415900000" />
              <EditableField entity="company" id={company.id} field="active_funds" value={company.active_funds?.toString()} label="Active funds" placeholder="e.g. 12" />
              <EditableField entity="company" id={company.id} field="check_size" value={company.check_size} label="Typical check size" placeholder="e.g. $5M – $20M" />
              <EditableField entity="company" id={company.id} field="preferred_stages" value={company.preferred_stages} label="Preferred stages" placeholder="e.g. Growth, Buyout" />
              <EditableField entity="company" id={company.id} field="geographic_focus" value={company.geographic_focus} label="Geographic focus" placeholder="e.g. Global (NAM, EMEA, APAC)" />
              <EditableField entity="company" id={company.id} field="investment_thesis" value={company.investment_thesis} label="Investment thesis" multiline placeholder="One-paragraph summary of how this firm allocates." />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Asset allocation</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">Percentages drive the donut and the breakdown bars.</p>
            <AllocationEditor id={company.id} initial={allocations} />
          </div>

          <div>
            <h3 className="text-sm font-semibold">Firm details</h3>
            <Separator className="my-3" />
            <div className="divide-y">
              <EditableField entity="company" id={company.id} field="sub_type" value={company.sub_type} label="Type" placeholder={meta.subTypes[0]} />
              <EditableField entity="company" id={company.id} field="status" value={company.status} label="Status" placeholder="e.g. Active Allocator" />
              <EditableField entity="company" id={company.id} field="region" value={company.region} label="Region" placeholder="e.g. Brazil / Latin America & Caribbean" />
              <EditableField entity="company" id={company.id} field="website" value={company.website} label="Website" link="url" />
              <EditableField entity="company" id={company.id} field="domain" value={company.domain} label="Domain" />
              <EditableField entity="company" id={company.id} field="linkedin_url" value={company.linkedin_url} label="LinkedIn" link="url" />
              <EditableField entity="company" id={company.id} field="country" value={company.country} label="Country" />
              <EditableField entity="company" id={company.id} field="city" value={company.city} label="City" />
              <EditableField entity="company" id={company.id} field="hq_location" value={company.hq_location} label="HQ" />
              <EditableField entity="company" id={company.id} field="employee_range" value={company.employee_range} label="Employees" placeholder="e.g. 1,001–5,000" />
              <EditableField entity="company" id={company.id} field="description" value={company.description} label="Description" multiline placeholder="What does this firm do?" />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Removes this company and all of its contacts.
            </p>
            <DeleteButton kind="company" id={company.id} />
          </div>
        </aside>

        <section className="lg:col-span-2 space-y-6">
          <div id="notes" className="scroll-mt-20 rounded-xl border bg-card p-5">
            <h2 className="font-semibold mb-3">Notes</h2>
            <NotesPanel entityType="company" entityId={company.id} notes={notes} />
          </div>
        </section>
      </div>
    </div>
  );
}
