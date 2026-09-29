/**
 * The LPGP Connect 2027 programme — 5 series, 25 events.
 *
 * Transcribed from the confirmed producer allocation ("Events by Producer",
 * 28 September 2026), the same list the tracker holds in `programme-2027.js`.
 * This is the confirmed programme, not the brochure: names, producers and
 * dates are the ones a deal is actually allocated against. Pure data, so both
 * the Event Performance page and the server can use it.
 *
 * The ops panel is still the source of truth for which events actually exist
 * and what they've earned; this catalogue supplies the canonical names and the
 * series ("portfolio") each event belongs to.
 *
 * Dates: an exact day is stored as given. A month with the day still TBC is
 * stored as the 1st of that month with `tbc: "day"`; no month at all is
 * `date: null` with `tbc: "date"`. Never render the 1st of a TBC month as if
 * it were a confirmed day — `lib/event-date.ts` handles that.
 */

export type SeriesId =
  | "private-debt"
  | "cfo-coo"
  | "operational-fund"
  | "operating-partners"
  | "data-tech";

/**
 * Ids earlier versions stored. The three CFO/COO conferences (Private Markets,
 * Private Equity, Private Debt) are one portfolio, so all of them fold into
 * `cfo-coo`; a stored choice of any of them still reads as that portfolio.
 */
export const LEGACY_SERIES: Record<string, SeriesId> = {
  "cfo-private-markets": "cfo-coo",
  "cfo-pe-debt": "cfo-coo",
  "cfo-pe": "cfo-coo",
};

export type Series = {
  id: SeriesId;
  /** Programme number as printed in the brochure. */
  code: string;
  name: string;
  short: string;
  /** Events in the confirmed 2027 programme. */
  eventCount: number;
};

// The order here is the display order in every chart, and it is the one order
// in which each neighbouring pair of series hues stays apart under red-green
// colour blindness (checked with the dataviz palette validator on both card
// surfaces). Every series keeps the hue it always had.
export const SERIES: Series[] = [
  { id: "private-debt", code: "01", name: "Private Debt Fundraising Series", short: "Private Debt", eventCount: 6 },
  { id: "cfo-coo", code: "02", name: "CFO / COO Series", short: "CFO / COO", eventCount: 9 },
  { id: "operational-fund", code: "03", name: "Operational Fund Summit Series", short: "Operational Fund", eventCount: 1 },
  { id: "operating-partners", code: "04", name: "Operating Partners Conference Series", short: "Operating Partners", eventCount: 5 },
  { id: "data-tech", code: "05", name: "Data & Technology Forum Series", short: "Data & Technology", eventCount: 4 },
];

export const SERIES_MAP: Record<string, Series> = Object.fromEntries(
  SERIES.map((s) => [s.id, s]),
);

/** A stored or received series id, folded onto the current five; null if unknown. */
export function normaliseSeriesId(v: unknown): SeriesId | null {
  if (typeof v !== "string" || !v) return null;
  if (SERIES.some((s) => s.id === v)) return v as SeriesId;
  return LEGACY_SERIES[v] ?? null;
}

/** The five producer teams, in the order the allocation lists them. */
export const PRODUCERS = ["Gio & Karam", "Tara & Maryam", "Fidak", "Santos", "Arj & Leena"] as const;
export type Producer = (typeof PRODUCERS)[number];

/** How much of an event's date is still to be confirmed. */
export type DateTbc = "" | "day" | "date";

export type CatalogueEvent = {
  series: SeriesId;
  name: string;
  location: string;
  /** "February 2027", or "2027" when not even the month is set. */
  month: string;
  /** Month index (1–12) for ordering; 0 when the month itself is TBC. */
  monthIndex: number;
  producer: Producer;
  /** Stable key shared with the tracker (`portfolio_events.programme_key` is `2027:<key>`). */
  key: string;
  /** YYYY-MM-DD, or null when no month is set. */
  date: string | null;
  tbc: DateTbc;
};

