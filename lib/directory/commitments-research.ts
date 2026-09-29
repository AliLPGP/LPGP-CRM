import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { isoDate, nullable, num, research, RESEARCH_RULES, slugify, str, url } from "./research";

// One limited partner's recent fund commitments, from what it publishes:
// board and investment-committee minutes, annual reports, press releases.
// Each row names the fund, the manager, the amount in the currency stated
// and the page that says so. Keyed by LP, fund and date so a re-run updates
// rather than duplicates.

const DISCLOSURE_TYPES = ["board_minutes", "investment_committee", "annual_report", "press_release", "regulatory_filing", "news", "other"];

const TOOL: Anthropic.Beta.BetaTool = {
  name: "record_commitments",
  description: "Record the LP's fund commitments the pages state. Call exactly once when done.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      commitments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fund: { type: "string" },
            manager: nullable("string"),
            amount: nullable("number"),
            currency: nullable("string"),
            amount_text: nullable("string"),
            date: nullable("string"),
            date_text: nullable("string"),
            year: nullable("integer"),
            asset_class_hint: nullable("string"),
            disclosure_type: { type: "string", enum: DISCLOSURE_TYPES },
            source_name: { type: "string" },
            source_url: { type: "string" },
          },
          required: ["fund", "manager", "amount", "currency", "amount_text", "date", "date_text", "year", "asset_class_hint", "disclosure_type", "source_name", "source_url"],
        },
      },
    },
    required: ["commitments"],
  },
};

export type LpInput = { id: string; name: string; country: string | null; type: string | null };

export type CommitmentRow = {
  external_key: string;
  lp_company_id: string;
  lp_name: string;
  gp_name: string | null;
  fund_name: string;
  amount: number | null;
  currency: string | null;
  amount_text: string | null;
  commitment_date: string | null;
  commitment_date_text: string | null;
  commitment_year: number | null;
  disclosure_type: string;
  source: "web_research";
  source_url: string;
  source_date: string | null;
};

export function commitmentKey(lp: string, fund: string, date: string | null, year: number | null): string {
  return `lpcommit:${slugify(lp)}:${slugify(fund)}:${date ?? (year != null ? String(year) : "undated")}`;
}

export async function researchCommitments(lp: LpInput, opts: { since: string; today: string; deadline?: number }): Promise<{ rows: CommitmentRow[]; error?: string; searches: number }> {
  const system = `You build the public commitment record of one limited partner for a private-markets sales team. Today is ${opts.today}. ${RESEARCH_RULES}
A commitment is the LP committing capital to a named private fund (private equity, private credit, venture, real estate, infrastructure, secondaries, hedge). Sources that state them: the LP's own board or investment-committee minutes and agendas, annual and quarterly reports, press releases, regulatory filings, and reputable trade press reporting a specific commitment. One row per fund commitment: the fund's name as published, the manager, the amount and currency as published (a plain number; "up to" amounts keep the wording in amount_text), the date or the meeting it was approved at, the disclosure type, and the page URL. Never record a target allocation, a policy range or a total programme size as a commitment.`;
  const user = `Limited partner: ${lp.name}${lp.type ? ` (${lp.type})` : ""}${lp.country ? `, ${lp.country}` : ""}.
Find its fund commitments disclosed since ${opts.since}. Plan 6–10 searches: "${lp.name} board meeting private equity commitment", "${lp.name} commits to fund ${new Date(opts.today).getUTCFullYear()}", "${lp.name} investment committee minutes private markets", "${lp.name} private credit commitment", "${lp.name} infrastructure fund commitment", plus the LP's own site for meeting materials. Record every commitment the pages state; none is a fine answer.`;
  const r = await research<{ commitments: Record<string, unknown>[] }>({ system, user, tool: TOOL, maxSearches: 12, effort: "medium", deadline: opts.deadline });
  if (!r.ok) return { rows: [], error: r.error, searches: 0 };
  const rows: CommitmentRow[] = [];
  const seen = new Set<string>();
  for (const c of Array.isArray(r.data.commitments) ? r.data.commitments : []) {
    const fund = str(c.fund, 200);
    const source_url = url(c.source_url);
    if (!fund || !source_url) continue;
    const date = isoDate(c.date);
    const year = num(c.year) ?? (date ? Number(date.slice(0, 4)) : null);
    const key = commitmentKey(lp.name, fund, date, year);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      external_key: key,
      lp_company_id: lp.id,
      lp_name: lp.name,
      gp_name: str(c.manager, 200),
      fund_name: fund,
      amount: num(c.amount),
      currency: str(c.currency, 8),
      amount_text: str(c.amount_text, 120),
      commitment_date: date,
      commitment_date_text: str(c.date_text, 80),
      commitment_year: year,
      disclosure_type: typeof c.disclosure_type === "string" && DISCLOSURE_TYPES.includes(c.disclosure_type) ? c.disclosure_type : "other",
      source: "web_research",
      source_url,
      source_date: opts.today,
    });
  }
  return { rows, searches: r.searches };
}
