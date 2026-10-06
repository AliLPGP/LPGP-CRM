// Fund names, folded so two filings of one fund read as one, and matched
// against the fund a sponsor's portfolio page names. Pure: used by server
// pages and the components that draw funds.
//
// A sponsor's portfolio page names the fund behind a holding in its own words
// ("Nordic Capital Evolution I", "PAI Europe VI", sometimes only a programme:
// "Foundation", "TPG Growth"); the filings name the vehicles ("PAI Europe
// VI-1 FPCI", "Vista Foundation Fund IV, L.P."). A holding joins a fund only
// when the two names say the same thing once legal forms and parallel-vehicle
// suffixes are set aside. A programme name with no fund number joins every
// numbered fund of that programme as a programme match, and the page says so:
// the sponsor did not say which of them made the investment.

const LEGAL = /\b(l\.?\s?p|lp|llc|ltd|limited|inc|scsp|scs|sca|sicav|raif|fpci|slp|sca sicar|sicar|scaf|gp|plc|s\.?a\.?r\.?l|sarl|s\.?a|ag|gmbh|bv|nv|ab|kg|co|company|the|fund|funds|fonds|holdings?|partnership)\b/g;
/** A parallel or feeder vehicle's tag after the fund's number: VI-1, VII-A, VIII-B, IV-Z, "Parallel", "Feeder". */
const PARALLEL = /(\b(?:[ivxlc]+|\d+))[-\s](?:\d{1,2}|[a-z])\b(?=\s*$)/;
const VEHICLE = /\b(parallel|feeder|aiv|co-?invest(?:ment)?|executive|employee|affiliates?|offshore|onshore|cayman|delaware|usd|eur|gbp|\(usd\)|\(eur\))\b/g;
const NUMBERED = /\b([ivxlc]+|\d+)$/;

/** A fund name folded for comparison: accents, legal forms, punctuation and a parallel-vehicle tag gone. */
export function fundKey(name: string): string {
  let s = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(formerly[^)]*\)/g, " ")
    // A parallel vehicle's bracketed tag: "(A)", "(B)", "(A-Delaware)", "(Executive)".
    .replace(/\((?:[a-z]|[a-z]-[a-z]+|executive|employees?)\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[.,'’]/g, (m) => (m === "." ? "" : " "));
  s = s.replace(LEGAL, " ").replace(VEHICLE, " ").replace(/[^a-z0-9-]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(PARALLEL, "$1").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** The sponsor's fund field can name several funds ("The Rise Funds; TPG Rise Climate"). */
function statedFunds(fundName: string): string[] {
  return fundName
    .split(/[;,]|\s\/\s|\band\b(?=\s+[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The stated name, and the same with the sponsor's name before it ("Fund VIII" is Nordic Capital's "Nordic Capital Fund VIII"; "Foundation" is Vista's "Vista Foundation"). */
function withSponsor(stated: string, sponsor: string | null): string[] {
  const k = fundKey(stated);
  if (!sponsor) return [k];
  const full = fundKey(sponsor);
  const first = full.split(" ")[0];
  return [...new Set([k, ...[first, full].filter((p) => p && !k.startsWith(`${p} `)).map((p) => `${p} ${k}`)])];
}

export type FundMatch = "fund" | "programme";

/**
 * How a holding's stated fund names a fund on file: "fund" when the names
 * agree, "programme" when the holding names only the programme a numbered
 * fund belongs to, else null.
 */
export function matchFund(stated: string | null | undefined, fund: { name: string; name_filed?: string | null }, sponsor: string | null): FundMatch | null {
  if (!stated) return null;
  const keys = [fund.name, fund.name_filed].filter((x): x is string => Boolean(x)).map(fundKey);
  // The sponsor's full name shortened to its first word: "CVC Capital Partners VI" is also "CVC VI".
  const full = sponsor ? fundKey(sponsor) : "";
  const first = full.split(" ")[0];
  if (full.includes(" ")) for (const k of [...keys]) if (k.startsWith(`${full} `)) keys.push(`${first} ${k.slice(full.length + 1)}`);
  let best: FundMatch | null = null;
  for (const part of statedFunds(stated)) {
    for (const k of withSponsor(part, sponsor)) {
      if (k.length < 3) continue;
      if (keys.includes(k)) return "fund";
      // A programme: no fund number of its own, and a fund's name is exactly the programme and a number.
      if (!NUMBERED.test(k) && k.length >= 4 && keys.some((f) => f.startsWith(`${k} `) && /^(?:[ivxlc]+|\d+)$/.test(f.slice(k.length + 1)))) best = "programme";
    }
  }
  return best;
}

/** Where a fund is, as its filing states it: still raising or investing, closed to new investors, or not stated. */
export type FundStage = "active" | "closed" | null;

export function fundStage(status: string | null | undefined): FundStage {
  const s = (status ?? "").toLowerCase();
  if (/^(raising|fundraising|open|investing|first close|launched)/.test(s)) return "active";
  if (/^(closed|final close|fully invested|harvesting|liquidat|realised|realized)/.test(s)) return "closed";
  return null;
}

export const FUND_STAGE_LABEL: Record<"active" | "closed", string> = { active: "Active", closed: "Closed" };

/** One fund however many times it was filed: the lead vehicle (the one with the most on file) and the rest. */
export type FundFamily<T> = { key: string; lead: T; vehicles: T[] };

/** Fold a manager's fund rows into one per fund. `score` ranks which vehicle leads (the one investors report on, say). */
export function foldFunds<T extends { id: string; name: string; name_filed?: string | null }>(funds: T[], score: (f: T) => number = () => 0): FundFamily<T>[] {
  const by = new Map<string, T[]>();
  for (const f of funds) {
    const k = fundKey(f.name) || f.id;
    by.set(k, [...(by.get(k) ?? []), f]);
  }
  return [...by.entries()].map(([key, vs]) => {
    const sorted = [...vs].sort((a, b) => score(b) - score(a) || a.name.length - b.name.length);
    return { key, lead: sorted[0], vehicles: sorted };
  });
}

/** A fund as a card draws it: one per fund family, with what its investors report and the companies it holds. */
export type FundCard = {
  id: string;
  name: string;
  name_filed?: string | null;
  vintage_year: number | null;
  fund_size_usd: number | null;
  target_size_usd?: number | null;
  status: string | null;
  vehicles: number;
  irr: number | null;
  multiple: number | null;
  lps: number;
  companies: { id: string; name: string; domain: string | null }[];
};