export const CATALOGUE_2027: CatalogueEvent[] = [
  // Gio & Karam — 6
  { series: "operating-partners", name: "2nd Annual Operating Partners Miami", location: "Miami, USA", month: "February 2027", monthIndex: 2, producer: "Gio & Karam", key: "ops-miami", date: "2027-02-25", tbc: "" },
  { series: "data-tech", name: "3rd Annual AI, Data & Technology in Private Markets New York", location: "New York, USA", month: "May 2027", monthIndex: 5, producer: "Gio & Karam", key: "dt-new-york", date: "2027-05-20", tbc: "" },
  { series: "operating-partners", name: "3rd Annual Operating Partners West Coast - Los Angeles", location: "Los Angeles, USA", month: "September 2027", monthIndex: 9, producer: "Gio & Karam", key: "ops-west-coast", date: "2027-09-01", tbc: "day" },
  { series: "data-tech", name: "3rd Annual AI, Data & Technology in Private Markets London", location: "London, UK", month: "October 2027", monthIndex: 10, producer: "Gio & Karam", key: "dt-london", date: "2027-10-06", tbc: "" },
  { series: "private-debt", name: "2nd Annual Sports Investing Forum London", location: "London, UK", month: "2027", monthIndex: 0, producer: "Gio & Karam", key: "sports-london", date: null, tbc: "date" },
  { series: "private-debt", name: "Sports Investing Forum New York", location: "New York, USA", month: "2027", monthIndex: 0, producer: "Gio & Karam", key: "sports-new-york", date: null, tbc: "date" },

  // Tara & Maryam — 5
  { series: "data-tech", name: "AI, Data & Technology in Private Markets Europe - Amsterdam", location: "Amsterdam, Netherlands", month: "April 2027", monthIndex: 4, producer: "Tara & Maryam", key: "dt-europe", date: "2027-04-15", tbc: "" },
  { series: "operating-partners", name: "3rd Annual Operating Partners New York", location: "New York, USA", month: "May 2027", monthIndex: 5, producer: "Tara & Maryam", key: "ops-new-york", date: "2027-05-19", tbc: "" },
  { series: "data-tech", name: "AI, Data & Technology in Private Markets West Coast - San Francisco", location: "San Francisco, USA", month: "June 2027", monthIndex: 6, producer: "Tara & Maryam", key: "dt-west-coast", date: "2027-06-24", tbc: "" },
  { series: "operating-partners", name: "Operating Partners Europe - London", location: "London, UK", month: "October 2027", monthIndex: 10, producer: "Tara & Maryam", key: "ops-europe", date: "2027-10-06", tbc: "" },
  { series: "operating-partners", name: "Operating Partners Retreat", location: "", month: "November 2027", monthIndex: 11, producer: "Tara & Maryam", key: "ops-retreat", date: "2027-11-01", tbc: "day" },

  // Fidak — 5
  { series: "cfo-coo", name: "4th Annual CFO/COO Private Markets Miami", location: "Miami, USA", month: "May 2027", monthIndex: 5, producer: "Fidak", key: "cfo-pm-miami", date: "2027-05-01", tbc: "day" },
  { series: "cfo-coo", name: "9th Annual CFO/COO Private Debt London", location: "London, UK", month: "July 2027", monthIndex: 7, producer: "Fidak", key: "cfo-pd-london", date: "2027-07-01", tbc: "day" },
  { series: "cfo-coo", name: "4th Annual CFO/COO Private Markets Los Angeles", location: "Los Angeles, USA", month: "October 2027", monthIndex: 10, producer: "Fidak", key: "cfo-pm-los-angeles", date: "2027-10-01", tbc: "day" },
  { series: "cfo-coo", name: "9th Annual CFO/COO Private Markets Chicago", location: "Chicago, USA", month: "October 2027", monthIndex: 10, producer: "Fidak", key: "cfo-pm-chicago", date: "2027-10-01", tbc: "day" },
  { series: "cfo-coo", name: "8th Annual CFO/COO Private Debt New York", location: "New York, USA", month: "November 2027", monthIndex: 11, producer: "Fidak", key: "cfo-pd-new-york", date: "2027-11-01", tbc: "day" },

  // Santos — 5
  { series: "cfo-coo", name: "4th Annual CFO/COO Private Markets Switzerland", location: "Switzerland", month: "March 2027", monthIndex: 3, producer: "Santos", key: "cfo-pm-switzerland", date: "2027-03-18", tbc: "" },
  { series: "cfo-coo", name: "5th Annual CFO/COO Private Markets San Francisco", location: "San Francisco, USA", month: "June 2027", monthIndex: 6, producer: "Santos", key: "cfo-pm-san-francisco", date: "2027-06-01", tbc: "day" },
  { series: "cfo-coo", name: "9th Annual CFO/COO Private Equity London", location: "London, UK", month: "July 2027", monthIndex: 7, producer: "Santos", key: "cfo-pe-london", date: "2027-07-01", tbc: "day" },
  { series: "cfo-coo", name: "8th Annual CFO/COO Private Equity New York", location: "New York, USA", month: "November 2027", monthIndex: 11, producer: "Santos", key: "cfo-pe-new-york", date: "2027-11-01", tbc: "day" },
  { series: "operational-fund", name: "Operational Fund Summit Luxembourg", location: "Luxembourg", month: "November 2027", monthIndex: 11, producer: "Santos", key: "ofs-luxembourg", date: "2027-11-01", tbc: "day" },

  // Arj & Leena — 4
  { series: "private-debt", name: "11th Annual Private Debt Berlin", location: "Berlin, Germany", month: "March 2027", monthIndex: 3, producer: "Arj & Leena", key: "pd-berlin", date: "2027-03-18", tbc: "" },
  { series: "private-debt", name: "13th Annual Private Debt New York", location: "New York, USA", month: "April 2027", monthIndex: 4, producer: "Arj & Leena", key: "pd-new-york", date: "2027-04-01", tbc: "day" },
  { series: "private-debt", name: "13th Annual Private Debt London", location: "London, UK", month: "September 2027", monthIndex: 9, producer: "Arj & Leena", key: "pd-london", date: "2027-09-01", tbc: "day" },
  { series: "private-debt", name: "12th Annual Private Debt Chicago", location: "Chicago, USA", month: "October 2027", monthIndex: 10, producer: "Arj & Leena", key: "pd-chicago", date: "2027-10-01", tbc: "day" },
];

