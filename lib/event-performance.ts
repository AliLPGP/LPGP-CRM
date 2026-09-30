import "server-only";
import { getReadClient } from "./supabase/server";
import { isOpsConfigured, listOpsEvents, listOpsEventSponsors } from "./ops";
import type { DateTbc, OpsSponsor } from "./ops-types";
import { CATALOGUE_2027, guessSeries, normaliseSeriesId, SERIES, type SeriesId } from "./events-catalogue";

/**
 * Event performance = what the ops panel says an event earned, against the
 * target we set here.
 *
 * The tracker owns actuals; it has no concept of a target or of which
 * programme series an event belongs to. Those live in `event_targets`, keyed
 * by the tracker's event id.
 */

export type EventTargetRow = {
  id: string;
  ops_event_id: number;
  event_name: string | null;
  series: string | null;
  target_amount: number | null;
  target_currency: string;
  target_sponsors: number | null;
  notes: string | null;
  updated_at: string;
};

export type EventPerformance = {
  opsEventId: number;
  name: string;
  date: string | null;
  dateTbc: DateTbc;
  location: string;
  /** Producer team from the tracker's programme; "" when unassigned. */
  producer: string;
  /** Allocated to this event in the ops panel, across all live deals. */
  actual: number;
  /** The portion of `actual` whose deal has been paid. */
  collected: number;
  sponsorCount: number;
  target: number | null;
  targetCurrency: string;
  targetSponsors: number | null;
  /** actual ÷ target, or null when no target is set. */
  progress: number | null;
  series: SeriesId | null;
  /** True when the series was inferred rather than chosen by a person. */
  seriesInferred: boolean;
  targetRowId: string | null;
};

export type SeriesPerformance = {
  id: SeriesId | "unassigned";
  name: string;
  short: string;
  code: string;
  eventCount: number;
  actual: number;
  collected: number;
  target: number;
  sponsorCount: number;
  progress: number | null;
};

export type EventPerformanceData = {
  events: EventPerformance[];
  series: SeriesPerformance[];
  totals: {
    actual: number;
    collected: number;
    target: number;
    eventCount: number;
    sponsorCount: number;
    /** Events with a target set — the denominator for "on target" claims. */
    targeted: number;
    onTarget: number;
  };
  opsError: string | null;
};

async function listTargets(): Promise<EventTargetRow[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase.from("event_targets").select("*");
  return (data as EventTargetRow[]) ?? [];
}

/** programme_key -> catalogue entry, e.g. "2027:ops-miami". */
const CATALOGUE_BY_KEY = new Map(CATALOGUE_2027.map((c) => [`2027:${c.key}`, c]));

export async function getEventPerformance(): Promise<EventPerformanceData> {
  const empty: EventPerformanceData = {
    events: [],
    series: [],
    totals: {
      actual: 0,
      collected: 0,
      target: 0,
      eventCount: 0,
      sponsorCount: 0,
      targeted: 0,
      onTarget: 0,
    },
    opsError: null,
  };

  if (!isOpsConfigured()) {
    return { ...empty, opsError: "Connect the ops panel in Settings to pull events in." };
  }

  const [opsEvents, targets] = await Promise.all([listOpsEvents(), listTargets()]);
  if (!opsEvents.ok) return { ...empty, opsError: opsEvents.error };

  const byEventId = new Map(targets.map((t) => [t.ops_event_id, t]));

  const events: EventPerformance[] = opsEvents.data.map((raw) => {
    // An older tracker sends no programme fields at all. Fill them here, once,
    // so nothing downstream has to ask whether a string is there.
    const e = {
      ...raw,
      producer: raw.producer ?? "",
      date_tbc: raw.date_tbc ?? "",
      programme_year: raw.programme_year ?? null,
      programme_key: raw.programme_key ?? null,
    };
    const t = byEventId.get(e.id);
    const target = t?.target_amount != null ? Number(t.target_amount) : null;

    // Where the series comes from, in order: the confirmed programme when the
    // row is linked to it (the tracker files it the same way), a person's
    // stored choice, then a guess from the name. A stored choice under one of
    // the old CFO ids folds onto the CFO/COO portfolio, which is what it was.
    const keyed = e.programme_key ? (CATALOGUE_BY_KEY.get(e.programme_key)?.series ?? null) : null;
    const stored = normaliseSeriesId(t?.series);
    const guess = keyed || stored ? null : guessSeries(e.name);
    const series = keyed ?? stored ?? guess?.series ?? null;
    const seriesInferred = !stored && series != null;

    return {
      opsEventId: e.id,
      name: e.name,
      date: e.event_date,
      dateTbc: e.date_tbc,
      location: e.location,
      producer: e.producer,
      actual: e.allocated_total,
      collected: e.allocated_paid,
      sponsorCount: e.deal_count,
      target,
      targetCurrency: t?.target_currency ?? "GBP",
      targetSponsors: t?.target_sponsors ?? null,
      progress: target && target > 0 ? e.allocated_total / target : null,
      series,
      seriesInferred,
      targetRowId: t?.id ?? null,
    };
  });

  // Roll up by series. Unassigned events get their own bucket rather than
  // being dropped — a missing series should be visible, not invisible.
  const buckets = new Map<string, SeriesPerformance>();
  for (const s of SERIES) {
    buckets.set(s.id, {
      id: s.id,
      name: s.name,
      short: s.short,
      code: s.code,
      eventCount: 0,
      actual: 0,
      collected: 0,
      target: 0,
      sponsorCount: 0,
      progress: null,
    });
  }
  buckets.set("unassigned", {
    id: "unassigned",
    name: "Not yet assigned to a series",
    short: "Unassigned",
    code: "—",
    eventCount: 0,
    actual: 0,
    collected: 0,
    target: 0,
    sponsorCount: 0,
    progress: null,
  });

  for (const e of events) {
    const bucket = buckets.get(e.series ?? "unassigned");
    if (!bucket) continue;
    bucket.eventCount++;
    bucket.actual += e.actual;
    bucket.collected += e.collected;
    bucket.target += e.target ?? 0;
    bucket.sponsorCount += e.sponsorCount;
  }
  for (const b of buckets.values()) {
    b.progress = b.target > 0 ? b.actual / b.target : null;
  }

  const targeted = events.filter((e) => e.target != null && e.target > 0);
  return {
    events,
    // Empty series are dropped from the roll-up; the catalogue still lists them.
    series: [...buckets.values()].filter((b) => b.eventCount > 0),
    totals: {
      actual: events.reduce((n, e) => n + e.actual, 0),
      collected: events.reduce((n, e) => n + e.collected, 0),
      target: events.reduce((n, e) => n + (e.target ?? 0), 0),
      eventCount: events.length,
      sponsorCount: events.reduce((n, e) => n + e.sponsorCount, 0),
      targeted: targeted.length,
      onTarget: targeted.filter((e) => (e.progress ?? 0) >= 1).length,
    },
    opsError: null,
  };
}

/** Who is sponsoring one event, and whether they've paid. */
export async function getEventSponsors(opsEventId: number): Promise<OpsSponsor[]> {
  const res = await listOpsEventSponsors(opsEventId);
  return res.ok ? res.data : [];
}
