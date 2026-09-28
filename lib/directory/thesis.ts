// Thesis search: a sentence in, structured filters out.
//
// "Private credit managers in London with $1bn+ AUM audited by KPMG" becomes
// book GP · type Private credit · city London · AUM ≥ $1B · uses KPMG as
// auditor — shown back as chips the person can remove. Whatever the rules
// don't recognise stays as keywords and is ranked by relevance, so nothing
// typed is silently dropped.
//
// Deterministic and instant. Pure module: safe on the client.

import type { Category } from "../types";
import { ALL_COUNTRIES, type Subregion, type Zone } from "./geo";
import { EMPTY_FILTERS, type DirectoryFilters, type ProviderFilter } from "./filters";
import { normName } from "./normalize";
import type { ProviderRole } from "./providers";
import type { DirectoryBrand, DirectoryRecord } from "./records";

export type Interpretation = {
  filters: DirectoryFilters;
  /** Readings worth calling out ("Emerging manager → AUM ≤ $1B"). */
  notes: string[];
};

type Term = { re: RegExp; books?: Category[]; types?: string[] };

// Longest, most specific phrases first: "corporate pension" before "pension".
const TYPE_TERMS: Term[] = [
  { re: /\bcorporate pensions?( funds?| plans?| schemes?)?\b/, books: ["LP"], types: ["Corporate pension fund"] },
  { re: /\bpublic pensions?( funds?| plans?| systems?| schemes?)?\b/, books: ["LP"], types: ["Public pension fund"] },
  { re: /\b(pension( funds?| plans?| schemes?| systems?)?|pensions|retirement systems?|superannuation( funds?)?|super funds?)\b/, books: ["LP"], types: ["Public pension fund", "Corporate pension fund"] },
  { re: /\b(sovereign( wealth)?( funds?)?|swfs?)\b/, books: ["LP"], types: ["Sovereign wealth fund"] },
  { re: /\b(insurers?|insurance( compan(y|ies))?|reinsurers?)\b/, books: ["LP"], types: ["Insurance company"] },
  { re: /\bendowments?\b/, books: ["LP"], types: ["Endowment"] },
  { re: /\bfoundations?\b/, books: ["LP"], types: ["Foundation"] },
  { re: /\b(multi[- ]?family offices?|mfos?)\b/, types: ["Multi-family office"] },
  { re: /\b((single[- ])?family offices?|sfos?)\b/, types: ["Family office"] },
  { re: /\b(investment consultants?|pension consultants?|gatekeepers?)\b/, books: ["LP"], types: ["Investment consultant"] },
  { re: /\b(development finance( institutions?)?|dfis?)\b/, types: ["Development finance institution", "Development finance"] },
  { re: /\bgovernment agenc(y|ies)\b/, books: ["LP"], types: ["Government agency"] },
  { re: /\b(funds? of funds|fofs?)\b/, types: ["Fund of funds", "Fund of funds & secondaries"] },
  { re: /\bsecondar(y|ies)( funds?| managers?| buyers?| investors?)?\b/, books: ["GP"], types: ["Fund of funds & secondaries"] },
  { re: /\b(private credit|private debt|direct lend(ing|ers?)|credit (funds?|managers?|investors?)|debt (funds?|managers?)|lenders?)\b/, books: ["GP"], types: ["Private credit"] },
  { re: /\b(corporate venture( capital)?|cvcs?)\b/, books: ["GP"], types: ["Venture capital"] },
  { re: /\b(venture capital|venture( firms?| funds?| investors?)?|vcs?|seed[- ]stage|early[- ]stage)\b/, books: ["GP"], types: ["Venture capital"] },
  { re: /\bgrowth( equity| stage| capital| investors?| funds?)?\b/, books: ["GP"], types: ["Growth equity"] },
  { re: /\b(private equity|pe (firms?|funds?|houses?|managers?|sponsors?|investors?)|buy[- ]?outs?|lbos?|financial sponsors?)\b/, books: ["GP"], types: ["Private equity"] },
  { re: /\b(real estate|property|reits?|realty)\b/, books: ["GP"], types: ["Real estate"] },
  { re: /\binfra(structure)?\b/, books: ["GP"], types: ["Infrastructure"] },
  { re: /\b(hedge funds?|multi[- ]?strat(egy)?)\b/, books: ["GP"], types: ["Hedge fund"] },
  { re: /\b(multi[- ]?asset|alternatives? (asset |investment )?managers?|alts managers?)\b/, books: ["GP"], types: ["Multi-asset alternatives"] },
  { re: /\basset managers?\b/, types: ["Asset manager"] },
  { re: /\b(fund admin(istrators?|istration|s)?|administrators?|fund services)\b/, books: ["SP"], types: ["Fund administrator"] },
  { re: /\b(auditors?|audit firms?|accounting firms?|accountants?|big (4|four))\b/, books: ["SP"], types: ["Audit & advisory"] },
  { re: /\b(law firms?|lawyers?|legal (counsel|advis[eo]rs?)|solicitors?|attorneys?)\b/, books: ["SP"], types: ["Law firm"] },
  { re: /\b(tech(nology)? (vendors?|providers?|compan(y|ies)|firms?)|software( vendors?| providers?| compan(y|ies))?|saas|fintechs?|data (providers?|vendors?)|platforms?)\b/, books: ["SP"], types: ["Technology vendor"] },
  { re: /\b(valuation( firms?| providers?| agents?)?|rating agenc(y|ies)|credit ratings?)\b/, books: ["SP"], types: ["Valuation & ratings"] },
  { re: /\b(research|analytics)( providers?| firms?| houses?)\b/, books: ["SP"], types: ["Research & analytics"] },
  { re: /\b(fx|foreign exchange|treasury|currency|payments?)( providers?| firms?| specialists?| managers?)\b/, books: ["SP"], types: ["FX & treasury"] },
  { re: /\b(placement agents?|placement firms?|capital raising (advis[eo]rs?|firms?))\b/, books: ["SP"], types: ["Placement agent"] },
  { re: /\b(executive search|headhunters?|recruit(ers?|ment|ing)( firms?)?|talent( firms?)?)\b/, books: ["SP"], types: ["Talent & search"] },
  { re: /\b(industry bod(y|ies)|trade bod(y|ies)|trade associations?|associations?)\b/, books: ["SP"], types: ["Industry body"] },
  { re: /\b(consultants|consulting( firms?)?|consultanc(y|ies)|advisory firms?)\b/, books: ["SP"], types: ["Consulting"] },
  { re: /\b(banks|bank|banking)\b/, types: ["Bank"] },
];

