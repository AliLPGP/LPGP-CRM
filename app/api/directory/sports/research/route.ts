import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { firmMatcher } from "@/lib/directory/firm-match";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { normDomain, normName } from "@/lib/directory/normalize";
import { deadlineAfter, OUT_OF_TIME, slugify, timeLeft } from "@/lib/directory/research";
import { clubInput, researchClub, type ClubInput } from "@/lib/directory/sports-research";
import { getAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/paged";

// Research one club (from its profile) or several (admin bulk) with web
// search on the server, and save the record with its sources. A team row
// that already exists is updated in place; its owners are replaced by the
// new record; deals are keyed and upserted. Any member may research one
// club that is already on file; adding clubs from free text, and bulk runs,
// are for admins — each club is a minute of paid searching.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });

  let body: { teamIds?: unknown; clubs?: unknown; verify?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const teamIds = Array.isArray(body.teamIds) ? [...new Set(body.teamIds.filter((v): v is string => typeof v === "string"))].slice(0, 20) : [];
  const clubs = Array.isArray(body.clubs) ? body.clubs.map(clubInput).filter((c): c is ClubInput => c !== null).slice(0, 20) : [];
  if (!teamIds.length && !clubs.length) return NextResponse.json({ error: "Nothing to research" }, { status: 400 });
  if (user.role !== "admin") {
    if (clubs.length) return NextResponse.json({ error: "Only admins can add clubs by name." }, { status: 403 });
    if (teamIds.length > 1) return NextResponse.json({ error: "Only admins can research clubs in bulk." }, { status: 403 });
  }
  const verify = body.verify === true;

  type Existing = { id: string; external_key: string | null; name: string; league: string | null; country: string | null; city: string | null; sport: string };
  const existing: Existing[] = [];
  if (teamIds.length) {
    const { data } = await supabase.from("sports_teams").select("id, external_key, name, league, country, city, sport").in("id", teamIds);
    existing.push(...((data as Existing[]) ?? []));
  }
  const inputs: { input: ClubInput; existing: Existing | null }[] = [
    ...existing.map((e) => ({ input: { name: e.name, league: e.league, country: e.country, city: e.city, sport: e.sport }, existing: e })),
    ...clubs.map((c) => ({ input: c, existing: null })),
  ];

  const firmId = await firmMatcher(supabase);
  const today = new Date().toISOString().slice(0, 10);
  const deadline = deadlineAfter(270_000);
  const results: { name: string; ok: boolean; error?: string; teamId?: string; deals?: number; searches?: number }[] = [];

  try {
    // Two at a time: each is a minute or so of searching. Clubs the time
    // limit doesn't reach are reported so the caller can send them again.
    for (let i = 0; i < inputs.length; i += 2) {
      const batch = inputs.slice(i, i + 2);
      if (timeLeft(deadline) < 45_000) {
        results.push(...batch.map(({ input }) => ({ name: input.name, ok: false, error: OUT_OF_TIME })));
        continue;
      }
      const outcomes = await Promise.all(batch.map(({ input }) => researchClub(input, { verify, today, deadline })));
      for (let j = 0; j < batch.length; j++) {
        const { input, existing: ex } = batch[j];
        const r = outcomes[j];
        if (!r.ok) {
          results.push({ name: input.name, ok: false, error: r.error });
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
              added_by: user.id,
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
      }
    }
  } finally {
    if (results.some((r) => r.teamId)) {
      revalidateTag(INTEL_TAG, { expire: 0 });
      revalidateTag(DIRECTORY_TAG, { expire: 0 });
    }
  }
  return NextResponse.json({ ok: true, researched: results.filter((r) => r.ok).length, results });
}
