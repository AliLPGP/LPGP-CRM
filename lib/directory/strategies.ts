// Strategies within an asset class — the level a specialist sells at.
//
// A fund is placed in a strategy when its own legal name says so ("… DIRECT
// LENDING FUND III", "… CLO 2024-1", "… MEZZANINE PARTNERS"). A manager is
// placed by what the directory records it doing — its vertical and its own
// overview — and the record says which. Nothing is inferred beyond the words.
//
// Pure module: safe on the client.

import type { AssetClassKey } from "./asset-classes";

/** Which axis a strategy sits on. A desk filters by both, but they are not
 *  the same thing: "Buyout" says how a fund invests, "Healthcare" what it
 *  invests in. Preqin keeps them apart as Strategy and Industry Focus. */
export type StrategyAxis = "strategy" | "sector";

export type Strategy = {
  key: string;
  classKey: AssetClassKey;
  name: string;
  blurb: string;
  axis: StrategyAxis;
  /** Words in a fund's legal name that place it here. */
  fundName: RegExp;
  /** Words in a manager's vertical or overview that place it here. */
  firmText: RegExp;
  /** What published benchmarks to look for, for the research job. */
  benchmarks: string[];
};

const S = (
  key: string,
  classKey: AssetClassKey,
  name: string,
  blurb: string,
  fundName: RegExp,
  firmText: RegExp,
  benchmarks: string[],
  axis: StrategyAxis = "strategy",
): Strategy => ({ key, classKey, name, blurb, axis, fundName, firmText, benchmarks });

/** A sector within a class: a property type, an infrastructure sector, an industry a PE fund names. */
const SECTOR = (key: string, classKey: AssetClassKey, name: string, blurb: string, fundName: RegExp, firmText: RegExp, benchmarks: string[]): Strategy =>
  S(key, classKey, name, blurb, fundName, firmText, benchmarks, "sector");

