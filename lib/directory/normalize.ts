// Shared normalisers for directory data: names, numbers, dates, and the
// controlled vocabularies the filters facet on.
//
// Pure module: no imports beyond siblings, safe on the client.

/** Loose firm-name key: case, punctuation, legal forms and "the" ignored.
 *  "The Riverside Company" and "Riverside Company, LLC" share a key. */
export function normName(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(and\s+co|and\s+company)\s*$/g, " ")
    .replace(
      /\b(the|llc|l l c|lp|l p|llp|l l p|ltd|limited|inc|incorporated|plc|sa|s a|ag|gmbh|corp|corporation|co|company|sarl|bv|nv|se|pte|pty)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** "www.Example.com/about" / "https://example.com" → "example.com". */
export function normDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  if (!v || !/[a-z0-9-]+\.[a-z]{2,}/.test(v)) return null;
  const host = v
    .replace(/^[a-z]+:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#\s]/)[0];
  return host || null;
}

export function toUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(v)) return `https://${v}`;
  return null;
}

/** Cell → trimmed string or null. Numbers keep their full precision. */
export function str(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s || s.toLowerCase() === "nan" || s === "-" || s === "—") return null;
  return s;
}

/** Cell → number or null. Accepts "1,234", "$4.2T+", "12.7%". */
export function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = str(value);
  if (!s) return null;
  const cleaned = s.replace(/[$,%+\s]/g, "");
  const m = cleaned.match(/^-?\d+(\.\d+)?(e[+-]?\d+)?/i);
  if (!m) return null;
  let n = Number(m[0]);
  const suffix = cleaned.slice(m[0].length).toUpperCase();
  if (suffix.startsWith("T")) n *= 1e12;
  else if (suffix.startsWith("B")) n *= 1e9;
  else if (suffix.startsWith("M")) n *= 1e6;
  else if (suffix.startsWith("K")) n *= 1e3;
  return Number.isFinite(n) ? n : null;
}

export function int(value: unknown): number | null {
  const n = num(value);
  return n == null ? null : Math.round(n);
}

export function bool(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const s = str(value)?.toLowerCase();
  if (!s) return null;
  if (["true", "yes", "y", "1"].includes(s)) return true;
  if (["false", "no", "n", "0"].includes(s)) return false;
  return null;
}

