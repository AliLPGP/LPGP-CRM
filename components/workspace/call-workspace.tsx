"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  ExternalLink,
  Flame,
  Inbox,
  Link2,
  Loader2,
  Mail,
  Pause,
  Phone,
  PhoneCall,
  Radar,
  RotateCcw,
  SkipForward,
  Sparkles,
  TriangleAlert,
  User,
} from "lucide-react";
import { logActivity, getLeadTimeline } from "@/lib/activity-actions";
import {
  DISPOSITIONS,
  DISPOSITION_MAP,
  buildQueue,
  formatDuration,
  teammatesFor,
  telHref,
  QUEUE_FILTERS,
  type QueueFilter,
} from "@/lib/sales";
import { LEAD_STAGES } from "@/lib/pipeline";
import { formatOpsMoney, type OpsLeadSummary } from "@/lib/ops-types";
import type { ActivityTimelineRow, LeadWithRefs } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { EventChips } from "@/components/pipeline/event-chips";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { cn, initials, timeAgo } from "@/lib/utils";

type Props = {
  leads: LeadWithRefs[];
  currentUserId: string | null;
  opsByLead: Record<string, OpsLeadSummary>;
};

export function CallWorkspace({ leads, currentUserId, opsByLead }: Props) {
  const [filter, setFilter] = useState<QueueFilter>("my-open");

  // The queue is frozen when it's built. Re-sorting under someone mid-session
  // — because a save changed last_activity_at — would move the ground beneath
  // them. "Rebuild" is an explicit action.
  const [queue, setQueue] = useState<LeadWithRefs[]>(() =>
    buildQueue(leads, "my-open", currentUserId),
  );
  const [index, setIndex] = useState(0);
  const [worked, setWorked] = useState<Record<string, string>>({});

  const rebuild = useCallback(
    (next: QueueFilter) => {
      setQueue(buildQueue(leads, next, currentUserId));
      setIndex(0);
      setWorked({});
    },
    [leads, currentUserId],
  );

  const lead = queue[index] ?? null;
  const remaining = queue.length - index;

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <QueueBar
        filter={filter}
        onFilter={(f) => {
          setFilter(f);
          rebuild(f);
        }}
        onRebuild={() => rebuild(filter)}
        index={index}
        total={queue.length}
        workedCount={Object.keys(worked).length}
      />

      {!lead ? (
        <QueueEmpty
          total={queue.length}
          workedCount={Object.keys(worked).length}
          onRebuild={() => rebuild(filter)}
        />
      ) : (
        <div className="grid flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[1.15fr_1fr] xl:grid-cols-[1.25fr_1fr]">
          <LeadPane
            lead={lead}
            ops={opsByLead[lead.id] ?? null}
            teammates={teammatesFor(leads, lead)}
          />
          <CallPane
            key={lead.id}
            lead={lead}
            hasNext={index < queue.length - 1}
            hasPrev={index > 0}
            remaining={remaining}
            onPrev={() => setIndex((i) => Math.max(0, i - 1))}
            onSkip={() => setIndex((i) => i + 1)}
            onSaved={(outcome) => {
              setWorked((w) => ({ ...w, [lead.id]: outcome }));
              setIndex((i) => i + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function QueueBar({
  filter,
  onFilter,
  onRebuild,
  index,
  total,
  workedCount,
}: {
  filter: QueueFilter;
  onFilter: (f: QueueFilter) => void;
  onRebuild: () => void;
  index: number;
  total: number;
  workedCount: number;
}) {
  const pct = total ? Math.round((Math.min(index, total) / total) * 100) : 0;
  return (
    <div className="sticky top-0 z-20 border-b bg-card/85 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:px-6">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">
          <PhoneCall className="h-4 w-4" />
        </span>
        <div className="mr-auto min-w-0">
          <p className="text-sm font-semibold leading-tight">Call workspace</p>
          <p className="text-[11px] text-muted-foreground">
            {total ? `Lead ${Math.min(index + 1, total)} of ${total}` : "Nothing queued"}
            {workedCount ? ` · ${workedCount} worked this session` : ""}
          </p>
        </div>

        <NativeSelect
          className="h-9 w-[190px]"
          value={filter}
          onChange={(e) => onFilter(e.target.value as QueueFilter)}
          aria-label="Queue"
        >
          {QUEUE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </NativeSelect>

        <Button variant="outline" size="sm" onClick={onRebuild}>
          <RotateCcw className="h-3.5 w-3.5" /> Rebuild
        </Button>
      </div>

      <div className="h-0.5 w-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function QueueEmpty({
  total,
  workedCount,
  onRebuild,
}: {
  total: number;
  workedCount: number;
  onRebuild: () => void;
}) {
  const finished = total > 0;
  return (
    <div className="grid flex-1 place-items-center p-10">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          {finished ? <Check className="h-7 w-7" /> : <Inbox className="h-7 w-7" />}
        </span>
        <h2 className="mt-4 text-lg font-semibold">
          {finished ? "Queue cleared" : "Nothing in this queue"}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {finished
            ? `You worked ${workedCount} lead${workedCount === 1 ? "" : "s"}. Rebuild to pick up call-backs, or switch queue.`
            : "Try another queue, or add leads from the Leads page or a spreadsheet import."}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={onRebuild}>
            <RotateCcw className="h-4 w-4" /> Rebuild queue
          </Button>
          <Button variant="outline" asChild>
            <Link href="/leads">Back to leads</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Left: who you're calling ───────────────────────────────────────────────

function LeadPane({
  lead,
  ops,
  teammates,
}: {
  lead: LeadWithRefs;
  ops: OpsLeadSummary | null;
  teammates: LeadWithRefs[];
}) {
  const tel = telHref(lead.contact_phone);
  // Pinned once per mount: reading the clock during render would make the
  // component non-idempotent, and a call-back doesn't come due mid-render.
  const [now] = useState(() => Date.now());
  const callbackDue = lead.callback_at && new Date(lead.callback_at).getTime() <= now;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent text-lg font-semibold text-accent-foreground">
            {initials(lead.company_name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="display truncate text-2xl">
                {lead.company_name ?? "Unnamed company"}
              </h1>
              {lead.category ? (
                <Badge variant="secondary" className="text-[10px]">
                  {lead.category}
                </Badge>
              ) : null}
              {lead.priority === "High" ? (
                <Badge className="border-transparent bg-[var(--ops-soft)] text-[var(--ops)] text-[10px]">
                  <Flame className="h-3 w-3" /> High
                </Badge>
              ) : null}
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                {lead.contact_name || "No contact name"}
              </span>
              {lead.contact_title ? <span>· {lead.contact_title}</span> : null}
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {lead.stage}
              </Badge>
              {lead.market ? <span>{lead.market}</span> : null}
              {lead.target_events?.length ? <EventChips events={lead.target_events} max={3} /> : null}
              <span>
                {lead.call_count ?? 0} call{(lead.call_count ?? 0) === 1 ? "" : "s"}
              </span>
              {lead.last_activity_at ? <span>· last {timeAgo(lead.last_activity_at)}</span> : null}
              {lead.owner?.full_name ? <span>· {lead.owner.full_name}</span> : null}
            </div>
          </div>
        </div>

        {/* Contact rail */}
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <ContactRow
            icon={<Phone className="h-4 w-4" />}
            label="Phone"
            value={lead.contact_phone}
            href={tel}
            emphasis
          />
          <ContactRow
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={lead.contact_email}
            href={lead.contact_email ? `mailto:${lead.contact_email}` : null}
          />
          <ContactRow
            icon={<Link2 className="h-4 w-4" />}
            label="LinkedIn"
            value={lead.linkedin_url ? "Open profile" : null}
            href={lead.linkedin_url}
            external
          />
          <ContactRow
            icon={<Building2 className="h-4 w-4" />}
            label="Database"
            value={lead.company ? lead.company.name : null}
            href={lead.company ? `/companies/${lead.company.id}` : null}
          />
        </div>

        {callbackDue ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[var(--ops-soft)] px-2.5 py-1.5 text-xs font-medium text-[var(--ops)]">
            <CalendarClock className="h-3.5 w-3.5" />
            Call-back was due {timeAgo(lead.callback_at)}
          </p>
        ) : null}

        {lead.do_not_call ? (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="h-3.5 w-3.5" /> Marked do-not-call
          </p>
        ) : null}
      </div>

      {ops ? <OpsStrip ops={ops} /> : null}
      <TeammateStrip teammates={teammates} />

      {lead.next_step ? (
        <div className="rounded-2xl border bg-card p-4">
          <p className="eyebrow">Next step</p>
          <p className="mt-1 text-sm">{lead.next_step}</p>
          {lead.next_step_date ? (
            <p className="mt-0.5 text-xs text-muted-foreground">Due {lead.next_step_date}</p>
          ) : null}
        </div>
      ) : null}

      <Timeline leadId={lead.id} />
    </div>
  );
}

function ContactRow({
  icon,
  label,
  value,
  href,
  external,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  href: string | null | undefined;
  external?: boolean;
  emphasis?: boolean;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
          emphasis && value ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-muted text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span className={cn("block truncate text-sm", !value && "text-muted-foreground")}>
          {value || "—"}
        </span>
      </span>
      {href && external ? <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /> : null}
    </>
  );

  if (!href || !value) {
    return <div className="flex items-center gap-2.5 rounded-xl border bg-muted/30 px-3 py-2">{body}</div>;
  }
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="lift flex items-center gap-2.5 rounded-xl border bg-card px-3 py-2 hover:border-primary/40"
    >
      {body}
    </a>
  );
}

/** The ops-panel context strip — what this sponsor already pays for. */
function OpsStrip({ ops }: { ops: OpsLeadSummary }) {
  return (
    <div className="rounded-2xl border border-[var(--ops)]/35 bg-[var(--ops-soft)] p-4">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-[var(--ops)]" />
        <p className="text-sm font-semibold">Live in the ops panel</p>
        {ops.paid ? (
          <Badge className="border-transparent bg-[var(--success-soft)] text-[10px] text-[var(--success)]">
            Paid
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Tracked as <span className="font-medium text-foreground">{ops.company}</span>
        {ops.events.length ? " — sponsoring:" : " — no event allocation yet."}
      </p>
      {ops.events.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {ops.events.map((e) => (
            <li
              key={e.event_id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--ops)]/30 bg-card/70 px-2 py-1 text-[11px]"
            >
              <span className="font-medium">{e.event_name}</span>
              <span className="tabular text-muted-foreground">
                {formatOpsMoney(e.allocated, e.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Other leads for this company — so nobody dials a firm a colleague is mid-deal with. */
function TeammateStrip({ teammates }: { teammates: LeadWithRefs[] }) {
  if (!teammates.length) return null;
  return (
    <div className="rounded-2xl border border-[var(--brand)]/30 bg-[var(--accent)]/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <User className="h-4 w-4 text-[var(--brand)]" />
        Also in the pipeline
      </p>
      <ul className="mt-2 space-y-1.5">
        {teammates.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="font-medium">{t.owner?.full_name ?? "Unassigned"}</span>
            <Badge variant="outline" className="text-[10px]">
              {t.stage}
            </Badge>
            {t.target_events?.length ? (
              <EventChips events={t.target_events} max={3} />
            ) : (
              <span className="text-xs text-muted-foreground">no event set</span>
            )}
            <Link href={`/leads/${t.id}`} className="ml-auto text-xs text-[var(--brand)] hover:underline">
              Open
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Check before pitching the same event twice.
      </p>
    </div>
  );
}

function Timeline({ leadId }: { leadId: string }) {
  // Tagged with the lead it belongs to, so switching leads shows the spinner
  // without an effect having to clear state first.
  const [loaded, setLoaded] = useState<{ leadId: string; rows: ActivityTimelineRow[] } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    getLeadTimeline(leadId).then((rows) => {
      if (live) setLoaded({ leadId, rows });
    });
    return () => {
      live = false;
    };
  }, [leadId]);

  const rows = loaded?.leadId === leadId ? loaded.rows : null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="eyebrow">History</p>
      {rows === null ? (
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No touches logged yet — this is a first contact.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex gap-2.5">
              <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <CircleDot className="h-3 w-3" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px]">
                  <span className="font-medium capitalize">{r.type}</span>
                  {r.outcome ? <span className="text-muted-foreground"> · {r.outcome}</span> : null}
                  {r.duration_seconds ? (
                    <span className="tabular text-muted-foreground">
                      {" "}
                      · {formatDuration(r.duration_seconds)}
                    </span>
                  ) : null}
                </p>
                {r.body ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-muted-foreground">
                    {r.body}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {timeAgo(r.occurred_at)}
                  {r.owner_name ? ` · ${r.owner_name}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Right: log the call ────────────────────────────────────────────────────

function CallPane({
  lead,
  hasNext,
  hasPrev,
  remaining,
  onPrev,
  onSkip,
  onSaved,
}: {
  lead: LeadWithRefs;
  hasNext: boolean;
  hasPrev: boolean;
  remaining: number;
  onPrev: () => void;
  onSkip: () => void;
  onSaved: (outcome: string) => void;
}) {
  const [outcome, setOutcome] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [stage, setStage] = useState<string>(lead.stage);
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Call timer
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (startedAt == null) return;
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const tel = telHref(lead.contact_phone);

  const pickOutcome = useCallback((value: string) => {
    setOutcome(value);
    const meta = DISPOSITION_MAP[value];
    if (meta?.stage) setStage(meta.stage);
    if (meta?.callbackHours) {
      const when = new Date(Date.now() + meta.callbackHours * 3_600_000);
      // datetime-local wants local time with no zone suffix.
      const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000);
      setCallbackAt(local.toISOString().slice(0, 16));
    }
  }, []);

  const save = useCallback(async () => {
    if (saving) return;
    if (!outcome && !notes.trim()) {
      setError("Pick an outcome or write a note first.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await logActivity({
      leadId: lead.id,
      accountId: lead.account_id,
      companyId: lead.company_id,
      type: "call",
      outcome,
      body: notes,
      durationSeconds: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null,
      stage: stage !== lead.stage ? stage : null,
      // An empty box means "no call-back"; the action treats "" as a clear.
      callbackAt: callbackAt ? new Date(callbackAt).toISOString() : "",
      doNotCall: outcome === "Wrong number",
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save");
      return;
    }
    onSaved(outcome ?? "Note");
  }, [saving, outcome, notes, lead, startedAt, stage, callbackAt, onSaved]);

  // Keyboard: digits pick an outcome, ⌘/Ctrl+Enter saves, Esc leaves the box.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void save();
        return;
      }
      if (typing) return;

      const byKey = DISPOSITIONS.find((d) => d.key === e.key);
      if (byKey) {
        e.preventDefault();
        pickOutcome(byKey.value);
        return;
      }
      if (e.key === "n" || e.key === "ArrowRight") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "p" || e.key === "ArrowLeft") {
        e.preventDefault();
        onPrev();
      } else if (e.key === "c" && tel) {
        e.preventDefault();
        setStartedAt(Date.now());
        window.location.href = tel;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, pickOutcome, onSkip, onPrev, tel]);

  return (
    <div className="space-y-4 lg:sticky lg:top-[4.25rem] lg:self-start">
      {/* Dialer */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          {tel ? (
            <a
              href={tel}
              onClick={() => setStartedAt(Date.now())}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--success)] px-4 py-3 text-sm font-semibold text-white transition-colors hover:opacity-90"
            >
              <Phone className="h-4 w-4" />
              Call {lead.contact_phone}
            </a>
          ) : (
            <div className="flex-1 rounded-xl border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
              No phone number on this lead
            </div>
          )}

          <div className="shrink-0 text-right">
            <p className="tabular text-xl font-semibold leading-none">
              {formatDuration(elapsed) === "—" ? "0s" : formatDuration(elapsed)}
            </p>
            <button
              type="button"
              onClick={() => (startedAt ? setStartedAt(null) : setStartedAt(Date.now()))}
              className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              {startedAt ? (
                <>
                  <Pause className="h-3 w-3" /> Stop
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" /> Start timer
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Outcome */}
      <div className="rounded-2xl border bg-card p-4">
        <p className="eyebrow">Outcome</p>
        <div className="mt-2.5 grid grid-cols-2 gap-2">
          {DISPOSITIONS.map((d) => {
            const active = outcome === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => pickOutcome(d.value)}
                className={cn(
                  "group flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all active:scale-[0.98]",
                  active
                    ? d.kind === "reached"
                      ? "border-[var(--success)] bg-[var(--success-soft)] text-[var(--success)]"
                      : d.kind === "dead"
                        ? "border-destructive bg-destructive/10 text-destructive"
                        : "border-[var(--ops)] bg-[var(--ops-soft)] text-[var(--ops)]"
                    : "hover:border-foreground/25 hover:bg-accent/60",
                )}
              >
                <span className="truncate">{d.label}</span>
                <kbd
                  className={cn(
                    "rounded border px-1 text-[10px] tabular",
                    active ? "border-current/30" : "text-muted-foreground",
                  )}
                >
                  {d.key}
                </kbd>
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Call notes</p>
          <span className="text-[10px] text-muted-foreground">⌘↵ to save</span>
        </div>
        <textarea
          ref={notesRef}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="What was said, who else to speak to, objections, budget…"
          className="mt-2 w-full resize-y rounded-xl border bg-background px-3 py-2.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Move to stage
            </span>
            <NativeSelect
              className="w-full"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              {LEAD_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Call back
            </span>
            <input
              type="datetime-local"
              value={callbackAt}
              onChange={(e) => setCallbackAt(e.target.value)}
              className="h-9 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </label>
        </div>

        {error ? <p className="mt-2.5 text-sm text-destructive">{error}</p> : null}
      </div>

      {/* Advance */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={onPrev} disabled={!hasPrev} aria-label="Previous lead">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onSkip} className="flex-1">
          <SkipForward className="h-4 w-4" /> Skip
        </Button>
        <Button onClick={save} disabled={saving} className="flex-[2]">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasNext ? (
            <ArrowRight className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {hasNext ? "Save & next" : "Save & finish"}
        </Button>
      </div>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> {remaining} left in queue
        </span>
        <span>
          <kbd className="rounded border px-1">1–8</kbd> outcome
        </span>
        <span>
          <kbd className="rounded border px-1">c</kbd> call
        </span>
        <span>
          <kbd className="rounded border px-1">n</kbd> next
          <ChevronRight className="inline h-3 w-3" />
        </span>
      </p>
    </div>
  );
}
