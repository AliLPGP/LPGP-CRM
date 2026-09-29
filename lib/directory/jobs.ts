import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSET_CLASSES, type AssetClass } from "./asset-classes";
import { researchBenchmarks } from "./benchmark-research";
import { researchCommitments, type LpInput } from "./commitments-research";
import { researchDeals } from "./deals-research";
import { firmMatcher } from "./firm-match";
import { normDomain, normName } from "./normalize";
import { OUT_OF_TIME, slugify, timeLeft } from "./research";
import { refreshAllSignals, signalKey } from "./signals-refresh";
import { researchClub, type ClubInput } from "./sports-research";
import { chunk, fetchAll } from "../supabase/paged";

// The research jobs as plain functions over a service-role client: the API
// routes call them after checking who is asking, and scripts/research.ts
// calls them from a terminal with the same keys, so a desk can be filled in
// one command as well as one button at a time. None of this touches the
// Next.js cache — the caller revalidates.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type JobLog = (line: string) => void;

export type ClassJobResult = { added: number; classes: number; skipped: string[]; errors: string[] };

export async function runBenchmarks(supabase: Admin, classes: AssetClass[], deadline: number, log: JobLog = () => {}): Promise<ClassJobResult> {
  let added = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < classes.length; i += 3) {
    const batch = classes.slice(i, i + 3);
    if (timeLeft(deadline) < 45_000) {
      skipped.push(...batch.map((c) => c.short));
      continue;
    }
    log(`benchmarks: ${batch.map((c) => c.short).join(", ")}…`);
    const results = await Promise.all(batch.map((cls) => researchBenchmarks(cls, { deadline })));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.error === OUT_OF_TIME) skipped.push(batch[j].short);
      else if (r.error) errors.push(`${batch[j].short}: ${r.error}`);
      for (const rows of chunk(r.rows, 200)) {
        const { error } = await supabase.from("benchmarks").upsert(rows, { onConflict: "external_key" });
        if (error) throw new Error(`Saving benchmarks: ${error.message}`);
        added += rows.length;
      }
      log(`  ${batch[j].short}: ${r.rows.length} figures${r.error ? ` (${r.error})` : ""}`);
    }
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not reached: ${skipped.join(", ")}.`);
  return { added, classes: classes.length - skipped.length, skipped, errors };
}

export async function runDeals(supabase: Admin, classes: AssetClass[], opts: { since: string; deadline: number; addedBy: string | null; log?: JobLog }): Promise<ClassJobResult> {
  const log = opts.log ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);
  const firmId = await firmMatcher(supabase);
  let added = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  for (const cls of classes) {
    if (timeLeft(opts.deadline) < 45_000) {
      skipped.push(cls.short);
      continue;
    }
    log(`deals: ${cls.short} since ${opts.since}…`);
    const [closes, transactions] = await Promise.all([
      researchDeals(cls, { since: opts.since, angle: "closes", today, deadline: opts.deadline }),
      researchDeals(cls, { since: opts.since, angle: "transactions", today, deadline: opts.deadline }),
    ]);
    for (const r of [closes, transactions]) {
      if (r.error === OUT_OF_TIME) {
        if (!skipped.includes(cls.short)) skipped.push(cls.short);
      } else if (r.error) errors.push(`${cls.short}: ${r.error}`);
    }
    // The two angles can surface the same transaction; one row per key.
    const byKey = new Map([...closes.rows, ...transactions.rows].map((d) => [d.external_key, d]));
    const rows = [...byKey.values()].map((d) => ({
      ...d,
      investor_company_id: firmId(d.investor),
      target_company_id: d.target_kind === "company" || d.target_kind === "fund" ? firmId(d.target) : null,
      added_by: opts.addedBy,
    }));
    for (const batch of chunk(rows, 200)) {
      const { error } = await supabase.from("deals").upsert(batch, { onConflict: "external_key" });
      if (error) throw new Error(`Saving deals: ${error.message}`);
      added += batch.length;
    }
    log(`  ${cls.short}: ${rows.length} deals`);
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not finished: ${skipped.join(", ")}.`);
  return { added, classes: classes.length - skipped.length, skipped, errors };
}

