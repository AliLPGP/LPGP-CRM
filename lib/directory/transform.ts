// Master Directory workbook → import bundle.
//
// The workbook is the team's capture file: one sheet per book (GP / LP / SP /
// Unclassified), the Form ADV Schedule D provider links, the public LP→GP
// commitments and a row-level source log. This module turns those sheets into
// rows shaped for our tables, and does the cleaning the sheets can't:
//
// - duplicates merge (same firm under two spellings or two sheets), keeping
//   every source id so a re-import lands on the same record;
// - locations split into city / state / country / zone;
// - provider names collapse to brands (lib/directory/providers.ts);
// - nothing is inferred that the sheet doesn't say. An empty cell stays empty.
//
// Pure: takes sheets as arrays of rows (what SheetJS `sheet_to_json` with
// `header: 1` returns), so it runs in the browser and in Node alike.

import { parseLocation } from "./geo";
import {
  amountIn,
  bool,
  dateIn,
  gpType,
  int,
  isoDate,
  lpType,
  normDomain,
  normName,
  num,
  parseFundSummary,
  parseSources,
  spType,
  splitName,
  str,
  toUrl,
  year,
  yearIn,
  type SourceLink,
} from "./normalize";
import { normalizeRole, providerBrand, type ProviderRole } from "./providers";

export type DirCategory = "LP" | "GP" | "SP" | "UN";

export type AdvEntity = {
  crd: string | null;
  file_number: string | null;
  entity: string | null;
  firm_type: string | null;
  regulatory_aum_usd: number | null;
  last_filed: string | null;
  source_url: string | null;
};

export type ServiceLine = { name: string; description: string | null; capabilities: string[] };

/** A company row, column-for-column with `public.companies`. */
export type DirCompany = {
  external_id: string;
  external_ids: string[];
  name: string;
  category: DirCategory;
  sub_type: string | null;
  directory_vertical: string | null;
  description: string | null;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  hq_location: string | null;
  region: string | null;
  founded_year: number | null;
  years_active: number | null;
  employee_count: number | null;
  industry: string | null;
  lusha_company_id: string | null;
  lusha_verified_on: string | null;
  sec_crd: string | null;
  sec_file_number: string | null;
  adv_firm_type: string | null;
  adv_matched_entity: string | null;
  adv_last_filed: string | null;
  adv_employee_count: number | null;
  private_fund_count: number | null;
  private_fund_gross_assets: number | null;
  regulatory_aum_usd: number | null;
  brand_entity_count: number | null;
  brand_aum_total_usd: number | null;
  adv_source_url: string | null;
  adv_entities: AdvEntity[];
  investor_type: string | null;
  total_assets_usd: number | null;
  alts_allocation_pct: number | null;
  discloses_commitments: string | null;
  disclosure_source_url: string | null;
  assets_monitored_usd: number | null;
  assets_monitored_display: string | null;
  lifecycle: string[];
  service_lines: ServiceLine[];
  sources: SourceLink[];
  catalog_updated_at: string | null;
};

export type DirContact = {
  /** Stable per person per firm, so a re-import updates instead of adding. */
  external_ref: string;
  company_ext: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  /** The team's master sheet holds a direct email for this person. */
  connectable: boolean | null;
};

export type DirRelationship = {
  external_key: string;
  client_ext: string;
  role: ProviderRole;
  provider_key: string;
  provider_brand: string;
  /** Directory SP this brand resolves to, when the workbook has one. */
  provider_ext: string | null;
  provider_entities: string[];
  provider_locations: string[];
  fund_count: number;
  fund_examples: string[];
  filed: string | null;
  source_url: string | null;
};

export type DirCommitment = {
  external_key: string;
  lp_ext: string;
  lp_name: string;
  gp_ext: string | null;
  gp_name: string;
  fund_name: string | null;
  amount: number | null;
  currency: string | null;
  amount_text: string | null;
  commitment_date: string | null;
  commitment_date_text: string | null;
  commitment_year: number | null;
  disclosure_type: string | null;
  source_url: string | null;
  source_date: string | null;
};

