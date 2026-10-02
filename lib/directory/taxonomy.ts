// The desk's taxonomy, at the level a private-markets data product sells:
// investor, manager and provider types; the industries a fund names; the
// regions it targets; the size bands a search is cut by; the vocabulary of
// an investor's forward plans. Asset classes and strategies live beside this
// in asset-classes.ts and strategies.ts.
//
// Every classifier here reads words the record already carries — the
// directory's own type, a fund's legal name, a firm's overview, a stated
// geographic focus — and places nothing those words do not say. A firm the
// vocabulary cannot place keeps a null code, never a guess.
//
// Pure module: safe on the client.

import type { Category } from "../types";
import { canonicalCountry, subregionOf, type Subregion } from "./geo";

// --- Investor types (LPs) ------------------------------------------------------

export type InvestorTypeGroup = "Pensions" | "Insurance" | "Endowments & foundations" | "Sovereign & government" | "Banks & asset managers" | "Family offices & wealth" | "Fund of funds & consultants" | "Other";

export type InvestorType = {
  code: string;
  name: string;
  group: InvestorTypeGroup;
  /** Directory sub-types that mean this type. */
  subTypes: string[];
  /** Words in a firm's name or overview that mean this type, when its sub-type is blank. */
  re: RegExp | null;
};

const IT = (code: string, name: string, group: InvestorTypeGroup, subTypes: string[], re: RegExp | null = null): InvestorType => ({ code, name, group, subTypes, re });

