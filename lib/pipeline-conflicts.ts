import "server-only";
import { getReadClient } from "./supabase/server";
import { getSessionUser } from "./auth";
import { loadProfileDirectory } from "./initials";
import { isOpsConfigured, listOpsEvents, matchOpsCompany } from "./ops";
import {
  formatOpsMoney,
  opsMatchKey,
  OPS_SIGNED_CONFIDENCE as SIGNED_CONFIDENCE,
  type DateTbc,
  type OpsMatch,
} from "./ops-types";
import { STAGE_META, type LeadStage } from "./pipeline";
import type { EventVerdict, LeadEvent, PipelineConflicts, TeammateLead } from "./types";

/**
 * The heads-up behind "add to pipeline".
 *
 * Before someone starts working a company, answer two things about it:
 *   1. Is a teammate already on it — and for which events?
 *   2. Has it already signed with us, per the ops panel — for which events,
 *      and who signed it?
 *
 * Nothing here blocks or fills anything in. It reports, and the person decides.
 * The conflict is per event: John having Barings for Miami doesn't stop you
 * pursuing Barings for Berlin, so verdicts are computed for the events the
 * person actually selected.
 */

export type ConflictQuery = {
  company: string;
  eventIds?: number[];
  /** Ignore this lead's own row — used when editing an existing lead. */
  excludeLeadId?: string | null;
};

export async function checkPipelineConflicts(query: ConflictQuery): Promise<PipelineConflicts> {
  const company = query.company.trim();
  const empty: PipelineConflicts = {
    company,
    teammates: [],
    ops: null,
    verdicts: [],
    signedBy: [],
    hasConflict: false,
  };
  const key = opsMatchKey(company);
  if (!key) return empty;

  const [user, directory, teammates, ops] = await Promise.all([
    getSessionUser(),
    loadProfileDirectory(),
    findTeammateLeads(key, query.excludeLeadId ?? null),
    isOpsConfigured() ? matchOpsCompany(company) : Promise.resolve(null),
  ]);

  const mine = user?.id ?? null;
  const withMine: TeammateLead[] = teammates.map((t) => ({
    ...t,
    ownerName: t.ownerId ? directory.nameFor(t.ownerId) ?? "A teammate" : "Unassigned",
    isMine: t.ownerId != null && t.ownerId === mine,
  }));
  const best = ops?.ok ? ops.data.best : null;

  // "Signed by" comes from the initials the ops panel stamps on each deal.
  const signer = (initials: string) =>
    directory.nameForInitials(initials) ?? (initials.trim() ? initials.trim().toUpperCase() : null);
  const signedBy = best
    ? [...new Set(best.deals.filter((d) => !d.cancelled).map((d) => signer(d.initials)).filter(Boolean))] as string[]
    : [];

  const verdicts = (query.eventIds ?? []).map((eventId) =>
    verdictFor(eventId, withMine, best, signer),
  );

  // A lost lead is context ("they said no to John in March"), not a conflict.
  const liveTeammate = withMine.some((t) => !t.isMine && t.stageKind !== "lost");
  const signedSomewhere = Boolean(best && best.confidence >= SIGNED_CONFIDENCE);

  return {
    company,
    teammates: withMine,
    ops: best,
    verdicts,
    signedBy,
    hasConflict: liveTeammate || signedSomewhere,
  };
}

