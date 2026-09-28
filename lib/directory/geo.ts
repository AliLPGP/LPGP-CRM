// Locations as the directory writes them, normalised for filtering.
//
// The capture sheets mix "City, ST, United States", "City, England, United
// Kingdom", "City, Country", bare countries ("USA", "UAE"), bare regions
// ("Americas", "EMEA") and the odd annotated value ("London, UK (KPMG
// International)"). Everything funnels into city / state / country / zone so a
// filter never has to know which spelling a row arrived with.
//
// Pure module: no imports, safe on the client.

export type Zone = "Americas" | "EMEA" | "APAC";
export type Subregion =
  | "North America"
  | "Latin America"
  | "Caribbean & Atlantic"
  | "Europe"
  | "Middle East"
  | "Africa"
  | "Asia"
  | "Oceania";

export const ZONES: Zone[] = ["Americas", "EMEA", "APAC"];

export const SUBREGIONS: Subregion[] = [
  "North America",
  "Latin America",
  "Caribbean & Atlantic",
  "Europe",
  "Middle East",
  "Africa",
  "Asia",
  "Oceania",
];

export const ZONE_LABEL: Record<Zone, string> = {
  Americas: "Americas",
  EMEA: "Europe, Middle East & Africa",
  APAC: "Asia-Pacific",
};

const SUBREGION_ZONE: Record<Subregion, Zone> = {
  "North America": "Americas",
  "Latin America": "Americas",
  "Caribbean & Atlantic": "Americas",
  Europe: "EMEA",
  "Middle East": "EMEA",
  Africa: "EMEA",
  Asia: "APAC",
  Oceania: "APAC",
};

// Canonical country → subregion. Canonical names are what the UI shows.
const COUNTRIES: Record<string, Subregion> = {
  "United States": "North America",
  Canada: "North America",
  Mexico: "Latin America",
  Brazil: "Latin America",
  Chile: "Latin America",
  Colombia: "Latin America",
  Peru: "Latin America",
  Argentina: "Latin America",
  Uruguay: "Latin America",
  Guatemala: "Latin America",
  Panama: "Latin America",
  "Costa Rica": "Latin America",
  Bermuda: "Caribbean & Atlantic",
  "Cayman Islands": "Caribbean & Atlantic",
  "British Virgin Islands": "Caribbean & Atlantic",
  Bahamas: "Caribbean & Atlantic",
  Barbados: "Caribbean & Atlantic",
  "Trinidad and Tobago": "Caribbean & Atlantic",
  Curaçao: "Caribbean & Atlantic",
  "Puerto Rico": "Caribbean & Atlantic",
  "United Kingdom": "Europe",
  Ireland: "Europe",
  Jersey: "Europe",
  Guernsey: "Europe",
  "Isle of Man": "Europe",
  Luxembourg: "Europe",
  Switzerland: "Europe",
  Liechtenstein: "Europe",
  Germany: "Europe",
  Austria: "Europe",
  France: "Europe",
  Monaco: "Europe",
  Belgium: "Europe",
  Netherlands: "Europe",
  Denmark: "Europe",
  Sweden: "Europe",
  Norway: "Europe",
  Finland: "Europe",
  Iceland: "Europe",
  Spain: "Europe",
  Portugal: "Europe",
  Italy: "Europe",
  Malta: "Europe",
  Greece: "Europe",
  Cyprus: "Europe",
  Poland: "Europe",
  "Czech Republic": "Europe",
  Hungary: "Europe",
  Romania: "Europe",
  Estonia: "Europe",
  Latvia: "Europe",
  Lithuania: "Europe",
  Slovenia: "Europe",
  Croatia: "Europe",
  Serbia: "Europe",
  Ukraine: "Europe",
  Russia: "Europe",
  Turkey: "Europe",
  Kazakhstan: "Asia",
  Azerbaijan: "Asia",
  Mongolia: "Asia",
  "United Arab Emirates": "Middle East",
  "Saudi Arabia": "Middle East",
  Qatar: "Middle East",
  Kuwait: "Middle East",
  Bahrain: "Middle East",
  Oman: "Middle East",
  Jordan: "Middle East",
  Lebanon: "Middle East",
  Israel: "Middle East",
  Egypt: "Africa",
  Morocco: "Africa",
  Libya: "Africa",
  Tunisia: "Africa",
  Nigeria: "Africa",
  Ghana: "Africa",
  Senegal: "Africa",
  "Côte d'Ivoire": "Africa",
  Kenya: "Africa",
  Ethiopia: "Africa",
  Rwanda: "Africa",
  Uganda: "Africa",
  Tanzania: "Africa",
  "South Africa": "Africa",
  Botswana: "Africa",
  Namibia: "Africa",
  Zambia: "Africa",
  Angola: "Africa",
  Gabon: "Africa",
  Mauritius: "Africa",
  China: "Asia",
  "Hong Kong": "Asia",
  Taiwan: "Asia",
  Japan: "Asia",
  "South Korea": "Asia",
  Singapore: "Asia",
  Malaysia: "Asia",
  Indonesia: "Asia",
  Thailand: "Asia",
  Vietnam: "Asia",
  Philippines: "Asia",
  Brunei: "Asia",
  "Timor-Leste": "Asia",
  India: "Asia",
  Pakistan: "Asia",
  Bangladesh: "Asia",
  "Sri Lanka": "Asia",
  Australia: "Oceania",
  "New Zealand": "Oceania",
};

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  "u.s.": "United States",
  "u.s.a.": "United States",
  "united states of america": "United States",
  america: "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  "great britain": "United Kingdom",
  britain: "United Kingdom",
  england: "United Kingdom",
  scotland: "United Kingdom",
  wales: "United Kingdom",
  "northern ireland": "United Kingdom",
  uae: "United Arab Emirates",
  "u.a.e.": "United Arab Emirates",
  dubai: "United Arab Emirates",
  "abu dhabi": "United Arab Emirates",
  korea: "South Korea",
  "korea, south": "South Korea",
  "republic of korea": "South Korea",
  "south korea": "South Korea",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
  czechia: "Czech Republic",
  "hong kong sar": "Hong Kong",
  prc: "China",
  "mainland china": "China",
  bvi: "British Virgin Islands",
  "cayman": "Cayman Islands",
  "grand cayman": "Cayman Islands",
  "ivory coast": "Côte d'Ivoire",
  curacao: "Curaçao",
  "türkiye": "Turkey",
  turkiye: "Turkey",
  "viet nam": "Vietnam",
  ksa: "Saudi Arabia",
};

