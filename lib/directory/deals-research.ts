import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { AssetClass } from "./asset-classes";
import { isoDate, nullable, num, research, RESEARCH_RULES, slugify, str, url } from "./research";

// Deals for one asset class — fund closes, acquisitions, exits, stake
// sales, financings — announced since a date, each with the page that
// reports it. Keyed by target, investor and date so a re-run updates
// rather than duplicates.

const KINDS = ["stake_sale", "acquisition", "minority_investment", "debt_financing", "stadium_financing", "league_media_rights", "league_stake", "expansion_fee", "fund_close", "fundraise", "company_acquisition", "company_exit", "secondary", "other"];
const INVESTOR_TYPES = ["private_equity", "private_credit", "sovereign_wealth", "family_office", "individual", "consortium", "corporate", "institutional", "other"];
const TARGET_KINDS = ["club", "team", "league", "competition", "company", "fund", "asset", "other"];

const TOOL: Anthropic.Beta.BetaTool = {
  name: "record_deals",
  description: "Record the deals found. Call exactly once when done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      deals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: nullable("string"),
            date_text: nullable("string"),
            kind: { type: "string", enum: KINDS },
            sport: nullable("string"),
            target: { type: "string" },
            target_kind: { type: "string", enum: TARGET_KINDS },
            target_country: nullable("string"),
            investor: { type: "string" },
            investor_type: { type: "string", enum: INVESTOR_TYPES },
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
          required: ["date", "date_text", "kind", "sport", "target", "target_kind", "target_country", "investor", "investor_type", "seller", "stake_pct", "amount", "currency", "valuation", "valuation_currency", "headline", "summary", "source_name", "source_url"],
        },
      },
    },
    required: ["deals"],
  },
};

export type DealRow = {
  external_key: string;
  date: string | null;
  date_text: string | null;
  kind: string;
  asset_class: string;
  sport: string | null;
  target: string;
  target_kind: string | null;
  target_country: string | null;
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
  source: "web_research";
};

export function dealKey(target: string, investor: string, date: string | null, dateText: string | null): string {
  return `deal:${slugify(target)}:${slugify(investor)}:${date ?? slugify(dateText ?? "undated")}`;
}

export async function researchDeals(cls: AssetClass, opts: { since: string; angle: "closes" | "transactions"; today: string; deadline?: number }): Promise<{ rows: DealRow[]; error?: string; searches: number }> {
  const what =
    opts.angle === "closes"
      ? `fund closes, first closes and fundraising milestones (kind "fund_close" or "fundraise"; target = the fund, target_kind "fund", investor = the manager, amount = the size raised)`
      : cls.key === "sports"
        ? `club, team and league transactions: takeovers, stake sales, minority investments, league media-rights and league-stake deals, stadium financings, expansion fees`
        : `the most significant transactions: acquisitions, exits, take-privates, platform deals, large financings, continuation-fund and secondary deals, marquee asset sales`;
  const system = `You keep a deal ledger for a private-markets sales team. Today is ${opts.today}. ${RESEARCH_RULES}
One row per transaction (never the same deal from two outlets). Each row: date, kind, target and its kind and country, investor and type, seller, stake, amount, valuation, a factual headline, a one-sentence summary, the source name and URL.`;
  const user = `Asset class: ${cls.name}. ${cls.blurb}
Find ${what} announced since ${opts.since}, worldwide (Americas, Europe, Asia-Pacific and the Middle East). At least 15 rows if the sources support it. Plan 8–12 searches by region and by month.`;
  const r = await research<{ deals: Record<string, unknown>[] }>({ system, user, tool: TOOL, maxSearches: 14, effort: "medium", deadline: opts.deadline });
  if (!r.ok) return { rows: [], error: r.error, searches: 0 };
  const rows: DealRow[] = [];
  const seen = new Set<string>();
  for (const d of Array.isArray(r.data.deals) ? r.data.deals : []) {
    const target = str(d.target, 200);
    const investor = str(d.investor, 200);
    const headline = str(d.headline, 300);
    const source_url = url(d.source_url);
    if (!target || !investor || !headline || !source_url) continue;
    const date = isoDate(d.date);
    const date_text = str(d.date_text, 80);
    const key = dealKey(target, investor, date, date_text);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      external_key: key,
      date,
      date_text,
      kind: typeof d.kind === "string" && KINDS.includes(d.kind) ? d.kind : "other",
      asset_class: cls.key,
      sport: str(d.sport, 40),
      target,
      target_kind: typeof d.target_kind === "string" && TARGET_KINDS.includes(d.target_kind) ? d.target_kind : null,
      target_country: str(d.target_country, 80),
      investor,
      investor_type: typeof d.investor_type === "string" && INVESTOR_TYPES.includes(d.investor_type) ? d.investor_type : null,
      seller: str(d.seller, 200),
      stake_pct: num(d.stake_pct),
      amount: num(d.amount),
      currency: str(d.currency, 8),
      valuation: num(d.valuation),
      valuation_currency: str(d.valuation_currency, 8),
      headline,
      summary: str(d.summary, 600),
      source_name: str(d.source_name, 120),
      source_url,
      source: "web_research",
    });
  }
  return { rows, searches: r.searches };
}
