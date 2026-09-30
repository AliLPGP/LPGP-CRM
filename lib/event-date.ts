/**
 * How an ops-panel event's date is shown.
 *
 * The tracker stores a month whose day is still TBC as the 1st of that month
 * with `date_tbc: "day"`, and an event with no month at all as `null` with
 * `date_tbc: "date"`. Printing the raw value would present a made-up 1st as
 * a confirmed day, so every place a date is rendered goes through here.
 *
 *   "25 Feb 2027"          exact day
 *   "Sep 2027 · day TBC"   month known, day not
 *   "2027 · date TBC"      programme year only
 *   "Date TBC"             nothing at all
 *
 * Pure and free of `server-only`, so client components can use it.
 */

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type EventDateFields = {
  event_date: string | null | undefined;
  /** '' | 'day' | 'date'. Missing (an old snapshot) reads as confirmed. */
  date_tbc?: string | null;
  programme_year?: number | null;
};

/** Split a YYYY-MM-DD string without going through Date (no timezone drift). */
function parts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function formatEventDate(
  ev: EventDateFields,
  opts: { long?: boolean } = {},
): string {
  const names = opts.long ? MONTHS_LONG : MONTHS_SHORT;
  const tbc = ev.date_tbc ?? "";
  const p = ev.event_date ? parts(ev.event_date) : null;

  if (!p || tbc === "date") {
    const year = p?.y ?? ev.programme_year;
    return year ? `${year} · date TBC` : "Date TBC";
  }
  const month = names[p.m - 1] ?? "";
  if (tbc === "day") return `${month} ${p.y} · day TBC`;
  return `${p.d} ${month} ${p.y}`;
}

/** True when the date carries some uncertainty — for a muted or flagged render. */
export function isEventDateTbc(ev: EventDateFields): boolean {
  return !ev.event_date || (ev.date_tbc ?? "") !== "";
}
