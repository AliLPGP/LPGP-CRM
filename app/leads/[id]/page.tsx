import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Mail, Phone, Link2 } from "lucide-react";
import { getLead, listProfiles } from "@/lib/crm";
import { getNotes } from "@/lib/queries";
import { getSessionUser } from "@/lib/auth";
import { formatUsd } from "@/lib/utils";
import { CategoryBadge } from "@/components/category-badge";
import { LeadEditor } from "@/components/lead-editor";
import { StageBadge } from "@/components/leads-table";
import { NotesPanel } from "@/components/notes-panel";
import { ConvertLeadButton } from "@/components/accounts/convert-lead-button";
import { OpsAllocations } from "@/components/accounts/ops-allocations";
import { dealsFromLinks, listOpsLinks } from "@/lib/ops-links";
import { opsPanelUrl } from "@/lib/ops";

export const dynamic = "force-dynamic";

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [lead, user] = await Promise.all([getLead(id), getSessionUser()]);
  if (!lead) notFound();
  const [notes, profiles, opsLinks] = await Promise.all([
    getNotes("lead", id),
    listProfiles(),
    listOpsLinks("lead", id),
  ]);
  const opsDeals = dealsFromLinks(opsLinks);

  const isAdmin = user?.role === "admin";
  const canEdit = Boolean(isAdmin || (user && lead.owner_id === user.id));

  return (
    <div className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-6">
      <Link href="/leads" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Leads
      </Link>

      {/* Header */}
      <div className="sheen rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Lead</p>
            <h1 className="display mt-1 text-[26px] leading-tight md:text-[30px]">
              {lead.company_name ?? lead.company?.name ?? "Untitled lead"}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm">
              <StageBadge stage={lead.stage} />
              {lead.market ? (
                <span className="rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium text-foreground/80">
                  {lead.market} Market
                </span>
              ) : null}
              {lead.company ? (
                <Link href={`/companies/${lead.company.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs hover:bg-accent">
                  <Building2 className="h-3 w-3" /> In database
                  <CategoryBadge category={lead.company.category} />
                </Link>
              ) : null}
            </div>
          </div>
          <div className="text-right">
            <div className="figure text-2xl">{lead.value_usd != null ? formatUsd(lead.value_usd) : "—"}</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Owner: <span className="text-foreground">{lead.owner?.full_name ?? "Unassigned"}</span>
            </div>
            <div className="mt-3 flex justify-end">
              <ConvertLeadButton leadId={id} accountId={lead.account_id} />
            </div>
          </div>
        </div>
        {lead.contact_name ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {lead.contact_email ? (
              <a href={`mailto:${lead.contact_email}`} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                <Mail className="h-4 w-4" /> {lead.contact_email}
              </a>
            ) : null}
            {lead.contact_phone ? (
              <a href={`tel:${lead.contact_phone}`} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                <Phone className="h-4 w-4" /> {lead.contact_phone}
              </a>
            ) : null}
            {lead.linkedin_url ? (
              <a href={lead.linkedin_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                <Link2 className="h-4 w-4" /> LinkedIn
              </a>
            ) : null}
          </div>
        ) : null}
      </div>

      {opsDeals.length ? (
        <section className="sheen rounded-2xl border bg-card p-5">
          <h2 className="mb-1 font-semibold">In the ops panel</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This company already has signed business in the tracker.
          </p>
          <OpsAllocations deals={opsDeals} links={opsLinks} opsPanelUrl={opsPanelUrl()} />
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="sheen lg:col-span-2 rounded-2xl border bg-card p-5">
          <h2 className="font-semibold mb-4">Lead details</h2>
          <LeadEditor lead={lead} canEdit={canEdit} isAdmin={isAdmin} profiles={profiles} />
        </section>
        <section className="sheen rounded-2xl border bg-card p-5 h-fit">
          <h2 className="font-semibold mb-3">Notes</h2>
          <NotesPanel entityType="lead" entityId={lead.id} notes={notes} />
        </section>
      </div>
    </div>
  );
}
