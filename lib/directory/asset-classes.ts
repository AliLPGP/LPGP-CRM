// The asset classes the intelligence section is organised by, and how a firm,
// a fund or a deal is placed in one.
//
// A manager belongs to a class by the type the Master Directory gives it. A
// fund belongs to a class when its own legal name says so ("… REAL ESTATE
// FUND III", "… INFRASTRUCTURE PARTNERS"), and otherwise takes its manager's
// class — the record says which, so nothing reads as more certain than it is.
//
// Pure module: safe on the client.

export type AssetClassKey =
  | "private_equity"
  | "private_credit"
  | "venture_capital"
  | "real_estate"
  | "infrastructure"
  | "natural_resources"
  | "secondaries"
  | "hedge_funds"
  | "sports";

export type AssetClass = {
  key: AssetClassKey;
  slug: string;
  name: string;
  short: string;
  /** One line for the hub cards. */
  blurb: string;
  /** GP sub-types from the directory that sit in this class. */
  gpTypes: string[];
  /** Words in a fund's legal name that place it here. */
  fundName: RegExp | null;
};

export const ASSET_CLASSES: AssetClass[] = [
  {
    key: "private_equity",
    slug: "private-equity",
    name: "Private equity",
    short: "PE",
    blurb: "Buyout and growth managers, their funds, providers and the deals they announce.",
    gpTypes: ["Private equity", "Growth equity"],
    fundName: /\b(BUYOUT|GROWTH\s+EQUITY|PRIVATE\s+EQUITY|MID-?\s?MARKET|EQUITY\s+PARTNERS)\b/,
  },
  {
    key: "private_credit",
    slug: "private-credit",
    name: "Private credit",
    short: "Credit",
    blurb: "Direct lending, opportunistic and asset-based credit: managers, vehicles, fund closes.",
    gpTypes: ["Private credit"],
    fundName: /\b(CREDIT|LENDING|DEBT|LOAN|CLO|MEZZANINE|SENIOR\s+SECURED|NAV\s+FINANC)/,
  },
  {
    key: "venture_capital",
    slug: "venture-capital",
    name: "Venture capital",
    short: "VC",
    blurb: "Seed to late-stage venture firms, their funds and the rounds they lead.",
    gpTypes: ["Venture capital"],
    fundName: /\b(VENTURE|VENTURES|SEED\s+FUND|EARLY\s+STAGE)\b/,
  },
  {
    key: "real_estate",
    slug: "real-estate",
    name: "Real estate",
    short: "RE",
    blurb: "Private real estate managers and vehicles across sectors and strategies.",
    gpTypes: ["Real estate"],
    fundName: /\b(REAL\s+ESTATE|PROPERTY|PROPERTIES|REIT|LOGISTICS\s+FUND|HOUSING\s+FUND|RESIDENTIAL\s+FUND)\b/,
  },
  {
    key: "infrastructure",
    slug: "infrastructure",
    name: "Infrastructure & real assets",
    short: "Infra",
    blurb: "Energy transition, digital, transport and utilities — managers, funds and platform deals.",
    gpTypes: ["Infrastructure", "Real assets"],
    fundName: /\b(INFRASTRUCTURE|INFRA\b|ENERGY\s+TRANSITION|RENEWABLE|DIGITAL\s+INFRA|POWER\s+FUND)/,
  },
  {
    key: "natural_resources",
    slug: "natural-resources",
    name: "Natural resources",
    short: "NatRes",
    blurb: "Farmland, timberland, metals and mining, oil and gas, water — the real-asset managers and funds outside infrastructure.",
    gpTypes: ["Natural resources"],
    fundName: /\b(NATURAL\s+RESOURCES?|TIMBER(LAND)?|FOREST(RY)?|FARMLAND|AGRICULTUR(E|AL)|AGRI\b|MINING|METALS|OIL\s*(&|AND)\s*GAS|UPSTREAM|WATER\s+FUND)\b/,
  },
  {
    key: "secondaries",
    slug: "secondaries",
    name: "Secondaries & fund of funds",
    short: "Secondaries",
    blurb: "Secondaries specialists, continuation vehicles and fund-of-funds programmes.",
    gpTypes: ["Fund of funds & secondaries"],
    fundName: /\b(SECONDAR|CONTINUATION|FUND\s+OF\s+FUNDS|PORTFOLIO\s+ADVISORS)/,
  },
  {
    key: "hedge_funds",
    slug: "hedge-funds",
    name: "Hedge funds",
    short: "Hedge",
    blurb: "Multi-strategy, macro, credit and equity hedge fund managers and their prime relationships.",
    gpTypes: ["Hedge fund"],
    fundName: /\b(MULTI-?\s?STRATEGY|LONG\s*\/?\s*SHORT|MARKET\s+NEUTRAL|MACRO\s+FUND|ABSOLUTE\s+RETURN|ARBITRAGE)\b/,
  },
  {
    key: "sports",
    slug: "sports",
    name: "Sports",
    short: "Sports",
    blurb: "Clubs, leagues and media rights as an asset class: who owns what, at what price.",
    gpTypes: [],
    fundName: /\b(SPORTS?\b|ATHLETIC\s+FUND|FOOTBALL)/,
  },
];

