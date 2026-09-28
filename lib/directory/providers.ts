// Service-provider brands behind the names GPs file on Form ADV.
//
// Schedule D names the legal entity ("JPMORGAN CHASE BANK, N.A.", "J.P. MORGAN
// SECURITIES LLC", "JP MORGAN CHASE"), so one bank arrives under dozens of
// spellings and a league table built on raw names is fiction. Rankings are only
// honest once those collapse to the brand a practitioner would name.
//
// Rules are ordered and the first match wins, so a narrower brand sits above a
// broader one that would swallow it (Citizens before Citi, SVB before Valley).
// Anything no rule claims falls back to its own name with the legal suffixes
// stripped, which still merges "PARK MADISON PARTNERS LLC" with
// "PARK MADISON PARTNERS, LLC".
//
// Pure module: no imports, safe on the client and in the importer.

export type ProviderRole =
  | "auditor"
  | "administrator"
  | "custodian"
  | "prime_broker"
  | "placement_agent"
  | "other";

export const PROVIDER_ROLES: ProviderRole[] = [
  "auditor",
  "administrator",
  "custodian",
  "prime_broker",
  "placement_agent",
];

export const ROLE_LABEL: Record<ProviderRole, string> = {
  auditor: "Auditor",
  administrator: "Administrator",
  custodian: "Custodian",
  prime_broker: "Prime broker",
  placement_agent: "Placement agent",
  other: "Other",
};

export const ROLE_PLURAL: Record<ProviderRole, string> = {
  auditor: "Auditors",
  administrator: "Administrators",
  custodian: "Custodians",
  prime_broker: "Prime brokers",
  placement_agent: "Placement agents",
  other: "Other providers",
};

/** Form ADV's own wording ("marketer/placement agent") → our role key. */
export function normalizeRole(raw: string | null | undefined): ProviderRole {
  const r = (raw ?? "").toLowerCase();
  if (r.includes("audit")) return "auditor";
  if (r.includes("admin")) return "administrator";
  if (r.includes("prime")) return "prime_broker";
  if (r.includes("custod")) return "custodian";
  if (r.includes("placement") || r.includes("market")) return "placement_agent";
  return "other";
}

type BrandRule = [brand: string, match: RegExp];

