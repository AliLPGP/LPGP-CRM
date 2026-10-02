import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CircleDot,
  Globe,
  Handshake,
  MapPin,
  Radar,
  Users,
} from "lucide-react";
import { getAccount, listAccountContacts } from "@/lib/accounts";
import { listActivitiesFor } from "@/lib/activities";
import { dealsFromLinks, listOpsLinks } from "@/lib/ops-links";
import { opsPanelUrl } from "@/lib/ops";
import { getNotes } from "@/lib/queries";
import { sponsorshipsFor } from "@/lib/account-sponsorships";
import { formatOpsMoney } from "@/lib/ops-types";
import { ACTIVITY_LABELS, formatDuration } from "@/lib/sales";
import { PointsOfContact } from "@/components/accounts/points-of-contact";
import { OpsAllocations } from "@/components/accounts/ops-allocations";
import {
  OpsLinkSearch,
  OpsSyncButton,
  OpsUnlinkButton,
} from "@/components/accounts/ops-link-controls";
import { NotesPanel } from "@/components/notes-panel";
import { RecordDealDialog } from "@/components/ops/record-deal-dialog";
import { isOpsWriteEnabled } from "@/lib/ops";
import { AccountStatusBadge } from "@/components/accounts/status-badge";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { StatCard, StatRow } from "@/components/stat-card";
import { fadeIn } from "@/components/motion";
import { initials, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Tab panels keep one floor so the bar never moves when the content under it
// changes height, and each panel fades in rather than snapping.
const TAB_PANEL = `min-h-[320px] ${fadeIn.className}`;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  return { title: account ? `${account.name} — LPGP Connect` : "Account — LPGP Connect" };
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getAccount(id);
  if (!account) notFound();

  const [contacts, links, activities, notes, paid] = await Promise.all([
    listAccountContacts(id),
    listOpsLinks("account", id),
    listActivitiesFor("account_id", id, 60),
    getNotes("account", id),
    sponsorshipsFor(id),
  ]);

  const deals = dealsFromLinks(links);
  const linked = deals.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:px-6">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Accounts
      </Link>

      {/* Header */}
      <header className="sheen rounded-2xl border bg-card p-5 md:p-6">
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
            {initials(account.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Account</p>
            <h1 className="display mt-1 text-[26px] leading-tight md:text-[30px]">{account.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <AccountStatusBadge status={account.status} />
              {account.category ? <Badge variant="outline">{account.category}</Badge> : null}
              {account.tier ? <Badge variant="secondary">{account.tier}</Badge> : null}
              {account.health ? <Badge variant="outline">{account.health}</Badge> : null}
              {linked ? (
                <Badge className="border-transparent bg-[var(--ops-soft)] text-[var(--ops)]">
                  <Radar className="h-3 w-3" /> In ops panel
                </Badge>
              ) : null}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {account.owner?.full_name ? <span>Owned by {account.owner.full_name}</span> : null}
              {account.hq_location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" /> {account.hq_location}
                </span>
              ) : null}
              {account.website ? (
                <a
                  href={account.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5" /> Website
                </a>
              ) : null}
              {account.company_id ? (
                <Link
                  href={`/companies/${account.company_id}`}
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Building2 className="h-3.5 w-3.5" /> Database profile
                </Link>
              ) : null}
              {account.renewal_date ? (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" /> Renews {account.renewal_date}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {isOpsWriteEnabled() ? (
              <RecordDealDialog
                defaultCompany={account.ops_company ?? account.name}
                link={{ entityType: "account", entityId: id }}
              />
            ) : null}
            {linked ? (
              <OpsUnlinkButton accountId={id} />
            ) : (
              <OpsLinkSearch accountId={id} accountName={account.name} />
            )}
          </div>
        </div>
      </header>

      {/* The account's numbers: what the sponsor lists say it paid, per year
          and per currency. Where the account is linked to tracker deals the
          Events & money tab carries the live figures. */}
      {paid.length ? (
        <StatRow>
          {paid.map((p) => (
            <StatCard
              key={`${p.year}-${p.currency}`}
              label={`${p.year} · ${p.currency}`}
              value={p.amount != null ? formatOpsMoney(p.amount, p.currency) : "—"}
              basis={p.amount != null ? `${p.deals} deal${p.deals === 1 ? "" : "s"} on the ${p.year} sponsor list` : `On the ${p.year} list, no amount stated`}
            />
          ))}
        </StatRow>
      ) : null}

      <Tabs defaultValue="contacts" className="gap-4">
        <TabsList className="w-full max-w-2xl">
          <TabsTrigger value="contacts">
            <Users className="h-4 w-4" /> Points of contact
            {contacts.length ? (
              <span className="ml-1 rounded bg-foreground/10 px-1 text-[10px] tabular">
                {contacts.length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="events">
            <Handshake className="h-4 w-4" /> Events &amp; money
          </TabsTrigger>
          <TabsTrigger value="activity">
            <CircleDot className="h-4 w-4" /> Activity
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className={TAB_PANEL} style={fadeIn.style}>
          <PointsOfContact accountId={id} accountName={account.name} contacts={contacts} />
        </TabsContent>

        <TabsContent value="events" className={TAB_PANEL} style={fadeIn.style}>
          <OpsAllocations
            deals={deals}
            links={links}
            opsPanelUrl={opsPanelUrl()}
            syncButton={linked ? <OpsSyncButton accountId={id} /> : null}
          />
        </TabsContent>

        <TabsContent value="activity" className={TAB_PANEL} style={fadeIn.style}>
          {activities.length === 0 ? (
            <EmptyState
              title="Nothing logged yet"
              description="Calls and emails sent from the points-of-contact tab land here, along with anything logged against this sponsor."
            />
          ) : (
            <ul className="space-y-2.5">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 rounded-xl border bg-card p-3.5">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <CircleDot className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium">{ACTIVITY_LABELS[a.type]}</span>
                      {a.outcome ? (
                        <span className="text-muted-foreground"> · {a.outcome}</span>
                      ) : null}
                      {a.duration_seconds ? (
                        <span className="tabular text-muted-foreground">
                          {" "}
                          · {formatDuration(a.duration_seconds)}
                        </span>
                      ) : null}
                    </p>
                    {a.subject ? <p className="mt-0.5 text-sm">{a.subject}</p> : null}
                    {a.body ? (
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">
                        {a.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {timeAgo(a.occurred_at)}
                      {a.owner?.full_name ? ` · ${a.owner.full_name}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="notes" className={TAB_PANEL} style={fadeIn.style}>
          <NotesPanel entityType="account" entityId={id} notes={notes} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
