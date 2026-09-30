import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// A GP's portfolio companies, read by Claude from the manager's own website
// and public press — each company with the page that states it. Nothing is
// taken from memory: a company goes in only when a page fetched or found in
// this run names it as this manager's investment, and years or exit status
// are filled only when that page says so.

const MODEL = "claude-opus-5-5";

export type ResearchedCompany = {
  name: string;
  website: string | null;
  description: string | null;
  sector: string | null;
  hq: string | null;
  status: "current" | "realized" | "unknown";
  invested_year: number | null;
  exit_year: number | null;
  fund_name: string | null;
  source_url: string;
  /** The transaction value a page states, in its currency, with what the figure is. */
  deal_value: number | null;
  deal_currency: string | null;
  deal_value_basis: "enterprise_value" | "equity_value" | "stake_price" | "unspecified" | null;
  /** The sponsor's own equity and stake, only when a page states them. */
  equity_invested: number | null;
  stake_pct: number | null;
  co_investors: string[];
  deal_source_url: string | null;
};

export type PortfolioResearch =
  | { ok: true; companies: ResearchedCompany[]; note: string }
  | { ok: false; error: string };

const nullable = (type: "string" | "integer" | "number") => ({ anyOf: [{ type }, { type: "null" }] });

const RECORD_TOOL: Anthropic.Beta.BetaTool = {
  name: "record_portfolio",
  description:
    "Record the manager's portfolio companies once the research is done. Call exactly once, with every company a fetched or found page names as this manager's investment.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      companies: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            website: nullable("string"),
            description: nullable("string"),
            sector: nullable("string"),
            hq: nullable("string"),
            status: { type: "string", enum: ["current", "realized", "unknown"] },
            invested_year: nullable("integer"),
            exit_year: nullable("integer"),
            fund_name: nullable("string"),
            source_url: { type: "string" },
            deal_value: nullable("number"),
            deal_currency: nullable("string"),
            deal_value_basis: { anyOf: [{ type: "string", enum: ["enterprise_value", "equity_value", "stake_price", "unspecified"] }, { type: "null" }] },
            equity_invested: nullable("number"),
            stake_pct: nullable("number"),
            co_investors: { type: "array", items: { type: "string" } },
            deal_source_url: nullable("string"),
          },
          required: [
            "name", "website", "description", "sector", "hq", "status",
            "invested_year", "exit_year", "fund_name", "source_url",
            "deal_value", "deal_currency", "deal_value_basis", "equity_invested", "stake_pct", "co_investors", "deal_source_url",
          ],
        },
      },
      note: { type: "string" },
    },
    required: ["companies", "note"],
  },
};

const SYSTEM = `You research the portfolio companies of private-markets fund managers for a sales team's CRM.

Work from sources, never memory:
1. Start with the manager's own website: find its portfolio / investments page(s) and fetch them. Follow pagination or sector tabs if the page splits the list.
2. If the site has no usable list, search recent press releases announcing this manager's investments or exits.
3. Include a company only when a page you fetched or a search result you saw in this conversation states it is (or was) this manager's portfolio company. Do not include the manager's funds, its limited partners, or companies of a different firm with a similar name.
4. For each company give source_url: the exact page that names it. Fill website, sector, HQ, description (one short sentence), fund name, investment year and exit year only when a source states them; otherwise null. status is "realized" only when the source marks it exited or realized, "current" only when it is listed as current/active, else "unknown".
5. What the manager paid: when a page you fetched or a search result you saw states the money behind the investment, record it. deal_value is the transaction value in full units (2500000000, not "2.5bn") with deal_currency as an ISO code and deal_value_basis saying what the figure is: enterprise_value when the page says enterprise value or "valued the company at", equity_value when it says equity value, stake_price when it is the price paid for a stake, unspecified when the page gives a number without saying. equity_invested only when a page states the sponsor's own equity cheque; stake_pct only when a page states the percentage held; co_investors as named. deal_source_url is the page that states the money (a press release, a deal announcement, a reputable news report). Never estimate, convert currencies, or infer a value from a fund size.
6. Large managers: a site can list several hundred companies. Fetch every sector or region page and every page of the list; record all of them, up to 400, current holdings first.

When done, call record_portfolio once. Put anything the team should know (e.g. "site lists only current holdings", "no public portfolio page") in note.`;

export async function researchPortfolio(firm: { name: string; domain: string | null; country?: string | null }): Promise<PortfolioResearch> {
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "Portfolio research needs ANTHROPIC_API_KEY." };
  const client = new Anthropic({ timeout: 240_000, maxRetries: 1 });
  const ask = `Manager: ${firm.name}${firm.domain ? `\nWebsite: https://${firm.domain}` : ""}${firm.country ? `\nHeadquarters: ${firm.country}` : ""}\n\nFind this manager's portfolio companies.`;
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: ask }];

  try {
    for (let turn = 0; turn < 12; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 32000,
        // A declined request is re-run on Anthropic's recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 10 },
          { type: "web_fetch_20260209", name: "web_fetch", max_uses: 20, max_content_tokens: 40_000 },
          RECORD_TOOL,
        ],
        messages,
      });

      const record = response.content.find(
        (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use" && b.name === "record_portfolio",
      );
      if (record) {
        const input = record.input as { companies?: ResearchedCompany[]; note?: string };
        const companies = (Array.isArray(input.companies) ? input.companies : [])
          .filter((c) => c && typeof c.name === "string" && c.name.trim() && typeof c.source_url === "string" && /^https?:\/\//.test(c.source_url))
          .map((c) => ({ ...c, co_investors: Array.isArray(c.co_investors) ? c.co_investors.filter((x) => typeof x === "string") : [] }))
          .slice(0, 400);
        return { ok: true, companies, note: typeof input.note === "string" ? input.note : "" };
      }
      if (response.stop_reason === "refusal") return { ok: false, error: "The research was declined." };
      // A long server-tool turn pauses; hand it back to carry on.
      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: "Call record_portfolio now with what the sources support (an empty list is fine)." });
      }
    }
    return { ok: false, error: "The research didn't finish — try again." };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Research is busy — try again shortly." };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `Research failed (${error.status ?? "network"}).` };
    return { ok: false, error: "Research is unavailable." };
  }
}
