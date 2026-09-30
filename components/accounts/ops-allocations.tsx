import Link from "next/link";
import {
  BadgeCheck,
  Banknote,
  CalendarDays,
  ExternalLink,
  MapPin,
  Radar,
  Receipt,
  TriangleAlert,
} from "lucide-react";
import { formatOpsMoney, type OpsDeal } from "@/lib/ops-types";
import { formatEventDate } from "@/lib/event-date";
import { aggregateAllocations } from "@/lib/ops-links";
import type { OpsLink } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { timeAgo } from "@/lib/utils";

/**
 * What this sponsor pays for, straight from the ops panel.
 *
 * Renders from the snapshots stored on each link rather than calling the
 * bridge, so the tab is instant and still works when the ops panel is down —
 * the "synced" line says how fresh it is.
 */
export function OpsAllocations({
  deals,
  links,
  opsPanelUrl,
  syncButton,
}: {
  deals: OpsDeal[];
  links: OpsLink[];
  opsPanelUrl: string;
  syncButton?: React.ReactNode;
}) {
  if (!deals.length) {
    return (
      <EmptyState
        icon={<Radar className="mx-auto h-8 w-8" />}
        title="Not linked to the ops panel"
        description="Once this sponsor is matched to a deal in the tracker, its event allocations, invoices and payment status appear here."
      />
    );
  }

  const events = aggregateAllocations(deals);
  const live = deals.filter((d) => !d.cancelled);

  // Per-currency, never cross-summed.
  const totals = new Map<string, { contracted: number; paid: number }>();
  for (const d of live) {
    const t = totals.get(d.currency) ?? { contracted: 0, paid: 0 };
    t.contracted += d.amount ?? 0;
    t.paid += d.paid_inc_vat ?? 0;
    totals.set(d.currency, t);
  }

  const syncedAt = links.reduce<string | null>(
    (latest, l) => (!latest || l.synced_at > latest ? l.synced_at : latest),
    null,
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {syncedAt ? `Synced from the ops panel ${timeAgo(syncedAt)}` : "Not yet synced"}
          {" · "}
          {live.length} deal{live.length === 1 ? "" : "s"}
        </p>
        {syncButton}
      </div>

      {/* Money */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...totals.entries()].map(([currency, t]) => (
          <div key={currency} className="rounded-2xl border bg-card p-4">
            <p className="eyebrow">Contracted ({currency})</p>
            <p className="mt-2 text-2xl font-semibold tabular tracking-tight">
              {formatOpsMoney(t.contracted, currency)}
            </p>
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Banknote className="h-3.5 w-3.5" />
              {formatOpsMoney(t.paid, currency)} received
            </p>
          </div>
        ))}
      </div>

      {/* Event allocations — the heart of it */}
      <section>
        <h3 className="text-sm font-semibold">Event allocations</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How this sponsor&apos;s money is split across the portfolio in the ops panel.
        </p>
        {events.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No events allocated against these deals yet.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map((e) => (
              <li
                key={e.event_id}
                className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.event_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatEventDate(e)}
                    {e.packages.length ? ` · ${e.packages.join(", ")}` : ""}
                  </p>
                </div>
                <p className="tabular text-base font-semibold">
                  {formatOpsMoney(e.allocated, e.currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Deals */}
      <section>
        <h3 className="text-sm font-semibold">Deals in the ops panel</h3>
        <ul className="mt-3 space-y-2">
          {deals.map((d) => (
            <li key={d.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {d.title || d.company}
                    <Badge variant="outline" className="text-[10px]">
                      {d.stage}
                    </Badge>
                    {d.cancelled ? (
                      <Badge className="border-transparent bg-destructive/12 text-[10px] text-destructive">
                        <TriangleAlert className="h-3 w-3" /> Cancelled
                      </Badge>
                    ) : null}
                    {(d.paid_inc_vat ?? 0) > 0 ? (
                      <Badge className="border-transparent bg-emerald-500/12 text-[10px] text-emerald-700 dark:text-emerald-300">
                        <BadgeCheck className="h-3 w-3" /> Paid
                      </Badge>
                    ) : null}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="tabular">
                      {formatOpsMoney(d.amount, d.currency)} contracted
                    </span>
                    {d.paid_inc_vat ? (
                      <span className="tabular">
                        {formatOpsMoney(d.paid_inc_vat, d.currency)} received
                        {d.paid_date ? ` on ${d.paid_date}` : ""}
                      </span>
                    ) : null}
                    {d.invoice_number ? (
                      <span className="inline-flex items-center gap-1">
                        <Receipt className="h-3 w-3" /> {d.invoice_number}
                      </span>
                    ) : null}
                    {d.fiscal_year ? <span>FY{d.fiscal_year}</span> : null}
                  </p>
                </div>
                {opsPanelUrl ? (
                  <Link
                    href={opsPanelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    Ops panel <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>

              {d.events.length ? (
                <ul className="mt-2.5 flex flex-wrap gap-1.5">
                  {d.events.map((ev) => (
                    <li
                      key={ev.event_id}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[11px]"
                    >
                      <MapPin className="h-3 w-3 text-muted-foreground" />
                      {ev.event_name}
                      <span className="tabular font-medium">
                        {formatOpsMoney(ev.allocated_amount, d.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