export const STRATEGIES: Strategy[] = [
  // --- Private credit ------------------------------------------------------
  S("direct_lending", "private_credit", "Direct lending", "Senior secured loans to sponsor-backed and non-sponsored mid-market companies.",
    // "Private debt" is the class, not this strategy: a vertical that says
    // only that places no one here.
    /\b(DIRECT\s+LENDING|SENIOR\s+(LOAN|CREDIT|DEBT|SECURED)|MIDDLE\s+MARKET\s+(LENDING|CREDIT|DEBT)|UNITRANCHE)\b/,
    /\b(direct[\s-]lending|senior[\s-]secured|unitranche|middle[\s-]market\s+(lending|loans|credit))\b/i,
    ["Cliffwater Direct Lending Index return", "direct lending fundraising", "middle market loan yields and spreads", "direct lending default rate"]),
  S("mezzanine", "private_credit", "Mezzanine & junior capital", "Subordinated debt, PIK notes and preferred equity behind a senior lender.",
    /\b(MEZZANINE|MEZZ|JUNIOR\s+(CAPITAL|DEBT)|SUBORDINATED|PREFERRED\s+EQUITY|SECOND\s+LIEN)\b/,
    /\b(mezzanine|junior\s+capital|subordinated\s+debt|second[\s-]lien|preferred\s+equity)\b/i,
    ["mezzanine fundraising", "mezzanine fund returns", "junior capital pricing"]),
  S("distressed_special_situations", "private_credit", "Distressed & special situations", "Stressed and distressed credit, rescue financing, restructurings and event-driven situations.",
    /\b(DISTRESSED|SPECIAL\s+SITUATIONS?|SPECIAL\s+OPPORTUNIT(Y|IES)|OPPORTUNISTIC\s+CREDIT|RESTRUCTURING|RESCUE|TURNAROUND|STRESSED)\b/,
    /\b(distressed|special\s+situations?|special\s+opportunities|opportunistic\s+credit|restructuring|rescue\s+(capital|financing)|turnaround)\b/i,
    ["distressed debt fundraising", "special situations fund returns", "default rate leveraged loans high yield", "distressed ratio"]),
  S("asset_based_lending", "private_credit", "Asset-based & specialty finance", "Loans against receivables, inventory, equipment, royalties, litigation and other hard or contractual assets.",
    /\b(ASSET[\s-]BASED|ASSET[\s-]BACKED|ABL\b|SPECIALTY\s+FINANCE|RECEIVABLES?|ROYALT(Y|IES)|LITIGATION\s+FINANCE|EQUIPMENT\s+(FINANCE|LEASING)|CONSUMER\s+(LOANS?|FINANCE)|TRADE\s+FINANCE|INVOICE)\b/,
    /\b(asset[\s-]based|asset[\s-]backed|specialty\s+finance|receivables|royalt|litigation\s+finance|equipment\s+(finance|leasing)|consumer\s+(loans|finance)|trade\s+finance)\b/i,
    ["asset-based finance market size", "asset-backed lending fundraising", "specialty finance private credit returns"]),
  S("clo_structured", "private_credit", "CLOs & structured credit", "Collateralised loan obligations, CLO equity and debt tranches, and other structured credit.",
    /\b(CLO\b|COLLATERALI[SZ]ED\s+LOAN|STRUCTURED\s+CREDIT|CLO\s+EQUITY|ABS\b|CMBS|RMBS|SECURITI[SZ]ED)/,
    /\b(CLOs?\b|collaterali[sz]ed\s+loan|structured\s+credit|CLO\s+equity|securiti[sz]ed\s+products?)\b/i,
    ["CLO issuance", "CLO equity returns", "CLO AAA spreads", "leveraged loan index return"]),
  S("real_estate_debt", "private_credit", "Real estate debt", "Whole loans, mezzanine and bridge lending secured on property.",
    /\b(REAL\s+ESTATE\s+(DEBT|CREDIT|LENDING|FINANCE)|MORTGAGE|PROPERTY\s+(DEBT|LENDING|CREDIT)|BRIDGE\s+LENDING|CRE\s+DEBT)\b/,
    /\b(real\s+estate\s+(debt|credit|lending|finance)|commercial\s+mortgage|CRE\s+(debt|lending)|property\s+(debt|lending))\b/i,
    ["commercial real estate debt fundraising", "CRE loan spreads", "real estate debt fund returns"]),
  S("infrastructure_debt", "private_credit", "Infrastructure debt", "Senior and junior debt to infrastructure and energy assets.",
    /\b(INFRASTRUCTURE\s+(DEBT|CREDIT|LENDING)|INFRA\s+DEBT|PROJECT\s+FINANCE|ENERGY\s+(DEBT|CREDIT|LENDING))\b/,
    /\b(infrastructure\s+(debt|credit|lending)|project\s+finance|energy\s+(debt|credit|lending))\b/i,
    ["infrastructure debt fundraising", "infrastructure debt spreads", "infrastructure debt fund returns"]),
  S("venture_debt", "private_credit", "Venture & growth debt", "Loans to venture-backed and growth companies.",
    /\b(VENTURE\s+(DEBT|LENDING|LOAN)|GROWTH\s+(DEBT|LENDING)|TECHNOLOGY\s+LENDING)\b/,
    /\b(venture\s+(debt|lending|loans)|growth\s+(debt|lending)|technology\s+lending)\b/i,
    ["venture debt volume", "venture lending fundraising"]),
  S("nav_fund_finance", "private_credit", "NAV & fund finance", "Loans to funds and their managers: NAV facilities, GP financing, subscription lines.",
    /\b(NAV\s+(FINANC(E|ING)|LENDING|LOANS?)|FUND\s+FINANC(E|ING)|SUBSCRIPTION\s+(LINES?|FINANC(E|ING))|GP\s+(FINANC(E|ING)|SOLUTIONS|STAKES?))\b/,
    /\b(NAV\s+(finance|financing|lending|loans)|fund\s+finance|subscription\s+(lines?|financing)|GP\s+(financing|solutions))\b/i,
    ["NAV lending market size", "fund finance market growth"]),
  S("opportunistic_credit", "private_credit", "Opportunistic & multi-strategy credit", "Flexible mandates across public and private credit.",
    /\b(CREDIT\s+OPPORTUNIT(Y|IES)|OPPORTUNISTIC\s+CREDIT|OPPORTUNIT(Y|IES)\s+CREDIT|MULTI[\s-]STRATEGY\s+CREDIT|TACTICAL\s+CREDIT|FLEXIBLE\s+CREDIT|SPECIAL\s+CREDIT)\b/,
    /\b(opportunistic\s+credit|credit\s+opportunities|multi[\s-]strategy\s+credit|tactical\s+credit|flexible\s+credit)\b/i,
    ["opportunistic credit fundraising", "credit opportunities fund returns"]),

  // --- Real estate --------------------------------------------------------
  S("re_core", "real_estate", "Core", "Stabilised, income-producing assets in prime locations, low leverage.",
    /\bCORE\s+(FUND|PARTNERS|REAL\s+ESTATE|PROPERTY|INCOME|PLUS)?\b(?!-)/,
    /\b(core\s+(real\s+estate|strategy|fund|property|assets)|core\s+and\s+core[\s-]plus)\b/i,
    ["core real estate returns", "NCREIF ODCE return"]),
  S("re_core_plus", "real_estate", "Core-plus", "Core assets with modest leasing or capital upside.",
    /\bCORE[\s-]PLUS\b/,
    /\bcore[\s-]plus\b/i,
    ["core-plus real estate returns"]),
  S("re_value_add", "real_estate", "Value added", "Repositioning, re-leasing and capital programmes on under-managed assets.",
    /\bVALUE[\s-]?ADD(ED)?\b/,
    /\bvalue[\s-]?add(ed)?\b/i,
    ["value-add real estate fundraising", "value-add real estate returns"]),
  S("re_opportunistic", "real_estate", "Opportunistic", "Development, distressed and complex situations with the highest return targets.",
    /\b(OPPORTUNISTIC|OPPORTUNIT(Y|IES)\s+(FUND|PARTNERS|REAL\s+ESTATE)|REAL\s+ESTATE\s+(PARTNERS|OPPORTUNIT))\b/,
    /\b(opportunistic\s+(real\s+estate|strategy|fund)|real\s+estate\s+opportunit)\w*/i,
    ["opportunistic real estate fundraising", "opportunistic real estate returns"]),
  S("re_distressed", "real_estate", "Distressed", "Distressed property and non-performing real estate loans.",
    /\b(DISTRESSED|NPL|NON[\s-]PERFORMING)\b/,
    /\b(distressed\s+(real\s+estate|property|assets)|non[\s-]performing\s+loans?|NPLs?)\b/i,
    ["distressed real estate fundraising"]),
  S("re_fof_secondaries", "real_estate", "Fund of funds, secondaries & co-investment", "Real estate fund-of-funds, secondaries and co-investment programmes.",
    /\b(FUND\s+OF\s+FUNDS|SECONDAR|CO[\s-]?INVEST)/,
    /\b(real\s+estate\s+(fund\s+of\s+funds|secondaries|co[\s-]?investments?))\b/i,
    ["real estate secondaries volume"]),
  SECTOR("re_logistics", "real_estate", "Logistics & industrial", "Warehouses, distribution and light industrial.",
    /\b(LOGISTICS|WAREHOUSE|COLD\s+STORAGE|DISTRIBUTION\s+CENT|INDUSTRIAL\s+(REAL\s+ESTATE|PROPERT|PORTFOLIO|PARTNERSHIP|ASSETS|FUND|INCOME))/,
    /\b(logistics|industrial\s+real\s+estate|warehous|cold\s+storage)\w*/i,
    ["logistics real estate returns", "industrial vacancy rates", "logistics real estate fundraising"]),
  SECTOR("re_residential", "real_estate", "Residential & living", "Multifamily, build-to-rent, single-family rental, student and senior living.",
    /\b(RESIDENTIAL|MULTIFAMILY|MULTI-FAMILY|APARTMENT|HOUSING|BUILD[\s-]TO[\s-]RENT|BTR\b|SINGLE[\s-]FAMILY|STUDENT|SENIOR\s+(LIVING|HOUSING)|LIVING)\b/,
    /\b(residential|multifamily|multi-family|apartments?|build[\s-]to[\s-]rent|single[\s-]family\s+rental|student\s+(housing|accommodation)|senior\s+(living|housing))\b/i,
    ["multifamily returns", "residential real estate fundraising", "build to rent investment volume"]),
  SECTOR("re_office", "real_estate", "Office", "Office assets and office-led mixed use.",
    /(?<!FAMILY\s)(?<!BACK\s)\bOFFICE\b/,
    /\boffice\s+(real\s+estate|assets|investment|buildings?)\b/i,
    ["office vacancy rate", "office real estate returns", "office investment volume"]),
  SECTOR("re_retail", "real_estate", "Retail", "Shopping centres, retail parks and high street.",
    /\b(RETAIL|SHOPPING)\b/,
    /\b(retail\s+(real\s+estate|assets|property|parks?)|shopping\s+cent)/i,
    ["retail real estate returns", "retail real estate investment volume"]),
  SECTOR("re_hospitality", "real_estate", "Hospitality & leisure", "Hotels, resorts and leisure assets.",
    /\b(HOTEL|HOSPITALITY|RESORT|LEISURE|LODGING)\b/,
    /\b(hotels?|hospitality|resorts?|lodging)\b/i,
    ["hotel real estate investment volume", "hotel RevPAR", "hospitality fund returns"]),
  SECTOR("re_data_centers", "real_estate", "Data centres & digital", "Data centres and digital real estate.",
    /\b(DATA\s+CENT(ER|RE)S?|DIGITAL\s+REAL\s+ESTATE|HYPERSCALE)\b/,
    /\b(data\s+cent(er|re)s?|digital\s+real\s+estate)\b/i,
    ["data center investment volume", "data center capacity growth", "data center real estate returns"]),
  SECTOR("re_life_sciences", "real_estate", "Life sciences & healthcare", "Labs, medical office and healthcare property.",
    /\b(LIFE\s+SCIENCE|LABORATOR|HEALTHCARE\s+(REAL\s+ESTATE|PROPERT)|MEDICAL\s+OFFICE)/,
    /\b(life\s+sciences?\s+real\s+estate|lab\s+space|medical\s+office|healthcare\s+real\s+estate)\b/i,
    ["life sciences real estate vacancy", "medical office returns"]),
  SECTOR("re_self_storage", "real_estate", "Self storage & niche", "Self storage, car parks and other operational niches.",
    /\b(SELF[\s-]STORAGE|PARKING|MARINA)\b/,
    /\b(self[\s-]storage|storage\s+(assets|facilities))\b/i,
    ["self storage returns", "self storage investment volume"]),

  // --- Infrastructure -------------------------------------------------------
  SECTOR("infra_energy_transition", "infrastructure", "Energy transition & renewables", "Wind, solar, storage, grids, hydrogen and decarbonisation platforms.",
    /\b(RENEWABLE|ENERGY\s+TRANSITION|CLIMATE|SOLAR|WIND\b|WIND\s+(POWER|FARM|ENERGY)|BATTERY|HYDROGEN|DECARBONI|CLEAN\s+ENERGY|GREEN\s+(ENERGY|POWER)|SUSTAINABLE\s+INFRA)/,
    /\b(renewables?|energy\s+transition|climate\s+infrastructure|solar|wind\s+(farms?|power)|battery\s+storage|hydrogen|decarboni[sz]ation|clean\s+energy)\b/i,
    ["energy transition fundraising", "renewable energy investment volume", "energy transition infrastructure returns"]),
  SECTOR("infra_digital", "infrastructure", "Digital infrastructure", "Fibre, towers, data centres and connectivity.",
    /\b(DIGITAL\s+INFRA|FIB(ER|RE)\b|TOWERS\b|TOWER\s+(INFRA|ASSETS|PORTFOLIO)|DATA\s+CENT(ER|RE)S?|CONNECTIVITY|TELECOM|BROADBAND)/,
    /\b(digital\s+infrastructure|fib(er|re)|towers|data\s+cent(er|re)s?|connectivity|telecoms?\s+infrastructure|broadband)\b/i,
    ["digital infrastructure fundraising", "data center investment", "fiber investment volume"]),
  SECTOR("infra_transport", "infrastructure", "Transport", "Airports, ports, roads, rail and rolling stock.",
    /\b(TRANSPORT|AIRPORT|PORT\b|PORTS\b|TOLL|ROAD|RAIL|ROLLING\s+STOCK|SHIPPING|MARITIME|AVIATION|AIRCRAFT)\b/,
    /\b(transport(ation)?\s+infrastructure|airports?|ports?\b|toll\s+roads?|rail|rolling\s+stock|shipping|aviation|aircraft\s+leasing)\b/i,
    ["transport infrastructure returns", "airport transaction volume", "toll road investment"]),
  SECTOR("infra_utilities", "infrastructure", "Utilities & energy", "Regulated utilities, power generation, midstream and water.",
    /\b(UTILIT(Y|IES)|POWER\s+(GENERATION|PLANTS?|UTILIT(Y|IES))|MIDSTREAM|PIPELINE\s+(INFRA|ASSETS|PARTNERS)|WATER\s+(UTILIT(Y|IES)|INFRA|NETWORKS?)|GAS\s+(DISTRIBUTION|NETWORKS?)|ELECTRIC(ITY)?\s+(NETWORKS?|DISTRIBUTION|TRANSMISSION|UTILIT(Y|IES))|(POWER|NATIONAL|ELECTRIC(ITY)?)\s+GRID|DISTRICT\s+(HEAT|ENERGY))/,
    /\b(utilit(y|ies)|power\s+generation|midstream|(gas|oil|midstream)\s+pipelines?|water\s+(utilities|infrastructure|networks?)|electricity\s+(networks?|distribution|transmission)|(power|electricity|national)\s+grid)\b/i,
    ["utilities infrastructure returns", "midstream energy investment", "regulated utilities valuation multiples"]),
  SECTOR("infra_social", "infrastructure", "Social infrastructure & PPP", "Schools, hospitals, housing and public-private partnerships.",
    /\b(SOCIAL\s+INFRA|PPP\b|P3\b|PUBLIC[\s-]PRIVATE|HEALTHCARE\s+INFRA|EDUCATION\s+INFRA)\b/,
    /\b(social\s+infrastructure|public[\s-]private\s+partnerships?|PPPs?\b|P3\b)/i,
    ["social infrastructure fundraising", "PPP investment volume"]),
  S("infra_natural_resources", "natural_resources", "Natural resources (diversified)", "Multi-asset natural resources and natural capital mandates.",
    /\b(TIMBER|FOREST|FARMLAND|AGRICULTUR(E|AL)|NATURAL\s+(RESOURCES|CAPITAL)|MINING|METALS|AGRI)\b/,
    /\b(timber(land)?|forestry|farmland|agricultur(e|al)|natural\s+(resources|capital)|mining|metals\s+and\s+mining)\b/i,
    ["farmland returns index", "timberland returns", "natural resources fundraising"]),
  S("infra_value_add", "infrastructure", "Value added", "Assets with expansion, repositioning or contracting upside.",
    /\b(VALUE[\s-]?ADD(ED)?\s+INFRA|INFRA\w*\s+VALUE[\s-]?ADD)/,
    /\bvalue[\s-]?add(ed)?\s+infrastructure\b/i,
    ["value-add infrastructure returns"]),
  S("infra_opportunistic", "infrastructure", "Opportunistic", "Development-led and complex infrastructure situations.",
    /\b(OPPORTUNISTIC\s+INFRA|INFRA\w*\s+OPPORTUNIT)/,
    /\bopportunistic\s+infrastructure\b/i,
    ["opportunistic infrastructure returns"]),
  S("infra_greenfield", "infrastructure", "Greenfield & development", "New-build assets: construction and development risk.",
    /\b(GREENFIELD|DEVELOPMENT\s+(FUND|PARTNERS)\s+INFRA|PROJECT\s+DEVELOPMENT)\b/,
    /\b(greenfield|development[\s-]stage\s+infrastructure|project\s+development)\b/i,
    ["greenfield infrastructure investment"]),
  S("infra_brownfield", "infrastructure", "Brownfield", "Operating assets with an existing revenue history.",
    /\bBROWNFIELD\b/,
    /\bbrownfield\b/i,
    ["brownfield infrastructure returns"]),
  S("infra_fof_secondaries", "infrastructure", "Fund of funds, secondaries & co-investment", "Infrastructure fund-of-funds, secondaries and co-investment programmes.",
    /\b(INFRA\w*\s+(FUND\s+OF\s+FUNDS|SECONDAR|CO[\s-]?INVEST)|(SECONDAR|CO[\s-]?INVEST)\w*\s+INFRA)/,
    /\binfrastructure\s+(fund\s+of\s+funds|secondaries|co[\s-]?investments?)\b/i,
    ["infrastructure secondaries volume"]),
  S("infra_core", "infrastructure", "Core & core-plus", "Diversified, brownfield, contracted or regulated assets.",
    /\b(CORE\s+INFRA|CORE[\s-]PLUS\s+INFRA|CORE\s+(FUND|PARTNERS)|DIVERSIFIED\s+INFRA|GLOBAL\s+INFRA)/,
    /\b(core\s+infrastructure|core[\s-]plus|diversified\s+infrastructure)\b/i,
    ["core infrastructure returns", "infrastructure fundraising total", "infrastructure dry powder", "EDHECinfra index return"]),

  // --- Natural resources ------------------------------------------------------
  S("nr_agriculture", "natural_resources", "Agriculture & farmland", "Farmland, permanent crops and agribusiness.",
    /\b(FARMLAND|AGRICULTUR(E|AL)|AGRI\b|AGRIBUSINESS|CROP)\b/,
    /\b(farmland|agricultur(e|al)|agribusiness|permanent\s+crops)\b/i,
    ["farmland returns index", "farmland fundraising"]),
  S("nr_timberland", "natural_resources", "Timberland", "Forestry and timberland.",
    /\b(TIMBER(LAND)?|FOREST(RY)?)\b/,
    /\b(timber(land)?|forestry|forests?)\b/i,
    ["timberland returns", "NCREIF timberland index"]),
  S("nr_energy", "natural_resources", "Energy (oil & gas)", "Upstream, oilfield services and conventional energy.",
    /\b(OIL\s*(&|AND)\s*GAS|UPSTREAM|OILFIELD|PETROLEUM|ENERGY\s+(PARTNERS|CAPITAL|FUND)|E&P)\b/,
    /\b(oil\s*(&|and)\s*gas|upstream|oilfield\s+services|petroleum|exploration\s+and\s+production)\b/i,
    ["energy private equity fundraising", "upstream oil and gas private capital"]),
  S("nr_metals_mining", "natural_resources", "Metals & mining", "Mining, minerals and metals streaming and royalties.",
    /\b(MINING|METALS|MINERALS?|STREAMING)\b/,
    /\b(mining|metals\s+and\s+mining|minerals?|royalty\s+and\s+streaming)\b/i,
    ["mining private capital fundraising"]),
  S("nr_water", "natural_resources", "Water", "Water rights, water utilities and water technology.",
    /\bWATER\b/,
    /\bwater\s+(assets|rights|fund|infrastructure|investments?)\b/i,
    ["water investment volume"]),

  // --- Private equity ---------------------------------------------------------
  // A name that says "buyout" without a size word: mid-market, lower-mid and
  // small-cap vehicles sit under Mid-market instead, never in both.
  S("pe_buyout", "private_equity", "Buyout", "Control buyouts — names that say buyout without a mid-market or small-cap qualifier.",
    /(?<!(MID|MIDDLE|LOWER[\s-]?MID(DLE)?)[\s-]MARKET\s)(?<!SMALL(ER)?[\s-]CAP\s)\b(BUYOUTS?|LBO)\b|\bGLOBAL\s+PRIVATE\s+EQUITY\b/,
    /(?<!(mid|middle|lower[\s-]?mid(dle)?)[\s-]market\s)(?<!small(er)?[\s-]cap\s)\bbuyouts?\b|\b(large[\s-]cap|mega[\s-]buyouts?)\b/i,
    ["buyout fundraising", "buyout dry powder", "buyout median net IRR", "buyout EV/EBITDA multiples"]),
  S("pe_mid_market", "private_equity", "Mid-market buyout", "Control investments in mid-sized companies.",
    /\b(MID[\s-]?MARKET|MIDDLE\s+MARKET|LOWER\s+MID|SMALL[\s-]CAP|SMALLER\s+COMPANIES)\b/,
    /\b(mid[\s-]?market|middle\s+market|lower\s+mid|small[\s-]cap\s+buyout)\b/i,
    ["mid-market buyout fundraising", "middle market PE returns", "middle market deal multiples"]),
  S("pe_growth", "private_equity", "Growth equity", "Minority and structured growth capital.",
    // LP reports abbreviate ("Growth Eqty Fd", "Growth Opps"): the words are still the fund's own.
    /\b(GROWTH\s+(EQUITY|EQTY|CAPITAL|PARTNERS|PRTNRS|FUND|FD|INVESTORS|OPPS|OPPORTUNIT(Y|IES))|EXPANSION\s+CAPITAL)\b/,
    /\b(growth\s+equity|growth\s+capital|expansion\s+capital)\b/i,
    ["growth equity fundraising", "growth equity returns"]),
  S("pe_balanced", "private_equity", "Balanced", "Mixed buyout, growth and venture mandates in one vehicle.",
    /\b(BALANCED|DIVERSIFIED\s+PRIVATE\s+EQUITY|MULTI[\s-]STAGE)\b/,
    /\b(balanced\s+(fund|strategy|mandate)|multi[\s-]stage)\b/i,
    ["balanced private equity fundraising"]),
  S("pe_coinvestment", "private_equity", "Co-investment", "Direct co-investment alongside a lead sponsor, single- or multi-manager.",
    /\b(CO[\s-]?INVEST(MENT)?S?|COINVEST)\b/,
    /\b(co[\s-]?investments?|co[\s-]?invest\s+(fund|programme|program|sleeve|vehicle))\b/i,
    ["co-investment fundraising", "co-investment returns"]),
  S("pe_turnaround", "private_equity", "Turnaround", "Control of under-performing or distressed businesses for operational repair.",
    /\b(TURNAROUND|SPECIAL\s+SITUATIONS?\s+(EQUITY|PARTNERS|FUND)|RESTRUCTURING\s+(EQUITY|PARTNERS))\b/,
    /\b(turnaround|operational\s+turnarounds?|distressed\s+(buyouts?|private\s+equity))\b/i,
    ["turnaround private equity fundraising"]),
  S("pe_pipe", "private_equity", "PIPE & structured public", "Private investments in public equity and structured minority stakes in listed companies.",
    /\b(PIPE\b|PUBLIC\s+EQUITY\s+(PARTNERS|OPPORTUNIT)|STRUCTURED\s+(EQUITY|SOLUTIONS))\b/,
    /\b(PIPEs?\b|private\s+investments?\s+in\s+public\s+equity|structured\s+equity)\b/i,
    ["PIPE deal volume"]),
  S("pe_hybrid", "private_equity", "Hybrid & evergreen", "Open-ended, evergreen and hybrid private-public vehicles.",
    /\b(EVERGREEN|HYBRID|OPEN[\s-]END(ED)?|PERPETUAL|INTERVAL\s+FUND|LONG[\s-]TERM\s+(FUND|PARTNERS|CAPITAL))\b/,
    /\b(evergreen|hybrid\s+(fund|vehicle|strategy)|open[\s-]ended?|perpetual\s+(fund|capital)|interval\s+funds?|semi[\s-]liquid)\b/i,
    ["evergreen private equity AUM", "semi-liquid private markets fund flows"]),
  SECTOR("pe_healthcare", "private_equity", "Healthcare", "Healthcare services, pharma services, medtech.",
    /\b(HEALTH|HEALTHCARE|MEDICAL|LIFE\s+SCIENCE|PHARMA|BIO)\b/,
    /\b(healthcare|health\s+care|medtech|life\s+sciences?|pharma)\b/i,
    ["healthcare private equity deal volume", "healthcare PE fundraising"]),
  SECTOR("pe_technology", "private_equity", "Technology & software", "Software, data and technology-enabled services.",
    /\b(TECH|TECHNOLOGY|SOFTWARE|DIGITAL|CYBER|SAAS)\b/,
    /\b(software|technology|tech[\s-]enabled|SaaS|cyber)\b/i,
    ["software private equity deal volume", "technology PE fundraising", "software buyout multiples"]),
  SECTOR("pe_consumer", "private_equity", "Consumer & retail", "Consumer brands, retail, leisure, food.",
    /\b(CONSUMER|RETAIL|BRANDS?|FOOD|BEVERAGE|LEISURE)\b/,
    /\b(consumer\s+(sector|brands?|products|goods|businesses|companies|services)|retail\s+(sector|brands?|businesses|companies|chains?)|food\s+and\s+beverage|leisure\s+(sector|businesses|companies))\b/i,
    ["consumer private equity deal volume"]),
  SECTOR("pe_industrials", "private_equity", "Industrials & business services", "Industrial, manufacturing and services businesses.",
    /\b(INDUSTRIAL|MANUFACTURING|BUSINESS\s+SERVICES|ENGINEERING)\b|(?<!FINANCIAL\s)(?<!HEALTH(CARE)?\s)\bSERVICES\s+(FUND|PARTNERS)\b/,
    /\b(industrials?|manufacturing|business\s+services|engineering)\b/i,
    ["industrials private equity deal volume"]),
  SECTOR("pe_financial_services", "private_equity", "Financial services", "Banks, insurers, asset managers, fintech and payments.",
    /\b(FINANCIAL\s+(SERVICES|INSTITUTIONS|SECTOR)|FINTECH|INSURANCE\s+(SERVICES|SECTOR|PARTNERS|GROWTH)|PAYMENTS|BANKING)\b/,
    /\b(financial\s+services|fintech|insurance\s+(sector|companies|businesses|carriers)|payments)\b/i,
    ["financial services private equity deal volume"]),
  SECTOR("pe_impact", "private_equity", "Impact & sustainability", "Impact, ESG and sustainability mandates.",
    /\b(IMPACT|SUSTAINAB(LE|ILITY)|ESG|CLIMATE|SOCIAL\s+IMPACT)\b/,
    /\b(impact\s+invest\w*|impact\s+funds?|sustainab(le|ility)\s+(fund|strategy|invest\w*)|ESG\s+(fund|strategy)|climate\s+funds?)\b/i,
    ["impact fund fundraising", "impact investing market size"]),

  // --- Venture capital ---------------------------------------------------------
  S("vc_seed", "venture_capital", "Seed", "Pre-seed and seed: the first institutional cheque.",
    /\b(SEED|PRE[\s-]SEED|ANGEL)\b/,
    /\b(pre[\s-]seed|seed[\s-]stage|seed\s+(fund|round|investor)|angel)\b/i,
    ["seed stage deal volume", "median seed round size"]),
  S("vc_early_stage", "venture_capital", "Early stage (start-up)", "Series A and B: companies with a product and first revenue.",
    /\b(EARLY[\s-]STAGE|START[\s-]?UP|SERIES\s+A)\b/,
    /\b(early[\s-]stage|start[\s-]?ups?|Series\s+[AB]\b)\b/i,
    ["early stage venture returns", "Series A deal volume"]),
  S("vc_seed_early", "venture_capital", "Seed & early stage", "Pre-seed to Series A.",
    /\b(SEED|EARLY[\s-]STAGE|ANGEL|PRE[\s-]SEED)\b/,
    /\b(seed|early[\s-]stage|pre[\s-]seed|Series\s+A)\b/i,
    ["seed stage deal volume", "early stage venture returns", "median seed round size"]),
  S("vc_growth_late", "venture_capital", "Late stage & growth venture", "Series B and beyond, growth rounds, crossover.",
    /\b(GROWTH|LATE[\s-]STAGE|OPPORTUNIT(Y|IES)\s+FUND|SELECT\s+FUND|CROSSOVER)\b/,
    /\b(late[\s-]stage|growth[\s-]stage|crossover|Series\s+[B-E])\b/i,
    ["late stage venture deal volume", "venture growth fundraising"]),
  SECTOR("vc_sector", "venture_capital", "Sector specialists", "Fintech, biotech, climate, AI, deep tech and other sector funds.",
    /\b(FINTECH|BIO|HEALTH|CLIMATE|AI\b|DEEP\s+TECH|CRYPTO|DIGITAL\s+ASSETS|WEB3|SPACE|DEFEN[CS]E|CYBER)\b/,
    /\b(fintech|biotech|climate\s+tech|artificial\s+intelligence|\bAI\b|deep\s+tech|crypto|digital\s+assets|web3|defen[cs]e\s+tech|cyber)\b/i,
    ["AI venture funding", "climate tech venture funding", "biotech venture funding"]),

  // --- Secondaries ---------------------------------------------------------------
  S("sec_lp_led", "secondaries", "LP-led secondaries", "Purchases of LP interests in funds.",
    /\b(SECONDAR(Y|IES)\s+(FUND|PARTNERS|OPPORTUNIT(Y|IES))|LP\s+SECONDAR(Y|IES))\b/,
    /\b(LP[\s-]led|secondary\s+(fund|market)\s+purchases?|fund\s+interests)\b/i,
    ["secondaries transaction volume", "secondaries fundraising", "LP-led pricing as percent of NAV"]),
  S("sec_gp_led", "secondaries", "GP-led & continuation vehicles", "Continuation funds and other GP-led transactions.",
    /\b(CONTINUATION|GP[\s-]LED|SINGLE[\s-]ASSET|CV\s+FUND)\b/,
    /\b(GP[\s-]led|continuation\s+(funds?|vehicles?)|single[\s-]asset)\b/i,
    ["GP-led secondaries volume", "continuation fund volume"]),
  S("sec_fof", "secondaries", "Fund of funds & co-investment", "Primary fund-of-funds programmes and co-investment sleeves.",
    /\b(FUND\s+OF\s+FUNDS|CO[\s-]?INVEST(MENT)?S?|PRIMAR(Y|IES)|PORTFOLIO\s+FUND)\b/,
    /\b(fund\s+of\s+funds|co[\s-]?investments?|primaries)\b/i,
    ["fund of funds fundraising", "co-investment volume"]),

  // --- Hedge funds -----------------------------------------------------------------
  S("hf_relative_value", "hedge_funds", "Relative value", "Fixed income, volatility and statistical arbitrage.",
    /\b(RELATIVE\s+VALUE|FIXED\s+INCOME\s+ARB|VOLATILITY|STAT(ISTICAL)?\s+ARB)\b/,
    /\b(relative\s+value|fixed\s+income\s+arbitrage|volatility\s+(arbitrage|strategies)|statistical\s+arbitrage)\b/i,
    ["relative value hedge fund returns"]),
  S("hf_fund_of_hedge_funds", "hedge_funds", "Fund of hedge funds", "Multi-manager portfolios of hedge funds.",
    /\b(FUND\s+OF\s+(HEDGE\s+)?FUNDS|FOHF|MULTI[\s-]ADVISOR)\b/,
    /\b(fund\s+of\s+hedge\s+funds|FoHF)\b/i,
    ["fund of hedge funds AUM"]),
  S("hf_niche", "hedge_funds", "Niche & specialist", "Insurance-linked, crypto, litigation and other specialist strategies.",
    /\b(INSURANCE[\s-]LINKED|ILS\b|CAT\s+BOND|CRYPTO|DIGITAL\s+ASSETS?|LITIGATION)\b/,
    /\b(insurance[\s-]linked|cat\s+bonds?|crypto|digital\s+assets?|litigation\s+finance)\b/i,
    ["insurance-linked securities returns", "crypto hedge fund AUM"]),
  S("hf_multi_strategy", "hedge_funds", "Multi-strategy & multi-manager", "Pod-based and diversified platforms.",
    /\b(MULTI[\s-]STRATEGY|MULTI[\s-]MANAGER)\b/,
    /\b(multi[\s-]strategy|multi[\s-]manager|pod[\s-]based)\b/i,
    ["multi-strategy hedge fund returns", "multi-manager hedge fund AUM"]),
  S("hf_credit", "hedge_funds", "Credit & event-driven", "Credit long/short, distressed and event-driven.",
    /\b(EVENT[\s-]DRIVEN|MERGER\s+ARB|ARBITRAGE|CONVERTIBLE|CREDIT\s+(HEDGE|MASTER|LONG|ALPHA)|DISTRESSED)\b/,
    /\b(credit\s+hedge|event[\s-]driven|merger\s+arbitrage|convertible\s+arbitrage)\b/i,
    ["event driven hedge fund returns", "credit hedge fund returns"]),
  S("hf_equity", "hedge_funds", "Equity long/short", "Fundamental and quantitative equity.",
    /\b(LONG[\s\/-]*SHORT|L\/S\b|MARKET\s+NEUTRAL|EQUITY\s+(HEDGE|LONG|ALPHA|OPPORTUNIT)|(?<!PRIVATE\s)(?<!GROWTH\s)EQUIT(Y|IES)\s+(FUND|MASTER|PARTNERS))/,
    /\b(equity\s+long[\s\/-]*short|long[\s\/-]*short\s+equity|market\s+neutral|fundamental\s+equity)\b/i,
    ["equity long short hedge fund returns"]),
  S("hf_macro_quant", "hedge_funds", "Macro, quant & CTA", "Global macro, systematic and managed futures.",
    /\b(MACRO|QUANT(ITATIVE)?|SYSTEMATIC|MANAGED\s+FUTURES|CTA\b|TREND|COMMODIT(Y|IES))\b/,
    /\b(global\s+macro|quantitative|systematic|managed\s+futures|CTA\b|trend[\s-]following|commodities)\b/i,
    ["macro hedge fund returns", "CTA index returns", "quant hedge fund performance"]),
];