export type DirectoryStats = {
  sheetRows: Record<DirCategory, number>;
  companies: Record<DirCategory, number>;
  mergedGroups: number;
  mergedRows: number;
  contacts: number;
  connectableContacts: number;
  relationshipRows: number;
  relationships: number;
  providerBrands: number;
  linkedProviderBrands: number;
  commitments: number;
  withAdv: number;
  withAum: number;
  withDomain: number;
  withDescription: number;
};

export type DirectoryBundle = {
  companies: DirCompany[];
  contacts: DirContact[];
  relationships: DirRelationship[];
  commitments: DirCommitment[];
  /** Every workbook id → the id of the record it merged into. */
  aliases: Record<string, string>;
  stats: DirectoryStats;
  warnings: string[];
};

export type Sheets = Record<string, unknown[][]>;

// --- Sheet access --------------------------------------------------------------

const ID_RE = /^(GP|GPX|LP|LPX|SP|SPX|UNC)-\d{3,}$/;

function findSheet(sheets: Sheets, ...needles: string[]): unknown[][] | null {
  const names = Object.keys(sheets);
  for (const needle of needles) {
    const hit = names.find((n) => n.toLowerCase().trim() === needle);
    if (hit) return sheets[hit];
  }
  for (const needle of needles) {
    const hit = names.find((n) => n.toLowerCase().includes(needle));
    if (hit) return sheets[hit];
  }
  return null;
}

type Rec = Record<string, unknown>;

/** Rows as objects keyed by the header row that holds `firstColumn`. */
function records(rows: unknown[][] | null, firstColumn: string): Rec[] {
  if (!rows) return [];
  const headerIdx = rows.slice(0, 6).findIndex((r) => str(r?.[0])?.toLowerCase() === firstColumn);
  if (headerIdx < 0) return [];
  const header = rows[headerIdx].map((h) => str(h)?.toLowerCase() ?? "");
  const out: Rec[] = [];
  for (const row of rows.slice(headerIdx + 1)) {
    if (!row || row.every((c) => str(c) == null)) continue;
    const rec: Rec = {};
    header.forEach((h, i) => {
      if (h) rec[h] = row[i];
    });
    out.push(rec);
  }
  return out;
}

// --- Directory rows ---------------------------------------------------------------

type RawRow = {
  id: string;
  category: DirCategory;
  /** 0 = core sheet row, 1 = "X" supplementary row, 2 = unclassified. */
  rank: number;
  richness: number;
  rec: Rec;
};

function sheetCategory(id: string): DirCategory {
  if (id.startsWith("GP")) return "GP";
  if (id.startsWith("LP")) return "LP";
  if (id.startsWith("SP")) return "SP";
  return "UN";
}

function rankOf(id: string): number {
  if (id.startsWith("UNC")) return 2;
  if (/^(GPX|LPX|SPX)-/.test(id)) return 1;
  return 0;
}

const LEGAL_TAIL =
  /[\s,]+(LLC|L\.L\.C\.|LP|L\.P\.|LLP|Ltd\.?|Limited|Inc\.?|Incorporated|plc|SA|S\.A\.|AG|GmbH|Corp\.?|Corporation)\s*$/i;

function hasLegalTail(name: string): boolean {
  return LEGAL_TAIL.test(name);
}

const STAGES: [string, string][] = [
  ["cov_formation", "Formation"],
  ["cov_fundraising", "Fundraising"],
  ["cov_operations", "Operations"],
  ["cov_value_creation", "Value creation"],
  ["cov_exit", "Exit"],
];

function serviceLines(rec: Rec): ServiceLine[] {
  const out: ServiceLine[] = [];
  for (let i = 1; i <= 6; i++) {
    const name = str(rec[`sl${i}_name`]);
    if (!name) continue;
    out.push({
      name,
      description: str(rec[`sl${i}_description`]),
      capabilities: (str(rec[`sl${i}_capabilities`]) ?? "")
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean),
    });
  }
  return out;
}

