// Keyword relevance over the directory: BM25 across a firm's name, type,
// description, service lines and location, with two-word phrases indexed so
// "nav finance" outranks a page that merely mentions "nav" and "finance".
//
// The same term statistics give each firm a TF-IDF profile vector, which is
// what lookalike search compares (lib/directory/similar.ts).
//
// Pure module: safe on the client.

import type { DirectoryRecord } from "./records";

const STOP = new Set(
  (
    "a an and are as at be by for from has have in into is it its of on or that the their them they this to " +
    "was were which who with within across over under via per our we you your us also more most other such " +
    "than then these those out up about firm firms company companies business businesses based headquartered " +
    "located offices office global leading provides provider providing offer offers offering including include " +
    "includes specialist specialising specializing specialized specialised focused focusing focus around worldwide " +
    "one two three all any each both inc llc ltd lp llp"
  ).split(" "),
);

/** Just enough stemming that "financing", "finance" and "finances" meet. */
export function stem(word: string): string {
  let t = word;
  if (t.length > 4 && t.endsWith("ies")) t = `${t.slice(0, -3)}y`;
  else if (t.length > 5 && t.endsWith("ing")) t = t.slice(0, -3);
  else if (t.length > 4 && t.endsWith("ed")) t = t.slice(0, -2);
  else if (t.length > 4 && /(s|x|z|ch|sh)es$/.test(t)) t = t.slice(0, -2);
  else if (t.length > 3 && t.endsWith("s") && !/(ss|us|is)$/.test(t)) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith("e")) t = t.slice(0, -1);
  return t;
}

function words(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/** Lower-case, accent-free, stop-word-free, lightly stemmed tokens. */
export function tokenize(text: string | null | undefined): string[] {
  return words(text).map(stem);
}

// Words every firm description uses. Fine for search, useless for telling
// two firms apart, so they stay out of the lookalike profile.
const PROFILE_STOP = new Set(
  (
    "approximately billion billions million millions trillion employee employees staff people team teams " +
    "professional professionals management manage managing manager managers investment investments invest " +
    "investing investor investors asset assets fund funds capital partner partners firm company group client " +
    "clients service services solution solutions year years founded headquarters headquartered office " +
    "offices across around global international world worldwide major largest large leading independent " +
    "since today current currently total overall usd us based new york london"
  )
    .split(" ")
    .map(stem),
);

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < tokens.length; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
  return out;
}

// Phrases never straddle punctuation: "…private finance. Venture…" is not
// the phrase "finance venture".
const CLAUSE = /[.,;:!?()|·\n\u2013\u2014/]+/;

function clauseBigrams(text: string | null | undefined, tok: (t: string) => string[]): string[] {
  if (!text) return [];
  return text.split(CLAUSE).flatMap((part) => bigrams(tok(part)));
}

function profileTerms(text: string | null, surfaces: Map<string, string>): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    if (/^\d+$/.test(w)) continue;
    const t = stem(w);
    if (PROFILE_STOP.has(t)) continue;
    if (!surfaces.has(t)) surfaces.set(t, w);
    out.push(t);
  }
  return out;
}

type Doc = {
  /** Weighted term frequency across every searchable field. */
  tf: Map<string, number>;
  len: number;
  /** Profile terms only (no name, no place) for lookalike comparison. */
  profile: Map<string, number>;
  profileNorm: number;
};

export type SearchIndex = {
  docs: Doc[];
  df: Map<string, number>;
  profileDf: Map<string, number>;
  avgLen: number;
  n: number;
  pos: Map<string, number>;
  /** Stem → a word it came from, for showing terms to people. */
  surfaces: Map<string, string>;
};

/** "real_estat" → "real estate". */
export function termLabel(index: SearchIndex, term: string): string {
  return term
    .split("_")
    .map((t) => index.surfaces.get(t) ?? t)
    .join(" ");
}

function add(map: Map<string, number>, terms: string[], weight: number) {
  for (const t of terms) map.set(t, (map.get(t) ?? 0) + weight);
}

export function buildSearchIndex(records: DirectoryRecord[]): SearchIndex {
  const b = searchIndexBuilder();
  b.add(records);
  b.normalize(0, records.length);
  return b.result();
}

/**
 * The same index, built a run of records at a time. A phone spends seconds
 * tokenising twenty thousand firms; in one task that freezes every tap, so
 * the browser builds it in slices (`add` a run, yield, `add` the next, then
 * `normalize` in runs, then `result`). buildSearchIndex is the one-shot form.
 */
