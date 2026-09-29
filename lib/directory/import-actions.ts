"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "../auth";
import { getAdminClient } from "../supabase/admin";
import { chunk, fetchAll } from "../supabase/paged";
import { DIRECTORY_TAG } from "./index-server";
import { normDomain, normName } from "./normalize";
import { providerBrand, ROLE_LABEL, type ProviderRole } from "./providers";
import type { DirCommitment, DirCompany, DirContact, DirFund, DirRelationship } from "./transform";

// Server half of Import -> Master directory. The browser parses the workbook
// (lib/directory/transform.ts) and sends rows here in chunks, phase by phase:
// companies first (their ids feed every later phase), then contacts, provider
// links and commitments, then finishDirectoryImport. Every phase is keyed so
// re-importing the next edition of the workbook updates in place.
//
// What the workbook owns (Form ADV facts, LP disclosures, SP service lines) is
// refreshed on each import. What people edit in the app (name, description,
// website, location, type) is only filled when empty — an import never
// overwrites a correction someone made by hand.

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;
type Guard = { ok: true; supabase: Admin; userId: string } | { ok: false; error: string };

async function guard(): Promise<Guard> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (user.role !== "admin") return { ok: false, error: "Only admins can import the directory." };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };
  return { ok: true, supabase, userId: user.id };
}

type Row = Record<string, unknown>;

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function text(v: unknown, max = 4000): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function number(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strings(v: unknown, max = 200): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, max) : [];
}

function json(v: unknown): unknown[] {
  return Array.isArray(v) ? v.slice(0, 200) : [];
}

// --- Companies ----------------------------------------------------------------

/** Refreshed from the workbook on every import (kept when the sheet is blank). */
const OWNED_TEXT = [
  "directory_vertical", "state", "industry", "lusha_verified_on", "catalog_updated_at",
  "sec_crd", "sec_file_number", "adv_firm_type", "adv_matched_entity", "adv_last_filed",
  "adv_source_url", "investor_type", "discloses_commitments", "disclosure_source_url",
  "assets_monitored_display",
] as const;
const OWNED_NUMBER = [
  "founded_year", "years_active", "employee_count", "adv_employee_count", "private_fund_count",
  "private_fund_gross_assets", "regulatory_aum_usd", "brand_entity_count", "brand_aum_total_usd",
  "total_assets_usd", "alts_allocation_pct", "assets_monitored_usd",
] as const;
const OWNED_JSON = ["adv_entities", "service_lines", "sources"] as const;
const OWNED_ARRAY = ["lifecycle"] as const;
/** People correct these in the app; the import only fills blanks. */
const FILLED = [
  "sub_type", "description", "domain", "website", "linkedin_url", "city", "country",
  "hq_location", "region",
] as const;

const EXISTING_COLUMNS = [
  "id", "name", "category", "external_id", "external_ids", "lusha_company_id", "aum_usd",
  ...FILLED, ...OWNED_TEXT, ...OWNED_NUMBER, ...OWNED_JSON, ...OWNED_ARRAY,
].join(", ");

/** The one headline size figure the profile hero shows. */
function headlineAum(c: DirCompany): number | null {
  return (
    number(c.brand_aum_total_usd) ??
    number(c.regulatory_aum_usd) ??
    number(c.total_assets_usd) ??
    null
  );
}

/** Whitelisted, type-checked copy of an incoming row. */
function cleanCompany(c: DirCompany): Row | null {
  const name = text(c.name, 300);
  const category = ["LP", "GP", "SP", "UN"].includes(c.category) ? c.category : null;
  const external_id = text(c.external_id, 40);
  if (!name || !category || !external_id) return null;
  const row: Row = {
    name,
    category,
    external_id,
    external_ids: strings(c.external_ids, 20),
    lusha_company_id: text(c.lusha_company_id, 120),
  };
  for (const f of FILLED) row[f] = text(c[f]);
  row.domain = normDomain(text(c.domain));
  for (const f of OWNED_TEXT) row[f] = text(c[f]);
  for (const f of OWNED_NUMBER) row[f] = number(c[f]);
  for (const f of OWNED_JSON) row[f] = json(c[f]);
  for (const f of OWNED_ARRAY) row[f] = strings(c[f], 10);
  return row;
}

