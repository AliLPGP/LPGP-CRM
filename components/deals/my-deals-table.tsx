"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  ExternalLink,
  FileWarning,
  Loader2,
  Receipt,
  RefreshCw,
  Unlink,
  UserRound,
} from "lucide-react";
import { releaseOpsDeal, refreshMyDeal } from "@/lib/my-deal-actions";
import { AGREEMENT_LABEL, formatOpsMoney, type AgreementStatus } from "@/lib/ops-types";
import type { MyDeal } from "@/lib/my-deals";
import { AgreementBadge } from "@/components/deals/agreement-badge";
import { Badge } from "@/components/ui/badge";
import { FacetChips, FacetMenu } from "@/components/intel/facet-menu";
import { ListToolbar, ShowMore, SortSelect, facetOptions } from "@/components/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { cn, timeAgo } from "@/lib/utils";

const STATUSES: AgreementStatus[] = ["need_invoice", "awaiting_signature", "signed"];
const PAGE = 50;
type Sort = "recent" | "amount" | "company";
const SORTS: { value: Sort; label: string }[] = [
  { value: "recent", label: "Newest" },
  { value: "amount", label: "Amount" },
  { value: "company", label: "Company" },
];

export function MyDealsTable({
  deals,
  opsPanelUrl,
}: {
  deals: MyDeal[];
  opsPanelUrl: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("recent");
  const [shown, setShown] = useState(PAGE);
  const [busyId, setBusyId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = deals.filter((d) => {
      if (statuses.length && !statuses.includes(d.deal.agreement_status)) return false;
      if (stages.length && !stages.includes(d.deal.stage)) return false;
      if (events.length && !d.deal.events.some((e) => events.includes(String(e.event_id)))) return false;
      if (!needle) return true;
      return (
        d.deal.company.toLowerCase().includes(needle) ||
        d.deal.invoice_number.toLowerCase().includes(needle) ||
        d.deal.events.some((e) => e.event_name.toLowerCase().includes(needle))
      );
    });
    return rows.sort((a, b) => {
      switch (sort) {
        case "amount":
          // Within a currency only; across currencies the order is by currency name.
          return a.deal.currency.localeCompare(b.deal.currency) || b.deal.amount - a.deal.amount;
        case "company":
          return a.deal.company.localeCompare(b.deal.company);
        default:
          return b.deal.id - a.deal.id;
      }
    });
  }, [deals, q, statuses, stages, events, sort]);

  if (!deals.length) {
    return (
      <EmptyState
        icon={<Receipt />}
        title="No deals yet"
        description="Deals the tracker stamps with your initials show up here on their own; one you record from this page or an account joins them."
      />
    );
  }

  const statusOptions = facetOptions(deals, (d) => d.deal.agreement_status, { order: STATUSES, label: (k) => AGREEMENT_LABEL[k as AgreementStatus] ?? k });
  const stageOptions = facetOptions(deals, (d) => d.deal.stage);
  const eventNames = new Map<string, string>();
  for (const d of deals) for (const e of d.deal.events) eventNames.set(String(e.event_id), e.event_name);
  const eventCounts = new Map<string, number>();
  for (const d of deals) for (const e of d.deal.events) eventCounts.set(String(e.event_id), (eventCounts.get(String(e.event_id)) ?? 0) + 1);
  const eventOptions = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: eventNames.get(k) ?? k, count: n }));
  const clearAll = () => {
    setQ("");
    setStatuses([]);
    setStages([]);
    setEvents([]);
  };

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search company, invoice or event" }}
        facets={
          <>
            <FacetMenu label="Paperwork" groups={[{ label: "", options: statusOptions }]} selected={statuses} onChange={setStatuses} searchable={false} width={230} />
            <FacetMenu label="Stage" groups={[{ label: "", options: stageOptions }]} selected={stages} onChange={setStages} searchable={false} width={200} />
            <FacetMenu label="Event" groups={[{ label: "", options: eventOptions }]} selected={events} onChange={setEvents} width={300} />
          </>
        }
        sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}
        shown={filtered.length}
        total={deals.length}
        noun="deals"
        actions={
          opsPanelUrl ? (
            <a href={opsPanelUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-[4px] border bg-card px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              Ops panel <ExternalLink className="h-3 w-3" />
            </a>
          ) : null
        }
        chips={
          <FacetChips
            chips={[
              ...statuses.map((k) => ({ key: `p:${k}`, label: AGREEMENT_LABEL[k as AgreementStatus] ?? k, remove: () => setStatuses(statuses.filter((x) => x !== k)) })),
              ...stages.map((k) => ({ key: `s:${k}`, label: k, remove: () => setStages(stages.filter((x) => x !== k)) })),
              ...events.map((k) => ({ key: `e:${k}`, label: eventNames.get(k) ?? k, remove: () => setEvents(events.filter((x) => x !== k)) })),
            ]}
            onClearAll={clearAll}
          />
        }
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No deals match these filters"
          description={`${deals.length} of your deals are on file; none carry every filter you have set.`}
          action={
            <button type="button" onClick={clearAll} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
              Clear filters
            </button>
          }
        />
      ) : (
        <section className="sheen rounded-2xl border bg-card">
          <ul className="divide-y">
            {filtered.slice(0, shown).map(({ deal, ownership, claimedAt }) => (
              <li key={deal.id} className="px-4 py-3.5 transition-colors duration-[120ms] hover:bg-muted/30">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {deal.company}
                      <Badge variant="outline" className="text-[10px]">
                        #{deal.id}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {deal.stage}
                      </Badge>
                      <AgreementBadge status={deal.agreement_status} detail={deal.agreement_file || deal.signed_file || null} />
                      {ownership === "claimed" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Added by you here — the tracker has someone else's initials on it">
                          <UserRound className="h-3 w-3" /> added {timeAgo(claimedAt)}
                        </span>
                      ) : null}
                    </p>

                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="tabular font-medium text-foreground">{formatOpsMoney(deal.amount, deal.currency)}</span>
                      {deal.paid_inc_vat ? (
                        <span className="tabular text-[var(--success)]">{formatOpsMoney(deal.paid_inc_vat, deal.currency)} received</span>
                      ) : (
                        <span>nothing received yet</span>
                      )}
                      {deal.invoice_number ? (
                        <span className="inline-flex items-center gap-1">
                          <Receipt className="h-3 w-3" /> {deal.invoice_number}
                        </span>
                      ) : null}
                      {deal.initials ? <span>· {deal.initials}</span> : null}
                    </p>

                    {deal.events.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {deal.events.map((e) => (
                          <li key={e.event_id} className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-[11px]">
                            <CalendarDays className="h-3 w-3 text-muted-foreground" />
                            <span className="font-medium">{e.event_name}</span>
                            <span className="tabular text-muted-foreground">{formatOpsMoney(e.allocated_amount, deal.currency)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-[11px] text-muted-foreground">Not allocated to an event yet.</p>
                    )}

                    {deal.agreement_status === "need_invoice" ? (
                      <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--ops-soft)] px-2.5 py-1.5 text-[11px] text-[var(--ops)]">
                        <FileWarning className="h-3.5 w-3.5 shrink-0" />
                        No agreement on file{deal.invoice_agreement_sent ? " despite being marked sent" : ""} — the admin needs to send one and upload it in the ops panel.
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={busyId === deal.id}
                      onClick={async () => {
                        setBusyId(deal.id);
                        await refreshMyDeal(deal.id);
                        setBusyId(null);
                        router.refresh();
                      }}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                      aria-label={`Refresh deal ${deal.id}`}
                      title="Re-read from the ops panel"
                    >
                      {busyId === deal.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </button>
                    {ownership !== "stamped" ? (
                      <button
                        type="button"
                        disabled={busyId === deal.id}
                        onClick={async () => {
                          setBusyId(deal.id);
                          await releaseOpsDeal(deal.id);
                          setBusyId(null);
                          router.refresh();
                        }}
                        className={cn("rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50")}
                        aria-label={`Remove deal ${deal.id} from my deals`}
                        title="Remove from my deals — the deal itself is untouched"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <ShowMore remaining={filtered.length - shown} step={PAGE} onClick={() => setShown(shown + PAGE)} className="border-t px-4 py-2.5" />
        </section>
      )}
    </div>
  );
}