function advEntity(rec: Rec): AdvEntity | null {
  const crd = str(rec.sec_crd_number);
  const entity = str(rec.adv_matched_entity);
  if (!crd && !entity) return null;
  return {
    crd,
    file_number: str(rec.sec_file_number),
    entity,
    firm_type: str(rec.adv_firm_type),
    regulatory_aum_usd: num(rec.regulatory_aum_usd),
    last_filed: isoDate(rec.adv_last_filed),
    source_url: toUrl(str(rec.adv_source_url)),
  };
}

// --- Union-find ----------------------------------------------------------------------

class Groups {
  private parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a) ?? a;
    if (p !== a) {
      p = this.find(p);
      this.parent.set(a, p);
    }
    return p;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

/** Same firm under a rename or a typo, confirmed by a shared website. */
const KNOWN_SAME: [string, string][] = [
  ["LP-0071", "LP-0072"], // CPP Investment Board / CPPIB
  ["GP-0492", "GP-0112"], // Edmond de Rothschild Asset Management / "Rohtschild"
  ["GP-0230", "GP-0067"], // 50T Holdings / 50T funds
  ["GP-0708", "GP-0147"], // Man Group / Man Investments
  ["GP-0004", "GP-0372"], // Sagemount / Bregal Sagemount (renamed)
];