export type CompanyPhaseResult = {
  ok: boolean;
  error?: string;
  created: number;
  updated: number;
  /** Every workbook id in this chunk → company uuid. */
  ids: Record<string, string>;
};

export async function importDirectoryCompanies(rows: DirCompany[]): Promise<CompanyPhaseResult> {
  const empty = { created: 0, updated: 0, ids: {} };
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, ...empty };
  const { supabase } = g;

  const existing = await fetchAll<Row>((from, to, first) =>
    supabase
      .from("companies")
      .select(EXISTING_COLUMNS, first ? { count: "exact" } : undefined)
      .order("id")
      .range(from, to),
  );
  if (!existing) {
    return {
      ok: false,
      error: "Couldn't read companies — has migration 0013 (sql-parts/3-directory) been run?",
      ...empty,
    };
  }

  const byExt = new Map<string, Row>();
  const byLusha = new Map<string, Row>();
  const byDomain = new Map<string, Row[]>();
  const byName = new Map<string, Row[]>();
  for (const e of existing) {
    for (const x of [e.external_id, ...strings(e.external_ids)]) if (typeof x === "string") byExt.set(x, e);
    if (typeof e.lusha_company_id === "string") byLusha.set(e.lusha_company_id, e);
    const d = normDomain(e.domain as string | null);
    if (d) byDomain.set(d, [...(byDomain.get(d) ?? []), e]);
    const n = normName(e.name as string);
    if (n) byName.set(n, [...(byName.get(n) ?? []), e]);
  }
  const usedLusha = new Set(byLusha.keys());

  // A record already claimed by a different workbook id is someone else's.
  const free = (e: Row | undefined, row: Row) => {
    if (!e) return undefined;
    const ext = e.external_id as string | null;
    if (!ext) return e;
    return strings(row.external_ids).includes(ext) || ext === row.external_id ? e : undefined;
  };
  const sameBook = (e: Row, row: Row) =>
    e.category === row.category || row.category === "UN" || e.category === "UN";

  const updates: Row[] = [];
  const inserts: Row[] = [];
  const ids: Record<string, string> = {};
  const claimed = new Set<string>();

  for (const incoming of rows) {
    const row = cleanCompany(incoming);
    if (!row) continue;
    const exts = [row.external_id as string, ...strings(row.external_ids)];
    let match: Row | undefined;
    for (const x of exts) match = match ?? byExt.get(x);
    match = match ?? free(byLusha.get(row.lusha_company_id as string), row);
    if (!match && row.domain) {
      match = free((byDomain.get(row.domain as string) ?? []).find((e) => sameBook(e, row) && !claimed.has(e.id as string)), row);
    }
    if (!match) {
      const n = normName(row.name as string);
      match = free((byName.get(n) ?? []).find((e) => sameBook(e, row) && !claimed.has(e.id as string)), row);
    }
    if (match && claimed.has(match.id as string)) match = undefined;

    if (match) {
      claimed.add(match.id as string);
      const merged: Row = {
        id: match.id,
        name: match.name,
        // The workbook may classify a firm we had parked as unclassified.
        category: match.category === "UN" && row.category !== "UN" ? row.category : match.category,
        external_id: row.external_id,
        external_ids: row.external_ids,
        source: "master_directory",
        aum_usd: match.aum_usd ?? headlineAum(incoming),
      };
      for (const f of FILLED) merged[f] = isEmpty(match[f]) ? row[f] : match[f];
      for (const f of [...OWNED_TEXT, ...OWNED_NUMBER]) merged[f] = isEmpty(row[f]) ? (match[f] ?? null) : row[f];
      for (const f of [...OWNED_JSON, ...OWNED_ARRAY]) merged[f] = isEmpty(row[f]) ? (match[f] ?? []) : row[f];
      const lusha = row.lusha_company_id as string | null;
      merged.lusha_company_id =
        match.lusha_company_id ?? (lusha && !usedLusha.has(lusha) ? lusha : null);
      if (lusha && merged.lusha_company_id === lusha) usedLusha.add(lusha);
      updates.push(merged);
      for (const x of exts) ids[x] = match.id as string;
    } else {
      const lusha = row.lusha_company_id as string | null;
      const insert: Row = {
        ...row,
        source: "master_directory",
        aum_usd: headlineAum(incoming),
        lusha_company_id: lusha && !usedLusha.has(lusha) ? lusha : null,
      };
      if (lusha && insert.lusha_company_id) usedLusha.add(lusha);
      inserts.push(insert);
    }
  }

  let updated = 0;
  for (const batch of chunk(updates, 200)) {
    const { error } = await supabase.from("companies").upsert(batch, { onConflict: "id" });
    if (error) return { ok: false, error: `Updating companies: ${error.message}`, created: 0, updated, ids };
    updated += batch.length;
  }

  let created = 0;
  for (const batch of chunk(inserts, 200)) {
    const { data, error } = await supabase.from("companies").insert(batch).select("id, external_id, external_ids");
    if (error) return { ok: false, error: `Adding companies: ${error.message}`, created, updated, ids };
    for (const r of data ?? []) {
      for (const x of [r.external_id, ...strings(r.external_ids)]) if (typeof x === "string") ids[x] = r.id;
    }
    created += data?.length ?? 0;
  }

  return { ok: true, created, updated, ids };
}