export const INVESTOR_TYPES: InvestorType[] = [
  IT("public_pension", "Public pension fund", "Pensions", ["Public pension fund", "Pension fund"], /\b(public\s+(employees?|pension|retirement)|retirement\s+system|state\s+(pension|retirement|teachers)|teachers'?\s+retirement|county\s+(employees|retirement)|municipal\s+(pension|retirement)|local\s+government\s+pension|LGPS)\b/i),
  IT("private_pension", "Private sector pension fund", "Pensions", ["Corporate pension fund"], /\b(corporate\s+pension|company\s+pension|pension\s+(scheme|trust)\s+of|staff\s+pension)\b/i),
  IT("superannuation", "Superannuation scheme", "Pensions", ["Superannuation scheme"], /\bsuper(annuation)?\b/i),
  IT("insurance", "Insurance company", "Insurance", ["Insurance company"], /\b(insurance|assurance|insurer|reinsurance|mutual\s+life)\b/i),
  IT("endowment", "Endowment plan", "Endowments & foundations", ["Endowment"], /\b(endowment|university\s+(fund|investment)|college\s+(fund|investment)|management\s+company\s+of\s+the\s+university)\b/i),
  IT("foundation", "Foundation", "Endowments & foundations", ["Foundation"], /\b(foundation|charitable\s+trust|charity|trust\s+for)\b/i),
  IT("sovereign_wealth", "Sovereign wealth fund", "Sovereign & government", ["Sovereign wealth fund"], /\b(sovereign\s+wealth|investment\s+authority|investment\s+corporation\s+of|future\s+fund|wealth\s+fund|national\s+(investment|wealth)\s+fund)\b/i),
  IT("government_agency", "Government agency", "Sovereign & government", ["Government agency"], /\b(government\s+(agency|of)|ministry|public\s+investment\s+fund|state[\s-]owned)\b/i),
  IT("dfi", "Development finance institution", "Sovereign & government", ["Development finance institution"], /\b(development\s+(finance|bank|corporation)|DFI\b|investment\s+fund\s+for\s+developing|IFC\b|EBRD|EIB\b)\b/i),
  IT("bank", "Bank", "Banks & asset managers", ["Bank"], /\b(bank|banque|banca|sparkasse|credit\s+union)\b/i),
  IT("investment_bank", "Investment bank", "Banks & asset managers", [], /\b(investment\s+bank|securities\s+(firm|company)|merchant\s+bank)\b/i),
  IT("asset_manager", "Asset manager", "Banks & asset managers", ["Asset manager"], /\b(asset\s+management|investment\s+management|investment\s+managers?|fund\s+management)\b/i),
  IT("wealth_manager", "Wealth manager", "Family offices & wealth", [], /\b(wealth\s+management|private\s+bank(ing)?|wealth\s+advisors?)\b/i),
  IT("single_family_office", "Family office (single)", "Family offices & wealth", ["Family office"], /\b(single[\s-]family\s+office|family\s+office|family\s+investment\s+(office|company))\b/i),
  IT("multi_family_office", "Family office (multi)", "Family offices & wealth", ["Multi-family office"], /\bmulti[\s-]family\s+office\b/i),
  IT("fund_of_funds", "Fund of funds manager", "Fund of funds & consultants", ["Fund of funds"], /\b(fund\s+of\s+funds|funds?\s+of\s+funds|FoF\b)\b/i),
  IT("investment_consultant", "Investment consultant", "Fund of funds & consultants", ["Investment consultant"], /\b(investment\s+consult(ant|ing|ants)|OCIO|outsourced\s+(CIO|chief\s+investment)|fiduciary\s+manag)\b/i),
  IT("corporate_investor", "Corporate investor", "Other", [], /\b(corporate\s+(investor|venture|ventures)|group\s+treasury)\b/i),
  IT("investment_company", "Investment company / trust", "Other", [], /\b(investment\s+(company|trust)|listed\s+investment)\b/i),
  IT("other_investor", "Other investor", "Other", ["Other"], null),
];

export const INVESTOR_TYPE_BY_CODE: Record<string, InvestorType> = Object.fromEntries(INVESTOR_TYPES.map((t) => [t.code, t]));

export const INVESTOR_TYPE_GROUPS: InvestorTypeGroup[] = ["Pensions", "Insurance", "Endowments & foundations", "Sovereign & government", "Banks & asset managers", "Family offices & wealth", "Fund of funds & consultants", "Other"];

// --- Manager types (GPs) --------------------------------------------------------

export type ManagerType = { code: string; name: string; subTypes: string[]; classKeys: string[] };

const MT = (code: string, name: string, subTypes: string[], classKeys: string[]): ManagerType => ({ code, name, subTypes, classKeys });

export const MANAGER_TYPES: ManagerType[] = [
  MT("private_equity_firm", "Private equity firm", ["Private equity", "Growth equity"], ["private_equity"]),
  MT("venture_capital_firm", "Venture capital firm", ["Venture capital"], ["venture_capital"]),
  MT("private_debt_firm", "Private debt firm", ["Private credit"], ["private_credit"]),
  MT("real_estate_firm", "Real estate firm", ["Real estate"], ["real_estate"]),
  MT("infrastructure_firm", "Infrastructure firm", ["Infrastructure"], ["infrastructure"]),
  MT("natural_resources_firm", "Natural resources firm", ["Natural resources", "Real assets"], ["natural_resources", "infrastructure"]),
  MT("fund_of_funds_manager", "Fund of funds / secondaries manager", ["Fund of funds & secondaries"], ["secondaries"]),
  MT("hedge_fund_manager", "Hedge fund manager", ["Hedge fund"], ["hedge_funds"]),
  MT("multi_asset_manager", "Multi-asset alternatives manager", ["Multi-asset alternatives", "Alternative asset manager", "Asset manager"], []),
  MT("family_office_gp", "Family office (direct investor)", ["Family office"], []),
  MT("bank_gp", "Bank / development finance", ["Bank", "Development finance"], []),
  MT("other_manager", "Other manager", ["Other"], []),
];

export const MANAGER_TYPE_BY_CODE: Record<string, ManagerType> = Object.fromEntries(MANAGER_TYPES.map((t) => [t.code, t]));

// --- Provider types (SPs) --------------------------------------------------------

export type ProviderType = { code: string; name: string; subTypes: string[]; /** Form ADV roles this type files under, if any. */ roles: string[] };

const PT = (code: string, name: string, subTypes: string[], roles: string[] = []): ProviderType => ({ code, name, subTypes, roles });

export const PROVIDER_TYPES: ProviderType[] = [
  PT("fund_administrator", "Fund administrator", ["Fund administrator"], ["administrator"]),
  PT("auditor", "Auditor", ["Audit & advisory"], ["auditor"]),
  PT("custodian", "Custodian / depositary", [], ["custodian"]),
  PT("prime_broker", "Prime broker", [], ["prime_broker"]),
  PT("law_firm", "Law firm", ["Law firm"]),
  PT("placement_agent", "Placement agent", ["Placement agent"], ["placement_agent", "marketer"]),
  PT("bank", "Bank / lender", ["Bank"]),
  PT("investment_consultant", "Investment consultant", ["Consulting"]),
  PT("technology_vendor", "Technology vendor", ["Technology vendor"]),
  PT("data_research", "Data, research & ratings", ["Research & analytics", "Valuation & ratings"]),
  PT("fx_treasury", "FX & treasury", ["FX & treasury"]),
  PT("talent", "Talent & executive search", ["Talent & search"]),
  PT("industry_body", "Industry body", ["Industry body"]),
];

export const PROVIDER_TYPE_BY_CODE: Record<string, ProviderType> = Object.fromEntries(PROVIDER_TYPES.map((t) => [t.code, t]));

/** The type code a directory record carries, by its book and sub-type; a
 *  blank sub-type falls back to the firm's own words for LPs only. */
export function typeCodeOf(category: Category, subType: string | null | undefined, text?: string | null): string | null {
  if (category === "LP") {
    if (subType) {
      const t = INVESTOR_TYPES.find((x) => x.subTypes.includes(subType));
      if (t) return t.code;
    }
    if (text) {
      for (const t of INVESTOR_TYPES) if (t.re && t.re.test(text)) return t.code;
    }
    return null;
  }
  if (category === "GP") {
    if (!subType) return null;
    return MANAGER_TYPES.find((x) => x.subTypes.includes(subType))?.code ?? null;
  }
  if (category === "SP") {
    if (!subType) return null;
    return PROVIDER_TYPES.find((x) => x.subTypes.includes(subType))?.code ?? null;
  }
  return null;
}

export function typeNameOf(category: Category, code: string | null | undefined): string | null {
  if (!code) return null;
  if (category === "LP") return INVESTOR_TYPE_BY_CODE[code]?.name ?? null;
  if (category === "GP") return MANAGER_TYPE_BY_CODE[code]?.name ?? null;
  if (category === "SP") return PROVIDER_TYPE_BY_CODE[code]?.name ?? null;
  return null;
}

// --- Industries ---------------------------------------------------------------------
// Core industry → industry focus. A fund or firm names an industry in its
// legal name or overview; nothing is placed from a sector a deal happened in.

export type IndustryFocus = { code: string; name: string; re: RegExp };
export type Industry = { code: string; name: string; re: RegExp; focus: IndustryFocus[] };

const F = (code: string, name: string, re: RegExp): IndustryFocus => ({ code, name, re });

export const INDUSTRIES: Industry[] = [
  {
    code: "financial_services", name: "Financial & insurance services",
    re: /\b(financial\s+(services|institutions|sector)|fintech|insurance|insurtech|banking|payments|asset\s+management\s+(sector|businesses)|wealth\s+management\s+(sector|businesses)|brokerage|lending\s+businesses)\b/i,
    focus: [
      F("fs_banks", "Commercial banks", /\b(commercial\s+banks?|community\s+banks?|regional\s+banks?|depositor)/i),
      F("fs_investment_banking", "Investment banking", /\b(investment\s+banking|capital\s+markets\s+firms?)\b/i),
      F("fs_insurance", "Insurance", /\b(insurance|insurtech|insurers?|reinsurance|underwriters?)\b/i),
      F("fs_brokerages", "Brokerages & exchanges", /\b(brokerages?|broker[\s-]dealers?|exchanges?|trading\s+platforms?)\b/i),
      F("fs_mortgage", "Mortgage & consumer finance", /\b(mortgage|consumer\s+finance|consumer\s+lending|specialty\s+lenders?)\b/i),
      F("fs_fintech", "Fintech & payments", /\b(fintech|payments?|paytech|regtech|wealthtech)\b/i),
      F("fs_asset_management", "Asset & wealth management", /\b(asset\s+managers?|wealth\s+managers?|fund\s+administrat|RIAs?\b)/i),
    ],
  },
  {
    code: "healthcare", name: "Healthcare",
    re: /\b(health\s*care|health|medical|life\s+sciences?|pharma(ceutical)?s?|biotech(nology)?|medtech|dental|clinics?|hospitals?)\b/i,
    focus: [
      F("hc_services", "Healthcare services", /\b(healthcare\s+services|providers?|clinics?|hospitals?|physician|dental|behavioral|home\s+health)\b/i),
      F("hc_pharma", "Pharmaceuticals", /\b(pharma(ceutical)?s?|drug|CDMO|generics)\b/i),
      F("hc_biotech", "Biotechnology", /\b(biotech(nology)?|biopharma|therapeutics|genomics)\b/i),
      F("hc_medtech", "Medical devices & medtech", /\b(medical\s+devices?|medtech|diagnostics|instruments)\b/i),
      F("hc_health_it", "Healthcare IT", /\b(health\s*(care)?\s+(IT|technology|software|data)|digital\s+health|healthtech)\b/i),
    ],
  },
  {
    code: "information_technology", name: "Information technology",
    re: /\b(technology|tech\b|software|SaaS|IT\s+services|cloud|cyber(security)?|data\s+(analytics|infrastructure)|semiconductors?|internet|digital|artificial\s+intelligence|\bAI\b|machine\s+learning)\b/i,
    focus: [
      F("it_software", "Software", /\b(software|SaaS|applications?|enterprise\s+software)\b/i),
      F("it_services", "IT services", /\b(IT\s+services|managed\s+services|systems\s+integrat|consulting\s+technology)\b/i),
      F("it_cyber", "Cybersecurity", /\b(cyber(security)?|security\s+software|identity)\b/i),
      F("it_data_ai", "Data & AI", /\b(artificial\s+intelligence|\bAI\b|machine\s+learning|data\s+(analytics|science|platforms?))\b/i),
      F("it_semis_hardware", "Semiconductors & hardware", /\b(semiconductors?|chips?|hardware|electronics|photonics)\b/i),
      F("it_internet", "Internet & digital media", /\b(internet|e-?commerce|marketplaces?|digital\s+media|consumer\s+internet|apps?)\b/i),
    ],
  },
  {
    code: "business_services", name: "Business services",
    re: /\b(business\s+services|professional\s+services|outsourcing|BPO|staffing|facilities\s+(management|services)|testing,?\s+inspection|logistics\s+services|marketing\s+services)\b/i,
    focus: [
      F("bs_professional", "Professional services", /\b(professional\s+services|consulting\s+firms?|accounting|legal\s+services)\b/i),
      F("bs_outsourcing", "Outsourcing & BPO", /\b(outsourcing|BPO|shared\s+services|contact\s+cent)/i),
      F("bs_staffing", "Staffing & HR", /\b(staffing|recruit|human\s+capital|HR\s+services|workforce)\b/i),
      F("bs_facilities", "Facilities & environmental services", /\b(facilities|environmental\s+services|waste|cleaning|security\s+services)\b/i),
      F("bs_tic", "Testing, inspection & certification", /\b(testing,?\s+inspection|certification|TIC\b|compliance\s+services)\b/i),
    ],
  },
  {
    code: "consumer", name: "Consumer discretionary & staples",
    re: /\b(consumer|retail|brands?|food|beverage|leisure|hospitality|restaurants?|apparel|fashion|beauty|pet|fitness|travel|gaming|e-?commerce)\b/i,
    focus: [
      F("cons_food_bev", "Food & beverage", /\b(food|beverage|drinks?|nutrition|snacks?|grocery)\b/i),
      F("cons_retail", "Retail & e-commerce", /\b(retail(ers?)?|e-?commerce|direct[\s-]to[\s-]consumer|DTC\b)\b/i),
      F("cons_brands", "Consumer brands & products", /\b(brands?|consumer\s+(products|goods|packaged)|CPG\b|beauty|apparel|fashion|household)\b/i),
      F("cons_leisure", "Leisure, travel & hospitality", /\b(leisure|travel|hospitality|restaurants?|hotels?|fitness|entertainment|gaming|sports?\s+(clubs?|teams?))\b/i),
      F("cons_education", "Education & training", /\b(education|edtech|schools?|training|childcare|universities)\b/i),
    ],
  },
  {
    code: "industrials", name: "Industrials",
    re: /\b(industrial(s)?|manufacturing|engineering|aerospace|defen[cs]e|automotive|machinery|packaging|chemicals?|building\s+products|distribution|transport(ation)?|logistics)\b/i,
    focus: [
      F("ind_manufacturing", "Manufacturing & engineering", /\b(manufactur|engineering|machinery|precision|components|automation)\b/i),
      F("ind_aero_defence", "Aerospace & defence", /\b(aerospace|defen[cs]e|space|aviation)\b/i),
      F("ind_automotive", "Automotive & mobility", /\b(automotive|auto\s+parts|mobility|vehicles?|EV\b)\b/i),
      F("ind_packaging_chem", "Packaging, chemicals & materials", /\b(packaging|chemicals?|materials|coatings|plastics|specialty\s+chemicals)\b/i),
      F("ind_transport_logistics", "Transport & logistics", /\b(transport(ation)?|logistics|freight|shipping|trucking|supply\s+chain)\b/i),
      F("ind_distribution", "Distribution & building products", /\b(distribution|distributors?|building\s+products|construction\s+(products|services)|HVAC)\b/i),
    ],
  },
  {
    code: "energy_utilities", name: "Energy & utilities",
    re: /\b(energy|power|utilit(y|ies)|renewables?|solar|wind|oil\s*(&|and)\s*gas|midstream|electricity|gas\s+(distribution|networks?)|hydrogen|battery|storage)\b/i,
    focus: [
      F("en_renewables", "Renewables & energy transition", /\b(renewables?|solar|wind|energy\s+transition|clean\s+energy|hydrogen|battery\s+storage|decarboni)/i),
      F("en_oil_gas", "Oil & gas", /\b(oil\s*(&|and)\s*gas|upstream|midstream|downstream|petroleum|LNG)\b/i),
      F("en_utilities", "Utilities & power", /\b(utilit(y|ies)|power\s+(generation|plants?)|electricity|grid|water\s+utilit)/i),
      F("en_services", "Energy services & equipment", /\b(energy\s+services|oilfield\s+services|energy\s+equipment|efficiency\s+services)\b/i),
    ],
  },
  {
    code: "telecoms_media", name: "Telecoms & media",
    re: /\b(telecom(munication)?s?|media|broadcast|publishing|content|fib(er|re)|towers|broadband|wireless|streaming|advertising)\b/i,
    focus: [
      F("tm_telecoms", "Telecoms & connectivity", /\b(telecom(munication)?s?|fib(er|re)|towers|broadband|wireless|connectivity|carriers?)\b/i),
      F("tm_media", "Media, content & entertainment", /\b(media|broadcast|publishing|content|streaming|film|music|entertainment)\b/i),
      F("tm_advertising", "Advertising & marketing", /\b(advertising|adtech|marketing\s+(services|technology)|martech)\b/i),
    ],
  },
  {
    code: "real_estate_industry", name: "Real estate & construction",
    re: /\b(real\s+estate|property|construction|homebuild|housing|REITs?)\b/i,
    focus: [
      F("re_construction", "Construction & homebuilding", /\b(construction|homebuild|contractors?|developers?)\b/i),
      F("re_property_services", "Property services & proptech", /\b(property\s+(management|services)|proptech|brokerage|facilities)\b/i),
    ],
  },
  {
    code: "materials_resources", name: "Materials & natural resources",
    re: /\b(materials|mining|metals|minerals|agriculture|agri|farming|forestry|timber|paper|steel|aggregates)\b/i,
    focus: [
      F("mr_mining", "Mining & metals", /\b(mining|metals|minerals|steel)\b/i),
      F("mr_agriculture", "Agriculture & food production", /\b(agricultur|agri|farming|farmland|aquaculture|crop)/i),
      F("mr_forestry", "Forestry & paper", /\b(forestry|timber|paper|pulp)\b/i),
    ],
  },
  {
    code: "diversified", name: "Diversified / generalist",
    re: /\b(diversified|generalist|multi[\s-]sector|sector[\s-]agnostic|across\s+(sectors|industries))\b/i,
    focus: [],
  },
];

export const INDUSTRY_BY_CODE: Record<string, Industry> = Object.fromEntries(INDUSTRIES.map((i) => [i.code, i]));
export const FOCUS_BY_CODE: Record<string, { industry: Industry; focus: IndustryFocus }> = Object.fromEntries(
  INDUSTRIES.flatMap((i) => i.focus.map((f) => [f.code, { industry: i, focus: f }])),
);

/** Industries (and the focus within each) a text names. */
export function industriesInText(text: string | null | undefined): { industry: string; focus: string[] }[] {
  if (!text) return [];
  const out: { industry: string; focus: string[] }[] = [];
  for (const i of INDUSTRIES) {
    if (!i.re.test(text)) continue;
    out.push({ industry: i.code, focus: i.focus.filter((f) => f.re.test(text)).map((f) => f.code) });
  }
  return out;
}

/** Industry codes only, for a filter. */
export function industryCodesInText(text: string | null | undefined): string[] {
  return industriesInText(text).map((x) => x.industry);
}

// --- Regions --------------------------------------------------------------------------
// The regions a fund or an investor targets. These sit above geo.ts's
// subregions (which place a firm's HQ) and add the groupings a mandate is
// written in: Global, Emerging Markets, Diversified multi-regional.

export type Region = {
  code: string;
  name: string;
  /** HQ subregions that belong to this region, for placing a firm by where it sits. */
  subregions: Subregion[];
  /** Words a fund name or a stated focus uses for this region. */
  re: RegExp;
};

export const REGIONS: Region[] = [
  { code: "global", name: "Global", subregions: [], re: /\b(global|worldwide|international|multi[\s-]regional)\b/i },
  { code: "north_america", name: "North America", subregions: ["North America"], re: /\b(north\s+america|united\s+states|U\.?S\.?A?\b|america[sn]?\b|canada|canadian)\b/i },
  { code: "europe", name: "Europe", subregions: ["Europe"], re: /\b(europe(an)?|EU\b|eurozone|pan[\s-]european|UK\b|united\s+kingdom|british|nordic|DACH|benelux|iberia|france|french|german|italy|italian|spain|spanish|dutch|netherlands|sweden|swedish|denmark|danish|norway|norwegian|finland|finnish|switzerland|swiss|ireland|irish|poland|polish|CEE\b|central\s+(and\s+)?eastern\s+europe)\b/i },
  { code: "asia", name: "Asia", subregions: ["Asia"], re: /\b(asia(n)?|asia[\s-]pacific|APAC|china|chinese|japan(ese)?|india(n)?|korea(n)?|singapore|hong\s+kong|taiwan|vietnam|indonesia|malaysia|thailand|philippines|south[\s-]east\s+asia|ASEAN|greater\s+china)\b/i },
  { code: "australasia", name: "Australasia", subregions: ["Oceania"], re: /\b(australia(n)?|new\s+zealand|australasia|oceania|ANZ\b)\b/i },
  { code: "middle_east", name: "Middle East & Israel", subregions: ["Middle East"], re: /\b(middle\s+east|MENA|GCC\b|gulf|israel(i)?|saudi|UAE|emirates|qatar|kuwait|bahrain|oman|turkey|turkish)\b/i },
  { code: "africa", name: "Africa", subregions: ["Africa"], re: /\b(africa(n)?|sub[\s-]saharan|nigeria|kenya|south\s+africa|egypt|morocco|pan[\s-]african)\b/i },
  { code: "latin_america", name: "Latin America & Caribbean", subregions: ["Latin America", "Caribbean & Atlantic"], re: /\b(latin\s+america|latam|south\s+america|brazil(ian)?|mexic(o|an)|colombia|chile|peru|argentin|caribbean|central\s+america)\b/i },
  { code: "emerging_markets", name: "Emerging markets", subregions: [], re: /\b(emerging\s+markets?|frontier\s+markets?|developing\s+(markets|countries|economies)|EM\b)\b/i },
];

export const REGION_BY_CODE: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.code, r]));