function prefixRelated(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

// --- Main ---------------------------------------------------------------------------

export function transformDirectory(sheets: Sheets): DirectoryBundle {
  const warnings: string[] = [];

  const sheetRows: Record<DirCategory, number> = { GP: 0, LP: 0, SP: 0, UN: 0 };
  const rows: RawRow[] = [];
  const seenIds = new Set<string>();
  for (const needle of ["gp directory", "lp directory", "sp directory", "unclassified"]) {
    for (const rec of records(findSheet(sheets, needle), "provider_id")) {
      const id = str(rec.provider_id)?.toUpperCase();
      const name = str(rec.firm_name);
      if (!id || !name || !ID_RE.test(id)) continue;
      if (seenIds.has(id)) {
        warnings.push(`${id} appears twice; kept the first.`);
        continue;
      }
      seenIds.add(id);
      const category = sheetCategory(id);
      sheetRows[category] += 1;
      const richness = Object.values(rec).filter((v) => str(v) != null).length;
      rows.push({ id, category, rank: rankOf(id), richness, rec });
    }
  }
  const byId = new Map(rows.map((r) => [r.id, r]));

  // Row-level provenance.
  const sourceMap = new Map<string, SourceLink[]>();
  const sourceRows = findSheet(sheets, "row sources") ?? [];
  for (const row of sourceRows) {
    const key = str(row?.[0]);
    const m = key?.match(/^((?:GP|GPX|LP|LPX|SP|SPX|UNC)-\d{3,})\b/i);
    if (!m) continue;
    const id = m[1].toUpperCase();
    const list = sourceMap.get(id) ?? [];
    for (const link of parseSources(row[1])) {
      if (!list.some((l) => l.label === link.label)) list.push(link);
    }
    sourceMap.set(id, list);
  }

  // --- Duplicate detection ---------------------------------------------------------
  const groups = new Groups();

  // A) Same normalised name. Same book merges; an unclassified row folds into
  //    the one classified book that shares its name.
  const byName = new Map<string, RawRow[]>();
  for (const r of rows) {
    const key = normName(str(r.rec.firm_name));
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), r]);
  }
  const crossBook: string[] = [];
  for (const members of byName.values()) {
    if (members.length < 2) continue;
    const books = new Map<DirCategory, RawRow[]>();
    for (const m of members) books.set(m.category, [...(books.get(m.category) ?? []), m]);
    for (const list of books.values()) list.slice(1).forEach((m) => groups.union(list[0].id, m.id));
    const classified = [...books.keys()].filter((c) => c !== "UN");
    const un = books.get("UN");
    if (un && classified.length === 1) {
      const anchor = books.get(classified[0])![0];
      un.forEach((m) => groups.union(anchor.id, m.id));
    }
    if (classified.length > 1) {
      crossBook.push(members.map((m) => `${str(m.rec.firm_name)} (${m.id})`).join(" / "));
    }
  }

  // B) Same website, same book, and one name extends the other
  //    ("Cerberus" / "Cerberus Capital Management") — unless their SEC CRDs differ.
  const byDomain = new Map<string, RawRow[]>();
  for (const r of rows) {
    const d = normDomain(str(r.rec.lusha_domain));
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), r]);
  }
  for (const members of byDomain.values()) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        const sameBook = a.category === b.category || a.category === "UN" || b.category === "UN";
        if (!sameBook) continue;
        const crdA = str(a.rec.sec_crd_number);
        const crdB = str(b.rec.sec_crd_number);
        if (crdA && crdB && crdA !== crdB) continue;
        if (prefixRelated(normName(str(a.rec.firm_name)), normName(str(b.rec.firm_name)))) {
          groups.union(a.id, b.id);
        }
      }
    }
  }

  // C) Renames and typos the heuristics can't see, only where the rows still
  //    share a website today.
  for (const [a, b] of KNOWN_SAME) {
    const ra = byId.get(a);
    const rb = byId.get(b);
    if (!ra || !rb || ra.category !== rb.category) continue;
    const da = normDomain(str(ra.rec.lusha_domain));
    const db = normDomain(str(rb.rec.lusha_domain));
    if (da && db && da === db) groups.union(a, b);
  }

  // --- Merge ---------------------------------------------------------------------------
  const clusters = new Map<string, RawRow[]>();
  for (const r of rows) {
    const root = groups.find(r.id);
    clusters.set(root, [...(clusters.get(root) ?? []), r]);
  }

  const aliases: Record<string, string> = {};
  const companies: DirCompany[] = [];
  const contacts: DirContact[] = [];
  let mergedGroups = 0;
  let mergedRows = 0;

  for (const members of clusters.values()) {
    members.sort((a, b) => a.rank - b.rank || b.richness - a.richness || a.id.localeCompare(b.id));
    if (members.length > 1) {
      mergedGroups += 1;
      mergedRows += members.length - 1;
    }
    const primary = members[0];
    const category: DirCategory = members.find((m) => m.category !== "UN")?.category ?? "UN";
    const ordered = [
      ...members.filter((m) => m.category === category),
      ...members.filter((m) => m.category !== category),
    ];
    const first = (key: string): unknown => {
      for (const m of ordered) if (str(m.rec[key]) != null) return m.rec[key];
      return null;
    };
    const firstStr = (key: string) => str(first(key));

    const name = chooseName(ordered);

    const loc = parseLocation(firmLocation(ordered));
    const domain = normDomain(firmDomain(ordered));
    const vertical = firstStr("product_vertical");
    const spCategoryRaw = category === "SP" ? firstSpCategory(ordered) : null;
    const industry = firstStr("lusha_industry");
    const investorType = firstStr("investor_type");

    let subType: string | null = null;
    if (category === "GP") subType = gpType(vertical);
    else if (category === "LP") subType = lpType(investorType, vertical);
    else if (category === "SP") subType = spType(spCategoryRaw, [vertical, industry].filter(Boolean).join(" "));

    const lifecycle: string[] = [];
    for (const [col, label] of STAGES) {
      if (ordered.some((m) => str(m.rec[col])?.toLowerCase() === "covered")) lifecycle.push(label);
    }

    const advEntities: AdvEntity[] = [];
    for (const m of ordered) {
      const e = advEntity(m.rec);
      if (e && !advEntities.some((x) => x.crd === e.crd && x.entity === e.entity)) advEntities.push(e);
    }

    const sources: SourceLink[] = [];
    for (const m of ordered) {
      for (const s of sourceMap.get(m.id) ?? []) {
        if (!sources.some((x) => x.label === s.label)) sources.push(s);
      }
    }

    const linkedin = firstStr("lusha_linkedin_url");
    const company: DirCompany = {
      external_id: primary.id,
      external_ids: ordered.map((m) => m.id),
      name,
      category,
      sub_type: subType,
      directory_vertical: category === "SP" ? (vertical ?? spCategoryRaw) : vertical,
      description: firstStr("overview_text"),
      domain,
      website: domain ? `https://${domain}` : null,
      linkedin_url: linkedin ? toUrl(linkedin) : null,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      hq_location: loc.label,
      region: loc.zone,
      founded_year: year(first("lusha_year_founded")),
      years_active: int(first("years_active")),
      employee_count: int(first("employee_count")),
      industry,
      lusha_company_id: firstStr("lusha_company_id"),
      lusha_verified_on: isoDate(first("lusha_verified_on")),
      sec_crd: firstStr("sec_crd_number"),
      sec_file_number: firstStr("sec_file_number"),
      adv_firm_type: firstStr("adv_firm_type"),
      adv_matched_entity: firstStr("adv_matched_entity"),
      adv_last_filed: isoDate(first("adv_last_filed")),
      adv_employee_count: int(first("adv_employee_count")),
      private_fund_count: int(first("private_fund_count")),
      private_fund_gross_assets: num(first("adv_private_fund_gross_assets")),
      regulatory_aum_usd: num(first("regulatory_aum_usd")),
      brand_entity_count: int(first("adv_brand_entity_count")),
      brand_aum_total_usd: num(first("adv_brand_aum_total_usd")),
      adv_source_url: toUrl(firstStr("adv_source_url")),
      adv_entities: advEntities,
      investor_type: investorType,
      total_assets_usd: num(first("total_assets_usd")),
      alts_allocation_pct: num(first("alts_allocation_pct")),
      discloses_commitments: firstStr("discloses_commitments"),
      disclosure_source_url: toUrl(firstStr("disclosure_source_url")),
      assets_monitored_usd: num(first("assets_monitored_usd_num")),
      assets_monitored_display: firstStr("assets_monitored_display"),
      lifecycle,
      service_lines: serviceLinesOf(ordered),
      sources,
      catalog_updated_at: firstStr("catalog_updated_at"),
    };
    companies.push(company);
    for (const m of members) aliases[m.id] = company.external_id;

    // Key contacts named in the sheet (kc1 / kc2 on every merged row).
    const people = new Map<string, DirContact>();
    for (const m of ordered) {
      for (const slot of ["kc1", "kc2"]) {
        const full = str(m.rec[`${slot}_name`]);
        if (!full) continue;
        const key = normName(full);
        if (!key) continue;
        const { first: fn, last: ln } = splitName(full);
        const existing = people.get(key);
        const title = str(m.rec[`${slot}_title`]);
        const connectable = bool(m.rec[`${slot}_connectable`]);
        if (existing) {
          existing.job_title = existing.job_title ?? title;
          existing.connectable = existing.connectable || connectable;
          continue;
        }
        people.set(key, {
          external_ref: `${company.external_id}#${key.replace(/\s+/g, "-")}`,
          company_ext: company.external_id,
          first_name: fn,
          last_name: ln,
          job_title: title,
          connectable,
        });
      }
    }
    contacts.push(...people.values());
  }

  if (crossBook.length) {
    warnings.push(
      `${crossBook.length} firm${crossBook.length === 1 ? "" : "s"} sit in two books and stay separate records: ${crossBook.join("; ")}.`,
    );
  }

  const companyByExt = new Map(companies.map((c) => [c.external_id, c]));

  // --- Provider brands → directory SP rows --------------------------------------------
  const brandToSp = new Map<string, string>();
  for (const c of companies) {
    if (c.category !== "SP") continue;
    for (const ext of c.external_ids) {
      const n = str(byId.get(ext)?.rec.firm_name);
      if (!n) continue;
      const key = providerBrand(n).key;
      if (!brandToSp.has(key)) brandToSp.set(key, c.external_id);
    }
  }

  // --- Form ADV provider links ---------------------------------------------------------
  const relRecords = records(findSheet(sheets, "gp to sp relationships", "relationships"), "gp_provider_id");
  const relMap = new Map<string, DirRelationship>();
  let relationshipRows = 0;
  let unmatchedClients = 0;
  const brands = new Set<string>();
  for (const rec of relRecords) {
    const gpId = str(rec.gp_provider_id)?.toUpperCase();
    const spName = str(rec.sp_name);
    if (!gpId || !ID_RE.test(gpId) || !spName) continue;
    relationshipRows += 1;
    const clientExt = aliases[gpId];
    if (!clientExt) {
      unmatchedClients += 1;
      continue;
    }
    const role = normalizeRole(str(rec.sp_role));
    const brand = providerBrand(spName);
    brands.add(brand.key);
    const spId = str(rec.sp_provider_id)?.toUpperCase();
    const explicit = spId && aliases[spId] ? aliases[spId] : null;
    if (explicit && !brandToSp.has(brand.key)) brandToSp.set(brand.key, explicit);
    const key = `adv:${clientExt}:${role}:${brand.key}`;
    const funds = parseFundSummary(rec.fund_name);
    const location = parseLocation(str(rec.sp_location)).label;
    const existing = relMap.get(key);
    if (existing) {
      if (!existing.provider_entities.includes(spName)) existing.provider_entities.push(spName);
      if (location && !existing.provider_locations.includes(location)) existing.provider_locations.push(location);
      existing.fund_count += funds.count;
      for (const f of funds.names) {
        if (existing.fund_examples.length < 6 && !existing.fund_examples.includes(f)) existing.fund_examples.push(f);
      }
      existing.provider_ext = existing.provider_ext ?? explicit;
      continue;
    }
    relMap.set(key, {
      external_key: key,
      client_ext: clientExt,
      role,
      provider_key: brand.key,
      provider_brand: brand.name,
      provider_ext: explicit,
      provider_entities: [spName],
      provider_locations: location ? [location] : [],
      fund_count: funds.count,
      fund_examples: funds.names.slice(0, 6),
      filed: str(rec.adv_filing_date),
      source_url: toUrl(str(rec.source_url)),
    });
  }
  const relationships = [...relMap.values()];
  for (const r of relationships) r.provider_ext = r.provider_ext ?? brandToSp.get(r.provider_key) ?? null;
  if (unmatchedClients) {
    warnings.push(`${unmatchedClients} provider link${unmatchedClients === 1 ? "" : "s"} name a GP id missing from the GP sheet and were skipped.`);
  }

  // --- LP → GP commitments ----------------------------------------------------------------
  const nameIndex = new Map<string, DirCompany[]>();
  for (const c of companies) {
    const key = normName(c.name);
    if (key) nameIndex.set(key, [...(nameIndex.get(key) ?? []), c]);
  }
  // "LACERA" for "Los Angeles County Employees Retirement Association".
  const acronymIndex = new Map<string, DirCompany[]>();
  for (const c of companies) {
    const initials = c.name
      .replace(/\([^)]*\)/g, " ")
      .split(/[^A-Za-z]+/)
      .filter((w) => w && !/^(of|the|and|for|de|du|des|la|le)$/i.test(w))
      .map((w) => w[0].toUpperCase())
      .join("");
    if (initials.length >= 3) acronymIndex.set(initials, [...(acronymIndex.get(initials) ?? []), c]);
  }
  const findByName = (value: string, prefer: DirCategory): DirCompany | null => {
    const list = nameIndex.get(normName(value)) ?? [];
    const hit = list.find((c) => c.category === prefer) ?? list[0];
    if (hit) return hit;
    const token = value.trim();
    if (/^[A-Z]{3,8}$/.test(token)) {
      const byInitials = (acronymIndex.get(token) ?? []).filter((c) => c.category === prefer);
      if (byInitials.length === 1) return byInitials[0];
    }
    return null;
  };

  const commitments: DirCommitment[] = [];
  const allocRecords = records(findSheet(sheets, "lp to gp allocations", "allocations"), "lp_provider_id");
  for (const rec of allocRecords) {
    const lpNameRaw = str(rec.lp_name);
    const gpNameRaw = str(rec.gp_name);
    if (!lpNameRaw || !gpNameRaw) continue;
    const lpId = str(rec.lp_provider_id)?.toUpperCase();
    if (lpId && !ID_RE.test(lpId)) continue; // the sheet's field-description row
    const lpName = lpNameRaw.replace(/\s*\([^)]*\)\s*/g, " ").trim();

    let lpExt = lpId ? aliases[lpId] : undefined;
    if (!lpExt) {
      const match = findByName(lpName, "LP");
      if (match) lpExt = match.external_id;
    }
    if (!lpExt) {
      // An LP the allocations sheet names but the directory doesn't list yet.
      lpExt = `ALLOC-${normName(lpName).replace(/\s+/g, "-").toUpperCase()}`;
      if (!companyByExt.has(lpExt)) {
        const created: DirCompany = blankCompany(lpExt, lpName, "LP");
        companies.push(created);
        companyByExt.set(lpExt, created);
        aliases[lpExt] = lpExt;
      }
    }
    const lp = companyByExt.get(lpExt)!;
    const sourceUrl = toUrl(str(rec.source_url));
    if (sourceUrl && !lp.sources.some((s) => s.url === sourceUrl)) {
      lp.sources.push({ label: `${str(rec.disclosure_type) ?? "Disclosure"}: ${sourceUrl.replace(/^https?:\/\//, "")}`, url: sourceUrl });
    }

    const placeholder = gpNameRaw.startsWith("(");
    const gpName = placeholder ? gpNameRaw : gpNameRaw.replace(/\s*\([^)]*\)\s*/g, " ").trim();
    const gp = placeholder ? null : findByName(gpName, "GP");
    const fundName = str(rec.fund_name);
    const dateText = str(rec.commitment_date);
    commitments.push({
      external_key: `alloc:${lpExt}:${normName(gpName) || "undisclosed"}:${normName(fundName) || "aggregate"}`,
      lp_ext: lpExt,
      lp_name: lp.name,
      gp_ext: gp?.external_id ?? null,
      gp_name: gpName,
      fund_name: fundName,
      amount: amountIn(rec.commitment_amount),
      currency: str(rec.currency)?.toUpperCase() ?? null,
      amount_text: str(rec.commitment_amount),
      commitment_date: dateIn(dateText),
      commitment_date_text: dateText,
      commitment_year: yearIn(dateText),
      disclosure_type: str(rec.disclosure_type),
      source_url: sourceUrl,
      source_date: isoDate(rec.source_date),
    });
  }
  // One row per LP + manager + fund; the last mention wins.
  const commitmentMap = new Map(commitments.map((c) => [c.external_key, c]));

  const companiesByCat: Record<DirCategory, number> = { GP: 0, LP: 0, SP: 0, UN: 0 };
  for (const c of companies) companiesByCat[c.category] += 1;

  const stats: DirectoryStats = {
    sheetRows,
    companies: companiesByCat,
    mergedGroups,
    mergedRows,
    contacts: contacts.length,
    connectableContacts: contacts.filter((c) => c.connectable).length,
    relationshipRows,
    relationships: relationships.length,
    providerBrands: brands.size,
    linkedProviderBrands: new Set(relationships.filter((r) => r.provider_ext).map((r) => r.provider_key)).size,
    commitments: commitmentMap.size,
    withAdv: companies.filter((c) => c.sec_crd || c.adv_matched_entity).length,
    withAum: companies.filter((c) => c.regulatory_aum_usd || c.brand_aum_total_usd || c.total_assets_usd).length,
    withDomain: companies.filter((c) => c.domain).length,
    withDescription: companies.filter((c) => c.description).length,
  };

  return {
    companies,
    contacts,
    relationships,
    commitments: [...commitmentMap.values()],
    aliases,
    stats,
    warnings,
  };
}