// --- Contacts ------------------------------------------------------------------

export type PhaseResult = { ok: boolean; error?: string; created: number; updated: number; skipped: number };

export async function importDirectoryContacts(
  rows: DirContact[],
  companyIds: Record<string, string>,
): Promise<PhaseResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, created: 0, updated: 0, skipped: 0 };
  const { supabase } = g;

  const wanted = [...new Set(rows.map((r) => companyIds[r.company_ext]).filter(Boolean))];
  const existing: Row[] = [];
  for (const ids of chunk(wanted, 100)) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, company_id, first_name, last_name, full_name, job_title, external_ref, source, connectable")
      .in("company_id", ids);
    if (error) return { ok: false, error: `Reading contacts: ${error.message}`, created: 0, updated: 0, skipped: 0 };
    existing.push(...(data ?? []));
  }
  const byRef = new Map<string, Row>();
  const byPerson = new Map<string, Row>();
  for (const e of existing) {
    if (typeof e.external_ref === "string") byRef.set(e.external_ref, e);
    byPerson.set(`${e.company_id}|${normName((e.full_name as string) ?? "")}`, e);
  }

  const updates: Row[] = [];
  const inserts: Row[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const r of rows) {
    const companyId = companyIds[r.company_ext];
    const ref = text(r.external_ref, 200);
    const first = text(r.first_name, 120);
    const last = text(r.last_name, 120);
    if (!companyId || !ref || (!first && !last) || seen.has(ref)) {
      skipped += 1;
      continue;
    }
    seen.add(ref);
    const title = text(r.job_title, 300);
    const connectable = typeof r.connectable === "boolean" ? r.connectable : null;
    const match =
      byRef.get(ref) ?? byPerson.get(`${companyId}|${normName([first, last].filter(Boolean).join(" "))}`);
    if (match && !seen.has(`id:${match.id}`)) {
      seen.add(`id:${match.id}`);
      updates.push({
        id: match.id,
        company_id: match.company_id,
        first_name: match.first_name ?? first,
        last_name: match.last_name ?? last,
        job_title: isEmpty(match.job_title) ? title : match.job_title,
        external_ref: match.external_ref ?? ref,
        source: match.source ?? "master_directory",
        connectable: connectable ?? match.connectable ?? null,
      });
    } else {
      inserts.push({
        company_id: companyId,
        first_name: first,
        last_name: last,
        job_title: title,
        external_ref: ref,
        source: "master_directory",
        connectable,
      });
    }
  }

  let updated = 0;
  for (const batch of chunk(updates, 300)) {
    const { error } = await supabase.from("contacts").upsert(batch, { onConflict: "id" });
    if (error) return { ok: false, error: `Updating contacts: ${error.message}`, created: 0, updated, skipped };
    updated += batch.length;
  }
  let created = 0;
  for (const batch of chunk(inserts, 300)) {
    const { error } = await supabase.from("contacts").upsert(batch, { onConflict: "external_ref" });
    if (error) return { ok: false, error: `Adding contacts: ${error.message}`, created, updated, skipped };
    created += batch.length;
  }
  return { ok: true, created, updated, skipped };
}

// --- Form ADV provider links ------------------------------------------------------