/** Regions a text names (a fund's legal name, a stated geographic focus). */
export function regionsInText(text: string | null | undefined): string[] {
  if (!text) return [];
  return REGIONS.filter((r) => r.re.test(text)).map((r) => r.code);
}

/** The region a firm sits in, by its HQ country. */
export function regionOfCountry(country: string | null | undefined): string | null {
  const sub = subregionOf(canonicalCountry(country ?? "") ?? country ?? "");
  if (!sub) return null;
  return REGIONS.find((r) => r.subregions.includes(sub))?.code ?? null;
}

export const GEOGRAPHIC_SCOPES = ["Global", "Continental", "Regional", "Country"] as const;
export type GeographicScope = (typeof GEOGRAPHIC_SCOPES)[number];

// --- Size bands ------------------------------------------------------------------------
// In USD millions, as a search cuts them. Money is never converted here:
// a band applies to a figure already in USD.

export type Band = { key: string; label: string; min: number | null; max: number | null };

const MN = 1_000_000;

export const AUM_BANDS: Band[] = [
  { key: "lt_100", label: "Under $100mn", min: null, max: 100 * MN },
  { key: "100_500", label: "$100–500mn", min: 100 * MN, max: 500 * MN },
  { key: "500_1000", label: "$500mn–1bn", min: 500 * MN, max: 1_000 * MN },
  { key: "1000_5000", label: "$1–5bn", min: 1_000 * MN, max: 5_000 * MN },
  { key: "5000_10000", label: "$5–10bn", min: 5_000 * MN, max: 10_000 * MN },
  { key: "10000_50000", label: "$10–50bn", min: 10_000 * MN, max: 50_000 * MN },
  { key: "gt_50000", label: "Over $50bn", min: 50_000 * MN, max: null },
];