function verdictFor(
  eventId: number,
  teammates: TeammateLead[],
  ops: OpsMatch | null,
  signer: (initials: string) => string | null,
): EventVerdict {
  const name =
    ops?.events.find((e) => e.event_id === eventId)?.event_name ??
    teammates.flatMap((t) => t.events).find((e) => e.event_id === eventId)?.event_name ??
    `Event ${eventId}`;

  // Signed beats in-pipeline: if the ops panel has money allocated to this
  // event, that's the fact that matters, whoever's pipeline it sits in.
  if (ops && ops.confidence >= SIGNED_CONFIDENCE) {
    const alloc = ops.events.find((e) => e.event_id === eventId);
    if (alloc) {
      const deal = ops.deals.find(
        (d) => !d.cancelled && d.events.some((e) => e.event_id === eventId),
      );
      const signedBy = deal ? signer(deal.initials) : null;
      const bits = [formatOpsMoney(alloc.allocated_amount, alloc.currency)];
      if (alloc.package_labels.length) bits.push(alloc.package_labels.join(", "));
      bits.push(ops.has_payment ? "paid" : "not yet paid");
      if (signedBy) bits.push(`signed by ${signedBy}`);
      return { event_id: eventId, event_name: name, status: "signed", detail: bits.join(" · "), signedBy };
    }
  }

  const holder = teammates.find(
    (t) => !t.isMine && t.stageKind !== "lost" && t.events.some((e) => e.event_id === eventId),
  );
  if (holder) {
    return {
      event_id: eventId,
      event_name: name,
      status: "pipeline",
      detail: `${holder.ownerName} · ${holder.stage}`,
      leadId: holder.leadId,
    };
  }

  return { event_id: eventId, event_name: name, status: "clear", detail: "Nobody on it" };
}

/**
 * Every lead for this company, whoever owns it. Matched on the same
 * normalised key the ops matcher uses, so "Barings LLC" and "Barings" collide.
 * Owner names are filled in by the caller from the profile directory.
 */
async function findTeammateLeads(key: string, excludeLeadId: string | null): Promise<TeammateLead[]> {
  const supabase = getReadClient();
  if (!supabase) return [];

  // Narrow in SQL on the first word, then compare the full key in JS — the
  // key can't be expressed as a LIKE pattern, but the first word usually can.
  const firstWord = key.split(" ")[0].replace(/[%_]/g, "");
  const { data } = await supabase
    .from("leads")
    .select("id, owner_id, company_name, stage, target_events, updated_at, last_activity_at")
    .ilike("company_name", `%${firstWord}%`)
    .limit(200);
  if (!data?.length) return [];

  return data
    .filter(
      (r) => r.id !== excludeLeadId && opsMatchKey((r.company_name as string | null) ?? "") === key,
    )
    .map((r) => {
      const stage = r.stage as LeadStage;
      return {
        leadId: r.id as string,
        ownerId: (r.owner_id as string | null) ?? null,
        ownerName: "",
        isMine: false,
        stage,
        stageKind: STAGE_META[stage]?.kind ?? "open",
        events: Array.isArray(r.target_events) ? (r.target_events as LeadEvent[]) : [],
        updatedAt: r.updated_at as string,
        lastActivityAt: (r.last_activity_at as string | null) ?? null,
      };
    })
    // Open pursuits first, then won, then lost — the order someone needs them.
    .sort((a, b) => rank(a.stageKind) - rank(b.stageKind) || b.updatedAt.localeCompare(a.updatedAt));
}

function rank(kind: TeammateLead["stageKind"]): number {
  return kind === "open" ? 0 : kind === "won" ? 1 : 2;
}

export type KnownEvent = LeadEvent & {
  event_date: string | null;
  location: string;
  producer: string;
  date_tbc: DateTbc;
};

/**
 * Events a lead can be pursued for. The ops panel is the source; when it's
 * not reachable, fall back to the names snapshotted on event targets so the
 * picker still works.
 */
export async function listKnownEvents(): Promise<KnownEvent[]> {
  if (isOpsConfigured()) {
    const res = await listOpsEvents();
    if (res.ok) {
      return res.data.map((e) => ({
        event_id: e.id,
        event_name: e.name,
        event_date: e.event_date,
        location: e.location,
        producer: e.producer,
        date_tbc: e.date_tbc,
      }));
    }
  }
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("event_targets")
    .select("ops_event_id, event_name")
    .not("event_name", "is", null)
    .order("event_name");
  return (data ?? []).map((r) => ({
    event_id: r.ops_event_id as number,
    event_name: r.event_name as string,
    event_date: null,
    location: "",
    producer: "",
    date_tbc: "",
  }));
}