/** Brand slug → SP company, for providers the workbook doesn't link itself. */
async function spBrandMap(supabase: Admin): Promise<Map<string, string>> {
  const sps =
    (await fetchAll<{ id: string; name: string }>((from, to, first) =>
      supabase
        .from("companies")
        .select("id, name", first ? { count: "exact" } : undefined)
        .eq("category", "SP")
        .order("id")
        .range(from, to),
    )) ?? [];
  const map = new Map<string, string>();
  for (const sp of sps) {
    const key = providerBrand(sp.name).key;
    if (!map.has(key)) map.set(key, sp.id);
  }
  return map;
}

export async function importDirectoryRelationships(
  rows: DirRelationship[],
  companyIds: Record<string, string>,
): Promise<PhaseResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, created: 0, updated: 0, skipped: 0 };
  const { supabase } = g;
  const brands = await spBrandMap(supabase);

  const payload: Row[] = [];
  let skipped = 0;
  for (const r of rows) {
    const clientId = companyIds[r.client_ext];
    const key = text(r.external_key, 300);
    const providerKey = text(r.provider_key, 200);
    if (!clientId || !key || !providerKey) {
      skipped += 1;
      continue;
    }
    const role = (Object.keys(ROLE_LABEL) as ProviderRole[]).includes(r.role) ? r.role : "other";
    payload.push({
      external_key: key,
      client_company_id: clientId,
      provider_company_id: (r.provider_ext && companyIds[r.provider_ext]) || brands.get(providerKey) || null,
      role: ROLE_LABEL[role],
      provider_key: providerKey,
      provider_brand: text(r.provider_brand, 200),
      provider_entities: strings(r.provider_entities, 40),
      provider_locations: strings(r.provider_locations, 20),
      fund_count: number(r.fund_count),
      fund_examples: strings(r.fund_examples, 6),
      source: "form_adv",
      source_url: text(r.source_url, 500),
      filed: text(r.filed, 120),
    });
  }

  let written = 0;
  for (const batch of chunk(payload, 500)) {
    const { error } = await supabase.from("service_relationships").upsert(batch, { onConflict: "external_key" });
    if (error) return { ok: false, error: `Provider links: ${error.message}`, created: written, updated: 0, skipped };
    written += batch.length;
  }
  return { ok: true, created: written, updated: 0, skipped };
}

// --- Form ADV fund lineup ------------------------------------------------------------

export async function importDirectoryFunds(
  rows: DirFund[],
  companyIds: Record<string, string>,
): Promise<PhaseResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, created: 0, updated: 0, skipped: 0 };
  const { supabase } = g;

  const roles = Object.keys(ROLE_LABEL) as ProviderRole[];
  const payload: Row[] = [];
  let skipped = 0;
  for (const f of rows) {
    const companyId = companyIds[f.gp_ext];
    const key = text(f.external_key, 300);
    const name = text(f.name, 300);
    if (!companyId || !key || !name) {
      skipped += 1;
      continue;
    }
    const providers = (Array.isArray(f.providers) ? f.providers : [])
      .filter((p) => p && roles.includes(p.role) && typeof p.key === "string" && typeof p.brand === "string")
      .slice(0, 40)
      .map((p) => ({ role: p.role, key: p.key.slice(0, 200), brand: p.brand.slice(0, 200) }));
    payload.push({
      external_key: key,
      company_id: companyId,
      name,
      name_filed: text(f.name_filed, 300),
      vehicle_kind: text(f.vehicle_kind, 40),
      domicile: text(f.domicile, 80),
      currency: text(f.currency, 8),
      service_providers: providers,
      filed: text(f.filed, 120),
      source_url: text(f.source_url, 500),
      source: "form_adv",
    });
  }

  let written = 0;
  for (const batch of chunk(payload, 500)) {
    const { error } = await supabase.from("funds").upsert(batch, { onConflict: "external_key" });
    if (error) {
      const hint = /column/i.test(error.message) ? " — has migration 0014 (sql-parts/3-directory) been run?" : "";
      return { ok: false, error: `Funds: ${error.message}${hint}`, created: written, updated: 0, skipped };
    }
    written += batch.length;
  }
  return { ok: true, created: written, updated: 0, skipped };
}

// --- LP -> GP commitments ------------------------------------------------------------