export type ClubJobResult = { name: string; ok: boolean; error?: string; teamId?: string; deals?: number; searches?: number };

type Existing = { id: string; external_key: string | null; name: string; league: string | null; country: string | null; city: string | null; sport: string };

export async function runClubs(
  supabase: Admin,
  opts: { teamIds: string[]; clubs: ClubInput[]; verify: boolean; deadline: number; addedBy: string | null; log?: JobLog },
): Promise<ClubJobResult[]> {
  const log = opts.log ?? (() => {});
  const existing: Existing[] = [];
  if (opts.teamIds.length) {
    for (const ids of chunk(opts.teamIds, 100)) {
      const { data } = await supabase.from("sports_teams").select("id, external_key, name, league, country, city, sport").in("id", ids);
      existing.push(...((data as Existing[]) ?? []));
    }
  }
  const inputs: { input: ClubInput; existing: Existing | null }[] = [
    ...existing.map((e) => ({ input: { name: e.name, league: e.league, country: e.country, city: e.city, sport: e.sport }, existing: e })),
    ...opts.clubs.map((c) => ({ input: c, existing: null })),
  ];
  const firmId = await firmMatcher(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const results: ClubJobResult[] = [];

  // Two at a time: each is a minute or so of searching. Clubs the time
  // limit doesn't reach are reported so the caller can send them again.
  for (let i = 0; i < inputs.length; i += 2) {
    const batch = inputs.slice(i, i + 2);
    if (timeLeft(opts.deadline) < 45_000) {
      results.push(...batch.map(({ input }) => ({ name: input.name, ok: false, error: OUT_OF_TIME })));
      continue;
    }
    log(`clubs: ${batch.map((b) => b.input.name).join(" · ")}…`);
    const outcomes = await Promise.all(batch.map(({ input }) => researchClub(input, { verify: opts.verify, today, deadline: opts.deadline })));
    for (let j = 0; j < batch.length; j++) {
      const { input, existing: ex } = batch[j];
      const r = outcomes[j];
      if (!r.ok) {
        results.push({ name: input.name, ok: false, error: r.error });
        log(`  ${input.name}: ${r.error}`);
        continue;
      }
      const t = r.data.team;
      const key = ex?.external_key ?? `${slugify(input.league ?? "other")}--${slugify(input.name)}`;
      const row = {
        external_key: key,
        name: t.name,
        short_name: t.short_name,
        sport: t.sport,
        league: t.league,
        country: t.country,
        city: t.city,
        stadium: t.stadium,
        stadium_capacity: t.stadium_capacity,
        stadium_capacity_source_url: t.stadium_capacity_source_url,
        founded_year: t.founded_year,
        domain: normDomain(t.domain),
        ownership_type: t.ownership_type,
        ownership_summary: t.ownership_summary,
        ownership_source_url: t.ownership_source_url,
        revenue: t.revenue,
        revenue_currency: t.revenue_currency,
        revenue_season: t.revenue_season,
        revenue_source_name: t.revenue_source_name,
        revenue_source_url: t.revenue_source_url,
        valuation: t.valuation,
        valuation_currency: t.valuation_currency,
        valuation_year: t.valuation_year,
        valuation_source_name: t.valuation_source_name,
        valuation_source_url: t.valuation_source_url,
        social_followers: t.social_followers,
        social_as_of: t.social_as_of,
        social_source_url: t.social_source_url,
        social_platforms: t.social_platforms,
        notes: t.notes,
        sources: t.sources,
        verification: t.verification,
        source: "web_research",
      };
      const { data: saved, error } = await supabase.from("sports_teams").upsert(row, { onConflict: "external_key" }).select("id").single();
      if (error || !saved) {
        results.push({ name: input.name, ok: false, error: error?.message ?? "save failed" });
        continue;
      }
      const teamId = saved.id as string;
      const problems: string[] = [];
      // Owners are replaced by the new record; deals are keyed, so an
      // upsert updates in place. Every write is checked: a record that
      // reports "done" with its owners or deals missing would mislead.
      const investors = t.owners.length
        ? await fetchAll<{ id: string; name: string }>((from, to, first) =>
            supabase.from("sports_investors").select("id, name", first ? { count: "exact" } : undefined).order("id").range(from, to),
          )
        : null;
      const invByName = new Map((investors ?? []).map((i) => [normName(i.name), i.id]));
      const ownerRows = t.owners.map((o) => ({
        team_id: teamId,
        name: o.name,
        kind: o.kind,
        institutional: o.institutional,
        investor_type: o.investor_type,
        stake_pct: o.stake_pct,
        since_year: o.since_year,
        amount: o.amount,
        currency: o.currency,
        valuation_at_entry: o.valuation_at_entry,
        investor_id: invByName.get(normName(o.name)) ?? null,
        company_id: o.institutional ? firmId(o.name) : null,
        source_url: o.source_url,
      }));
      const { error: delError } = await supabase.from("sports_team_owners").delete().eq("team_id", teamId);
      if (delError) problems.push(`owners: ${delError.message}`);
      else if (ownerRows.length) {
        const { error: insError } = await supabase.from("sports_team_owners").insert(ownerRows);
        if (insError) problems.push(`owners: ${insError.message}`);
      }
      if (r.data.deals.length) {
        const { error: dealError } = await supabase.from("deals").upsert(
          r.data.deals.map((d) => ({
            external_key: d.key,
            date: d.date,
            date_text: d.date_text,
            kind: d.kind,
            asset_class: "sports",
            sport: t.sport,
            target: t.name,
            target_kind: "club",
            target_country: t.country,
            target_team_id: teamId,
            investor: d.investor,
            investor_type: d.investor_type,
            investor_company_id: firmId(d.investor),
            seller: d.seller,
            stake_pct: d.stake_pct,
            amount: d.amount,
            currency: d.currency,
            valuation: d.valuation,
            valuation_currency: d.valuation_currency,
            headline: d.headline,
            summary: d.summary,
            source_name: d.source_name,
            source_url: d.source_url,
            source: "web_research",
            added_by: opts.addedBy,
          })),
          { onConflict: "external_key" },
        );
        if (dealError) problems.push(`deals: ${dealError.message}`);
      }
      results.push(
        problems.length
          ? { name: t.name, ok: false, teamId, error: `Saved the club, but not everything: ${problems.join("; ")}` }
          : { name: t.name, ok: true, teamId, deals: r.data.deals.length, searches: r.data.searches },
      );
      log(`  ${t.name}: ${r.data.deals.length} deals, ${t.owners.length} owner rows, ${r.data.searches} searches${problems.length ? ` — ${problems.join("; ")}` : ""}`);
    }
  }
  return results;
}

export type CommitmentsJobResult = { added: number; lps: number; skipped: string[]; errors: string[] };

/** The LPs to research: those the workbook says publish commitments, largest first. */
export async function disclosingLps(supabase: Admin, limit: number, ids?: string[]): Promise<LpInput[]> {
  let q = supabase.from("companies").select("id, name, country, sub_type").eq("category", "LP");
  q = ids?.length ? q.in("id", ids.slice(0, 200)) : q.not("discloses_commitments", "is", null).neq("discloses_commitments", "No").order("total_assets_usd", { ascending: false, nullsFirst: false });
  const { data } = await q.limit(limit);
  return ((data as { id: string; name: string; country: string | null; sub_type: string | null }[] | null) ?? []).map((r) => ({ id: r.id, name: r.name, country: r.country, type: r.sub_type }));
}

export async function runCommitments(supabase: Admin, lps: LpInput[], opts: { since: string; deadline: number; log?: JobLog }): Promise<CommitmentsJobResult> {
  const log = opts.log ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);
  const firmId = await firmMatcher(supabase);
  // Funds already on file, by name, so a commitment lands on the fund record.
  const funds =
    (await fetchAll<{ id: string; name: string; company_id: string | null }>((from, to, first) =>
      supabase.from("funds").select("id, name, company_id", first ? { count: "exact" } : undefined).order("id").range(from, to),
    )) ?? [];
  const fundByName = new Map(funds.map((f) => [normName(f.name), f]));
  let added = 0;
  let done = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < lps.length; i += 2) {
    const batch = lps.slice(i, i + 2);
    if (timeLeft(opts.deadline) < 45_000) {
      skipped.push(...batch.map((l) => l.name));
      continue;
    }
    log(`commitments: ${batch.map((l) => l.name).join(" · ")}…`);
    const results = await Promise.all(batch.map((lp) => researchCommitments(lp, { since: opts.since, today, deadline: opts.deadline })));
    for (let j = 0; j < batch.length; j++) {
      const r = results[j];
      if (r.error === OUT_OF_TIME) skipped.push(batch[j].name);
      else if (r.error) errors.push(`${batch[j].name}: ${r.error}`);
      else done += 1;
      const rows = r.rows.map((c) => {
        const fund = fundByName.get(normName(c.fund_name));
        return { ...c, fund_id: fund?.id ?? null, gp_company_id: fund?.company_id ?? firmId(c.gp_name) };
      });
      for (const chunkRows of chunk(rows, 200)) {
        const { error } = await supabase.from("commitments").upsert(chunkRows, { onConflict: "external_key" });
        if (error) throw new Error(`Saving commitments: ${error.message}`);
        added += chunkRows.length;
      }
      log(`  ${batch[j].name}: ${r.rows.length} commitments, ${r.searches} searches${r.error ? ` (${r.error})` : ""}`);
    }
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not reached: ${skipped.join(", ")}.`);
  return { added, lps: done, skipped, errors };
}

export type SignalsJobResult = { added: number; found: number; classes: number; errors: string[] };

export async function runSignals(supabase: Admin, opts: { deadline: number; rotate?: number; days?: number; log?: JobLog }): Promise<SignalsJobResult> {
  const log = opts.log ?? (() => {});
  const rotate = opts.rotate ?? 0;
  // The order rotates daily so a class the deadline cuts off one day goes
  // first the next.
  const order = [...ASSET_CLASSES.slice(rotate), ...ASSET_CLASSES.slice(0, rotate)];
  log(`signals: ${order.map((c) => c.short).join(", ")}…`);
  const outcomes = await refreshAllSignals(opts.days ?? 5, opts.deadline, order);

  // Firms named in a headline get linked to their profile.
  const firms =
    (await fetchAll<{ id: string; name: string }>((from, to, first) =>
      supabase.from("companies").select("id, name", first ? { count: "exact" } : undefined).order("id").range(from, to),
    )) ?? [];
  const byName = new Map(firms.map((f) => [normName(f.name), f.id]));

  const rows = outcomes.flatMap((o) =>
    o.items.map((i) => ({
      external_key: signalKey(i.source_url),
      date: i.date && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : null,
      asset_class: o.cls.key,
      kind: i.kind,
      headline: i.headline.slice(0, 300),
      summary: i.summary.slice(0, 600),
      entities: (i.entities ?? []).slice(0, 12),
      company_ids: [...new Set((i.entities ?? []).map((e) => byName.get(normName(e))).filter(Boolean))],
      source_name: i.source_name.slice(0, 120),
      source_url: i.source_url.slice(0, 600),
      source: "refresh",
    })),
  );
  // Stories already on file stay as they are.
  const existing = new Set<string>();
  for (const batch of chunk(rows.map((r) => r.external_key), 150)) {
    const { data } = await supabase.from("signals").select("external_key").in("external_key", batch);
    for (const r of data ?? []) existing.add(r.external_key as string);
  }
  const seen = new Set<string>();
  const unique = rows.filter((r) => !existing.has(r.external_key) && (seen.has(r.external_key) ? false : (seen.add(r.external_key), true)));
  let added = 0;
  for (const batch of chunk(unique, 200)) {
    const { error } = await supabase.from("signals").upsert(batch, { onConflict: "external_key", ignoreDuplicates: true });
    if (error) throw new Error(`Saving signals: ${error.message}`);
    added += batch.length;
  }
  for (const o of outcomes) log(`  ${o.cls.short}: ${o.items.length} items${o.error ? ` (${o.error})` : ""}`);
  return { added, found: rows.length, classes: outcomes.filter((o) => !o.error).length, errors: outcomes.filter((o) => o.error).map((o) => `${o.cls.short}: ${o.error}`) };
}