/** SP types whose client lists Form ADV Schedule D actually records. */
const ADV_TYPES = ["Fund administrator", "Audit & advisory", "Bank", "Placement agent"];

const BOOK_TERMS: Term[] = [
  { re: /\b(lps?|limited partners?|allocators?|institutional investors?|asset owners?|institutions|investors?)\b/, books: ["LP"] },
  { re: /\b(gps?|general partners?|fund managers?|investment managers?|managers?|sponsors?|investment firms?)\b/, books: ["GP"] },
  { re: /\b(sps?|service providers?|solution providers?|vendors?|providers?|suppliers?|advis[eo]rs?)\b/, books: ["SP"] },
  { re: /\bunclassified\b/, books: ["UN"] },
];

const ROLE_CUES: [RegExp, ProviderRole][] = [
  [/\baudit(ed|ors?|s)?\b|\baccountants?\b/, "auditor"],
  [/\badmin(istered|istrators?|istration|s)?\b|\bfund services\b/, "administrator"],
  [/\bprime( brok(er|ers|erage))?\b/, "prime_broker"],
  [/\bcustod(y|ians?|ied)\b|\bbank(s|ing)? with\b/, "custodian"],
  [/\bplacement\b|\bplaced by\b|\braised? (with|by|through)\b|\bmarketers?\b|\bdistribution\b/, "placement_agent"],
];
const AFTER_ROLE =
  /^\s+(as|for)\s+(their\s+|its\s+|the\s+|an?\s+)?(fund\s+)?(auditors?|audit|administrators?|administration|admin|custodians?|custody|prime\s+brok(er|ers|erage)|placement(\s+agents?)?)\b/;
const USE_CUE =
  /\b(use|uses|using|used|with|by|client(s)? of|serviced|served|works? with|working with|backed by|through|banks? with|banking with)\b/;