/** The commitment an investor writes per fund. */
export const TICKET_BANDS: Band[] = [
  { key: "lt_10", label: "Under $10mn", min: null, max: 10 * MN },
  { key: "10_25", label: "$10–25mn", min: 10 * MN, max: 25 * MN },
  { key: "25_50", label: "$25–50mn", min: 25 * MN, max: 50 * MN },
  { key: "50_100", label: "$50–100mn", min: 50 * MN, max: 100 * MN },
  { key: "100_250", label: "$100–250mn", min: 100 * MN, max: 250 * MN },
  { key: "gt_250", label: "Over $250mn", min: 250 * MN, max: null },
];

/** A fund's size. */
export const FUND_SIZE_BANDS: Band[] = [
  { key: "lt_100", label: "Under $100mn", min: null, max: 100 * MN },
  { key: "100_250", label: "$100–250mn", min: 100 * MN, max: 250 * MN },
  { key: "250_500", label: "$250–500mn", min: 250 * MN, max: 500 * MN },
  { key: "500_1000", label: "$500mn–1bn", min: 500 * MN, max: 1_000 * MN },
  { key: "1000_2500", label: "$1–2.5bn", min: 1_000 * MN, max: 2_500 * MN },
  { key: "2500_5000", label: "$2.5–5bn", min: 2_500 * MN, max: 5_000 * MN },
  { key: "gt_5000", label: "Over $5bn", min: 5_000 * MN, max: null },
];

export function bandOf(bands: Band[], value: number | null | undefined): Band | null {
  if (value == null) return null;
  return bands.find((b) => (b.min == null || value >= b.min) && (b.max == null || value < b.max)) ?? null;
}

// --- Investor plans (the next twelve months) ------------------------------------------

export const PLAN_STATUSES = ["investing", "considering", "not_investing"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  investing: "Investing",
  considering: "Considering",
  not_investing: "Not investing",
};

/** How an investor means to put the money to work. */
export const PLAN_TYPES = [
  "New fund commitments",
  "Re-ups with existing managers",
  "Co-investments",
  "Separate accounts",
  "Direct investments",
  "Secondaries",
  "Fund of funds",
] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** What an investor's profile may say about how it commits. */
export const INVESTOR_PRACTICES = {
  co_invests: "Co-invests alongside managers",
  separate_accounts: "Uses separate accounts",
  first_time_funds: "Backs first-time funds",
  emerging_managers: "Backs emerging managers",
  direct_investments: "Invests directly",
} as const;
export type InvestorPractice = keyof typeof INVESTOR_PRACTICES;

export const FUNDRAISING_STATUSES = ["Pre-marketing", "Raising", "First close", "Interim close", "Final close", "Closed", "Evergreen"] as const;