// --- Helpers ----------------------------------------------------------------------------

const CANONICAL_IDS = new Set(KNOWN_SAME.map(([canonical]) => canonical));

/** The cleanest spelling in a merged group: a known canonical row first, then
 *  names without a legal form, then the shortest name the others extend
 *  ("Francisco Partners" over "Francisco Partners Operating Executives"). */
function chooseName(ordered: RawRow[]): string {
  const names = ordered.map((m) => ({ id: m.id, name: str(m.rec.firm_name) ?? "" })).filter((n) => n.name);
  const canonical = names.find((n) => CANONICAL_IDS.has(n.id));
  if (canonical) return canonical.name;
  const keys = names.map((n) => normName(n.name));
  const extendsOthers = (i: number) =>
    keys.some((k, j) => j !== i && k !== keys[i] && k.startsWith(`${keys[i]} `));
  const ranked = names
    .map((n, i) => ({ ...n, i, legal: hasLegalTail(n.name), root: extendsOthers(i) }))
    .sort((a, b) => Number(a.legal) - Number(b.legal) || Number(b.root) - Number(a.root) || a.i - b.i);
  return ranked[0]?.name ?? names[0]?.name ?? "";
}

function firmLocation(ordered: RawRow[]): string | null {
  // Prefer a row that names a city over one that only names a region.
  let fallback: string | null = null;
  for (const m of ordered) {
    const loc = str(m.rec.location);
    if (!loc) continue;
    if (loc.includes(",")) return loc;
    fallback = fallback ?? loc;
  }
  return fallback;
}