// Common alternative spellings, keyed by brand slug.
const BRAND_ALIASES: Record<string, string[]> = {
  "j-p-morgan": ["jp morgan", "jpmorgan", "j p morgan", "jpm", "chase"],
  "bank-of-america": ["bofa", "merrill", "merrill lynch", "baml"],
  pwc: ["pricewaterhousecoopers", "price waterhouse"],
  ey: ["ernst and young", "ernst young"],
  bny: ["bny mellon", "bank of new york", "pershing"],
  "first-citizens-svb": ["svb", "silicon valley bank", "first citizens"],
  citi: ["citibank", "citigroup"],
  "goldman-sachs": ["goldman"],
  "ss-and-c": ["ssc", "ss and c", "ss c"],
  "iq-eq": ["iqeq", "iq eq"],
  "state-street": ["ifs"],
  "u-s-bank": ["us bank", "usbank", "u s bank"],
  "gen-ii-fund-services": ["gen ii", "gen 2"],
  "pjt-park-hill": ["park hill", "pjt"],
  "alter-domus": ["alterdomus"],
  "apex-group": ["apex"],
};

const COUNTRY_WORDS: Record<string, string> = {
  american: "United States",
  "u.s.": "United States",
  usa: "United States",
  "united states": "United States",
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  british: "United Kingdom",
  england: "United Kingdom",
  english: "United Kingdom",
  scottish: "United Kingdom",
  scotland: "United Kingdom",
  irish: "Ireland",
  swiss: "Switzerland",
  german: "Germany",
  french: "France",
  dutch: "Netherlands",
  belgian: "Belgium",
  spanish: "Spain",
  italian: "Italy",
  portuguese: "Portugal",
  swedish: "Sweden",
  norwegian: "Norway",
  danish: "Denmark",
  finnish: "Finland",
  austrian: "Austria",
  polish: "Poland",
  greek: "Greece",
  turkish: "Turkey",
  israeli: "Israel",
  emirati: "United Arab Emirates",
  uae: "United Arab Emirates",
  dubai: "United Arab Emirates",
  "abu dhabi": "United Arab Emirates",
  saudi: "Saudi Arabia",
  qatari: "Qatar",
  kuwaiti: "Kuwait",
  egyptian: "Egypt",
  moroccan: "Morocco",
  nigerian: "Nigeria",
  kenyan: "Kenya",
  "south african": "South Africa",
  indian: "India",
  chinese: "China",
  japanese: "Japan",
  korean: "South Korea",
  korea: "South Korea",
  singaporean: "Singapore",
  malaysian: "Malaysia",
  indonesian: "Indonesia",
  thai: "Thailand",
  vietnamese: "Vietnam",
  australian: "Australia",
  canadian: "Canada",
  mexican: "Mexico",
  brazilian: "Brazil",
  chilean: "Chile",
  colombian: "Colombia",
  peruvian: "Peru",
  argentinian: "Argentina",
  argentine: "Argentina",
  luxembourgish: "Luxembourg",
};

const COUNTRY_GROUPS: [RegExp, string, string[]][] = [
  [/\bnordics?\b|\bscandinavian?\b/, "Nordics", ["Sweden", "Norway", "Denmark", "Finland", "Iceland"]],
  [/\bdach\b/, "DACH", ["Germany", "Austria", "Switzerland"]],
  [/\bbenelux\b/, "Benelux", ["Belgium", "Netherlands", "Luxembourg"]],
  [/\b(gcc|gulf)\b/, "GCC", ["United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait", "Bahrain", "Oman"]],
  [/\bchannel islands\b/, "Channel Islands", ["Jersey", "Guernsey"]],
  [/\boffshore\b/, "Offshore centres", ["Cayman Islands", "Bermuda", "British Virgin Islands", "Jersey", "Guernsey", "Isle of Man"]],
  [/\bnorth americ(a|an)\b/, "North America", ["United States", "Canada"]],
  [/\biberia(n)?\b/, "Iberia", ["Spain", "Portugal"]],
];