export const ASSET_CLASS_BY_KEY: Record<AssetClassKey, AssetClass> = Object.fromEntries(
  ASSET_CLASSES.map((c) => [c.key, c]),
) as Record<AssetClassKey, AssetClass>;

export function assetClassBySlug(slug: string): AssetClass | null {
  return ASSET_CLASSES.find((c) => c.slug === slug) ?? null;
}

export function isAssetClassKey(v: unknown): v is AssetClassKey {
  return typeof v === "string" && v in ASSET_CLASS_BY_KEY;
}

/** The class a manager's directory type places it in, if any. */
export function classOfGpType(subType: string | null | undefined): AssetClassKey | null {
  if (!subType) return null;
  for (const c of ASSET_CLASSES) if (c.gpTypes.includes(subType)) return c.key;
  return null;
}

/** The class a fund's own name states, if it states one. */
export function classStatedByFundName(name: string | null | undefined): AssetClassKey | null {
  if (!name) return null;
  const upper = name.toUpperCase();
  // Narrower classes first: "REAL ESTATE CREDIT FUND" is credit into real
  // estate — the name says both, credit is what the vehicle does.
  for (const key of ["private_credit", "secondaries", "natural_resources", "infrastructure", "real_estate", "venture_capital", "hedge_funds", "sports", "private_equity"] as AssetClassKey[]) {
    const re = ASSET_CLASS_BY_KEY[key].fundName;
    if (re && re.test(upper)) return key;
  }
  return null;
}

export type FundClass = { key: AssetClassKey; basis: "name" | "manager" } | null;

/** Where a fund sits: its own name first, its manager's type second. */
export function fundClass(name: string | null | undefined, managerType: string | null | undefined): FundClass {
  const stated = classStatedByFundName(name);
  if (stated) return { key: stated, basis: "name" };
  const inherited = classOfGpType(managerType);
  return inherited ? { key: inherited, basis: "manager" } : null;
}

export const DEAL_KIND_LABEL: Record<string, string> = {
  stake_sale: "Stake sale",
  acquisition: "Acquisition",
  minority_investment: "Minority investment",
  debt_financing: "Debt financing",
  stadium_financing: "Stadium financing",
  league_media_rights: "Media rights",
  league_stake: "League stake",
  expansion_fee: "Expansion fee",
  fund_close: "Fund close",
  fundraise: "Fundraise",
  company_acquisition: "Company acquisition",
  funding_round: "Funding round",
  add_on_acquisition: "Add-on acquisition",
  ipo: "IPO",
  company_exit: "Exit",
  secondary: "Secondary",
  other: "Other",
};

export const SIGNAL_KIND_LABEL: Record<string, string> = {
  deal: "Deal",
  fund_close: "Fund close",
  fundraise: "Fundraise",
  people: "People",
  regulatory: "Regulatory",
  performance: "Performance",
  news: "News",
};

export const INVESTOR_TYPE_LABEL: Record<string, string> = {
  private_equity: "Private equity",
  private_credit: "Private credit",
  sovereign_wealth: "Sovereign wealth",
  family_office: "Family office",
  individual: "Individual",
  consortium: "Consortium",
  corporate: "Corporate",
  institutional: "Institutional",
  other: "Other",
};

export const OWNERSHIP_TYPE_LABEL: Record<string, string> = {
  individual_family: "Individual / family",
  consortium: "Consortium",
  private_equity: "Private equity",
  sovereign_state: "Sovereign / state",
  corporate: "Corporate",
  member_owned: "Member-owned",
  public_listed: "Listed",
  municipal: "Municipal",
  other: "Other",
  unknown: "Unknown",
};
