// Named private funds from Form ADV Schedule D.
//
// Each GP → provider row in the Master Directory lists up to three of the
// funds that provider services ("17 fund(s) incl. A, B, C"). Put together
// across a manager's rows they name thousands of real vehicles, and for each
// one the auditor, administrator, custodian or prime broker the filing ties it
// to. Names arrive as filed, in capitals; they're shown in title case with the
// manager's own spelling, and nothing is read into a name that it doesn't
// literally say — a vehicle is only called a feeder, or Luxembourg-domiciled,
// when its legal name says so.
//
// Pure module: safe on the client and in the importer.

import type { ProviderRole } from "./providers";

export type FundProvider = { role: ProviderRole; key: string; brand: string };

export type VehicleKind =
  | "Continuation"
  | "Co-investment"
  | "Feeder"
  | "Master"
  | "Parallel"
  | "AIV"
  | "SPV"
  | "Employee";

export const VEHICLE_KINDS: VehicleKind[] = [
  "Continuation",
  "Co-investment",
  "Feeder",
  "Master",
  "Parallel",
  "AIV",
  "SPV",
  "Employee",
];

export const VEHICLE_LABEL: Record<VehicleKind, string> = {
  Continuation: "Continuation vehicle",
  "Co-investment": "Co-investment",
  Feeder: "Feeder",
  Master: "Master fund",
  Parallel: "Parallel fund",
  AIV: "Alternative investment vehicle",
  SPV: "SPV",
  Employee: "Employee / GP vehicle",
};

/** First marker wins, so "CO-INVEST FEEDER" is a co-investment vehicle. */
const KIND_RULES: [VehicleKind, RegExp][] = [
  ["Continuation", /\bCONTINUATION\b/],
  ["Co-investment", /\bCO-?\s?INVEST/],
  ["Feeder", /\bFEEDER\b/],
  ["Master", /\bMASTER\b/],
  ["Parallel", /\bPARALLEL\b/],
  ["AIV", /\bAIV\b/],
  ["SPV", /\bSPV\b/],
  ["Employee", /\b(EMPLOYEES?|EXECUTIVES?|FRIENDS\s+(AND|&)\s+FAMILY)\b/],
];

/** Only forms and words that fix a domicile on their own. */
const DOMICILE_RULES: [string, RegExp][] = [
  ["Luxembourg", /\b(S\.?\s?C\.?\s?SP|RAIF|LUXEMBOURG)\b|\(LUX\)/],
  ["Ireland", /\bICAV\b|\(IRELAND\)/],
  ["Cayman Islands", /\bCAYMAN\b/],
  ["Delaware", /\bDELAWARE\b/],
  ["Jersey", /\(JERSEY\)/],
  ["Guernsey", /\(GUERNSEY\)/],
];

const CURRENCY_RE = /\b(USD|EUR|GBP|JPY|CHF|CAD|AUD|SEK|NOK|DKK|SGD|HKD)\b|\b(EURO)\b/;

export function vehicleKind(filed: string): VehicleKind | null {
  const upper = filed.toUpperCase();
  for (const [kind, re] of KIND_RULES) if (re.test(upper)) return kind;
  return null;
}

export function fundDomicile(filed: string): string | null {
  const upper = filed.toUpperCase();
  for (const [place, re] of DOMICILE_RULES) if (re.test(upper)) return place;
  return null;
}

/** A currency class the name states ("… FUND 5 USD SCSP"). */
export function fundCurrency(filed: string): string | null {
  const m = filed.toUpperCase().match(CURRENCY_RE);
  if (!m) return null;
  return m[2] ? "EUR" : m[1];
}

/** Identity of a fund within its manager: spelling, spacing and "L.P." vs "LP"
 *  ignored, but "(B)" and "(I)" kept — they are different vehicles. */
