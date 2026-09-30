"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "./supabase/admin";
import { getSessionUser } from "./auth";
import { normaliseSeriesId } from "./events-catalogue";
import { listOpsEventSponsors } from "./ops";
import { loadProfileDirectory } from "./initials";
import type { OpsSponsor } from "./ops-types";

/** A sponsor row with the signer resolved from their initials. */
export type EventSponsorRow = OpsSponsor & { signed_by: string | null };

export type TargetResult = { ok: boolean; error?: string };

function toAmount(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(typeof v === "string" ? v.replace(/[^0-9.\-]/g, "") : v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toCount(v: unknown): number | null {
  const n = toAmount(v);
  return n == null ? null : Math.round(n);
}

/** A series id fit to store: folded onto the current five, or null. */
function validSeries(v: unknown): string | null {
  return normaliseSeriesId(v);
}

/**
 * Set (or clear) an event's target and series.
 *
 * Upserts on ops_event_id so the row is created on first save without the UI
 * needing to know whether one exists. `event_name` is snapshotted so the page
 * still reads sensibly if the bridge is later unreachable.
 */
export async function saveEventTarget(input: {
  opsEventId: number;
  eventName?: string | null;
  series?: string | null;
  targetAmount?: string | number | null;
  targetCurrency?: string | null;
  targetSponsors?: string | number | null;
  notes?: string | null;
}): Promise<TargetResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };

  const opsEventId = Number(input.opsEventId);
  if (!Number.isInteger(opsEventId)) return { ok: false, error: "Invalid event" };

  const { error } = await supabase.from("event_targets").upsert(
    {
      ops_event_id: opsEventId,
      event_name: input.eventName ?? null,
      series: validSeries(input.series),
      target_amount: toAmount(input.targetAmount),
      target_currency: (input.targetCurrency || "GBP").toUpperCase().slice(0, 3),
      target_sponsors: toCount(input.targetSponsors),
      notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
      updated_by: user.id,
    },
    { onConflict: "ops_event_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/events");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Who is sponsoring one event, and whether they've paid.
 *
 * Read-only, but exposed as an action so each event row can pull its sponsors
 * when expanded rather than loading every event's sponsor list up front.
 */
export async function fetchEventSponsors(opsEventId: number): Promise<EventSponsorRow[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const [res, directory] = await Promise.all([
    listOpsEventSponsors(Number(opsEventId)),
    loadProfileDirectory(),
  ]);
  if (!res.ok) return [];
  return res.data.map((s) => ({
    ...s,
    signed_by: directory.nameForInitials(s.initials) ?? (s.initials ? s.initials.toUpperCase() : null),
  }));
}

/**
 * Accept every inferred series in one go.
 *
 * The page can suggest a series from an event's name; this writes those
 * suggestions down so they stop being guesses. Only fills events that have no
 * series stored — it never overwrites a human's choice.
 */
export async function acceptInferredSeries(
  rows: { opsEventId: number; eventName: string; series: string }[],
): Promise<TargetResult & { saved?: number }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };

  const payload = rows
    .filter((r) => validSeries(r.series) && Number.isInteger(Number(r.opsEventId)))
    .map((r) => ({
      ops_event_id: Number(r.opsEventId),
      event_name: r.eventName,
      series: r.series,
      updated_by: user.id,
    }));
  if (!payload.length) return { ok: true, saved: 0 };

  // Existing rows may already carry a target; upserting the full object would
  // null it. Split into inserts and series-only updates.
  const ids = payload.map((p) => p.ops_event_id);
  const { data: existing } = await supabase
    .from("event_targets")
    .select("ops_event_id, series")
    .in("ops_event_id", ids);
  const held = new Map((existing ?? []).map((r) => [r.ops_event_id as number, r.series]));

  const inserts = payload.filter((p) => !held.has(p.ops_event_id));
  const updates = payload.filter((p) => held.has(p.ops_event_id) && !held.get(p.ops_event_id));

  if (inserts.length) {
    const { error } = await supabase.from("event_targets").insert(inserts);
    if (error) return { ok: false, error: error.message };
  }
  for (const u of updates) {
    await supabase
      .from("event_targets")
      .update({ series: u.series, updated_by: user.id })
      .eq("ops_event_id", u.ops_event_id);
  }

  revalidatePath("/events");
  return { ok: true, saved: inserts.length + updates.length };
}