const REGION_WORDS: [RegExp, Subregion][] = [
  [/\b(latin america(n)?|latam)\b/, "Latin America"],
  [/\bmiddle east(ern)?\b|\bmena\b/, "Middle East"],
  [/\bafrica(n)?\b/, "Africa"],
  [/\b(continental )?europe(an)?\b/, "Europe"],
  [/\b(oceania|australasia|anz)\b/, "Oceania"],
  [/\bcaribbean\b/, "Caribbean & Atlantic"],
  [/\basia(n)?\b(?![- ]pacific)/, "Asia"],
];

const ZONE_WORDS: [RegExp, Zone][] = [
  [/\bemea\b/, "EMEA"],
  [/\b(apac|asia[- ]pacific)\b/, "APAC"],
  [/\bamericas\b/, "Americas"],
];

const STATE_NAMES: Record<string, string> = {
  california: "CA", texas: "TX", florida: "FL", massachusetts: "MA", illinois: "IL",
  connecticut: "CT", pennsylvania: "PA", "new jersey": "NJ", colorado: "CO", georgia: "GA",
  "north carolina": "NC", virginia: "VA", maryland: "MD", ohio: "OH", michigan: "MI",
  minnesota: "MN", tennessee: "TN", arizona: "AZ", utah: "UT", missouri: "MO",
  wisconsin: "WI", oregon: "OR", delaware: "DE", nevada: "NV", "washington state": "WA",
};

const CITY_GROUPS: [RegExp, string, string[]][] = [
  [/\b(bay area|silicon valley)\b/, "Bay Area", ["San Francisco", "Menlo Park", "Palo Alto", "San Mateo", "Mountain View", "Redwood City", "Oakland", "Berkeley", "San Jose", "Emeryville", "Burlingame", "Sausalito", "Woodside"]],
  [/\b(nyc|new york city|manhattan)\b/, "New York", ["New York"]],
];

const FILLER = new Set(
  (
    "a an the of and or in on at for to with by from that which who whose are is be been being their them " +
    "show find me list get give search all any some firms firm companies company businesses business based " +
    "located headquartered hq offices office focused focusing focus on specialising specializing specialised " +
    "specialized invest invests investing into investment investments looking look like similar also plus " +
    "than more over under above below around about only such as e.g eg etc their its our my we i you"
  ).split(" "),
);