export function searchIndexBuilder() {
  const docs: Doc[] = [];
  const ids: string[] = [];
  const df = new Map<string, number>();
  const profileDf = new Map<string, number>();
  const surfaces = new Map<string, string>();
  let total = 0;

  return {
    add(records: DirectoryRecord[]) {
      for (const r of records) {
        const tf = new Map<string, number>();
        const profile = new Map<string, number>();
        const fields: [string | null, number, boolean][] = [
          [r.name, 3, false],
          [r.subType, 2.5, true],
          [r.vertical, 2, true],
          [r.industry, 0.5, true],
          [r.lines, 1.5, true],
          [r.description, 1, true],
          [[r.city, r.state, r.country].filter(Boolean).join(" "), 1, false],
        ];
        let len = 0;
        for (const [text, weight, isProfile] of fields) {
          const toks = tokenize(text);
          if (!toks.length) continue;
          len += toks.length;
          add(tf, toks, weight);
          add(tf, clauseBigrams(text, tokenize), weight * 1.5);
          if (isProfile) {
            add(profile, profileTerms(text, surfaces), weight);
            // Phrases from the full word sequence, so dropping a stop word can't
            // glue its neighbours into a phrase nobody wrote.
            add(
              profile,
              clauseBigrams(text, tokenize).filter((b) => !b.split("_").some((t) => PROFILE_STOP.has(t) || /^\d+$/.test(t))),
              weight,
            );
          }
        }
        total += len;
        for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
        for (const t of profile.keys()) profileDf.set(t, (profileDf.get(t) ?? 0) + 1);
        docs.push({ tf, len, profile, profileNorm: 0 });
        ids.push(r.id);
      }
    },
    /** Profile vectors are TF-IDF weighted and normalised once every record is in. */
    normalize(from: number, to: number) {
      const n = docs.length;
      for (let i = from; i < Math.min(to, n); i++) {
        const d = docs[i];
        let norm = 0;
        for (const [t, w] of d.profile) {
          const idf = Math.log(1 + n / (profileDf.get(t) ?? 1));
          const v = (1 + Math.log(w)) * idf;
          d.profile.set(t, v);
          norm += v * v;
        }
        d.profileNorm = Math.sqrt(norm);
      }
    },
    size: () => docs.length,
    result(): SearchIndex {
      const n = docs.length;
      return {
        docs,
        df,
        profileDf,
        avgLen: n ? total / n : 1,
        n,
        pos: new Map(ids.map((id, i) => [id, i])),
        surfaces,
      };
    },
  };
}

export type Relevance = { score: number; matched: number; of: number };

/** BM25 per record for a free-text query. Records missing too many of the
 *  query's words are left out: relevance ranks, it doesn't pad. */
export function relevance(index: SearchIndex, query: string): Map<number, Relevance> {
  const words = [...new Set(tokenize(query))];
  const out = new Map<number, Relevance>();
  if (!words.length) return out;
  const phrases = clauseBigrams(query, tokenize);
  // Two words must both appear; longer queries may miss a few.
  const need = words.length <= 2 ? words.length : Math.ceil(words.length * 0.6);
  const k1 = 1.2;
  const b = 0.75;
  const idf = (t: string) => {
    const df = index.df.get(t) ?? 0;
    return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
  };
  index.docs.forEach((d, i) => {
    let score = 0;
    let matched = 0;
    for (const t of words) {
      const f = d.tf.get(t);
      if (!f) continue;
      matched += 1;
      score += (idf(t) * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * d.len) / index.avgLen));
    }
    if (matched < need) return;
    for (const p of phrases) {
      const f = d.tf.get(p);
      if (f) score += idf(p) * 1.5;
    }
    out.set(i, { score, matched, of: words.length });
  });
  return out;
}

/** The sentence of a description that best answers the query, for a result row. */
export function snippet(text: string | null, query: string, max = 180): string | null {
  if (!text) return null;
  const words = new Set(tokenize(query));
  if (!words.size) return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  const sentences = text.split(/(?<=[.!?])\s+/);
  let best = sentences[0] ?? text;
  let bestHits = -1;
  for (const s of sentences) {
    const hits = tokenize(s).filter((t) => words.has(t)).length;
    if (hits > bestHits) {
      best = s;
      bestHits = hits;
    }
  }
  return best.length > max ? `${best.slice(0, max).trimEnd()}…` : best;
}

/** Split text into [plain, match, plain, …] runs for highlighting. */
export function highlight(text: string, query: string): { text: string; hit: boolean }[] {
  const words = new Set(tokenize(query));
  if (!words.size) return [{ text, hit: false }];
  const parts = text.split(/([A-Za-z0-9\u00C0-\u024F]+)/);
  return parts
    .filter((p) => p !== "")
    .map((p) => ({ text: p, hit: /[A-Za-z0-9]/.test(p) && words.has(stem(p.toLowerCase())) }));
}
