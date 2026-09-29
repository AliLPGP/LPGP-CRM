// Lookalikes: firms that resemble one or more seed firms, with the reasons.
//
// Similarity blends what a firm says it does (TF-IDF over description, type
// and service lines) with what the record knows: same type, same place,
// similar size and headcount, and — for managers — the same auditors,
// administrators and custodians on Form ADV. Every score comes with the
// evidence behind it, so a result is never a black box.
//
// Pure module: safe on the client.

import { formatUsd } from "../utils";
import { ROLE_LABEL } from "./providers";
import { providerPairs, type DirectoryBrand, type DirectoryRecord } from "./records";
import { termLabel, tokenize, type SearchIndex } from "./search";

export type SimilarHit = {
  record: DirectoryRecord;
  /** 0–100. */
  score: number;
  reasons: string[];
};

function logCloseness(a: number | null, b: number | null, span: number): number | null {
  if (a == null || b == null || a <= 0 || b <= 0) return null;
  return Math.max(0, 1 - Math.abs(Math.log10(a) - Math.log10(b)) / span);
}

export function findSimilar(
  seeds: DirectoryRecord[],
  records: DirectoryRecord[],
  brands: DirectoryBrand[],
  index: SearchIndex,
  limit = 60,
): SimilarHit[] {
  if (!seeds.length) return [];
  const seedIds = new Set(seeds.map((s) => s.id));

  // Seed centroid in profile space.
  const centroid = new Map<string, number>();
  for (const s of seeds) {
    const d = index.docs[index.pos.get(s.id) ?? -1];
    if (!d || !d.profileNorm) continue;
    for (const [t, w] of d.profile) centroid.set(t, (centroid.get(t) ?? 0) + w / d.profileNorm / seeds.length);
  }
  let centroidNorm = 0;
  for (const w of centroid.values()) centroidNorm += w * w;
  centroidNorm = Math.sqrt(centroidNorm);

  const books = new Map<string, number>();
  for (const s of seeds) books.set(s.category, (books.get(s.category) ?? 0) + 1);
  const mainBook = [...books.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const types = new Set(seeds.map((s) => s.subType).filter(Boolean) as string[]);
  // "Same type" already says this; the profile reason should add something.
  const typeTerms = new Set(tokenize(seeds.map((s) => `${s.subType ?? ""} ${s.vertical ?? ""}`).join(" ")));
  const countries = new Set(seeds.map((s) => s.country).filter(Boolean) as string[]);
  const zones = new Set(seeds.map((s) => s.zone).filter(Boolean) as string[]);
  const seedBrands = new Map<number, Set<string>>();
  for (const s of seeds) {
    for (const p of providerPairs(s)) {
      const roles = seedBrands.get(p.brand) ?? new Set<string>();
      roles.add(p.role);
      seedBrands.set(p.brand, roles);
    }
  }
  // Big Four and bulge-bracket banks appear everywhere; sharing one says
  // little. Weight shared providers by how rare they are.
  const brandRarity = (bi: number) => 1 / Math.log(2 + (brands[bi]?.clients ?? 1));

  const hits: SimilarHit[] = [];
  records.forEach((r, i) => {
    if (seedIds.has(r.id)) return;
    const reasons: { w: number; text: string }[] = [];
    let score = 0;

    // Text profile.
    const d = index.docs[i];
    if (d && d.profileNorm && centroidNorm) {
      let dot = 0;
      const shared: { t: string; w: number }[] = [];
      for (const [t, w] of centroid) {
        const v = d.profile.get(t);
        if (v) {
          dot += w * v;
          if (!t.split("_").some((part) => typeTerms.has(part))) shared.push({ t, w: w * v });
        }
      }
      const cos = dot / (centroidNorm * d.profileNorm);
      score += 0.5 * cos;
      if (cos > 0.12) {
        // "real estate" already covers "real" and "estate".
        const covered = new Set<string>();
        const top: string[] = [];
        for (const s of shared.sort((a, b) => b.w - a.w)) {
          const parts = s.t.split("_");
          if (parts.every((p) => covered.has(p))) continue;
          parts.forEach((p) => covered.add(p));
          top.push(`“${termLabel(index, s.t)}”`);
          if (top.length === 3) break;
        }
        if (top.length) reasons.push({ w: cos, text: `Similar profile: ${top.join(", ")}` });
      }
    }

    if (r.subType && types.has(r.subType)) {
      score += 0.2;
      reasons.push({ w: 0.2, text: `Same type: ${r.subType}` });
    }

    if (r.country && countries.has(r.country)) {
      score += 0.08;
      reasons.push({ w: 0.08, text: `Also in ${r.country}` });
    } else if (r.zone && zones.has(r.zone)) {
      score += 0.04;
    }

    let bestAum: { c: number; seed: DirectoryRecord } | null = null;
    for (const s of seeds) {
      const c = logCloseness(r.aum, s.aum, 2);
      if (c != null && (!bestAum || c > bestAum.c)) bestAum = { c, seed: s };
    }
    if (bestAum) {
      score += 0.12 * bestAum.c;
      if (bestAum.c > 0.75) {
        reasons.push({
          w: 0.12 * bestAum.c,
          text: `Similar size: ${formatUsd(r.aum)} vs ${formatUsd(bestAum.seed.aum)}`,
        });
      }
    }

    let bestEmp = 0;
    for (const s of seeds) bestEmp = Math.max(bestEmp, logCloseness(r.employees, s.employees, 1.5) ?? 0);
    score += 0.05 * bestEmp;

    if (r.adv && seeds.some((s) => s.adv === r.adv)) score += 0.03;

    if (seedBrands.size) {
      const mine = providerPairs(r);
      let overlap = 0;
      const names: string[] = [];
      const seen = new Set<number>();
      for (const p of mine) {
        if (seen.has(p.brand) || !seedBrands.get(p.brand)?.has(p.role)) continue;
        seen.add(p.brand);
        overlap += brandRarity(p.brand);
        if (names.length < 3) names.push(`${brands[p.brand]?.name ?? "?"} (${ROLE_LABEL[p.role].toLowerCase()})`);
      }
      if (overlap > 0) {
        const w = Math.min(0.25, 0.12 * overlap);
        score += w;
        reasons.push({
          w,
          text: `Shares ${seen.size} provider${seen.size === 1 ? "" : "s"}: ${names.join(", ")}${seen.size > names.length ? "…" : ""}`,
        });
      }
    }

    if (r.category !== mainBook && seeds.every((s) => s.category !== r.category)) score *= 0.35;
    if (score <= 0.08) return;
    hits.push({
      record: r,
      score: Math.round(Math.min(1, score / 0.9) * 100),
      reasons: reasons.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.text),
    });
  });

  return hits.sort((a, b) => b.score - a.score || (b.record.aum ?? 0) - (a.record.aum ?? 0)).slice(0, limit);
}