const US_STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", "district of columbia": "DC",
  "d.c.": "DC", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID", illinois: "IL",
  indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME",
  maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC",
  "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA",
  "rhode island": "RI", "south carolina": "SC", "south dakota": "SD", tennessee: "TN",
  texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};
const US_STATE_CODES = new Set(Object.values(US_STATES));
const CA_PROVINCES: Record<string, string> = {
  ontario: "ON", quebec: "QC", "british columbia": "BC", alberta: "AB", manitoba: "MB",
  saskatchewan: "SK", "nova scotia": "NS", "new brunswick": "NB",
  "newfoundland and labrador": "NL", "prince edward island": "PE",
};
const CA_CODES = new Set(Object.values(CA_PROVINCES));

// The UK's constituent countries add nothing a filter can use.
const UK_NATIONS = new Set(["england", "scotland", "wales", "northern ireland"]);

// Cantons and states that sit between a city and its country ("Baar, Zug").
const SUBDIVISIONS = new Set(["zug", "zurich", "zürich", "geneva", "bavaria", "hesse", "île-de-france"]);

const CITY_ALIASES: Record<string, string> = {
  "new york city": "New York",
  nyc: "New York",
  "washington, d.c.": "Washington",
  "washington d.c.": "Washington",
  zürich: "Zurich",
  "st. helier": "St Helier",
  "st. peter port": "St Peter Port",
};

/** Canonical country for any spelling we recognise, else null. */
export function canonicalCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().replace(/\.$/, "");
  if (!v) return null;
  const lower = v.toLowerCase();
  if (COUNTRY_ALIASES[lower]) return COUNTRY_ALIASES[lower];
  for (const name of Object.keys(COUNTRIES)) {
    if (name.toLowerCase() === lower) return name;
  }
  return null;
}

export function subregionOf(country: string | null | undefined): Subregion | null {
  const c = canonicalCountry(country);
  return c ? COUNTRIES[c] : null;
}

export function zoneOf(country: string | null | undefined, regionText?: string | null): Zone | null {
  const sub = subregionOf(country);
  if (sub) return SUBREGION_ZONE[sub];
  const r = (regionText ?? "").toLowerCase();
  if (!r) return null;
  if (/\bamericas?\b|north america|latin america|latam/.test(r)) return "Americas";
  if (/\bemea\b|europe|middle east|africa|\bmena\b|\bgcc\b/.test(r)) return "EMEA";
  if (/asia|apac|pacific|oceania|australasia/.test(r)) return "APAC";
  // A region field holding a country ("Brazil / Latin America & Caribbean").
  for (const part of r.split(/[/,;&]| and /)) {
    const c = canonicalCountry(part);
    if (c) return SUBREGION_ZONE[COUNTRIES[c]];
  }
  return null;
}

export const ALL_COUNTRIES: string[] = Object.keys(COUNTRIES).sort();

