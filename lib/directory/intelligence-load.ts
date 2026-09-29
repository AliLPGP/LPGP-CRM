"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "../auth";
import { getAdminClient } from "../supabase/admin";
import { chunk } from "../supabase/paged";
import { firmMatcher } from "./firm-match";
import { DIRECTORY_TAG } from "./index-server";
import { INTEL_TAG } from "./intelligence-queries";
import type { IntelligenceDataset } from "./intelligence-types";
import { normDomain, normName } from "./normalize";

// Loads data/intelligence/dataset.json — the researched, source-cited
// dataset checked into the repo — into the 0016 tables. Keyed rows update in
// place, so a newer dataset lands on the same records. A club the dataset
// lists without figures is only ever added, never overwritten: what the
// in-app research job found for it since stays.

type Row = Record<string, unknown>;

export type LoadResult = {
  ok: boolean;
  error?: string;
  version?: string;
  teams: number;
  owners: number;
  investors: number;
  deals: number;
  signals: number;
  linkedFirms: number;
};

const EMPTY: LoadResult = { ok: false, teams: 0, owners: 0, investors: 0, deals: 0, signals: 0, linkedFirms: 0 };

async function readDataset(): Promise<IntelligenceDataset | null> {
  try {
    const text = await readFile(path.join(process.cwd(), "data", "intelligence", "dataset.json"), "utf8");
    return JSON.parse(text) as IntelligenceDataset;
  } catch {
    return null;
  }
}

