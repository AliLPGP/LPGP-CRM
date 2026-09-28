"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { getSessionUser } from "../auth";
import { CATEGORIES } from "../categories";
import { ALL_COUNTRIES, SUBREGIONS, ZONES } from "./geo";
import { getDirectoryIndex } from "./index-server";
import { PROVIDER_ROLES } from "./providers";
import type { AiReading } from "./thesis";

// Optional AI reading of a Discover thesis. The rule-based parser in
// lib/directory/thesis.ts answers instantly and always runs first; when
// ANTHROPIC_API_KEY is set, Claude re-reads the same sentence into the same
// filter shape, which catches phrasings the rules don't. The model only ever
// chooses filter values — it never names firms that aren't in the question.

const MODEL = "claude-opus-5-5";

const LP_TYPES = CATEGORIES.LP.subTypes;
const GP_TYPES = CATEGORIES.GP.subTypes;
const SP_TYPES = CATEGORIES.SP.subTypes;
const ALL_TYPES = [...new Set([...LP_TYPES, ...GP_TYPES, ...SP_TYPES])] as [string, ...string[]];

const Reading = z.object({
  books: z.array(z.enum(["LP", "GP", "SP", "UN"])),
  types: z.array(z.enum(ALL_TYPES)),
  serves_types: z.array(z.enum(GP_TYPES as [string, ...string[]])),
  zones: z.array(z.enum(ZONES as [string, ...string[]])),
  regions: z.array(z.enum(SUBREGIONS as [string, ...string[]])),
  countries: z.array(z.string()),
  us_states: z.array(z.string()),
  cities: z.array(z.string()),
  aum_min_usd: z.number().nullable(),
  aum_max_usd: z.number().nullable(),
  employees_min: z.number().nullable(),
  employees_max: z.number().nullable(),
  founded_min: z.number().nullable(),
  founded_max: z.number().nullable(),
  adv: z.array(z.enum(["Registered", "ERA", "None"])),
  providers: z.array(
    z.object({
      name: z.string(),
      role: z.enum(["any", ...PROVIDER_ROLES]),
    }),
  ),
  similar_to: z.array(z.string()),
  has_contacts: z.boolean(),
  has_email: z.boolean(),
  discloses_commitments: z.boolean(),
  keywords: z.string(),
  sort: z.enum(["aum", "employees", "founded", "name"]).nullable(),
  explanation: z.string(),
});

function systemPrompt(brands: string[]): string {
  return `You turn a sales team's plain-English search into filters for LPGP Connect's private-markets directory. The directory holds four books of firms:
- LP: limited partners / institutional investors (pensions, sovereign wealth funds, insurers, endowments, foundations, family offices, consultants, DFIs).
- GP: general partners / fund managers (private equity, venture, growth, private credit, real estate, infrastructure, hedge funds, secondaries).
- SP: solution providers to the industry (fund administrators, auditors, law firms, banks, placement agents, technology vendors, consultants).
- UN: firms not yet classified.

Fill the filter fields from the search. Leave a field empty (empty array, null, false or "") unless the search asks for it.

- books: which books the search is about. A type implies its book ("pension funds" means LP).
- types: firm types, only from these lists. LP: ${LP_TYPES.join("; ")}. GP: ${GP_TYPES.join("; ")}. SP: ${SP_TYPES.join("; ")}.
- serves_types: when the search asks for providers that work for a kind of manager ("administrators serving venture firms", "auditors to hedge funds"), put the manager type here and the provider type in types.
- zones: Americas, EMEA or APAC, only when a whole zone is named. regions: ${SUBREGIONS.join(", ")}. countries: English country names from this list: ${ALL_COUNTRIES.join(", ")}. us_states: two-letter codes. cities: as named ("New York", "London"); "Bay Area" means San Francisco, Menlo Park, Palo Alto and San Mateo.
- aum_min_usd / aum_max_usd: assets under management in US dollars, only when a size is stated ("$1bn+" is 1000000000 minimum). Read "emerging managers" as at most 1000000000. employees_min / employees_max: headcount. founded_min / founded_max: years.
- adv: "Registered" for SEC-registered advisers, "ERA" for exempt reporting advisers, "None" for firms without a Form ADV filing, only when asked.
- providers: when the search wants firms that use a named service provider, one entry per provider with the role it is used in (auditor, administrator, custodian, prime_broker, placement_agent) or "any". Spell known providers as in this list: ${brands.join("; ")}.
- similar_to: firm names the search asks to find lookalikes of ("firms like Ares").
- has_contacts: the search wants firms with named key contacts. has_email: with a direct email on file. discloses_commitments: LPs that publish their fund commitments.
- keywords: the topical words no field above can express, such as a sector or a niche ("healthcare", "NAV finance", "impact"). Leave out words the fields already capture.
- sort: "aum" when the search asks for the largest or top firms.
- explanation: one short sentence saying how you read the search, for the person who typed it.`;
}

export type AiThesisResult = { ok: true; reading: AiReading } | { ok: false; error: string };

export async function interpretThesisWithAi(query: string): Promise<AiThesisResult> {
  if (!(await getSessionUser())) return { ok: false, error: "Not signed in" };
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, error: "AI search isn't configured" };
  const text = query.trim().slice(0, 600);
  if (!text) return { ok: false, error: "Nothing to read" };

  const index = await getDirectoryIndex();
  const brands = [...index.brands]
    .sort((a, b) => b.clients - a.clients)
    .slice(0, 150)
    .map((b) => b.name);

  const client = new Anthropic({ timeout: 25_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // A declined request is re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Reading) },
      system: [{ type: "text", text: systemPrompt(brands), cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: text }],
    });
    if (response.stop_reason === "refusal") return { ok: false, error: "The AI declined this search" };
    if (!response.parsed_output) return { ok: false, error: "The AI reply couldn't be read" };
    return { ok: true, reading: response.parsed_output as AiReading };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "AI search is busy — try again shortly" };
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected" };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `AI search failed (${error.status ?? "network"})` };
    return { ok: false, error: "AI search is unavailable" };
  }
}