export function fundKey(filed: string): string {
  return filed
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9()]+/g, " ")
    .replace(/\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .replace(/\bL P\b/g, "LP")
    .replace(/\bL L C\b/g, "LLC")
    .replace(/\bL L P\b/g, "LLP")
    .replace(/\bS C SP\b/g, "SCSP")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL-safe slug of the key, for external keys. */
export function fundSlug(filed: string): string {
  return fundKey(filed)
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

// --- Display names -------------------------------------------------------------

const ROMAN = /^(X{0,3})(IX|IV|V?I{0,3})$/;

/** Kept exactly as filed: legal forms, currencies, market shorthand. */
const UPPER = new Set([
  "LP", "LLP", "LLLP", "LLC", "GP", "PE", "VC", "SCS", "SCA", "SICAV", "SICAF", "RAIF", "SIF",
  "ICAV", "QIAIF", "UCITS", "AIF", "ELTIF", "LTAF", "FCP", "FCPR", "FPCI", "SLP", "SPC", "SPV",
  "AIV", "KG", "KGAA", "AG", "SA", "SE", "NV", "BV", "AB", "AS", "ASA", "SPA", "SRL", "PLC",
  "US", "USA", "UK", "EU", "HK", "NY", "APAC", "EMEA", "LATAM", "MENA", "CEE", "GCC", "ASEAN",
  "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "SEK", "NOK", "DKK", "SGD", "HKD",
  "LBO", "MBO", "SBIC", "CLO", "CDO", "ABS", "RMBS", "CMBS", "MLP", "REIT", "BDC", "ILS",
  "DST", "QOZ", "OZ", "ESG", "SDG", "EM", "NAV", "IPO", "SPAC", "SMA", "AI", "IT", "RE",
  "SARL", "SAS", "SCI", "OEIC", "ETF", "II", "III",
]);

/** Filed abbreviations with a conventional mixed-case spelling. */
const SPELLED: Record<string, string> = {
  SCSP: "SCSp",
  GMBH: "GmbH",
  LTD: "Ltd",
  INC: "Inc",
  CO: "Co",
  CORP: "Corp",
  MGMT: "Mgmt",
  INTL: "Intl",
  HLDGS: "Hldgs",
  PTNRS: "Ptnrs",
};

const LOWER = new Set(["of", "and", "the", "de", "des", "du", "la", "le", "di", "van", "von", "der", "for", "in", "on", "at", "y", "e"]);

const TWO_LETTER_WORDS = new Set([
  "of", "in", "on", "at", "to", "by", "an", "or", "de", "du", "la", "le", "di", "da", "el", "en",
  "et", "al", "go", "no", "so", "up", "we", "my", "me", "be", "do", "he", "is", "if", "am",
]);

/** Every word of the manager's own name, keyed by its capitals, so "17CAPITAL"
 *  comes back as "17Capital" and "HIG" stays "HIG". */
export function nameCasing(manager: string | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const w of (manager ?? "").match(/[A-Za-z0-9]+/g) ?? []) {
    if (w.length < 2 || LOWER.has(w.toLowerCase())) continue;
    // Only spellings that carry information beyond plain title case.
    const title = w[0].toUpperCase() + w.slice(1).toLowerCase();
    if (w !== title) map.set(w.toUpperCase(), w);
  }
  return map;
}

function caseWord(word: string, first: boolean, casing: Map<string, string>): string {
  const upper = word.toUpperCase();
  const own = casing.get(upper);
  if (own) return own;
  if (SPELLED[upper]) return SPELLED[upper];
  if (UPPER.has(upper) || ROMAN.test(upper)) return upper;
  if (word.length === 1) return upper;
  // "17CAPITAL" → "17Capital"; "3G", "2020" stay as filed.
  if (/\d/.test(word)) {
    const letters = word.replace(/\d/g, "");
    if (letters.length <= 3) return upper;
    return word.toLowerCase().replace(/^(\d+)([a-z])/, (_, d: string, c: string) => d + c.toUpperCase());
  }
  const lower = word.toLowerCase();
  if (!first && LOWER.has(lower)) return lower;
  // Short all-consonant tokens are initialisms ("KKR", "TPG", "HPS"), and so
  // is any two-letter token that isn't a word ("QP", "MA").
  if (word.length <= 4 && !/[AEIOUY]/i.test(word)) return upper;
  if (word.length === 2 && !TWO_LETTER_WORDS.has(lower)) return upper;
  return lower[0].toUpperCase() + lower.slice(1);
}

/** "17CAPITAL CO-INVEST (B) SCSP" → "17Capital Co-Invest (B) SCSp". */
export function fundDisplayName(filed: string, casing: Map<string, string> = new Map()): string {
  const clean = filed.replace(/\s+/g, " ").trim();
  if (!clean) return clean;
  // Already mixed case: someone typed it that way on purpose.
  if (clean !== clean.toUpperCase()) return clean;
  let seen = false;
  return clean.replace(/[A-Za-z0-9]+/g, (word: string, at: number) => {
    // The "s" after an apostrophe is a possessive, not an initial.
    const out = word === "S" && clean[at - 1] === "'" ? "s" : caseWord(word, !seen, casing);
    seen = true;
    return out;
  });
}
