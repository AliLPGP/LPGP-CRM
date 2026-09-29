import Link from "next/link";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  CircleDot,
  Mail,
  Phone,
  Radar,
  TrendingUp,
  Users,
} from "lucide-react";
import { LEAD_STAGES, STAGE_META } from "@/lib/pipeline";
import { ACTIVITY_LABELS, formatDuration } from "@/lib/sales";
import { formatOpsMoney, type OpsEvent } from "@/lib/ops-types";
import { formatEventDate } from "@/lib/event-date";
import type { ActivityWithRefs, LeadWithRefs } from "@/lib/types";
import { cn, formatUsd, timeAgo } from "@/lib/utils";

/* ── KPI tile ─────────────────────────────────────────────────────────────── */

export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
  href,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "brand" | "success" | "ops";
  href?: string;
  icon?: React.ReactNode;
}) {
  const toneRing = {
    neutral: "text-muted-foreground bg-muted",
    brand: "text-[var(--brand)] bg-[var(--accent)]",
    success: "text-[var(--success)] bg-[var(--success-soft)]",
    ops: "text-[var(--ops)] bg-[var(--ops-soft)]",
  }[tone];

  const body = (
    <div className={cn("sheen h-full rounded-2xl border bg-card p-5", href && "lift")}>
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">{label}</span>
        {icon ? (
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg", toneRing)}>{icon}</span>
        ) : null}
      </div>
      <p className="figure mt-3 text-[2.25rem] leading-none">{value}</p>
      {sub ? <p className="mt-2 text-sm text-muted-foreground">{sub}</p> : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ── Pipeline funnel ──────────────────────────────────────────────────────── */

export function StageFunnel({ leads }: { leads: LeadWithRefs[] }) {
  const rows = LEAD_STAGES.map((stage) => {
    const inStage = leads.filter((l) => l.stage === stage);
    return {
      stage,
      kind: STAGE_META[stage].kind,
      count: inStage.length,
      value: inStage.reduce((n, l) => n + (l.value_usd ?? 0), 0),
    };
  });
  const peak = Math.max(1, ...rows.map((r) => r.count));

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Pipeline</h2>
          <p className="text-xs text-muted-foreground">{leads.length} leads in the book</p>
        </div>
        <Link
          href="/pipeline"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
        >
          Open board <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <ul className="mt-4 space-y-2.5">
        {rows.map((r) => (
          <li key={r.stage}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{r.stage}</span>
              <span className="flex items-baseline gap-2">
                {r.value > 0 ? (
                  <span className="tabular text-xs text-muted-foreground">{formatUsd(r.value)}</span>
                ) : null}
                <span className="tabular font-semibold">{r.count}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-700 ease-out",
                  r.kind === "won"
                    ? "bg-[var(--success)]"
                    : r.kind === "lost"
                      ? "bg-[var(--destructive)]/70"
                      : "brand-gradient",
                )}
                style={{ width: `${Math.round((r.count / peak) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Ops panel: revenue by event ──────────────────────────────────────────── */

export function OpsEventsPanel({
  events,
  error,
}: {
  events: OpsEvent[] | null;
  error: string | null;
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--ops-soft)] text-[var(--ops)]">
            <Radar className="h-3.5 w-3.5" />
          </span>
          <div>
            <h2 className="font-semibold">Event revenue</h2>
            <p className="text-xs text-muted-foreground">Allocated in the ops panel</p>
          </div>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {error}
        </p>
      ) : !events?.length ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No portfolio events in the ops panel yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {events.slice(0, 6).map((e) => {
            const pct = e.allocated_total
              ? Math.round((e.allocated_paid / e.allocated_total) * 100)
              : 0;
            return (
              <li key={e.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{e.name}</span>
                  <span className="tabular shrink-0 text-xs text-muted-foreground">
                    {formatOpsMoney(e.allocated_total)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[var(--success)] transition-[width] duration-700 ease-out"
                      style={{ width: `${Math.min(100, pct)}%` }}
                    />
                  </div>
                  <span className="tabular w-16 shrink-0 text-right text-[11px] text-muted-foreground">
                    {pct}% paid
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.deal_count} sponsor{e.deal_count === 1 ? "" : "s"}
                  {` · ${formatEventDate(e)}`}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="font-semibold">Team activity</h2>
      {activities.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing logged yet. Calls made in the workspace show up here.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
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
                  {a.body ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{a.body}</p>
                  ) : null}
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
    </section>
  );
}

/* ── Top sponsors ─────────────────────────────────────────────────────────── */

export function SponsorStrip({
  accounts,
}: {
  accounts: { id: string; name: string; status: string; contacts: number; events: string[] }[];
}) {
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Sponsors</h2>
          <p className="text-xs text-muted-foreground">Accounts with live allocations</p>
        </div>
        <Link
          href="/accounts"
          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--brand)] hover:underline"
        >
          All accounts <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {accounts.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No sponsor accounts yet — convert a confirmed lead to create one.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {accounts.slice(0, 6).map((a) => (
            <li key={a.id}>
              <Link
                href={`/accounts/${a.id}`}
                className="lift block rounded-xl border bg-background px-3 py-2.5"
              >
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" /> {a.contacts}
                  </span>
                  {a.events.length ? (
                    <span className="inline-flex min-w-0 items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span className="truncate">{a.events.join(", ")}</span>
                    </span>
                  ) : (
                    <span>{a.status}</span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Conversion strip ─────────────────────────────────────────────────────── */

export function ConnectRate({ calls, connects }: { calls: number; connects: number }) {
  const pct = calls ? Math.round((connects / calls) * 100) : 0;
  return (
    <div className="sheen rounded-2xl border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="eyebrow">Connect rate · 7 days</span>
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--success-soft)] text-[var(--success)]">
          <TrendingUp className="h-4 w-4" />
        </span>
      </div>
      <p className="figure mt-3 text-[2.25rem] leading-none">{pct}%</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {connects} connected of {calls} call{calls === 1 ? "" : "s"}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--success)] transition-[width] duration-700 ease-out"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
    </div>
  );
}
