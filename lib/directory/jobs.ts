import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ASSET_CLASSES, type AssetClass } from "./asset-classes";
import { researchBenchmarks } from "./benchmark-research";
import { researchCommitments, type LpInput } from "./commitments-research";
import { researchDeals } from "./deals-research";
import { researchFund, type FundInput } from "./fund-research";
import { researchInvestor, type InvestorInput } from "./investor-research";
import { portfolioDomain, portfolioKey } from "./portfolio";
import { researchPortfolio, type ResearchedCompany } from "./portfolio-research";
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

// --- Portfolio companies, in bulk -------------------------------------------

export type PortfolioFirm = { id: string; name: string; domain: string | null; country: string | null };

/** The manager types whose investments are portfolio companies (not loans, not listed securities). */
export const SPONSOR_TYPES = ["Private equity", "Growth equity", "Venture capital", "Alternative asset manager", "Multi-asset alternatives", "Infrastructure", "Private credit", "Asset manager", "Other"];

/**
 * Sponsors to research, with nothing on file first: the Master Directory's
 * firms before the SEC roster's, and the largest first within each. The
 * roster's "private equity" advisers include many that report a private
 * equity fund without running a portfolio, so they come last and by the
 * gross assets of the private funds they file.
 */
export async function portfolioTargets(supabase: Admin, opts: { limit: number; includeRoster?: boolean; redo?: boolean }): Promise<PortfolioFirm[]> {
  const { data: counts } = await supabase.from("portfolio_companies").select("gp_company_id");
  const have = new Set(((counts as { gp_company_id: string }[] | null) ?? []).map((r) => r.gp_company_id));
  const out: PortfolioFirm[] = [];
  const pull = async (source: string, order: string) => {
    const rows =
      (await fetchAll<{ id: string; name: string; domain: string | null; country: string | null }>((from, to, first) =>
        supabase
          .from("companies")
          .select("id, name, domain, country", first ? { count: "exact" } : undefined)
          .eq("category", "GP")
          .eq("source", source)
          .in("sub_type", SPONSOR_TYPES)
          .order(order, { ascending: false, nullsFirst: false })
          .order("id")
          .range(from, to),
      )) ?? [];
    for (const r of rows) if (opts.redo || !have.has(r.id)) out.push(r);
  };
  await pull("master_directory", "brand_aum_total_usd");
  if (opts.includeRoster) await pull("form_adv_roster", "private_fund_gross_assets");
  return out.slice(0, opts.limit);
}

/** Researched companies as rows, one per company per GP. */
export function portfolioRows(gpId: string, companies: ResearchedCompany[], addedBy: string | null): Record<string, unknown>[] {
  const rows = new Map<string, Record<string, unknown>>();
  const year = (y: number | null | undefined) => (y && y > 1900 && y < 2100 ? y : null);
  const money = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  for (const c of companies) {
    const key = portfolioKey(gpId, c.name);
    if (rows.has(key)) continue;
    rows.set(key, {
      external_key: key,
      gp_company_id: gpId,
      name: c.name.trim().slice(0, 200),
      domain: portfolioDomain(c.website),
      description: c.description?.slice(0, 600) ?? null,
      sector: c.sector?.slice(0, 120) ?? null,
      hq: c.hq?.slice(0, 160) ?? null,
      status: c.status === "unknown" ? null : c.status,
      invested_year: year(c.invested_year),
      exit_year: year(c.exit_year),
      fund_name: c.fund_name?.slice(0, 200) ?? null,
      status_note: c.status_note?.slice(0, 300) ?? null,
      deal_type: c.deal_type?.slice(0, 80) ?? null,
      asset_class: c.asset_class?.slice(0, 80) ?? null,
      asset_kind: c.asset_kind ?? null,
      asset_location: c.asset_location?.slice(0, 160) ?? null,
      value_creation_plan: c.value_creation_plan?.slice(0, 600) ?? null,
      value_creation_source_url: c.value_creation_source_url && /^https?:\/\//.test(c.value_creation_source_url) ? c.value_creation_source_url.slice(0, 600) : null,
      source: "web_research",
      source_url: c.source_url.slice(0, 600),
      added_by: addedBy,
      deal_value: money(c.deal_value),
      deal_currency: c.deal_currency ? c.deal_currency.toUpperCase().slice(0, 3) : null,
      deal_value_basis: money(c.deal_value) ? (c.deal_value_basis ?? "unspecified") : null,
      equity_invested: money(c.equity_invested),
      stake_pct: typeof c.stake_pct === "number" && c.stake_pct > 0 && c.stake_pct <= 100 ? c.stake_pct : null,
      co_investors: (c.co_investors ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 12),
      deal_source_url: c.deal_source_url && /^https?:\/\//.test(c.deal_source_url) ? c.deal_source_url.slice(0, 600) : null,
      researched_at: new Date().toISOString(),
    });
  }
  return [...rows.values()];
}