export async function loadIntelligenceDataset(): Promise<LoadResult> {
  const user = await getSessionUser();
  if (!user) return { ...EMPTY, error: "Not signed in" };
  if (user.role !== "admin") return { ...EMPTY, error: "Only admins can load the dataset." };
  const supabase = getAdminClient();
  if (!supabase) return { ...EMPTY, error: "Supabase service role not configured" };
  const data = await readDataset();
  if (!data) return { ...EMPTY, error: "data/intelligence/dataset.json is missing from this deployment." };

  const firmId = await firmMatcher(supabase);
  let linkedFirms = 0;
  const link = (name: string | null | undefined) => {
    const id = firmId(name);
    if (id) linkedFirms += 1;
    return id;
  };

  // Investors first: teams' owners and deals point at them.
  const investorIds = new Map<string, string>();
  for (const batch of chunk(data.investors, 200)) {
    const rows: Row[] = batch.map((i) => ({
      external_key: i.key,
      name: i.name,
      investor_type: i.investor_type,
      hq: i.hq,
      domain: normDomain(i.domain),
      aum: i.aum,
      aum_currency: i.aum_currency,
      aum_as_of: i.aum_as_of,
      aum_source_url: i.aum_source_url,
      summary: i.summary,
      holdings: i.holdings ?? [],
      company_id: link(i.name),
      source_url: i.source_url,
      source: "web_research",
    }));
    const { data: out, error } = await supabase.from("sports_investors").upsert(rows, { onConflict: "external_key" }).select("id, external_key");
    if (error) return { ...EMPTY, error: `Investors: ${error.message}` };
    for (const r of out ?? []) investorIds.set(r.external_key as string, r.id as string);
  }
  const investorByName = new Map<string, string>();
  for (const i of data.investors) {
    const id = investorIds.get(i.key);
    if (id) investorByName.set(normName(i.name), id);
  }

  // A roster row the dataset lists bare (no figures, no owners) only ever
  // adds the club: a record someone has since researched in the app keeps
  // what it found. Rows with figures land on their record in full.
  const hasFigures = (t: IntelligenceDataset["teams"][number]) =>
    t.revenue != null || t.valuation != null || t.stadium_capacity != null || t.social_followers != null || t.founded_year != null || (t.owners?.length ?? 0) > 0;
  const full = data.teams.filter(hasFigures);
  const bare = data.teams.filter((t) => !hasFigures(t));

  const teamIds = new Map<string, string>();
  for (const batch of chunk(bare, 200)) {
    const rows: Row[] = batch.map((t) => ({
      external_key: t.key,
      name: t.name,
      short_name: t.short_name,
      sport: t.sport || "football",
      league: t.league,
      country: t.country,
      city: t.city,
      domain: normDomain(t.domain),
      source: "web_research",
    }));
    const { error } = await supabase.from("sports_teams").upsert(rows, { onConflict: "external_key", ignoreDuplicates: true });
    if (error) return { ...EMPTY, error: `Teams: ${error.message}` };
    const { data: out, error: readError } = await supabase.from("sports_teams").select("id, external_key").in("external_key", batch.map((t) => t.key));
    if (readError) return { ...EMPTY, error: `Teams: ${readError.message}` };
    for (const r of out ?? []) teamIds.set(r.external_key as string, r.id as string);
  }
  for (const batch of chunk(full, 100)) {
    const rows: Row[] = batch.map((t) => ({
      external_key: t.key,
      name: t.name,
      short_name: t.short_name,
      sport: t.sport || "football",
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
      social_platforms: t.social_platforms ?? [],
      notes: t.notes,
      sources: t.sources ?? [],
      verification: t.verification ?? [],
      source: "web_research",
    }));
    const { data: out, error } = await supabase.from("sports_teams").upsert(rows, { onConflict: "external_key" }).select("id, external_key");
    if (error) return { ...EMPTY, error: `Teams: ${error.message}` };
    for (const r of out ?? []) teamIds.set(r.external_key as string, r.id as string);
  }

  // Owners are replaced per researched team: the dataset is the whole
  // ownership record for those; bare rows leave a club's owners alone.
  let owners = 0;
  const ownerRows: Row[] = [];
  const fullIds: string[] = [];
  for (const t of full) {
    const teamId = teamIds.get(t.key);
    if (!teamId) continue;
    fullIds.push(teamId);
    for (const o of t.owners ?? []) {
      ownerRows.push({
        team_id: teamId,
        name: o.name,
        kind: o.kind,
        institutional: Boolean(o.institutional),
        investor_type: o.investor_type,
        stake_pct: o.stake_pct,
        since_year: o.since_year,
        amount: o.amount,
        currency: o.currency,
        valuation_at_entry: o.valuation_at_entry,
        investor_id: investorByName.get(normName(o.name)) ?? null,
        company_id: o.institutional ? link(o.name) : null,
        source_url: o.source_url,
      });
    }
  }
  for (const ids of chunk(fullIds, 150)) {
    const { error } = await supabase.from("sports_team_owners").delete().in("team_id", ids);
    if (error) return { ...EMPTY, error: `Owners: ${error.message}` };
  }
  for (const batch of chunk(ownerRows, 300)) {
    const { error } = await supabase.from("sports_team_owners").insert(batch);
    if (error) return { ...EMPTY, error: `Owners: ${error.message}` };
    owners += batch.length;
  }

  let deals = 0;
  for (const batch of chunk(data.deals, 200)) {
    const rows: Row[] = batch.map((d) => ({
      external_key: d.key,
      date: d.date,
      date_text: d.date_text,
      kind: d.kind,
      asset_class: d.asset_class,
      sport: d.sport,
      target: d.target,
      target_kind: d.target_kind,
      target_country: d.target_country,
      target_team_id: d.target_team_key ? (teamIds.get(d.target_team_key) ?? null) : null,
      target_company_id: d.target_kind === "company" || d.target_kind === "fund" ? link(d.target) : null,
      investor: d.investor,
      investor_type: d.investor_type,
      investor_company_id: link(d.investor),
      investor_id: (d.investor_key ? investorIds.get(d.investor_key) : undefined) ?? investorByName.get(normName(d.investor)) ?? null,
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
    }));
    const { error } = await supabase.from("deals").upsert(rows, { onConflict: "external_key" });
    if (error) return { ...EMPTY, error: `Deals: ${error.message}` };
    deals += rows.length;
  }

  let signals = 0;
  for (const batch of chunk(data.signals, 300)) {
    const rows: Row[] = batch.map((s) => ({
      external_key: s.key,
      date: s.date,
      asset_class: s.asset_class,
      kind: s.kind,
      headline: s.headline,
      summary: s.summary,
      entities: s.entities ?? [],
      company_ids: [...new Set((s.entities ?? []).map((e) => firmId(e)).filter(Boolean))],
      source_name: s.source_name,
      source_url: s.source_url,
      source: "web_research",
    }));
    const { error } = await supabase.from("signals").upsert(rows, { onConflict: "external_key" });
    if (error) return { ...EMPTY, error: `Signals: ${error.message}` };
    signals += rows.length;
  }

  await supabase.from("directory_imports").insert({
    filename: `intelligence-dataset@${data.version}`,
    stats: { teams: data.teams.length, investors: data.investors.length, deals: data.deals.length, signals: data.signals.length },
    result: { owners, linkedFirms },
    imported_by: user.id,
  });

  updateTag(INTEL_TAG);
  updateTag(DIRECTORY_TAG);
  for (const p of ["/database", "/database/sports", "/database/deals", "/database/signals", "/database/asset-classes", "/import/directory"]) revalidatePath(p);
  return { ok: true, version: data.version, teams: teamIds.size, owners, investors: investorIds.size, deals, signals, linkedFirms };
}