export function countriesIn(sub: Subregion): string[] {
  return ALL_COUNTRIES.filter((c) => COUNTRIES[c] === sub);
}

export function countriesInZone(zone: Zone): string[] {
  return ALL_COUNTRIES.filter((c) => SUBREGION_ZONE[COUNTRIES[c]] === zone);
}

export type ParsedLocation = {
  city: string | null;
  /** Two-letter code for US states / Canadian provinces, else the subdivision. */
  state: string | null;
  country: string | null;
  zone: Zone | null;
  /** Tidy one-line form for display, e.g. "Los Angeles, CA, United States". */
  label: string | null;
};

const EMPTY: ParsedLocation = { city: null, state: null, country: null, zone: null, label: null };

function tidyCity(value: string): string {
  let v = value.trim();
  // Form ADV shouts ("NEW YORK", "GRAND CAYMAN").
  if (v.length > 3 && v === v.toUpperCase()) {
    v = v.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
  }
  return CITY_ALIASES[v.toLowerCase()] ?? v;
}

export function parseLocation(raw: string | null | undefined): ParsedLocation {
  if (!raw) return EMPTY;
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return EMPTY;

  // Bare macro-regions carry a zone and nothing else.
  const lower = text.toLowerCase();
  if (lower === "americas") return { ...EMPTY, zone: "Americas", label: "Americas" };
  if (lower === "emea") return { ...EMPTY, zone: "EMEA", label: "EMEA" };
  if (lower === "asia-pacific" || lower === "apac") return { ...EMPTY, zone: "APAC", label: "Asia-Pacific" };

  // Annotations: "USA (global; MUFG Group)", "UK / global".
  text = text.replace(/\s*\([^)]*\)/g, "").replace(/\s*\/\s*global\b/i, "").trim();

  // Several offices: keep the first, but borrow the last country if the first
  // has none ("San Francisco / New York, USA").
  const offices = text.split(/\s+(?:\/|&)\s+/);
  let first = offices[0];
  const firstParts = first.split(",").map((p) => p.trim()).filter(Boolean);
  if (offices.length > 1 && !canonicalCountry(firstParts[firstParts.length - 1])) {
    const tail = offices[offices.length - 1].split(",").map((p) => p.trim());
    const tailCountry = tail[tail.length - 1];
    if (canonicalCountry(tailCountry)) first = `${first}, ${tailCountry}`;
  }

  // "Seoul, Korea, South" → rejoin the ADV-style inverted country.
  const parts = first
    .replace(/Korea,\s*South/i, "South Korea")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  let country: string | null = null;
  if (parts.length && canonicalCountry(parts[parts.length - 1])) {
    const tail = parts.pop()!;
    country = canonicalCountry(tail);
  }

  let state: string | null = null;
  if (parts.length >= 2 || (parts.length === 1 && country)) {
    const candidate = parts[parts.length - 1];
    const upper = candidate.toUpperCase().replace(/\./g, "");
    const lc = candidate.toLowerCase();
    if (country === "United States" && (US_STATE_CODES.has(upper) || US_STATES[lc])) {
      state = US_STATE_CODES.has(upper) ? upper : US_STATES[lc];
      // "New York, New York" keeps New York as the city.
      if (parts.length >= 2) parts.pop();
      else if (US_STATES[lc] && lc !== "new york" && lc !== "washington") parts.pop();
      else if (US_STATE_CODES.has(upper)) parts.pop();
    } else if (country === "Canada" && (CA_CODES.has(upper) || CA_PROVINCES[lc])) {
      state = CA_CODES.has(upper) ? upper : CA_PROVINCES[lc];
      parts.pop();
    } else if (UK_NATIONS.has(lc)) {
      parts.pop();
    } else if (parts.length >= 2 && SUBDIVISIONS.has(lc)) {
      state = candidate;
      parts.pop();
    }
  }
  // A lone state with no city ("NY, United States").
  if (!country && parts.length === 1) {
    const c = canonicalCountry(parts[0]);
    if (c) {
      country = c;
      parts.pop();
    }
  }

  // "Washington, D.C., DC" → city Washington.
  const cityRaw = parts.length ? parts[0] : null;
  let city = cityRaw ? tidyCity(cityRaw) : null;
  if (city && UK_NATIONS.has(city.toLowerCase())) city = null;
  if (city && canonicalCountry(city) === country) city = null;
  if (city && US_STATE_CODES.has(city.toUpperCase()) && country === "United States" && !state) {
    state = city.toUpperCase();
    city = null;
  }

  const zone = zoneOf(country, null);
  const label = [city, state, country].filter(Boolean).join(", ") || null;
  return { city, state, country, zone, label };
}
