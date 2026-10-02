import Link from "next/link";
import { Mail } from "lucide-react";
import { getNotes } from "@/lib/queries";
import { getCompanyFunds, getProviderClients } from "@/lib/directory/queries";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { teamsHeldBy } from "@/lib/directory/intelligence-queries";
import { getInvestorPlans, getInvestorProfile } from "@/lib/directory/investor-queries";
import { lendersManagedBy } from "@/lib/directory/filings-queries";
import { getProfileCommitments, getProfileOfferings, getProfilePortfolio, profileContacts, profileDeals, profileProviders, profileSignals } from "@/lib/directory/profile-queries";
import { LenderTable, OfferingTable } from "@/components/intel/filings-tables";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { isOperatingRole } from "@/lib/directory/operating";
import { similarFirms } from "@/lib/directory/similar-server";
import type { DirectoryRecord } from "@/lib/directory/records";
import { getSessionUser } from "@/lib/auth";
import { getParticipationForCompany } from "@/lib/event-participants";
import { CompanyEvents } from "@/components/events/event-history";
import { CATEGORIES } from "@/lib/categories";
import { lushaConfigured } from "@/lib/lusha";
import type { Company } from "@/lib/types";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { EditableField } from "@/components/editable-field";
import { NotesPanel } from "@/components/notes-panel";
import { DeleteButton } from "@/components/delete-button";
import { Commitments, DealLedger } from "@/components/directory/profile-ledgers";
import { AdvPanel, ConnectableBadge, FiledProviders, Overview, ProviderClients, SimilarFirms, type RoleRank } from "@/components/directory/profile-sections";
import { FundLineup } from "@/components/directory/fund-lineup";
import { InvestorProfile, ManagerProfile } from "@/components/directory/investor-profile";
import { OperatingPartners, PortfolioCompanies } from "@/components/directory/operators-portfolio";
import { PeerBenchmark } from "@/components/directory/peer-benchmark";
import { DealTable, SignalList } from "@/components/intel/tables";
import { Box, Empty, Src, Tag } from "@/components/intel/ui";

// One async server component per tab of a firm's profile. Each reads only
// what its tab shows, behind a Suspense boundary in the page, so the
// header and the stat strip paint first and a tab's rows stream in after.
// The reads several tabs share (contacts, deals, providers, signals) are
// deduplicated per request in profile-queries.

/** What a tab looks like while its rows are on the way: one boxed ledger, quietly pulsing. */
export function TabSkeleton({ rows = 8 }: { rows?: number }) {
  const bone = "animate-pulse rounded-[3px] bg-muted/70";
  return (
    <div className="rounded-[4px] border bg-card" aria-busy="true" aria-label="Loading">
      <div className="border-b px-3 py-2.5">
        <div className={`${bone} h-2.5 w-28`} />
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className={`${bone} h-3 w-[22%] min-w-[120px]`} />
            <div className={`${bone} h-3 w-20`} />
            <div className={`${bone} h-3 w-20`} />
            <div className={`${bone} ml-auto h-3 w-14`} />
          </div>
        ))}
      </div>
    </div>
  );
}

const more = "text-[11.5px] text-muted-foreground hover:text-foreground";