export async function importDirectoryCommitments(
  rows: DirCommitment[],
  companyIds: Record<string, string>,
): Promise<PhaseResult & { funds: number }> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, created: 0, updated: 0, skipped: 0, funds: 0 };
  const { supabase } = g;

  // Managers the workbook names but doesn't id: match on name, GPs first.
  const all =
    (await fetchAll<{ id: string; name: string; category: string }>((from, to, first) =>
      supabase
        .from("companies")
        .select("id, name, category", first ? { count: "exact" } : undefined)
        .order("id")
        .range(from, to),
    )) ?? [];
  const byName = new Map<string, { id: string; category: string }[]>();
  for (const c of all) {
    const n = normName(c.name);
    if (n) byName.set(n, [...(byName.get(n) ?? []), c]);
  }
  const managerId = (r: DirCommitment): string | null => {
    if (r.gp_ext && companyIds[r.gp_ext]) return companyIds[r.gp_ext];
    if (!r.gp_name || r.gp_name.startsWith("(")) return null;
    const hits = byName.get(normName(r.gp_name)) ?? [];
    return (hits.find((h) => h.category === "GP") ?? hits[0])?.id ?? null;
  };

  // The manager's own Form ADV fund, loaded by the funds phase before this one.
  const advKeys = [
    ...new Set(rows.map((r) => r.adv_fund_key).filter((k): k is string => typeof k === "string" && k.startsWith("advfund:"))),
  ];
  const advFundIds = new Map<string, string>();
  for (const keys of chunk(advKeys, 150)) {
    const { data } = await supabase.from("funds").select("id, external_key").in("external_key", keys);
    for (const f of data ?? []) advFundIds.set(f.external_key as string, f.id as string);
  }

  const fundRows = new Map<string, Row>();
  const prepared: { r: DirCommitment; lpId: string; gpId: string | null; fundKey: string | null }[] = [];
  let skipped = 0;
  for (const r of rows) {
    const lpId = companyIds[r.lp_ext];
    const key = text(r.external_key, 300);
    if (!lpId || !key) {
      skipped += 1;
      continue;
    }
    const gpId = managerId(r);
    const fundName = text(r.fund_name, 300);
    if (r.adv_fund_key && advFundIds.has(r.adv_fund_key)) {
      prepared.push({ r, lpId, gpId, fundKey: r.adv_fund_key });
      continue;
    }
    const named = fundName && r.gp_name && !r.gp_name.startsWith("(");
    const fundKey = named ? `alloc-fund:${gpId ?? normName(r.gp_name)}:${normName(fundName)}` : null;
    if (fundKey && !fundRows.has(fundKey)) {
      fundRows.set(fundKey, {
        external_key: fundKey,
        company_id: gpId,
        name: fundName,
        manager_name: gpId ? null : text(r.gp_name, 300),
        source: "lp_disclosure",
      });
    }
    prepared.push({ r, lpId, gpId, fundKey });
  }

  const fundIds = new Map<string, string>(advFundIds);
  for (const batch of chunk([...fundRows.values()], 200)) {
    const { data, error } = await supabase
      .from("funds")
      .upsert(batch, { onConflict: "external_key" })
      .select("id, external_key");
    if (error) return { ok: false, error: `Funds: ${error.message}`, created: 0, updated: 0, skipped, funds: 0 };
    for (const f of data ?? []) fundIds.set(f.external_key as string, f.id as string);
  }

  const payload = prepared.map(({ r, lpId, gpId, fundKey }) => {
    const currency = text(r.currency, 8);
    const amount = number(r.amount);
    return {
      external_key: r.external_key,
      lp_company_id: lpId,
      gp_company_id: gpId,
      fund_id: fundKey ? (fundIds.get(fundKey) ?? null) : null,
      // Money is per currency: only a USD figure goes in the USD column.
      amount_usd: currency === "USD" ? amount : null,
      commitment_date: text(r.commitment_date, 10),
      lp_name: text(r.lp_name, 300),
      gp_name: text(r.gp_name, 300),
      fund_name: text(r.fund_name, 300),
      amount,
      currency,
      amount_text: text(r.amount_text, 200),
      commitment_date_text: text(r.commitment_date_text, 120),
      commitment_year: number(r.commitment_year),
      disclosure_type: text(r.disclosure_type, 200),
      source: "lp_disclosure",
      source_url: text(r.source_url, 500),
      source_date: text(r.source_date, 10),
    };
  });

  let written = 0;
  for (const batch of chunk(payload, 200)) {
    const { error } = await supabase.from("commitments").upsert(batch, { onConflict: "external_key" });
    if (error) return { ok: false, error: `Commitments: ${error.message}`, created: written, updated: 0, skipped, funds: fundIds.size };
    written += batch.length;
  }
  return { ok: true, created: written, updated: 0, skipped, funds: fundIds.size };
}