function firmDomain(ordered: RawRow[]): string | null {
  for (const m of ordered) {
    const d = str(m.rec.lusha_domain);
    if (d) return d;
  }
  return null;
}

function firstSpCategory(ordered: RawRow[]): string | null {
  for (const m of ordered) {
    const c = str(m.rec.category);
    if (c && c.toUpperCase() !== "SP") return c;
  }
  return null;
}

function serviceLinesOf(ordered: RawRow[]): ServiceLine[] {
  for (const m of ordered) {
    const lines = serviceLines(m.rec);
    if (lines.length) return lines;
  }
  return [];
}

function blankCompany(ext: string, name: string, category: DirCategory): DirCompany {
  return {
    external_id: ext,
    external_ids: [ext],
    name,
    category,
    sub_type: null,
    directory_vertical: null,
    description: null,
    domain: null,
    website: null,
    linkedin_url: null,
    city: null,
    state: null,
    country: null,
    hq_location: null,
    region: null,
    founded_year: null,
    years_active: null,
    employee_count: null,
    industry: null,
    lusha_company_id: null,
    lusha_verified_on: null,
    sec_crd: null,
    sec_file_number: null,
    adv_firm_type: null,
    adv_matched_entity: null,
    adv_last_filed: null,
    adv_employee_count: null,
    private_fund_count: null,
    private_fund_gross_assets: null,
    regulatory_aum_usd: null,
    brand_entity_count: null,
    brand_aum_total_usd: null,
    adv_source_url: null,
    adv_entities: [],
    investor_type: null,
    total_assets_usd: null,
    alts_allocation_pct: null,
    discloses_commitments: null,
    disclosure_source_url: null,
    assets_monitored_usd: null,
    assets_monitored_display: null,
    lifecycle: [],
    service_lines: [],
    sources: [],
    catalog_updated_at: null,
  };
}