export async function OverviewTab({ company, dealCount, base }: { company: Company; dealCount: number; base: string }) {
  const id = company.id;
  const [contacts, deals, providers, signals, similar, user] = await Promise.all([
    profileContacts(id),
    profileDeals(id),
    profileProviders(id),
    profileSignals(id),
    similarFirms(id),
    getSessionUser(),
  ]);
  const meta = CATEGORIES[company.category];
  const isAdmin = user?.role === "admin";
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <Overview company={company} />
        {deals.length ? (
          <Box title="Latest deals" count={dealCount} action={<Link href={`${base}?tab=deals`} className={more}>All deals</Link>} flush>
            <DealTable deals={deals.slice(0, 6)} compact />
          </Box>
        ) : null}
        {providers.length ? <FiledProviders rows={providers} /> : null}
        <AdvPanel company={company} />
      </div>
      <div className="space-y-4">
        {signals.length ? (
          <Box title="Signals" count={signals.length} action={<Link href={`${base}?tab=signals`} className={more}>All</Link>} flush>
            <SignalList signals={signals} limit={5} />
          </Box>
        ) : null}
        <SimilarFirms hits={similar} companyId={company.id} />
        {contacts.length ? (
          <Box title="Key people" count={contacts.length} action={<Link href={`${base}?tab=people`} className={more}>All</Link>} flush>
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
  );
}

export async function InvestorTab({ company }: { company: Company }) {
  // The researched investor profile and plans (migration 0033); null and
  // empty until the research job has been by, or on an older database.
  const [profile, plans, commitments] = await Promise.all([getInvestorProfile(company.id), getInvestorPlans(company.id), getProfileCommitments(company.id)]);
  return <InvestorProfile company={company} profile={profile} plans={plans} commitments={commitments.asLp} />;
}

export async function ManagerTab({ company }: { company: Company }) {
  const funds = await getCompanyFunds(company.id);
  return <ManagerProfile company={company} funds={funds} />;
}

export async function DealsTab({ company }: { company: Company }) {
  const id = company.id;
  const [deals, held, lenders, offerings, commitments] = await Promise.all([
    profileDeals(id),
    teamsHeldBy({ companyId: id }),
    lendersManagedBy(id),
    getProfileOfferings(id),
    getProfileCommitments(id),
  ]);
  return (
    <div className="space-y-4">
      <Box title="Deals" count={deals.length} flush defn="Sourced transactions where this firm is the investor or the target: fund closes, acquisitions, stake sales, financings.">
        <DealLedger deals={deals} />
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
      <Commitments rows={commitments.asLp} as="lp" />
      <Commitments rows={commitments.asGp} as="gp" />
    </div>
  );
}

export async function FundsTab({ company }: { company: Company }) {
  const funds = await getCompanyFunds(company.id);
  return funds.length ? (
    <FundLineup funds={funds} reported={company.private_fund_count ?? null} sourceUrl={company.adv_source_url ?? null} />
  ) : (
    <Box title="Funds">
      <Empty>No funds on file for this firm.</Empty>
    </Box>
  );
}

export async function PortfolioTab({ company }: { company: Company }) {
  const [{ rows, intel }, contacts] = await Promise.all([getProfilePortfolio(company.id), profileContacts(company.id)]);
  const operators = contacts.filter((c) => isOperatingRole(c.job_title));
  return (
    <div className="space-y-4">
      <PortfolioCompanies companyId={company.id} rows={rows} total={rows.length} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} intel={intel} />
      <OperatingPartners
        companyId={company.id}
        hasDomain={Boolean(company.domain)}
        lushaReady={lushaConfigured()}
        rows={operators.map((c) => ({ id: c.id, full_name: c.full_name, job_title: c.job_title, city: c.city, country: c.country, linkedin_url: c.linkedin_url, source: c.source ?? null }))}
      />
    </div>
  );
}

export async function PeopleTab({ companyId }: { companyId: string }) {
  const contacts = await profileContacts(companyId);
  const connectable = contacts.filter((c) => c.connectable).length;
  return (
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
  );
}

export async function EventsTab({ companyId }: { companyId: string }) {
  const rows = await getParticipationForCompany(companyId);
  return (
    <Box title="Events" count={new Set(rows.map((r) => r.event_name)).size} flush>
      <CompanyEvents rows={rows} />
    </Box>
  );
}

export async function ProvidersTab({ companyId }: { companyId: string }) {
  const providers = await profileProviders(companyId);
  return <FiledProviders rows={providers} />;
}

export async function ClientsTab({ companyId, ranks, brandKey }: { companyId: string; ranks: RoleRank[]; brandKey: string | null }) {
  const clients = await getProviderClients(companyId);
  return <ProviderClients clients={clients} ranks={ranks} brandKey={brandKey} />;
}

export async function SignalsTab({ companyId }: { companyId: string }) {
  const signals = await profileSignals(companyId);
  return (
    <Box title="Signals naming this firm" count={signals.length} flush>
      <SignalList signals={signals} />
    </Box>
  );
}

export async function PeersTab({ record }: { record: DirectoryRecord }) {
  // The index is already in memory for the shell; this is the same copy.
  const index = await getDirectoryIndex();
  return <PeerBenchmark firm={record} records={index.records} />;
}

export async function NotesTab({ companyId }: { companyId: string }) {
  const notes = await getNotes("company", companyId);
  return (
    <Box title="Notes" count={notes.length}>
      <NotesPanel entityType="company" entityId={companyId} notes={notes} />
    </Box>
  );
}