// Ordered: first match wins. Patterns run against the upper-cased raw name.
const RULES: BrandRule[] = [
  // --- Audit & accounting -------------------------------------------------
  ["KPMG", /\bK(PM|MP)G\b/],
  ["PwC", /PRICE\s*S?WATER|PRICEWATERCOOPERS|\bPWC\b/],
  ["EY", /\bERNST\s*(&|AND)?\s*YOUNG\b|^EY\b/],
  ["Deloitte", /\bDELOITTE\b/],
  ["Grant Thornton", /\bGRANT\s+THO?RN?TON\b/],
  ["BDO", /\bBDO\b/],
  ["RSM", /\bRSM\b/],
  ["Forvis Mazars", /\bFORVIS\b|\bMAZARS\b/],
  ["CohnReznick", /COHN\s*REZNICK/],
  ["Baker Tilly", /BAKER\s+TILLY/],
  ["EisnerAmper", /EISNER\s*AMPER/],
  ["Citrin Cooperman", /CITRIN\s+COOPERMAN/],
  ["Marcum", /\bMARCUM\b/],
  ["WithumSmith+Brown", /WITHUM/],
  ["Moss Adams", /MOSS\s+ADAMS/],
  ["Crowe", /\bCROWE\b/],
  ["Armanino", /ARMANINO/],
  ["Plante Moran", /PLANTE\s*(&|AND)?\s*MORAN/],
  ["Frank, Rimerman + Co.", /FRANK,?\s+RIMERMAN/],
  ["CBIZ", /\bCBIZ\b/],
  ["CliftonLarsonAllen", /CLIFTON\s*LARSON/],
  ["Anchin", /\bANCHIN\b/],
  ["Cohen & Co", /^COHEN\s*(&|AND)\s*(COMPANY|CO\b)/],
  ["Spicer Jeffries", /SPICER\s+JEFFRIES/],
  ["Richey May", /RICHEY\s+MAY/],
  ["Wipfli", /\bWIPFLI\b/],
  ["Andersen", /^ANDERSEN\b/],
  ["O'Connor Davies", /O'?CONNOR\s+DAVIES/],

  // --- Fund administration -------------------------------------------------
  ["Citco", /\bCITCO\b/],
  ["SS&C", /\bSS\s*&\s*C\b|\bSS&C\b|GLOBEOP/],
  ["Alter Domus", /ALTER\s*DOMUS/],
  ["Apex Group", /\bAPEX\s+(GROUP|FUND|GLOBAL)|BROADSCOPE/],
  ["Gen II Fund Services", /\bGEN\s*II\b/],
  ["Aztec Group", /\bAZTEC\b/],
  ["Maples Group", /\bMAPLES\b/],
  ["IQ-EQ", /\bIQ[\s-]*EQ\b/],
  ["SEI", /\bSEI\b/],
  ["HedgeServ", /HEDGESERV/],
  ["Ultimus", /\bULTIMUS\b/],
  ["Aduro Advisors", /\bADURO\b/],
  ["UMB", /\bUMB\b/],
  ["CACEIS", /\bCACEIS\b/],
  ["Standish Management", /\bSTANDISH\b/],
  ["Petra Funds Group", /PETRA\s+FUNDS/],
  ["Carta", /\bCARTA\b|\bE\s*SHARES\b/],
  ["Juniper Square", /JUNIPER\s+SQUARE/],
  ["Langham Hall", /LANGHAM\s+HALL/],
  ["Ocorian", /\bOCORIAN\b|\bESTERA\b/],
  ["Vistra", /\bVISTRA\b/],
  ["TMF Group", /\bTMF\b/],
  ["JTC", /\bJTC\b/],
  ["Trident Trust", /\bTRIDENT\s+(FUND|TRUST)/],
  ["CSC", /^CSC$|\bCSC\s+(FUND|GLOBAL|US)|CORPORATION\s+SERVICE\s+COMPANY|\bINTERTRUST\b/],
  ["Harmonic Fund Services", /HARMONIC\s+FUND/],
  ["NAV Fund Services", /\bNAV\s+FUND\s+SERVICES/],
  ["HC Global Fund Services", /HC\s+GLOBAL\s+FUND/],
  ["Waystone", /\bWAYSTONE\b/],
  ["Belasko", /\bBELASKO\b/],
  ["Zedra", /\bZEDRA\b/],
  ["Navolio & Tallman", /NAVOLIO/],
  ["Dynamo Software", /DYNAMO\s+SOFTWARE/],
  // State Street's alternatives administration arm still files under IFS.
  ["State Street", /INTERNATIONAL\s+FUND\s+SERVICES/],
  ["European Fund Administration", /EUROPEAN\s+FUND\s+ADMINISTRATION/],
  ["Walkers", /\bWALKERS\b/],
  ["Appleby", /\bAPPLEBY\b/],
  ["Carne Group", /^CARNE\b/],

  // --- Banks, custodians & brokers ----------------------------------------
  // Narrow brands whose names contain a broader one come first.
  ["First Citizens / SVB", /SILICON\s+VALL?EY|\bSVB\b|FIRST[\s-]*CITIZEN/],
  ["Citizens", /\bCITIZENS\b/],
  ["City National Bank of Florida", /CITY\s+NATIONAL\s+BANK\s+OF\s+FLORIDA/],
  ["City National Bank", /CITY\s+NATIONAL\s+BANK/],
  ["Mitsubishi UFJ Morgan Stanley", /MITSUBISHI\s+UFJ\s+MORGAN\s+STANLEY/],
  ["J.P. Morgan", /J\.?\s*P\.?\s*MORGAN|JPMORGAN|\bCHASE\b|^JPM$/],
  ["Bank of America", /BANK\s+OF\s+AMERICA|MERRILL\s+LYNCH|\bBOFA\b|^BA\s+SECURITIES/],
  ["Goldman Sachs", /GOLDMAN,?\s+SACHS/],
  ["Morgan Stanley", /MORGAN\s+STANLEY/],
  ["Citi", /\bCITI(BANK|GROUP)?\b|\bCITI\s+BANK\b/],
  // Anchored: "SAFRA NATIONAL BANK OF NEW YORK" is not BNY. Pershing is.
  ["BNY", /^(THE\s+)?BANK\s+OF\s+NEW\s+YORK|\bBNYM?\b|\bMELLON\b|\bPERSHING\b/],
  ["State Street", /STATE\s+STREET/],
  ["Northern Trust", /NORTHERN\s+TRUST/],
  ["Wells Fargo", /WELLS\s+FARGO/],
  ["U.S. Bank", /\bU\.?\s*S\.?\s*BAN(K|CORP)\b|^US\s+BANK/],
  ["UBS", /\bUBS\b/],
  ["Credit Suisse", /CREDIT\s+SUISSE/],
  ["Barclays", /\bBARCLAYS\b/],
  ["BNP Paribas", /\bBNP\b/],
  ["Société Générale", /SOCIETE\s+GENERALE|^SG\s+AMERICAS/],
  ["Deutsche Bank", /DEUTSCHE\s+BANK/],
  ["HSBC", /\bHSBC\b|HONGKONG\s+AND\s+SHANGHAI\s+BANKING/],
  ["Raymond James", /RAYMOND\s+JAMES/],
  ["Jefferies", /\bJEFFERIES\b/],
  ["Fidelity", /\bFIDELITY\b|NATIONAL\s+FINANCIAL\s+SERVICES/],
  ["Charles Schwab", /\bSCHWAB\b/],
  ["Interactive Brokers", /INTERACTIVE\s+BROKERS/],
  ["BMO", /\bBMO\b|BANK\s+OF\s+MONTREAL/],
  ["RBC", /\bRBC\b|ROYAL\s+BANK\s+OF\s+CANADA/],
  ["NatWest (RBS)", /ROYAL\s+BANK\s+OF\s+SCOTLAND|\bRBS\b|NATWEST/],
  ["Scotiabank", /\bSCOTIA\b/],
  ["CIBC", /\bCIBC\b|CANADIAN\s+IMPERIAL/],
  ["TD", /^TD\s+(PRIME|SECURITIES|BANK|AMERITRADE)|TORONTO[\s-]DOMINION/],
  ["Stifel", /\bSTIFEL\b/],
  ["BTIG", /\bBTIG\b/],
  ["Cantor Fitzgerald", /CANTOR\s+FITZGERALD|^CF\s+SECURED/],
  ["Macquarie", /\bMACQUARIE\b/],
  ["Standard Chartered", /STANDARD\s+CHARTERED/],
  ["KeyBank", /\bKEY\s*BANK\b/],
  ["PNC", /\bPNC\b/],
  ["M&T Bank", /\bM\s*&\s*T\s+BANK|MANUFACTURERS\s+(AND|&)\s+TRADERS/],
  ["Wilmington Trust", /WILMINGTON\s+TRUST/],
  ["Fifth Third", /FIFTH\s+THIRD/],
  ["Comerica", /\bCOMERICA\b/],
  ["East West Bank", /EAST\s+WEST\s+BANK/],
  ["Western Alliance", /WESTERN\s+ALLIANCE/],
  ["First Republic", /FIRST\s+REPUBLIC/],
  ["Banc of California", /BANC\s+OF\s+CALIFORNIA|PACIFIC\s+WESTERN\s+BANK/],
  ["Axos Bank", /\bAXOS\b/],
  ["Texas Capital", /TEXAS\s+CAPITAL\s+BANK/],
  ["Huntington", /\bHUNTINGTON\s+NATIONAL/],
  ["Regions Bank", /^REGIONS\s+BANK/],
  ["Truist", /\bTRUIST\b/],
  ["Capital One", /^CAPITAL\s+ONE\b/],
  ["Zions", /\bZIONS\b/],
  ["Webster Bank", /WEBSTER\s+BANK/],
  ["Valley Bank", /^VALLEY\s+NATIONAL/],
  ["Brown Brothers Harriman", /BROWN\s+BROTHERS\s+HARRIMAN/],
  ["Computershare", /COMPUTERSHARE/],
  ["Equiniti", /\bEQUINITI\b/],
  ["Anchorage Digital", /ANCHORAGE\s+(DIGITAL|DIGITLA|DITIGAL|HOLD)/],
  ["Coinbase", /\bCOINBASE\b/],
  ["MUFG", /\bMUFG\b|MITSUBISHI\s+UFJ|TOKYO[\s-]MITSUBISHI/],
  ["SMBC", /SUMITOMO\s+MITSUI\s+BANKING|\bSMBC\b/],
  ["Sumitomo Mitsui Trust", /SUMITOMO\s+MITSUI\s+TRUST/],
  ["Mizuho", /\bMIZUHO\b/],
  ["Nomura", /\bNOMURA\b/],
  ["Natixis", /\bNATIXIS\b/],
  ["ING", /^ING\b/],
  ["ABN AMRO", /ABN\s+AMRO/],
  ["Santander", /SANTANDER/],
  ["Itaú", /\bITAU\b/],
  ["Bradesco", /\bBRADESCO\b/],
  ["BTG Pactual", /\bBTG\b/],
  ["Samsung Securities", /SAMSUNG\s+SECURI?T/],
  ["Mirae Asset", /MIRAE\s+ASSET/],
  ["Shinhan", /\bSHINHAN\b/],
  ["KB Securities", /^KB\s+(SECURITIES|INVESTMENT)/],
  ["NH Investment & Securities", /^NH\s+INVESTMENT/],
  ["Korea Investment & Securities", /KOREA\s+INVESTMENT\s+(&|AND)\s+SECURITIES/],
  ["Korea Asset Investment Securities", /KOREA\s+ASSET\s+INVESTMENT/],
  ["DBS", /^DBS\b/],
  ["UOB", /^UOB\b|UNITED\s+OVERSEAS\s+BANK/],
  ["CIMB", /\bCIMB\b/],
  ["Trimegah Sekuritas", /TRIMEGAH/],
  ["CICC", /CHINA\s+INTERNATIONAL\s+CAPITAL\s+CORP|\bCICC\b/],
  ["Kotak", /\bKOTAK\b/],
  ["ICICI", /\bICICI\b/],
  ["HDFC", /\bHDFC\b/],
  ["Absa", /\bABSA\b/],
  ["Lloyds", /\bLLOYDS\s+BANK/],
  ["UniCredit", /\bUNICREDIT\b/],
  ["Intesa Sanpaolo", /INTESA\s+SANPAOL/],
  ["Nordea", /\bNORDEA\b/],
  ["Commerzbank", /COMMERZBANK/],
  ["Spuerkeess (BCEE)", /BANQUE\s+ET\s+CAISSE\s+D'?E/],
  ["Banque de Patrimoines Privés", /BANQUE\s+DE\s+PATRIMOINES/],
  ["Oppenheimer", /\bOPPENHEIMER\s*&/],
  ["William Blair", /WILLIAM\s+BLAIR/],
  ["Baird", /ROBERT\s+W\.?\s+BAIRD/],
  ["Marex", /\bMAREX\b/],
  ["StoneX", /\bSTONEX\b/],
  ["Clear Street", /CLEAR\s+STREET/],
  ["Allfunds", /\bALLFUNDS\b/],
  ["Rockefeller Capital Management", /\bROCKEFELLER\b/],

  // --- Placement agents & distribution ------------------------------------
  ["Evercore", /\bEVERCORE\b/],
  ["PJT Park Hill", /\bPJT\b|^PARK\s+HILL\s+GROUP/],
  ["Lazard", /\bLAZARD\b/],
  ["Campbell Lutyens", /CAMPBELL\s+LU/],
  ["Houlihan Lokey", /HOULIHAN\s+LOKEY/],
  ["iCapital", /\bICAPITAL\b|INSTITUTIONAL\s+CAPITAL\s+NETWORK/],
  ["CAIS", /^CAIS\b/],
  ["Probitas Partners", /\bPROBITAS\b/],
  ["Greenstone", /\bGREENSTONE\b/],
  ["Rede Partners", /\bREDE\s+PARTNERS/],
  ["Monument Group", /MONUMENT\s+GROUP/],
  ["Triago", /\bTRIAGO\b/],
  ["Asante Capital", /\bASANTE\s+CAPITAL/],
  ["Eaton Partners", /EATON\s+PARTNERS|^C\.?\s*P\.?\s+EATON/],
  ["First Avenue", /^FIRST\s+AVENUE/],
  ["Mercury Capital Advisors", /MERCURY\s+CAPITAL\s+ADVISORS/],
  ["Harris Williams", /HARRIS\s+WILLIAMS/],
  ["Park Madison Partners", /PARK\s+MADISON/],
  ["Hollister Associates", /HOLLISTER\s+ASSOCIATES/],
  ["Atlantic-Pacific Capital", /ATLANTIC\s*-\s*PACIFIC/],
  ["Picton", /^PICTON\b/],
  ["Polaris", /^POLARIS\s+(\(EUROPE\)|INVESTMENT)/],
  ["LarrainVial", /LARRAIN\s*VIAL/],
];

/** Legal-form suffixes, trimmed repeatedly from the end of an unmatched name. */
const LEGAL_SUFFIX =
  /[\s,.]+(L\.?\s?L\.?\s?C|L\.?\s?L\.?\s?P|L\.?\s?P|P\.?\s?L\.?\s?L\.?\s?C|INC(ORPORATED)?|LTD|LIMITED|PLC|N\.?\s?A|NATIONAL\s+ASSOCIATION|CORP(ORATION)?|(&|AND)\s*CO(MPANY)?|CO(MPANY)?|S\.?\s?A\.?\s?R\.?\s?L|S\.?\s?A\.?\s?U|S\.?\s?À\s?R\.?\s?L|S\.?\s?C\.?\s?A|S\.?\s?A|S\.?\s?C|S\.?\s?L|S\.?\s?P\.?\s?A|S\.?\s?R\.?\s?L|S\.?\s?A\.?\s?S|A\.?\s?G|GMBH|SE|N\.?\s?V|B\.?\s?V|PTE|PTY|AB|AS|A\/S|OY|K\.?\s?K|DMCC|FZ-?LLC|FZC(-LLC)?|FZE|LTDA|P\.?\s?C|P\.?\s?A|CPAS?|UAB|SOCIETE\s+(COOPERATIVE|ANONYME)|DESIGNATED\s+ACTIVITY\s+COMPANY)\.?$/i;

/** Words kept upper-case when title-casing an all-caps filing name. */
const ACRONYMS = new Set([
  "LP", "LLP", "UK", "US", "USA", "EU", "AG", "SA", "NV", "BV", "AB", "II", "III", "IV",
  "PE", "VC", "FX", "AM", "IM", "HK", "NY", "DC", "LA", "CI", "SG", "AIFM", "BCI",
  "SPV", "GP", "LLC", "ESG", "IFS", "NAV", "CPA", "PR", "IR", "IT", "AI", "EFG", "LGT",
  "CBRE", "IBK", "ISP", "AHP", "LCA", "DS", "SK", "KB", "NH", "ICBC", "SPDB", "EFA", "ABC",
  "AXA", "BGL", "CIC", "IBI", "ICG", "IDB", "IFC", "JLL", "KKR", "MFS", "PGIM", "RBC", "SVB",
]);

const LOWER_WORDS = new Set(["of", "and", "the", "de", "des", "du", "la", "le", "y", "e", "di", "van", "von", "der", "for", "in", "on", "at"]);

function titleWord(word: string, first: boolean): string {
  if (!word) return word;
  const bare = word.replace(/[^A-Za-z]/g, "");
  if (ACRONYMS.has(bare)) return word;
  const lower = word.toLowerCase();
  if (!first && LOWER_WORDS.has(lower)) return lower;
  // Short all-consonant tokens are almost always initialisms ("BNY", "CBRE").
  if (bare.length <= 4 && !/[AEIOUY]/.test(bare)) return word;
  return lower.replace(/(^|[-'/(.&])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

function tidyName(raw: string): string {
  let name = raw
    .replace(/\s+/g, " ")
    .replace(/^\(\w\)\s*/, "") // "(B) JPMORGAN …"
    .trim();
  // "ESHARES, INC. DBA CARTA, INC." → the trading name.
  const dba = name.match(/\b(?:D\/B\/A|DBA)\s+(.+)$/i);
  if (dba) name = dba[1];
  name = name
    .replace(/\s*\((?:F\/?K\/?A|FORMERLY|D\/B\/A)[^)]*\)/gi, "")
    .replace(/,?\s+(?:A|AS A)\s+DIVISION\s+OF\s+.+$/i, "")
    .trim();
  for (let i = 0; i < 5; i++) {
    const next = name
      .replace(/\s*\([^)]*\)\s*$/, "") // trailing "(CAYMAN)", "(USA)"
      .replace(/,?\s+[A-Z][A-Z .'-]*\bBRANCH$/i, "") // ", DUBLIN BRANCH"
      .replace(/,?\s+S\.?\s?A\.?\s+DE\s+C\.?\s?V\.?$/i, "")
      .replace(LEGAL_SUFFIX, "")
      .replace(/[\s,.;:&-]+$/, "")
      .trim();
    if (next === name || next.length < 2) break;
    name = next;
  }
  if (name && name === name.toUpperCase()) {
    name = name
      .split(" ")
      .map((w, i) => titleWord(w, i === 0))
      .join(" ");
  }
  return name || raw.trim();
}

/** "J.P. Morgan" → "j-p-morgan". Stable across spellings of one brand. */
export function brandKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type ProviderBrand = {
  /** Slug used to group rows and address the provider page. */
  key: string;
  /** Display name. */
  name: string;
  /** True when a curated rule recognised the brand. */
  curated: boolean;
};

const cache = new Map<string, ProviderBrand>();

/** Collapse a raw Form ADV provider name to its brand. */
export function providerBrand(raw: string): ProviderBrand {
  const hit = cache.get(raw);
  if (hit) return hit;
  const upper = raw.toUpperCase().replace(/\s+/g, " ").trim();
  let result: ProviderBrand | null = null;
  for (const [brand, match] of RULES) {
    if (match.test(upper)) {
      result = { key: brandKey(brand), name: brand, curated: true };
      break;
    }
  }
  if (!result) {
    const name = tidyName(raw);
    result = { key: brandKey(name), name, curated: false };
  }
  if (cache.size > 20_000) cache.clear();
  cache.set(raw, result);
  return result;
}