// --- Finish ------------------------------------------------------------------------------

export type FinishResult = { ok: boolean; error?: string; pruned: number; samplesRemoved: number };

export async function finishDirectoryImport(input: {
  filename: string | null;
  stats: Record<string, unknown>;
  result: Record<string, unknown>;
  /** Every provider-link key in this workbook; filed links not in it are gone. */
  relationshipKeys: string[];
  /** Same for commitments, so a corrected row replaces the old one. */
  commitmentKeys: string[];
  /** Same for Form ADV funds. Omitted by an import that didn't load funds. */
  fundKeys?: string[];
  removeSamples: boolean;
}): Promise<FinishResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error, pruned: 0, samplesRemoved: 0 };
  const { supabase, userId } = g;

  // A GP that changed auditor since the last edition: drop the stale link.
  let pruned = 0;
  const keep = new Set(strings(input.relationshipKeys, 100_000));
  if (keep.size) {
    const filed =
      (await fetchAll<{ id: string; external_key: string | null }>((from, to, first) =>
        supabase
          .from("service_relationships")
          .select("id, external_key", first ? { count: "exact" } : undefined)
          .eq("source", "form_adv")
          .order("id")
          .range(from, to),
      )) ?? [];
    const stale = filed.filter((r) => !r.external_key || !keep.has(r.external_key)).map((r) => r.id);
    for (const ids of chunk(stale, 200)) {
      const { error } = await supabase.from("service_relationships").delete().in("id", ids);
      if (!error) pruned += ids.length;
    }
  }

  const keepCommitments = new Set(strings(input.commitmentKeys, 100_000));
  if (keepCommitments.size) {
    const { data: disclosed } = await supabase
      .from("commitments")
      .select("id, external_key")
      .eq("source", "lp_disclosure")
      .limit(10_000);
    const stale = (disclosed ?? [])
      .filter((r) => !r.external_key || !keepCommitments.has(r.external_key as string))
      .map((r) => r.id as string);
    for (const ids of chunk(stale, 200)) {
      const { error } = await supabase.from("commitments").delete().in("id", ids);
      if (!error) pruned += ids.length;
    }
  }

  // A fund no longer on the manager's filing goes too — unless a disclosed
  // commitment points at it, which would otherwise be deleted with it.
  const keepFunds = new Set(strings(input.fundKeys, 100_000));
  if (keepFunds.size) {
    const filedFunds =
      (await fetchAll<{ id: string; external_key: string | null }>((from, to, first) =>
        supabase
          .from("funds")
          .select("id, external_key", first ? { count: "exact" } : undefined)
          .eq("source", "form_adv")
          .order("id")
          .range(from, to),
      )) ?? [];
    const stale = filedFunds.filter((f) => !f.external_key || !keepFunds.has(f.external_key)).map((f) => f.id);
    if (stale.length) {
      const referenced = new Set<string>();
      for (const ids of chunk(stale, 150)) {
        const { data } = await supabase.from("commitments").select("fund_id").in("fund_id", ids);
        for (const c of data ?? []) if (c.fund_id) referenced.add(c.fund_id as string);
      }
      for (const ids of chunk(stale.filter((id) => !referenced.has(id)), 200)) {
        const { error } = await supabase.from("funds").delete().in("id", ids);
        if (!error) pruned += ids.length;
      }
    }
  }

  let samplesRemoved = 0;
  if (input.removeSamples) {
    const rel = await supabase.from("service_relationships").delete({ count: "exact" }).eq("source", "sample");
    const com = await supabase.from("commitments").delete({ count: "exact" }).eq("source", "sample");
    samplesRemoved = (rel.count ?? 0) + (com.count ?? 0);
  }

  await supabase.from("directory_imports").insert({
    filename: text(input.filename, 300),
    stats: input.stats ?? {},
    result: { ...(input.result ?? {}), pruned, samplesRemoved },
    imported_by: userId,
  });

  updateTag(DIRECTORY_TAG);
  for (const path of ["/database", "/companies", "/contacts", "/funds", "/portfolio", "/import/directory"]) {
    revalidatePath(path);
  }
  return { ok: true, pruned, samplesRemoved };
}