export const STRATEGIES_BY_CLASS: Record<AssetClassKey, Strategy[]> = {
  private_equity: [],
  private_credit: [],
  venture_capital: [],
  real_estate: [],
  infrastructure: [],
  natural_resources: [],
  secondaries: [],
  hedge_funds: [],
  sports: [],
};
for (const s of STRATEGIES) STRATEGIES_BY_CLASS[s.classKey].push(s);

export const STRATEGY_BY_KEY: Record<string, Strategy> = Object.fromEntries(STRATEGIES.map((s) => [s.key, s]));

/** The strategies of a class on one axis: how a fund invests, or what it invests in. */
export function strategiesOnAxis(classKey: AssetClassKey, axis: StrategyAxis): Strategy[] {
  return STRATEGIES_BY_CLASS[classKey].filter((s) => s.axis === axis);
}

/** Strategies a fund's own name states, within its class. */
export function strategiesInFundName(name: string | null | undefined, classKey: AssetClassKey): Strategy[] {
  if (!name) return [];
  const upper = name.toUpperCase();
  return STRATEGIES_BY_CLASS[classKey].filter((s) => s.fundName.test(upper));
}

/** Strategies a manager's own vertical or overview states, within its class. */
export function strategiesInFirmText(text: string | null | undefined, classKey: AssetClassKey): Strategy[] {
  if (!text) return [];
  return STRATEGIES_BY_CLASS[classKey].filter((s) => s.firmText.test(text));
}