export type PortfolioJobResult = { firms: number; companies: number; skipped: string[]; errors: string[] };

/** Read each sponsor's portfolio, two at a time, and save what the sources name. */
export async function runPortfolios(
  supabase: Admin,
  firms: PortfolioFirm[],
  opts: {
    deadline: number;
    addedBy: string | null;
    log?: JobLog;
    /** Where rows go instead of the database: a run on a machine with the research key but no database key writes SQL. */
    save?: (firm: PortfolioFirm, rows: Record<string, unknown>[], note: string) => Promise<void>;
  },
): Promise<PortfolioJobResult> {
  const log = opts.log ?? (() => {});
  let done = 0;
  let companies = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < firms.length; i += 2) {
    const batch = firms.slice(i, i + 2);
    if (timeLeft(opts.deadline) < 60_000) {
      skipped.push(...batch.map((f) => f.name));
      continue;
    }
    log(`portfolio: ${batch.map((f) => f.name).join(" · ")}…`);
    const results = await Promise.all(batch.map((f) => researchPortfolio(f)));
    for (let j = 0; j < batch.length; j++) {
      const firm = batch[j];
      const r = results[j];
      if (!r.ok) {
        errors.push(`${firm.name}: ${r.error}`);
        log(`  ${firm.name}: ${r.error}`);
        continue;
      }
      const rows = portfolioRows(firm.id, r.companies, opts.addedBy);
      if (opts.save) {
        await opts.save(firm, rows, r.note);
      } else {
        for (const part of chunk(rows, 200)) {
          const { error } = await supabase.from("portfolio_companies").upsert(part, { onConflict: "external_key" });
          if (error) throw new Error(`Saving portfolio companies: ${error.message}`);
        }
        await supabase.from("companies").update({ portfolio_note: r.note.slice(0, 600) || null, portfolio_researched_at: new Date().toISOString() }).eq("id", firm.id);
      }
      done += 1;
      companies += rows.length;
      const priced = rows.filter((x) => x.deal_value != null).length;
      log(`  ${firm.name}: ${rows.length} companies${priced ? `, ${priced} with a stated deal value` : ""}${r.note ? ` (${r.note.slice(0, 120)})` : ""}`);
    }
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not reached: ${skipped.join(", ")}.`);
  return { firms: done, companies, skipped, errors };
}

/** One idempotent statement per row, for a run that writes SQL instead of rows. */
export function portfolioRowSql(row: Record<string, unknown>): string {
  const cols = Object.keys(row);
  const lit = (v: unknown): string => {
    if (v == null) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v)) return `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(", ")}]::text[]`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const updates = cols.filter((c) => c !== "external_key" && c !== "gp_company_id" && c !== "added_by").map((c) => `${c} = excluded.${c}`);
  return `insert into public.portfolio_companies (${cols.join(", ")}) values (${cols.map((c) => lit(row[c])).join(", ")}) on conflict (external_key) do update set ${updates.join(", ")};`;
}

// --- Investor profiles and plans (migration 0033) -----------------------------

type InvestorBatchRow = {
  id: string;
  name: string;
  domain: string | null;
  country: string | null;
  sub_type: string | null;
  investor_type: string | null;
  total_assets_usd: number | null;
  alts_allocation_pct: number | null;
  commitments: number | null;
  funds_named: string[] | null;
};

function investorInput(r: InvestorBatchRow): InvestorInput {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    country: r.country,
    subType: r.sub_type,
    knownFunds: Array.isArray(r.funds_named) ? r.funds_named.filter((f): f is string => typeof f === "string").slice(0, 8) : [],
    investorType: r.investor_type,
    totalAssetsUsd: r.total_assets_usd == null ? null : Number(r.total_assets_usd),
    altsAllocationPct: r.alts_allocation_pct == null ? null : Number(r.alts_allocation_pct),
    commitments: r.commitments == null ? null : Number(r.commitments),
  };
}

/**
 * The LPs to research: the next page of `investor_research_batch` (LPs with
 * nothing on file, best-documented first), or the LPs named — those come
 * straight from `companies`, researched or not, so a profile can be redone.
 */
export async function investorTargets(supabase: Admin, opts: { limit: number; offset?: number; ids?: string[] }): Promise<InvestorInput[]> {
  if (opts.ids?.length) {
    const ids = [...new Set(opts.ids)].slice(0, 50);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, domain, country, sub_type, investor_type, total_assets_usd, alts_allocation_pct")
      .in("id", ids)
      .eq("category", "LP");
    if (error) throw new Error(`Reading investors: ${error.message}`);
    const rows = (data as Omit<InvestorBatchRow, "commitments" | "funds_named">[] | null) ?? [];
    const named = new Map<string, string[]>();
    if (rows.length) {
      const { data: held } = await supabase.from("commitments").select("lp_company_id, fund_name").in("lp_company_id", rows.map((r) => r.id)).limit(2000);
      for (const c of (held as { lp_company_id: string; fund_name: string | null }[] | null) ?? []) {
        if (!c.fund_name) continue;
        const l = named.get(c.lp_company_id) ?? [];
        if (!l.includes(c.fund_name)) l.push(c.fund_name);
        named.set(c.lp_company_id, l);
      }
    }
    return rows.slice(0, opts.limit).map((r) => investorInput({ ...r, commitments: named.get(r.id)?.length ?? 0, funds_named: named.get(r.id) ?? [] }));
  }
  const { data, error } = await supabase.rpc("investor_research_batch", { p_limit: opts.limit, p_offset: opts.offset ?? 0 });
  if (error) throw new Error(`Reading the investor batch: ${error.message}`);
  return ((Array.isArray(data) ? data : []) as InvestorBatchRow[]).filter((r) => r && typeof r.id === "string" && typeof r.name === "string").map(investorInput);
}

export type InvestorJobResult = {
  /** Investors whose profile was written (including an honest "no public data"). */
  done: number;
  fields: number;
  plans: number;
  /** Values the loader dropped for want of a qualifying source. */
  dropped: number;
  failed: string[];
  outOfTime: string[];
  errors: string[];
};

type UpsertCounts = Record<string, unknown>;
const count = (r: UpsertCounts | null | undefined, key: string): number => (r && typeof r[key] === "number" ? (r[key] as number) : 0);

/**
 * Research each LP's profile and plans, two at a time, and write them through
 * `investor_profile_upsert` — the function keeps only sourced values. LPs the
 * deadline does not reach are reported, not retried.
 */
export async function runInvestors(
  supabase: Admin,
  opts: { limit: number; offset?: number; ids?: string[]; deadline: number; log?: JobLog },
): Promise<InvestorJobResult> {
  const log = opts.log ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);
  const lps = await investorTargets(supabase, { limit: opts.limit, offset: opts.offset, ids: opts.ids });
  const result: InvestorJobResult = { done: 0, fields: 0, plans: 0, dropped: 0, failed: [], outOfTime: [], errors: [] };
  if (!lps.length) {
    log("investors: nothing to research");
    return result;
  }
  for (let i = 0; i < lps.length; i += 2) {
    const batch = lps.slice(i, i + 2);
    if (timeLeft(opts.deadline) < 60_000) {
      result.outOfTime.push(...batch.map((l) => l.name));
      continue;
    }
    log(`investors: ${batch.map((l) => l.name).join(" · ")}…`);
    const outcomes = await Promise.all(batch.map((lp) => researchInvestor(lp, { today, deadline: opts.deadline })));
    for (let j = 0; j < batch.length; j++) {
      const lp = batch[j];
      const r = outcomes[j];
      if (!r.ok) {
        if (r.error === OUT_OF_TIME) result.outOfTime.push(lp.name);
        else result.failed.push(`${lp.name}: ${r.error}`);
        log(`  ${lp.name}: ${r.error}`);
        continue;
      }
      const { data, error } = await supabase.rpc("investor_profile_upsert", { p: [r.row] });
      if (error) {
        result.failed.push(`${lp.name}: saving — ${error.message}`);
        log(`  ${lp.name}: saving failed — ${error.message}`);
        continue;
      }
      const counts = (data ?? null) as UpsertCounts | null;
      if (count(counts, "unknown_company")) {
        result.failed.push(`${lp.name}: not a company the database knows`);
        continue;
      }
      result.done += 1;
      result.fields += count(counts, "fields");
      result.plans += count(counts, "plans");
      result.dropped += count(counts, "dropped_no_source");
      log(
        `  ${lp.name}: ${count(counts, "fields")} fields, ${count(counts, "plans")} plans, ${r.searches} searches` +
          `${count(counts, "dropped_no_source") ? `, ${count(counts, "dropped_no_source")} dropped for want of a source` : ""}` +
          `${r.row.research_state === "no_public_data" ? " (no public data)" : ""}`,
      );
    }
  }
  if (result.outOfTime.length) result.errors.push(`${OUT_OF_TIME} Not reached: ${result.outOfTime.join(", ")}.`);
  result.errors.push(...result.failed);
  return result;
}

// --- Fund profiles (migration 0032/0033) ----------------------------------------

type FundBatchRow = {
  id: string;
  name: string;
  name_filed: string | null;
  manager: { name: string; domain: string | null } | null;
  size_usd: number | null;
  target_usd: number | null;
  vintage: number | null;
  strategy: string | null;
  vehicle_kind: string | null;
  domicile: string | null;
  lp_commitments: number | null;
  form_d: FundInput["form_d"];
};

function fundInput(r: FundBatchRow): FundInput {
  return {
    id: r.id,
    name: r.name,
    name_filed: r.name_filed ?? null,
    manager: r.manager && typeof r.manager === "object" && typeof r.manager.name === "string" ? { name: r.manager.name, domain: r.manager.domain ?? null } : null,
    vintage: r.vintage == null ? null : Number(r.vintage),
    size_usd: r.size_usd == null ? null : Number(r.size_usd),
    target_usd: r.target_usd == null ? null : Number(r.target_usd),
    strategy: r.strategy ?? null,
    vehicle_kind: r.vehicle_kind ?? null,
    domicile: r.domicile ?? null,
    lp_commitments: r.lp_commitments == null ? null : Number(r.lp_commitments),
    form_d: r.form_d && typeof r.form_d === "object" ? r.form_d : null,
  };
}

/**
 * The funds to research: the next page of `fund_research_batch` (most-held
 * and best-documented first, nothing on file), or the funds named — read
 * straight from `funds` with their manager and latest Form D, researched or
 * not, so a profile can be redone.
 */
export async function fundTargets(supabase: Admin, opts: { limit: number; offset?: number; ids?: string[] }): Promise<FundInput[]> {
  if (opts.ids?.length) {
    const ids = [...new Set(opts.ids)].slice(0, 50);
    const { data, error } = await supabase
      .from("funds")
      .select("id, name, name_filed, company_id, vintage_year, fund_size_usd, target_size_usd, strategy, vehicle_kind, domicile")
      .in("id", ids);
    if (error) throw new Error(`Reading funds: ${error.message}`);
    type FundRow = { id: string; name: string; name_filed: string | null; company_id: string | null; vintage_year: number | null; fund_size_usd: number | null; target_size_usd: number | null; strategy: string | null; vehicle_kind: string | null; domicile: string | null };
    const rows = ((data as FundRow[] | null) ?? []).slice(0, opts.limit);
    const managerIds = [...new Set(rows.map((r) => r.company_id).filter((x): x is string => Boolean(x)))];
    const managers = new Map<string, { name: string; domain: string | null }>();
    if (managerIds.length) {
      const { data: cos } = await supabase.from("companies").select("id, name, domain").in("id", managerIds);
      for (const c of (cos as { id: string; name: string; domain: string | null }[] | null) ?? []) managers.set(c.id, { name: c.name, domain: c.domain });
    }
    const formD = new Map<string, NonNullable<FundInput["form_d"]>>();
    if (rows.length) {
      const { data: offs } = await supabase
        .from("fund_offerings")
        .select("fund_id, filing_date, first_sale_date, offering_amount, amount_sold, investors_count, min_investment, source_url")
        .in("fund_id", rows.map((r) => r.id))
        .order("filing_date", { ascending: false, nullsFirst: false });
      type Off = { fund_id: string; first_sale_date: string | null; offering_amount: number | null; amount_sold: number | null; investors_count: number | null; min_investment: number | null; source_url: string | null };
      for (const o of (offs as Off[] | null) ?? []) {
        if (formD.has(o.fund_id)) continue;
        formD.set(o.fund_id, { first_sale: o.first_sale_date, offering: o.offering_amount, sold: o.amount_sold, investors: o.investors_count, min_investment: o.min_investment, url: o.source_url });
      }
    }
    return rows.map((r) =>
      fundInput({
        id: r.id,
        name: r.name,
        name_filed: r.name_filed,
        manager: r.company_id ? (managers.get(r.company_id) ?? null) : null,
        size_usd: r.fund_size_usd,
        target_usd: r.target_size_usd,
        vintage: r.vintage_year,
        strategy: r.strategy,
        vehicle_kind: r.vehicle_kind,
        domicile: r.domicile,
        lp_commitments: null,
        form_d: formD.get(r.id) ?? null,
      }),
    );
  }
  const { data, error } = await supabase.rpc("fund_research_batch", { p_limit: opts.limit, p_offset: opts.offset ?? 0 });
  if (error) throw new Error(`Reading the fund batch: ${error.message}`);
  return ((Array.isArray(data) ? data : []) as FundBatchRow[]).filter((r) => r && typeof r.id === "string" && typeof r.name === "string").map(fundInput);
}

export type FundDetailsJobResult = {
  done: number;
  fields: number;
  /** Funds placed in the taxonomy (strategy, regions or industries written). */
  placed: number;
  dropped: number;
  failed: string[];
  outOfTime: string[];
  errors: string[];
};

/**
 * Research each fund's profile, two at a time, write it through
 * `fund_details_upsert` (sourced values only; fees and terms from primary or
 * press sources only) and then the taxonomy codes beside it. Funds the
 * deadline does not reach are reported, not retried.
 */
export async function runFundDetails(
  supabase: Admin,
  opts: { limit: number; offset?: number; ids?: string[]; deadline: number; log?: JobLog },
): Promise<FundDetailsJobResult> {
  const log = opts.log ?? (() => {});
  const today = new Date().toISOString().slice(0, 10);
  const funds = await fundTargets(supabase, { limit: opts.limit, offset: opts.offset, ids: opts.ids });
  const result: FundDetailsJobResult = { done: 0, fields: 0, placed: 0, dropped: 0, failed: [], outOfTime: [], errors: [] };
  if (!funds.length) {
    log("funds: nothing to research");
    return result;
  }
  for (let i = 0; i < funds.length; i += 2) {
    const batch = funds.slice(i, i + 2);
    if (timeLeft(opts.deadline) < 60_000) {
      result.outOfTime.push(...batch.map((f) => f.name));
      continue;
    }
    log(`funds: ${batch.map((f) => f.name).join(" · ")}…`);
    const outcomes = await Promise.all(batch.map((fund) => researchFund(fund, { today, deadline: opts.deadline })));
    for (let j = 0; j < batch.length; j++) {
      const fund = batch[j];
      const r = outcomes[j];
      if (!r.ok) {
        if (r.error === OUT_OF_TIME) result.outOfTime.push(fund.name);
        else result.failed.push(`${fund.name}: ${r.error}`);
        log(`  ${fund.name}: ${r.error}`);
        continue;
      }
      const { data, error } = await supabase.rpc("fund_details_upsert", { p: [r.row] });
      if (error) {
        result.failed.push(`${fund.name}: saving — ${error.message}`);
        log(`  ${fund.name}: saving failed — ${error.message}`);
        continue;
      }
      const counts = (data ?? null) as UpsertCounts | null;
      if (count(counts, "unknown_fund")) {
        result.failed.push(`${fund.name}: not a fund the database knows`);
        continue;
      }
      result.done += 1;
      result.fields += count(counts, "fields");
      result.dropped += count(counts, "dropped_no_source");
      // The taxonomy codes are columns of their own (0033), outside the
      // upsert's element: written once the row exists.
      const codes = r.codes;
      let placed = "";
      if (codes.strategy_code || codes.region_codes.length || codes.industry_codes.length) {
        const { error: codeError } = await supabase
          .from("fund_details")
          .update({ strategy_code: codes.strategy_code, region_codes: codes.region_codes, industry_codes: codes.industry_codes })
          .eq("fund_id", fund.id);
        if (codeError) result.errors.push(`${fund.name}: taxonomy codes — ${codeError.message}`);
        else {
          result.placed += 1;
          placed = [codes.strategy_code, ...codes.region_codes, ...codes.industry_codes].filter(Boolean).join(", ");
        }
      }
      log(
        `  ${fund.name}: ${count(counts, "fields")} fields, ${r.searches} searches` +
          `${count(counts, "dropped_no_source") ? `, ${count(counts, "dropped_no_source")} dropped for want of a source` : ""}` +
          `${placed ? ` — placed: ${placed}` : ""}${r.row.research_state === "no_public_data" ? " (no public data)" : ""}`,
      );
    }
  }
  if (result.outOfTime.length) result.errors.push(`${OUT_OF_TIME} Not reached: ${result.outOfTime.join(", ")}.`);
  result.errors.push(...result.failed);
  return result;
}