// --- Classifying an ops-panel event ----------------------------------------

export type SeriesGuess = { series: SeriesId; confidence: "certain" | "likely" } | null;

/**
 * Best guess at which series an ops-panel event belongs to.
 *
 * Runs on the event's name, which in the tracker is often shorthand
 * ("PD/CFO LA", "Ops NYC", "Lux"). Rules are ordered most-specific first —
 * first match wins — and only report "certain" when the name states the
 * series outright. The same rules, in the same order, live in the tracker so
 * both apps file an event under the same series. A guess is a suggestion —
 * the Event Performance page lets someone override it, and that choice is
 * what's stored.
 */
export function guessSeries(eventName: string): SeriesGuess {
  const n = eventName.toLowerCase();

  // 1–6: stated outright
  if (n.includes("operational fund")) return { series: "operational-fund", confidence: "certain" };
  if (n.includes("operating partners")) return { series: "operating-partners", confidence: "certain" };
  if (n.includes("data") && (n.includes("tech") || n.includes("ai"))) {
    return { series: "data-tech", confidence: "certain" };
  }
  // Every CFO/COO conference is the one CFO/COO portfolio. This runs before
  // the bare "private debt" rule, or "CFO/COO Private Debt London" would be
  // filed as a fundraising event.
  if (/\bcfo\b/.test(n) || /\bcoo\b/.test(n)) return { series: "cfo-coo", confidence: "certain" };
  if (n.includes("private debt") || n.includes("sports investing")) {
    return { series: "private-debt", confidence: "certain" };
  }

  // 7: tracker shorthand
  if (/\bops\b/.test(n)) return { series: "operating-partners", confidence: "likely" };
  if (/\bdata\s*tech\b/.test(n)) return { series: "data-tech", confidence: "likely" };
  if (/\bpd\b/.test(n) || n.includes("fundraising") || n.includes("sports")) {
    return { series: "private-debt", confidence: "likely" };
  }

  // 8: cities that host exactly one 2027 event, so the city alone is enough.
  // Chicago, London, New York, Miami and San Francisco each host several —
  // never guessed from the city.
  if (n.includes("berlin")) return { series: "private-debt", confidence: "likely" };
  if (n.includes("lux")) return { series: "operational-fund", confidence: "likely" };
  if (n.includes("switzerland") || n.includes("zurich")) {
    return { series: "cfo-coo", confidence: "likely" };
  }

  return null;
}

/** Series display colour, used consistently across charts and badges. */
export const SERIES_COLOR: Record<SeriesId, string> = {
  "private-debt": "var(--chart-1)",
  "cfo-coo": "var(--chart-2)",
  "operational-fund": "var(--chart-7)",
  "operating-partners": "var(--chart-5)",
  "data-tech": "var(--chart-6)",
};