/** "03/31/2026" (ADV) or "2026-09-28" → "2026-03-31". Anything else → null. */
export function isoDate(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

/** A plausible founding year, or null. */
export function year(value: unknown): number | null {
  const n = int(value);
  if (n == null || n < 1600 || n > 2100) return null;
  return n;
}

/** "Owen James" → first/last. Credentials after a comma are dropped. */
export function splitName(full: string): { first: string | null; last: string | null } {
  const clean = full
    .replace(/,.*$/, "")
    .replace(/\s+/g, " ")
    .replace(/^(mr|mrs|ms|dr|prof)\.?\s+/i, "")
    .trim();
  if (!clean) return { first: null, last: null };
  const parts = clean.split(" ");
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

// --- Controlled vocabularies -------------------------------------------------
// One label per facet value, so a filter never has to know how a row was typed.

const GP_TYPES: [RegExp, string][] = [
  [/corporate venture/i, "Venture capital"],
  [/venture/i, "Venture capital"],
  [/growth/i, "Growth equity"],
  [/credit|lending|debt/i, "Private credit"],
  [/real estate|property/i, "Real estate"],
  [/infrastructure/i, "Infrastructure"],
  [/fund of funds|secondar/i, "Fund of funds & secondaries"],
  [/hedge|multi-strategy/i, "Hedge fund"],
  [/multi-asset/i, "Multi-asset alternatives"],
  [/asset manager|traditional/i, "Asset manager"],
  [/\bbank\b/i, "Bank"],
  [/family office/i, "Family office"],
  [/development finance/i, "Development finance"],
  [/private equity|buyout/i, "Private equity"],
  [/^other$/i, "Other"],
];

const LP_TYPES: [RegExp, string][] = [
  [/sovereign/i, "Sovereign wealth fund"],
  [/corporate pension/i, "Corporate pension fund"],
  [/public pension|pension/i, "Public pension fund"],
  [/insur/i, "Insurance company"],
  [/consult|cosultant/i, "Investment consultant"],
  [/multi[\s-]*family|\bmfo\b/i, "Multi-family office"],
  [/family/i, "Family office"],
  [/foundation/i, "Foundation"],
  [/endowment/i, "Endowment"],
  [/development finance|\bdfi\b/i, "Development finance institution"],
  [/government/i, "Government agency"],
  [/fund of funds|\bfof\b/i, "Fund of funds"],
  [/asset manager/i, "Asset manager"],
  [/\bbank\b/i, "Bank"],
  [/^other$|institutional investor/i, "Other"],
];

const SP_TYPES: [RegExp, string][] = [
  [/fund services|fund admin/i, "Fund administrator"],
  [/technology|software|data|\bit\b|saas|computer|internet|information/i, "Technology vendor"],
  [/accounting|audit|tax/i, "Audit & advisory"],
  [/valuation|rating|credit intelligence/i, "Valuation & ratings"],
  [/research|analytics/i, "Research & analytics"],
  [/fx|treasury|payments|foreign exchange/i, "FX & treasury"],
  [/legal|law/i, "Law firm"],
  [/bank/i, "Bank"],
  [/placement|distribution|capital introduction/i, "Placement agent"],
  [/staffing|recruit|executive search|hr services|human resources|talent/i, "Talent & search"],
  [/association|non-profit|nonprofit|membership|civic/i, "Industry body"],
  [/consult|advisory|management consulting|business services/i, "Consulting"],
];

function pick(table: [RegExp, string][], value: string | null | undefined): string | null {
  if (!value) return null;
  for (const [re, label] of table) if (re.test(value)) return label;
  return null;
}

export function gpType(vertical: string | null | undefined): string | null {
  return pick(GP_TYPES, vertical);
}

export function lpType(investorType: string | null | undefined, vertical?: string | null): string | null {
  return pick(LP_TYPES, investorType) ?? pick(LP_TYPES, vertical);
}

/** SP type from the sheet's own category, else from the Lusha industry. */
export function spType(category: string | null | undefined, industry?: string | null): string | null {
  const c = category && category.trim().toUpperCase() !== "SP" ? category : null;
  return pick(SP_TYPES, c) ?? pick(SP_TYPES, industry);
}

/** "17 fund(s) incl. A, B, C" → { count: 17, names: [A, B, C] }. */
/** A comma-separated piece that finishes the fund before it ("3G FUND VI, L.P.")
 *  rather than naming a fund of its own. */
const FUND_NAME_TAIL =
  /^(L\.?\s?P\.?|L\.?\s?L\.?\s?L?\.?\s?[CP]\.?|LTD\.?|LIMITED|INC\.?|CORP\.?|CO\.?|PLC|SPC|S\.?\s?C\.?\s?S\.?\s?P?\.?|S\.?\s?C\.?\s?A\.?|S\.?\s?A\.?|S\.?\s?[AÀ]\.?\s?R\.?\s?L\.?|SLP|GMBH\b.*|KG|AG|N\.?\s?V\.?|B\.?\s?V\.?|SICA[VF]\b.*|RAIF|FCPR?\b.*|A\s+(SERIES|SUB-FUND|COMPARTMENT)\s+OF\b.*|SERIES\s+[A-Z0-9-]+)$/i;

export function parseFundSummary(value: unknown): { count: number; names: string[] } {
  const s = str(value);
  if (!s) return { count: 0, names: [] };
  const m = s.match(/^(\d+)\s+fund\(s\)\s*(?:incl\.?\s*(.*))?$/i);
  if (!m) return { count: 1, names: [s] };
  const names: string[] = [];
  for (const piece of (m[2] ?? "").split(/,\s+(?=[A-Z0-9])/)) {
    const part = piece.replace(/\s+/g, " ").trim();
    if (!part) continue;
    if (names.length && FUND_NAME_TAIL.test(part)) names[names.length - 1] += `, ${part}`;
    else names.push(part);
  }
  return { count: Number(m[1]) || names.length, names };
}

/** First four-digit year in free text ("Q3 FY2025", "signed 2025-06-16"). */
export function yearIn(value: unknown): number | null {
  const s = str(value);
  if (!s) return null;
  const m = s.match(/(?<!\d)(19|20)\d{2}(?!\d)/);
  return m ? Number(m[0]) : null;
}

/** An ISO date when free text holds a full one ("2025-01-14"), else null. */
export function dateIn(value: unknown): string | null {
  const s = str(value);
  if (!s) return null;
  const m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "up to 40,000,000" → 40000000; "150,000,000 (C$135m equiv)" → 150000000. */
export function amountIn(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = str(value);
  if (!s) return null;
  const m = s.replace(/^up to\s+/i, "").match(/\d[\d,]*(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type SourceLink = { label: string; url: string | null };

/** "a.com (note) ; b.org/x" → [{label, url}] for provenance display. */
export function parseSources(value: unknown): SourceLink[] {
  const s = str(value);
  if (!s) return [];
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  for (const part of s.split(/\s*;\s*|\s+\|\s+/)) {
    const label = part.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    const head = label.split(/\s+\(|\s+/)[0];
    out.push({ label, url: toUrl(head) });
  }
  return out;
}
