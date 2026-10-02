import type { LeadWithRefs } from "@/lib/types";
import { STAGE_META } from "@/lib/pipeline";
import { isClosed } from "@/lib/sales";
import { formatUsd } from "@/lib/utils";
import { StatCard, StatRow } from "@/components/stat-card";

/** The figures the lead screens open with, counted once from the same rows. */
export function leadFigures(leads: LeadWithRefs[], currentUserId: string | null, now = Date.now()) {
  const open = leads.filter((l) => !isClosed(l));
  const mineOpen = open.filter((l) => !currentUserId || l.owner_id === currentUserId).filter((l) => !l.do_not_call);
  const callbacksDue = mineOpen.filter((l) => l.callback_at && new Date(l.callback_at).getTime() <= now);
  const neverCalled = mineOpen.filter((l) => (l.call_count ?? 0) === 0);
  const sum = (rows: LeadWithRefs[]) => rows.reduce((n, l) => n + (l.value_usd ?? 0), 0);
  return {
    total: leads.length,
    open: open.length,
    closed: leads.length - open.length,
    mineOpen: mineOpen.length,
    callbacksDue: callbacksDue.length,
    neverCalled: neverCalled.length,
    openValue: sum(leads.filter((l) => STAGE_META[l.stage]?.kind === "open")),
    wonValue: sum(leads.filter((l) => STAGE_META[l.stage]?.kind === "won")),
  };
}

/** The stat row shared by the Leads list and the Pipeline board. Server-safe. */
export function LeadStatRow({
  leads,
  currentUserId,
  now,
}: {
  leads: LeadWithRefs[];
  currentUserId: string | null;
  now: number;
}) {
  const f = leadFigures(leads, currentUserId, now);
  return (
    <StatRow>
      <StatCard label="Leads" value={f.total} basis={`${f.open} open · ${f.closed} closed`} href="/leads" />
      <StatCard label="My open leads" value={f.mineOpen} basis={`${f.neverCalled} never called`} href="/leads/workspace" />
      <StatCard label="Call-backs due" value={f.callbacksDue} basis="Promised, at or past the time" href="/leads/workspace" />
      <StatCard label="Open pipeline" value={formatUsd(f.openValue)} basis="Lead values as entered, USD" href="/pipeline" />
      <StatCard label="Confirmed" value={formatUsd(f.wonValue)} basis="Confirmed leads, as entered" href="/pipeline" />
    </StatRow>
  );
}
