/**
 * Shapes and formatters for ops-panel (TrackerLPGP) payloads.
 *
 * Deliberately free of `server-only` so client components can render a match
 * notice without pulling the bridge transport into the browser bundle.
 * The fetching lives in `lib/ops.ts`, which re-exports everything here.
 */

/** How much of an event's date is still to be confirmed (see lib/event-date.ts). */
export type DateTbc = "" | "day" | "date";

export type OpsEventAllocation = {
  event_id: number;
  event_name: string;
  event_date: string | null;
  location: string;
  producer: string;
  date_tbc: DateTbc;
  allocated_amount: number;
  package_label: string;
};

export type OpsDeal = {
  id: number;
  title: string;
  company: string;
  contact_name: string;
  amount: number;
  currency: string;
  stage: string;
  cancelled: boolean;
  flagged: boolean;
  paid_inc_vat: number | null;
  tax_vat: number | null;
  invoice_number: string;
  invoice_date: string | null;
  paid_date: string | null;
  bank: string;
  initials: string;
  fiscal_year: number | null;
  deal_month: string;
  invoice_agreement_sent: boolean;
  signature_received: boolean;
  agreement_status: AgreementStatus;
  /** File names only — the files themselves live in the tracker. */
  agreement_file: string;
  signed_file: string;
  notes: string;
  created_at: string;
  events: OpsEventAllocation[];
};

/**
 * Where a deal stands on paperwork, as derived by the tracker.
 *   need_invoice        nothing on file — someone owes the client a document
 *   awaiting_signature  sent, waiting on the countersigned copy
 *   signed              signature received
 */
export type AgreementStatus = "need_invoice" | "awaiting_signature" | "signed";

export const AGREEMENT_LABEL: Record<AgreementStatus, string> = {
  need_invoice: "Need to send invoice",
  awaiting_signature: "Awaiting signature",
  signed: "Signed",
};

export type OpsCurrencyTotal = {
  currency: string;
  contracted: number;
  paid: number;
  vat: number;
};

export type OpsCompanyEvent = {
  event_id: number;
  event_name: string;
  event_date: string | null;
  location: string;
  producer: string;
  date_tbc: DateTbc;
  allocated_amount: number;
  package_labels: string[];
  deal_ids: number[];
  currency: string;
};

export type OpsCompany = {
  company: string;
  normalized: string;
  deal_count: number;
  cancelled_count: number;
  event_count: number;
  totals: OpsCurrencyTotal[];
  has_payment: boolean;
  events: OpsCompanyEvent[];
  deals: OpsDeal[];
};

export type OpsMatch = OpsCompany & { confidence: number; exact: boolean };

/**
 * The /companies?slim=1 payload: the event rollup without the full deal
 * bodies. Enough to reconcile a bulk import, small enough to fetch in one go.
 */
export type OpsCompanySlim = Omit<OpsCompany, "deals" | "cancelled_count" | "events"> & {
  events: Pick<
    OpsCompanyEvent,
    | "event_id"
    | "event_name"
    | "event_date"
    | "producer"
    | "date_tbc"
    | "allocated_amount"
    | "currency"
    | "deal_ids"
  >[];
};

export type OpsMatchResponse = {
  query: string;
  normalized: string;
  match_count: number;
  best: OpsMatch | null;
  matches: OpsMatch[];
};

export type OpsEvent = {
  id: number;
  name: string;
  event_date: string | null;
  location: string;
  notes: string;
  /** Producer team, from the tracker's programme. "" when unassigned. */
  producer: string;
  date_tbc: DateTbc;
  programme_year: number | null;
  /** `2027:ops-miami` when linked to the canonical programme, else null. */
  programme_key: string | null;
  deal_count: number;
  allocated_total: number;
  allocated_paid: number;
};

export type OpsSponsor = {
  deal_id: number;
  company: string;
  contact_name: string;
  currency: string;
  stage: string;
  allocated_amount: number;
  package_label: string;
  paid: boolean;
  paid_inc_vat: number | null;
  /** Initials of the salesperson who signed it, as typed in the tracker. */
  initials: string;
};

export type OpsPing = {
  ok: true;
  service: string;
  version: number;
  counts: { deals: number; events: number; allocations: number };
};

export type OpsFailure = "not_configured" | "unauthorized" | "unreachable" | "bad_response";

export type OpsResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: OpsFailure; error: string };

/** Condensed ops context for a CRM record — what a list row or call card shows. */
export type OpsLeadSummary = {
  company: string;
  events: { event_id: number; event_name: string; allocated: number; currency: string }[];
  paid: boolean;
};

/**
 * Minimum match confidence before the CRM will state a company has *signed*
 * for an event. Below this it's shown as a possible match, never as fact.
 */
export const OPS_SIGNED_CONFIDENCE = 0.88;

// --- Name normalisation -----------------------------------------------------
// Mirrors the tiered matcher in TrackerLPGP's bridge.js. Used here only for
// EXACT key comparison during bulk imports — scoring stays server-side in the
// bridge so there is one source of truth for fuzzy matching.

const LEGAL_SUFFIXES = new Set([
  "ltd", "limited", "llc", "llp", "lp", "inc", "incorporated", "corp",
  "corporation", "co", "plc", "gmbh", "ag", "sa", "sas", "nv", "bv", "ab",
  "as", "oy", "spa", "srl", "pte", "pty", "kk", "kg", "mbh", "sarl", "aps",
]);

export function normalizeCompanyName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalised name with trailing legal-entity words removed ("Barings LLC" → "barings"). */
export function opsMatchKey(raw: string): string {
  const tokens = normalizeCompanyName(raw).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

// --- Presentation -----------------------------------------------------------

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  CHF: "CHF ",
  AED: "AED ",
  PHP: "₱",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

export function formatOpsMoney(amount: number | null | undefined, currency = "GBP"): string {
  if (amount == null) return "—";
  const symbol = currencySymbol(currency);
  // Whole pounds read better than £4,000.00 on a summary line.
  const rounded = Math.abs(amount) >= 1000 ? Math.round(amount) : amount;
  return `${symbol}${rounded.toLocaleString("en-GB", {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Berlin and CFO Miami" / "Berlin, Zurich and CFO Miami" */
export function listEventNames(names: string[]): string {
  if (names.length === 0) return "no events yet";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "£4,000 across Berlin and CFO Miami" — the one-liner for the match notice. */
export function describeOpsMatch(match: OpsCompany): string {
  const total = match.totals[0];
  const money = total ? formatOpsMoney(total.contracted, total.currency) : null;
  const events = listEventNames(match.events.map((e) => e.event_name));
  return money ? `${money} across ${events}` : events;
}

/** Sum of every currency total's paid figure, per currency — never cross-summed. */
export function opsPaidTotals(match: OpsCompany): OpsCurrencyTotal[] {
  return match.totals.filter((t) => t.paid > 0);
}
