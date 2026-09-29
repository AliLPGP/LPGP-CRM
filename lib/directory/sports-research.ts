import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { DatasetOwner, DatasetTeam } from "./intelligence-types";
import { isoDate, nullable, num, research, RESEARCH_RULES, slugify, str, url } from "./research";

// One club, researched from the web with sources: ownership, institutional
// investors, revenue, valuation, following, stadium and the deals behind
// them. Optionally re-checked by a second pass with different searches;
// refuted figures are dropped and the verdicts kept on the record.

const OWNER_KINDS = ["individual", "family", "fund", "company", "state", "members", "other"];
const INVESTOR_TYPES = ["private_equity", "private_credit", "sovereign_wealth", "family_office", "corporate", "institutional", "other"];
const OWNERSHIP_TYPES = ["individual_family", "consortium", "private_equity", "sovereign_state", "corporate", "member_owned", "public_listed", "municipal", "other", "unknown"];
const DEAL_KINDS = ["stake_sale", "acquisition", "minority_investment", "debt_financing", "stadium_financing", "league_media_rights", "league_stake", "expansion_fee", "other"];

const CLUB_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_club",
  description: "Record the club's ownership-and-money record. Call exactly once when the research is done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      short_name: nullable("string"),
      city: nullable("string"),
      stadium: nullable("string"),
      stadium_capacity: nullable("integer"),
      stadium_capacity_source_url: nullable("string"),
      founded_year: nullable("integer"),
      website_domain: nullable("string"),
      ownership_type: { type: "string", enum: OWNERSHIP_TYPES },
      ownership_summary: { type: "string" },
      ownership_source_url: nullable("string"),
      owners: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: OWNER_KINDS },
            institutional: { type: "boolean" },
            investor_type: { anyOf: [{ type: "string", enum: INVESTOR_TYPES }, { type: "null" }] },
            stake_pct: nullable("number"),
            since_year: nullable("integer"),
            amount: nullable("number"),
            currency: nullable("string"),
            valuation_at_entry: nullable("number"),
            source_url: { type: "string" },
          },
          required: ["name", "kind", "institutional", "investor_type", "stake_pct", "since_year", "amount", "currency", "valuation_at_entry", "source_url"],
        },
      },
      revenue_amount: nullable("number"),
      revenue_currency: nullable("string"),
      revenue_season: nullable("string"),
      revenue_source_name: nullable("string"),
      revenue_source_url: nullable("string"),
      valuation_amount: nullable("number"),
      valuation_currency: nullable("string"),
      valuation_year: nullable("integer"),
      valuation_source_name: nullable("string"),
      valuation_source_url: nullable("string"),
      social_followers_total: nullable("integer"),
      social_as_of: nullable("string"),
      social_source_url: nullable("string"),
      social_platforms: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { platform: { type: "string" }, followers: { type: "integer" }, as_of: nullable("string"), source_url: { type: "string" } },
          required: ["platform", "followers", "as_of", "source_url"],
        },
      },
      deals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: nullable("string"),
            date_text: nullable("string"),
            kind: { type: "string", enum: DEAL_KINDS },
            investor: { type: "string" },
            investor_type: { type: "string", enum: [...INVESTOR_TYPES, "individual", "consortium"] },
            seller: nullable("string"),
            stake_pct: nullable("number"),
            amount: nullable("number"),
            currency: nullable("string"),
            valuation: nullable("number"),
            valuation_currency: nullable("string"),
            headline: { type: "string" },
            summary: { type: "string" },
            source_name: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["date", "date_text", "kind", "investor", "investor_type", "seller", "stake_pct", "amount", "currency", "valuation", "valuation_currency", "headline", "summary", "source_name", "source_url"],
        },
      },
      sources: { type: "array", items: { type: "string" } },
      notes: { type: "string" },
    },
    required: [
      "name", "short_name", "city", "stadium", "stadium_capacity", "stadium_capacity_source_url", "founded_year", "website_domain",
      "ownership_type", "ownership_summary", "ownership_source_url", "owners",
      "revenue_amount", "revenue_currency", "revenue_season", "revenue_source_name", "revenue_source_url",
      "valuation_amount", "valuation_currency", "valuation_year", "valuation_source_name", "valuation_source_url",
      "social_followers_total", "social_as_of", "social_source_url", "social_platforms", "deals", "sources", "notes",
    ],
  },
};

const VERIFY_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_checks",
  description: "Record the verdict on each claim. Call exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      checks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            field: { type: "string", enum: ["revenue", "valuation", "stadium_capacity", "ownership", "top_investor", "social"] },
            verdict: { type: "string", enum: ["confirmed", "refuted", "unverifiable"] },
            claimed: { type: "string" },
            found: nullable("string"),
            note: { type: "string" },
            source_url: nullable("string"),
          },
          required: ["field", "verdict", "claimed", "found", "note", "source_url"],
        },
      },
    },
    required: ["checks"],
  },
};

export type ClubInput = { name: string; league: string | null; country: string | null; city?: string | null; sport?: string | null };