/** Where a fund's strategy came from: a researched profile (a page that
 *  states it), the fund's own name, or the one strategy its manager's own
 *  words state in that class. The record always says which. */
export type StrategyBasis = "researched" | "name" | "manager";

export type PlacedStrategy = { key: string; basis: StrategyBasis };

export const STRATEGY_BASIS_LABEL: Record<StrategyBasis, string> = {
  researched: "researched",
  name: "by name",
  manager: "by manager",
};

/** The one strategy a manager's own vertical or overview states within a
 *  class; null when it states none, or several (a multi-strategy manager
 *  says nothing about any one fund). */
export function managerStrategyIn(text: string | null | undefined, classKey: AssetClassKey): string | null {
  const hits = strategiesInFirmText(text, classKey).filter((s) => s.axis === "strategy");
  return hits.length === 1 ? hits[0].key : null;
}

/** A fund's strategy: its researched profile first (any class's strategy:
 *  a venture fund in an LP's private-equity programme is still venture), then
 *  what its own name states in its class, then the one strategy its manager
 *  states. Null when nothing says. */
export function placeStrategy(o: { researched?: string | null; name?: string | null; classKey: AssetClassKey; managerText?: string | null }): PlacedStrategy | null {
  if (o.researched && STRATEGY_BY_KEY[o.researched]?.axis === "strategy") return { key: o.researched, basis: "researched" };
  const named = strategiesInFundName(o.name, o.classKey).find((s) => s.axis === "strategy");
  if (named) return { key: named.key, basis: "name" };
  const managed = managerStrategyIn(o.managerText, o.classKey);
  return managed ? { key: managed, basis: "manager" } : null;
}

export const METRIC_LABEL: Record<string, string> = {
  fundraising_total: "Fundraising",
  dry_powder: "Dry powder",
  aum: "AUM",
  median_net_irr: "Median net IRR",
  index_return: "Index return",
  default_rate: "Default rate",
  spread_bps: "Spread",
  deal_volume: "Deal volume",
  fund_count: "Funds closed",
  other: "Figure",
};
