import Link from "next/link";
import { ArrowUpRight, BadgeCheck, CalendarClock, CircleDot, Flame, Mail, Phone, Timer, Users } from "lucide-react";
import { LEAD_STAGES } from "@/lib/pipeline";
import { ACTIVITY_LABELS, formatDuration } from "@/lib/sales";
import { formatOpsMoney, type OpsEvent } from "@/lib/ops-types";
import { formatEventDate } from "@/lib/event-date";
import type { ActivityWithRefs, LeadWithRefs } from "@/lib/types";
import { BarList } from "@/components/charts/bar-list";
import { EmptyState } from "@/components/empty-state";
import { formatUsd, timeAgo } from "@/lib/utils";

/* ── The one panel ────────────────────────────────────────────────────────── */

/**
 * Every block on the command centre is this: a title, one line saying what
 * the block counts, an optional link to the full screen, and the body. One
 * register for the whole dashboard; the stat cards above are the other.
 */
export function Panel({
  title,
  basis,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  basis: string;
  href?: string;
  hrefLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sheen flex min-h-[280px] flex-col rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{basis}</p>
        </div>
        {href ? (
          <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline">
            {hrefLabel ?? "Open"} <ArrowUpRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

/* ── Today's calls ────────────────────────────────────────────────────────── */

/** The queue as the workspace will walk it: overdue call-backs, then priority, then stalest. */
export function TodaysCalls({ queue, now, limit = 8 }: { queue: LeadWithRefs[]; now: number; limit?: number }) {
  return (
    <Panel title="Today's calls" basis={queue.length ? `${queue.length} in your queue — overdue call-backs first, then priority, then stalest` : "Your open leads, in the order the workspace dials them"} href="/leads/workspace" hrefLabel="Start calling">
      {queue.length === 0 ? (
        <EmptyState
          title="Nothing to call"
          description="Every open lead you own has been worked, or none is assigned to you yet. Import a list or add a lead to fill the queue."
          action={
            <Link href="/import/leads" className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
              Import leads
            </Link>
          }
        />
      ) : (
        <ul className="divide-y">
          {queue.slice(0, limit).map((l) => {
            const due = l.callback_at && new Date(l.callback_at).getTime() <= now;
            const Icon = due ? CalendarClock : l.priority === "High" ? Flame : Timer;
            return (
              <li key={l.id}>
                <Link href={`/leads/${l.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-[120ms] hover:bg-muted/40">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className={due || l.priority === "High" ? "h-3.5 w-3.5 text-[var(--ops)]" : "h-3.5 w-3.5"} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{l.company_name ?? "Unnamed"}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {l.contact_name ?? "No contact"} · {l.stage}
                      {due ? ` · call-back due ${timeAgo(l.callback_at)}` : l.last_activity_at ? ` · last touch ${timeAgo(l.last_activity_at)}` : " · never called"}
                    </span>
                  </span>
                  {l.value_usd != null ? <span className="tabular shrink-0 text-xs text-muted-foreground">{formatUsd(l.value_usd)}</span> : null}
                </Link>
              </li>
            );
          })}
          {queue.length > limit ? (
            <li className="pt-2 text-[12px] text-muted-foreground">
              {queue.length - limit} more in the workspace
            </li>
          ) : null}
        </ul>
      )}
    </Panel>
  );
}

/* ── Pipeline by stage ────────────────────────────────────────────────────── */

export function PipelineByStage({ leads }: { leads: LeadWithRefs[] }) {
  const rows = LEAD_STAGES.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    const value = inStage.reduce((n, l) => n + (l.value_usd ?? 0), 0);
    return {
      key: stage,
      label: stage,
      value: inStage.length,
      sub: value > 0 ? formatUsd(value) : undefined,
      href: "/pipeline",
      title: `${stage}: ${inStage.length} lead${inStage.length === 1 ? "" : "s"}${value > 0 ? `, ${formatUsd(value)} as entered` : ""}`,
    };
  });
  return (
    <Panel title="Pipeline by stage" basis={`${leads.length} leads in the book · lead values as entered, USD`} href="/pipeline" hrefLabel="Open board">
      {leads.length === 0 ? (
        <EmptyState title="No leads in the book" description="The pipeline fills as leads are added or imported." />
      ) : (
        <BarList rows={rows} />
      )}
    </Panel>
  );
}

/* ── Ops panel: revenue by event ──────────────────────────────────────────── */

export function OpsEventsPanel({ events, error }: { events: OpsEvent[] | null; error: string | null }) {
  const rows = (events ?? []).slice(0, 6).map((e) => {
    const pct = e.allocated_total ? Math.round((e.allocated_paid / e.allocated_total) * 100) : 0;
    return {
      key: String(e.id),
      label: e.name,
      value: e.allocated_total,
      display: formatOpsMoney(e.allocated_total),
      sub: `${e.deal_count} sponsor${e.deal_count === 1 ? "" : "s"} · ${pct}% paid · ${formatEventDate(e)}`,
      href: "/events",
      title: `${e.name}: ${formatOpsMoney(e.allocated_total)} allocated, ${formatOpsMoney(e.allocated_paid)} paid`,
    };
  });
  return (
    <Panel title="Event revenue" basis="Allocated in the ops panel, the six largest · each event in its own currency" href="/events" hrefLabel="All events">
      {error ? (
        <EmptyState title="Not reading the ops panel" description={error} />
      ) : !rows.length ? (
        <EmptyState title="No portfolio events yet" description="Events and their sponsors live in the tracker; add one there and its revenue appears here." />
      ) : (
        <BarList rows={rows} />
      )}
    </Panel>
  );
}

/* ── Activity feed ────────────────────────────────────────────────────────── */

const ACTIVITY_ICON = {
  call: Phone,
  email: Mail,
  meeting: Users,
  linkedin: CircleDot,
  note: CircleDot,
  task: BadgeCheck,
} as const;

export function ActivityFeed({ activities }: { activities: ActivityWithRefs[] }) {
  return (
    <Panel title="Team activity" basis="The last ten calls, emails and notes logged by anyone">
      {activities.length === 0 ? (
        <EmptyState title="Nothing logged yet" description="Calls made in the workspace and notes left on a lead or account show up here." />
      ) : (
        <ul className="space-y-3">
          {activities.map((a) => {
            const Icon = ACTIVITY_ICON[a.type] ?? CircleDot;
            const subject = a.lead_name ?? a.account_name ?? a.subject ?? "—";
            return (
              <li key={a.id} className="flex gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-medium">{subject}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {ACTIVITY_LABELS[a.type]}
                      {a.outcome ? ` · ${a.outcome}` : ""}
                    </span>
                  </p>
                  {a.body ? <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p> : null}
                  <p className="text-[11px] text-muted-foreground">
                    {timeAgo(a.occurred_at)}
                    {a.owner?.full_name ? ` · ${a.owner.full_name}` : ""}
                    {a.duration_seconds ? ` · ${formatDuration(a.duration_seconds)}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