type ClubRecord = Record<string, unknown> & { owners?: Record<string, unknown>[]; deals?: Record<string, unknown>[]; social_platforms?: Record<string, unknown>[]; sources?: unknown[] };

export type ClubDeal = {
  key: string;
  date: string | null;
  date_text: string | null;
  kind: string;
  investor: string;
  investor_type: string | null;
  seller: string | null;
  stake_pct: number | null;
  amount: number | null;
  currency: string | null;
  valuation: number | null;
  valuation_currency: string | null;
  headline: string;
  summary: string | null;
  source_name: string | null;
  source_url: string;
};

export type ClubResearch = { team: Omit<DatasetTeam, "key">; deals: ClubDeal[]; searches: number };

/** A club request's fields, each checked and capped; null when the name is missing. */
export function clubInput(v: unknown): ClubInput | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  const name = str(c.name, 200);
  if (!name) return null;
  return { name, league: str(c.league, 80), country: str(c.country, 80), city: str(c.city, 80), sport: str(c.sport, 40) };
}

export async function researchClub(input: ClubInput, opts: { verify?: boolean; today: string; deadline?: number } = { today: new Date().toISOString().slice(0, 10) }): Promise<{ ok: true; data: ClubResearch } | { ok: false; error: string }> {
  const where = [input.league, input.country].filter(Boolean).join(", ");
  const system = `You build the ownership-and-money record of one football club for a private-markets sales team. Today is ${opts.today}. ${RESEARCH_RULES}
Cover: official and short name; city, stadium and capacity; founded year; website domain; ownership type and a one-to-two sentence summary; owners (people, families, companies, states, members) with stakes where stated; institutional investors (mark institutional true: private equity, private credit, sovereign wealth, family office, corporate or other institutional holders) with stake, entry year and terms; revenue for the latest season a source states (club accounts, or the Deloitte Football Money League); valuation (Forbes or Sportico, with year); social following (a total across platforms where one source states it, and per platform where stated); every investment transaction since 2015 you can source (takeover, stake sale, minority investment, major debt or stadium financing).`;
  const user = `Club: ${input.name}${where ? ` (${where})` : ""}${input.city ? `, ${input.city}` : ""}.
Plan 8–14 searches: "${input.name} owner", "${input.name} stake sale private equity", "${input.name} revenue 2024-25 accounts", "${input.name} Deloitte Football Money League 2026", "${input.name} valuation Forbes 2025", "${input.name} social media followers", "${input.name} stadium capacity".`;
  const r = await research<ClubRecord>({ system, user, tool: CLUB_TOOL, maxSearches: 14, effort: "medium", deadline: opts.deadline });
  if (!r.ok) return r;
  const c = r.data;

  let verification: DatasetTeam["verification"] = [];
  let topInvestor: string | null = null;
  if (opts.verify) {
    const claims: string[] = [];
    if (num(c.revenue_amount) != null) claims.push(`revenue: ${c.revenue_amount} ${c.revenue_currency} for ${c.revenue_season}`);
    if (num(c.valuation_amount) != null) claims.push(`valuation: ${c.valuation_amount} ${c.valuation_currency} in ${c.valuation_year}`);
    if (num(c.stadium_capacity) != null) claims.push(`stadium_capacity: ${c.stadium} ${c.stadium_capacity}`);
    claims.push(`ownership: ${c.ownership_type} — ${c.ownership_summary}`);
    const inst = (c.owners ?? []).find((o) => o.institutional === true);
    if (inst) {
      topInvestor = str(inst.name, 200);
      claims.push(`top_investor: ${inst.name} (${inst.investor_type}) stake ${inst.stake_pct}% since ${inst.since_year}`);
    }
    if (num(c.social_followers_total) != null) claims.push(`social: total followers ${c.social_followers_total} as of ${c.social_as_of}`);
    const v = await research<{ checks: DatasetTeam["verification"] }>({
      system: `You are a sceptical fact-checker. ${RESEARCH_RULES} For each claim run your own searches with different queries and decide: confirmed (an independent page states the same figure or fact, allowing rounding and currency presentation), refuted (a credible page states a materially different figure or fact — give it in found, with its URL), or unverifiable. A figure for a different season, or a valuation from a different publisher or year, is not a refutation. Default to unverifiable when unsure.`,
      user: `Club: ${input.name} (${where}). Claims:\n${claims.map((x) => `- ${x}`).join("\n")}`,
      tool: VERIFY_TOOL,
      maxSearches: 8,
      effort: "low",
      deadline: opts.deadline,
    });
    // Verdicts are stored on the record and rendered on the profile, so
    // they get the same checks as every other field the model returns.
    if (v.ok && Array.isArray(v.data.checks)) {
      verification = v.data.checks
        .filter((k) => k && typeof k === "object" && str(k.field) && str(k.verdict))
        .map((k) => ({ field: str(k.field, 40)!, verdict: str(k.verdict, 20)!, claimed: str(k.claimed, 300) ?? "", found: str(k.found, 300), note: str(k.note, 600) ?? "", source_url: url(k.source_url) }));
    }
  }
  // A refuted claim takes everything that hung on it with it: the figure,
  // its currency, season, year and page; a refuted ownership summary, the
  // owner rows it described; a refuted top investor, that investor's row.
  const refuted = new Set(verification.filter((k) => k.verdict === "refuted").map((k) => k.field));
  const keep = (field: string) => !refuted.has(field);

  const owners: DatasetOwner[] = (c.owners ?? [])
    .filter((o) => str(o.name))
    .filter((o) => keep("ownership") || o.institutional === true)
    .filter((o) => keep("top_investor") || !topInvestor || str(o.name, 200)!.toLowerCase() !== topInvestor.toLowerCase())
    .map((o) => ({
      name: str(o.name, 200)!,
      kind: str(o.kind, 20),
      institutional: o.institutional === true,
      investor_type: str(o.investor_type, 30),
      stake_pct: num(o.stake_pct),
      since_year: num(o.since_year),
      amount: num(o.amount),
      currency: str(o.currency, 8),
      valuation_at_entry: num(o.valuation_at_entry),
      source_url: url(o.source_url),
    }));
  const name = str(c.name, 200) ?? input.name;
  // One row per key: two undated rows for the same investor would otherwise
  // collide in the upsert and lose every deal of the club.
  const dealKeys = new Set<string>();
  const deals: ClubDeal[] = (c.deals ?? [])
    .filter((d) => str(d.headline) && url(d.source_url) && str(d.investor))
    .filter((d) => {
      const key = `deal:${slugify(name)}:${slugify(str(d.investor)!)}:${isoDate(d.date) ?? slugify(str(d.date_text) ?? "undated")}`;
      if (dealKeys.has(key)) return false;
      dealKeys.add(key);
      return true;
    })
    .map((d) => ({
      key: `deal:${slugify(name)}:${slugify(str(d.investor)!)}:${isoDate(d.date) ?? slugify(str(d.date_text) ?? "undated")}`,
      date: isoDate(d.date),
      date_text: str(d.date_text, 80),
      kind: typeof d.kind === "string" && DEAL_KINDS.includes(d.kind) ? d.kind : "other",
      investor: str(d.investor, 200)!,
      investor_type: str(d.investor_type, 30),
      seller: str(d.seller, 200),
      stake_pct: num(d.stake_pct),
      amount: num(d.amount),
      currency: str(d.currency, 8),
      valuation: num(d.valuation),
      valuation_currency: str(d.valuation_currency, 8),
      headline: str(d.headline, 300)!,
      summary: str(d.summary, 600),
      source_name: str(d.source_name, 120),
      source_url: url(d.source_url)!,
    }));

  const team: Omit<DatasetTeam, "key"> = {
    name,
    short_name: str(c.short_name, 80),
    sport: input.sport ?? "football",
    league: input.league,
    country: input.country,
    city: str(c.city, 80) ?? input.city ?? null,
    stadium: str(c.stadium, 120),
    stadium_capacity: keep("stadium_capacity") ? num(c.stadium_capacity) : null,
    stadium_capacity_source_url: keep("stadium_capacity") ? url(c.stadium_capacity_source_url) : null,
    founded_year: num(c.founded_year),
    domain: str(c.website_domain, 120),
    ownership_type: keep("ownership") ? (str(c.ownership_type, 30) ?? "unknown") : "unknown",
    ownership_summary: keep("ownership") ? str(c.ownership_summary, 800) : null,
    ownership_source_url: keep("ownership") ? url(c.ownership_source_url) : null,
    revenue: keep("revenue") ? num(c.revenue_amount) : null,
    revenue_currency: keep("revenue") ? str(c.revenue_currency, 8) : null,
    revenue_season: keep("revenue") ? str(c.revenue_season, 40) : null,
    revenue_source_name: keep("revenue") ? str(c.revenue_source_name, 160) : null,
    revenue_source_url: keep("revenue") ? url(c.revenue_source_url) : null,
    valuation: keep("valuation") ? num(c.valuation_amount) : null,
    valuation_currency: keep("valuation") ? str(c.valuation_currency, 8) : null,
    valuation_year: keep("valuation") ? num(c.valuation_year) : null,
    valuation_source_name: keep("valuation") ? str(c.valuation_source_name, 160) : null,
    valuation_source_url: keep("valuation") ? url(c.valuation_source_url) : null,
    social_followers: keep("social") ? num(c.social_followers_total) : null,
    social_as_of: keep("social") ? str(c.social_as_of, 40) : null,
    social_source_url: keep("social") ? url(c.social_source_url) : null,
    social_platforms: (c.social_platforms ?? [])
      .filter((p) => str(p.platform) && num(p.followers) != null)
      .map((p) => ({ platform: str(p.platform, 40)!, followers: num(p.followers)!, as_of: str(p.as_of, 40), source_url: url(p.source_url) })),
    notes: str(c.notes, 1500),
    sources: (c.sources ?? []).map((u) => url(u)).filter((u): u is string => Boolean(u)).slice(0, 40),
    verification,
    owners,
  };
  return { ok: true, data: { team, deals, searches: r.searches } };
}