const UNIT: Record<string, number> = {
  t: 1e12, tn: 1e12, trillion: 1e12,
  b: 1e9, bn: 1e9, billion: 1e9,
  m: 1e6, mm: 1e6, mn: 1e6, million: 1e6,
  k: 1e3, thousand: 1e3,
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Vocab = {
  brands: { key: string; name: string; re: RegExp }[];
  cities: { name: string; re: RegExp }[];
  firms: { id: string; key: string; name: string }[];
};

/** Brand, city and firm dictionaries for the current index. Build once. */
export function buildVocab(records: DirectoryRecord[], brands: DirectoryBrand[]): Vocab {
  const brandEntries: Vocab["brands"] = [];
  for (const b of brands) {
    if (b.clients < 2) continue;
    const phrases = new Set([b.name.toLowerCase(), ...(BRAND_ALIASES[b.key] ?? [])]);
    for (const p of phrases) {
      const clean = p.replace(/[^\w&.+' -]/g, "").trim();
      if (clean.length < 2) continue;
      brandEntries.push({
        key: b.key,
        name: b.name,
        re: new RegExp(`(^|[^a-z0-9])${escapeRe(clean).replace(/\\\.|\s+/g, "[.\\s]*")}(?=$|[^a-z0-9])`),
      });
    }
  }
  brandEntries.sort((a, b) => b.re.source.length - a.re.source.length);

  const cityNames = new Set<string>();
  for (const r of records) if (r.city && r.city.length >= 3) cityNames.add(r.city);
  const countrySet = new Set(ALL_COUNTRIES.map((c) => c.toLowerCase()));
  const cities = [...cityNames]
    .filter((c) => !countrySet.has(c.toLowerCase()))
    .sort((a, b) => b.length - a.length)
    .map((name) => ({ name, re: new RegExp(`\\b${escapeRe(name.toLowerCase())}\\b`) }));

  const firms = records
    .map((r) => ({ id: r.id, key: normName(r.name), name: r.name }))
    .filter((f) => f.key.length >= 3)
    .sort((a, b) => b.key.length - a.key.length);

  return { brands: brandEntries, cities, firms };
}

/** Interpret a thesis. The result replaces the current filters. */
export function interpret(query: string, vocab: Vocab, now = new Date()): Interpretation {
  const f: DirectoryFilters = structuredClone(EMPTY_FILTERS);
  const notes: string[] = [];
  const original = ` ${query.replace(/\s+/g, " ").trim()} `;
  let s = original.toLowerCase().replace(/[“”"]/g, " ");

  const extraKeywords: string[] = [];
  const add = <T>(list: T[], values: T[]) => {
    for (const v of values) if (!list.includes(v)) list.push(v);
  };
  /** Blank out a span so later rules and the keyword pass don't see it again. */
  const consume = (start: number, end: number) => {
    s = s.slice(0, start) + " ".repeat(end - start) + s.slice(end);
  };
  const takeAll = (re: RegExp, fn: (m: RegExpExecArray) => boolean | void) => {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    const spans: [number, number][] = [];
    while ((m = g.exec(s))) {
      if (m[0].length === 0) {
        g.lastIndex += 1;
        continue;
      }
      if (fn(m) !== false) spans.push([m.index, m.index + m[0].length]);
    }
    for (const [a, b] of spans) consume(a, b);
  };

  // 1. Lookalikes: "like Ares", "similar to Blackstone".
  takeAll(
    /\b(?:similar to|lookalikes? (?:of|for|to)|comparable to|peers of|firms like|companies like|managers like|investors like|like)\s+(.+?)(?=\s+(?:in|with|that|who|which|based|headquartered|but|over|under|above|below|using|audited|administered)\b|[,.;]|\s*$)/,
    (m) => {
      const target = normName(m[1]);
      if (!target) return false;
      const hit =
        vocab.firms.find((x) => x.key === target) ??
        vocab.firms.find((x) => x.key.startsWith(`${target} `)) ??
        vocab.firms.find((x) => target.length >= 4 && x.key.includes(target));
      if (!hit) return false;
      add(f.like, [hit.id]);
      return true;
    },
  );

  // 2. Providers named with a cue: "audited by KPMG", "that use Alter Domus".
  for (const b of vocab.brands) {
    let m: RegExpExecArray | null;
    const re = new RegExp(b.re.source, "g");
    while ((m = re.exec(s))) {
      const start = m.index + m[1].length;
      const end = m.index + m[0].length;
      // Only a cue right before the name counts ("audited by KPMG"), so a
      // "with" earlier in the sentence can't swallow the words between.
      const windowStart = Math.max(0, start - 28);
      const before = s.slice(windowStart, start);
      let role: ProviderRole | null = null;
      let cueAt = -1;
      for (const [cue, r] of ROLE_CUES) {
        const last = [...before.matchAll(new RegExp(cue.source, "g"))].pop();
        if (last && last.index! > cueAt) {
          cueAt = last.index!;
          role = r;
        }
      }
      const use = [...before.matchAll(new RegExp(USE_CUE.source, "g"))].pop();
      if (!role && !use) continue;
      const cueStart = role ? cueAt : use!.index!;
      // "… using Alter Domus as administrator": the role can follow the name.
      let stop = end;
      const after = s.slice(end).match(AFTER_ROLE);
      if (after) {
        for (const [cue, r] of ROLE_CUES) {
          if (cue.test(after[0])) {
            role = r;
            break;
          }
        }
        stop = end + after[0].length;
      }
      const entry: ProviderFilter = { key: b.key, role };
      if (!f.providers.some((p) => p.key === entry.key && p.role === entry.role)) f.providers.push(entry);
      consume(windowStart + cueStart, stop);
      re.lastIndex = stop;
    }
  }

  // 3. Form ADV status.
  takeAll(/\b(sec[- ]registered|registered (investment )?advis[eo]rs?|rias?)\b/, () => {
    add(f.adv, ["Registered"]);
  });
  takeAll(/\bexempt reporting( advis[eo]rs?)?\b/, () => {
    add(f.adv, ["ERA"]);
  });
  // "ERA" only in capitals: "a new era" is not a filing status.
  if (/\bERAs?\b/.test(original)) {
    takeAll(/\beras?\b/, () => {
      add(f.adv, ["ERA"]);
    });
  }
  takeAll(/\b(files?|filing|filed) (a )?form adv\b|\badv filers?\b|\bon form adv\b/, () => {
    add(f.adv, ["Registered", "ERA"]);
  });

  // 4. Data on file.
  takeAll(/\bwith (key |named )?(contacts|decision[- ]makers|people|names)\b/, () => {
    f.hasContacts = true;
  });
  takeAll(/\bwith (direct )?e-?mails?\b|\bconnectable\b|\breachable\b/, () => {
    f.connectable = true;
  });
  takeAll(/\bwith (a )?websites?\b/, () => {
    f.hasWebsite = true;
  });
  takeAll(
    /\b(that |who |which )?(disclose|disclosing|discloses|publish|publishes|publishing|report|reports|reporting)( their| its)?( fund[- ]level)? (commitments|allocations|portfolios?)\b/,
    () => {
      f.discloses = true;
    },
  );
  takeAll(/\b(in )?(my|our) portfolio\b/, () => {
    f.portfolio = true;
  });

  // 5. Size.
  takeAll(
    /\bbetween\s+\$?\s*(\d+(?:\.\d+)?)\s*(t|tn|trillion|b|bn|billion|m|mm|mn|million)?\s*(?:and|-|to)\s*\$?\s*(\d+(?:\.\d+)?)\s*(t|tn|trillion|b|bn|billion|m|mm|mn|million)\b(\s*(of\s+)?(aum|assets|under management))?/,
    (m) => {
      const hiUnit = UNIT[m[4]];
      const lo = Number(m[1]) * (m[2] ? UNIT[m[2]] : hiUnit);
      const hi = Number(m[3]) * hiUnit;
      if (!(lo > 0 && hi > lo)) return false;
      f.aumMin = lo;
      f.aumMax = hi;
      return true;
    },
  );
  takeAll(
    /(?:(?:over|above|more than|greater than|at least|north of|upwards of|exceeding|under|below|less than|up to|sub)\s*[-–]?\s*|[<>]\s*)?(?:\$|usd\s*|us\$|€|£)?\s*(\d+(?:\.\d+)?)\s*(t|tn|trillion|b|bn|billion|m|mm|mn|million)\b\+?(\s*(of\s+|in\s+)?(aum|assets( under management)?|under management|raum|fund size))?/,
    (m) => {
      const value = Number(m[1]) * (UNIT[m[2]] ?? 1);
      if (!Number.isFinite(value) || value <= 0) return false;
      if (/^(under|below|less than|up to|sub|<)/.test(m[0].trim())) f.aumMax = value;
      else f.aumMin = value;
      return true;
    },
  );
  takeAll(
    /(?:(over|above|more than|at least|greater than|>)\s*|(under|below|fewer than|less than|up to|<)\s*)?(\d[\d,]*)\s*(\+)?\s*(employees|staff|people|professionals|headcount|fte)\b/,
    (m) => {
      const n = Number(m[3].replace(/,/g, ""));
      if (!Number.isFinite(n)) return false;
      if (m[2]) f.empMax = n;
      else f.empMin = n;
      return true;
    },
  );
  takeAll(/\bemerging (managers?|gps?)\b/, () => {
    f.aumMax = f.aumMax ?? 1e9;
    add(f.books, ["GP"]);
    notes.push("Emerging manager read as AUM up to $1B");
  });
  takeAll(/\b(largest|biggest|top(\s+\d+)?|leading|major)\b/, () => {
    f.sort = "aum";
  });

  // 6. Founding date.
  const year = now.getFullYear();
  takeAll(/\b(?:founded|established|launched|started|formed)\s+(after|since|post|in or after)\s+((?:19|20)\d{2})\b/, (m) => {
    f.foundedMin = Number(m[2]) + (m[1] === "after" || m[1] === "post" ? 1 : 0);
  });
  takeAll(/\b(?:founded|established|launched|started|formed)\s+(before|prior to|pre)\s+((?:19|20)\d{2})\b/, (m) => {
    f.foundedMax = Number(m[2]) - 1;
  });
  takeAll(/\b(?:founded|established|launched|started|formed)\s+in\s+the\s+((?:19|20)\d)0s\b/, (m) => {
    f.foundedMin = Number(m[1]) * 10;
    f.foundedMax = Number(m[1]) * 10 + 9;
  });
  takeAll(/\b(?:founded|established|launched|started|formed)\s+in\s+((?:19|20)\d{2})\b/, (m) => {
    f.foundedMin = Number(m[1]);
    f.foundedMax = Number(m[1]);
  });
  takeAll(/\b(new|young|newer|recently (founded|launched|established)|start[- ]?ups?)\b(?= (managers?|firms?|funds?|gps?|vcs?|companies))/, () => {
    f.foundedMin = year - 5;
    notes.push(`“New” read as founded ${year - 5} or later`);
  });

  // 7. Who a provider serves ("administrators serving venture firms"), then
  //    types, then books.
  // Form ADV only records auditors, administrators, custodians, prime
  // brokers and placement agents, so "tech vendors for private credit" is a
  // keyword question while "administrators for private credit" is a filing one.
  const spTypes = TYPE_TERMS.filter((t) => t.books?.includes("SP") && t.re.test(s)).flatMap((t) => t.types ?? []);
  const filedRoles = spTypes.some((t) => ADV_TYPES.includes(t));
  const cue = spTypes.length ? "serving|serves|serve|servicing|used by|working with|for|to" : "serving|serves|serve|servicing|used by|working with";
  for (const t of TYPE_TERMS) {
    if (t.books?.includes("SP") || t.books?.includes("LP")) continue;
    const serving = new RegExp(
      `\\b(${cue}|clients? (in|among|include))\\s+(the\\s+)?(${t.re.source})(\\s+(firms?|managers?|funds?|companies|clients?|gps?))?`,
    );
    takeAll(serving, (m) => {
      if (filedRoles || !spTypes.length) {
        if (t.types) add(f.clientTypes, t.types);
      } else {
        extraKeywords.push(m[4]);
      }
    });
  }
  for (const t of TYPE_TERMS) {
    takeAll(t.re, () => {
      if (t.types) add(f.types, t.types);
      if (t.books) add(f.books, t.books);
    });
  }
  for (const t of BOOK_TERMS) {
    takeAll(t.re, () => {
      if (t.books) add(f.books, t.books);
    });
  }

  // 8. Places.
  for (const [re, zone] of ZONE_WORDS) takeAll(re, () => add(f.zones, [zone]));
  for (const [re, label, countries] of CITY_GROUPS) {
    takeAll(re, () => {
      add(f.cities, countries);
      if (label !== countries[0]) notes.push(`${label}: ${countries.slice(0, 4).join(", ")}…`);
    });
  }
  for (const [re, label, countries] of COUNTRY_GROUPS) {
    takeAll(re, () => {
      add(f.countries, countries);
      notes.push(`${label}: ${countries.join(", ")}`);
    });
  }
  for (const [re, region] of REGION_WORDS) takeAll(re, () => add(f.regions, [region]));
  for (const [word, state] of Object.entries(STATE_NAMES)) {
    takeAll(new RegExp(`\\b${escapeRe(word)}\\b`), () => add(f.states, [state]));
  }
  for (const c of vocab.cities) takeAll(c.re, () => add(f.cities, [c.name]));
  const countryWords = [
    ...Object.keys(COUNTRY_WORDS),
    ...ALL_COUNTRIES.map((c) => c.toLowerCase()),
  ].sort((a, b) => b.length - a.length);
  for (const word of countryWords) {
    const country = COUNTRY_WORDS[word] ?? ALL_COUNTRIES.find((c) => c.toLowerCase() === word)!;
    takeAll(new RegExp(`(^|[^a-z])${escapeRe(word)}(?=$|[^a-z])`), () => add(f.countries, [country]));
  }
  // "US" only when typed in capitals — "us" is usually a pronoun.
  if (/\bUS\b/.test(original)) {
    takeAll(/\bus\b/, () => add(f.countries, ["United States"]));
  }

  // 9. Whatever's left is ranked as keywords.
  const words = `${s} ${extraKeywords.join(" ")}`
    .split(/[^a-z0-9&'-]+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w) && w.length > 1);
  f.keywords = words.join(" ");

  return { filters: f, notes };
}

// --- AI reading → filters ------------------------------------------------------
// The shape lib/directory/ai-actions.ts asks Claude for. Names the model
// returns (providers, firms, places) are resolved against this directory's own
// vocabulary here, so a filter only ever points at something that exists.

export type AiReading = {
  books: ("LP" | "GP" | "SP" | "UN")[];
  types: string[];
  serves_types: string[];
  zones: string[];
  regions: string[];
  countries: string[];
  us_states: string[];
  cities: string[];
  aum_min_usd: number | null;
  aum_max_usd: number | null;
  employees_min: number | null;
  employees_max: number | null;
  founded_min: number | null;
  founded_max: number | null;
  adv: ("Registered" | "ERA" | "None")[];
  providers: { name: string; role: string }[];
  similar_to: string[];
  has_contacts: boolean;
  has_email: boolean;
  discloses_commitments: boolean;
  keywords: string;
  sort: "aum" | "employees" | "founded" | "name" | null;
  explanation: string;
};

const ROLE_KEYS: ProviderRole[] = ["auditor", "administrator", "custodian", "prime_broker", "placement_agent"];

export function readingToFilters(reading: AiReading, vocab: Vocab): Interpretation {
  const f: DirectoryFilters = structuredClone(EMPTY_FILTERS);
  const notes: string[] = [];
  const zoneSet: string[] = ["Americas", "EMEA", "APAC"];
  const regionSet: string[] = [
    "North America", "Latin America", "Caribbean & Atlantic", "Europe", "Middle East", "Africa", "Asia", "Oceania",
  ];

  f.books = reading.books.filter((b): b is Category => ["LP", "GP", "SP", "UN"].includes(b));
  f.types = [...new Set(reading.types)];
  f.clientTypes = [...new Set(reading.serves_types)];
  f.zones = reading.zones.filter((z): z is Zone => zoneSet.includes(z));
  f.regions = reading.regions.filter((r): r is Subregion => regionSet.includes(r));
  f.countries = [
    ...new Set(
      reading.countries
        .map((c) => ALL_COUNTRIES.find((x) => x.toLowerCase() === c.trim().toLowerCase()) ?? COUNTRY_WORDS[c.trim().toLowerCase()])
        .filter(Boolean) as string[],
    ),
  ];
  f.states = [...new Set(reading.us_states.map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)))];
  const knownCities = new Map(vocab.cities.map((c) => [c.name.toLowerCase(), c.name]));
  f.cities = [...new Set(reading.cities.map((c) => knownCities.get(c.trim().toLowerCase()) ?? c.trim()).filter(Boolean))];

  const positive = (n: number | null) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
  f.aumMin = positive(reading.aum_min_usd);
  f.aumMax = positive(reading.aum_max_usd);
  f.empMin = positive(reading.employees_min);
  f.empMax = positive(reading.employees_max);
  const yr = (n: number | null) => (n != null && n >= 1600 && n <= 2100 ? Math.round(n) : null);
  f.foundedMin = yr(reading.founded_min);
  f.foundedMax = yr(reading.founded_max);
  f.adv = [...new Set(reading.adv)];

  for (const p of reading.providers) {
    const probe = ` ${p.name.toLowerCase()} `;
    const brand = vocab.brands.find((b) => new RegExp(b.re.source).test(probe));
    if (!brand) {
      notes.push(`No provider called “${p.name}” in the Form ADV data`);
      continue;
    }
    const role = ROLE_KEYS.includes(p.role as ProviderRole) ? (p.role as ProviderRole) : null;
    if (!f.providers.some((x) => x.key === brand.key && x.role === role)) f.providers.push({ key: brand.key, role });
  }

  for (const name of reading.similar_to) {
    const key = normName(name);
    if (!key) continue;
    const hit =
      vocab.firms.find((x) => x.key === key) ??
      vocab.firms.find((x) => x.key.startsWith(`${key} `)) ??
      vocab.firms.find((x) => key.length >= 4 && x.key.includes(key));
    if (hit && !f.like.includes(hit.id)) f.like.push(hit.id);
    else if (!hit) notes.push(`“${name}” isn't in the directory`);
  }

  f.hasContacts = reading.has_contacts;
  f.connectable = reading.has_email;
  f.discloses = reading.discloses_commitments;
  f.keywords = reading.keywords.trim();
  f.sort = reading.sort;
  if (reading.explanation.trim()) notes.unshift(reading.explanation.trim());
  return { filters: f, notes };
}
