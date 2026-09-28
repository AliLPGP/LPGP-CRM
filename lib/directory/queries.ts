import "server-only";
import { getReadClient } from "../supabase/server";
import { chunk, fetchAll } from "../supabase/paged";

// Reads behind Discover, lists and the richer company page. Like every read
// in the app: anon client, empty result on any failure, never throws.

export type DirectoryList = {
  id: string;
  name: string;
  description: string | null;
  owner_id: string | null;
  owner_name: string | null;
  item_count: number;
  updated_at: string;
  created_at: string;
};

export type DirectoryListItem = {
  company_id: string;
  note: string | null;
  added_by: string | null;
  added_by_name: string | null;
  created_at: string;
};

export type SavedSearch = {
  id: string;
  name: string;
  query: string | null;
  filters: Record<string, string>;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
};

async function profileNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const supabase = getReadClient();
  const map = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (!supabase || !unique.length) return map;
  for (const batch of chunk(unique, 150)) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", batch);
    for (const p of data ?? []) map.set(p.id, p.full_name ?? p.email ?? "Teammate");
  }
  return map;
}

export async function listDirectoryLists(): Promise<DirectoryList[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("directory_lists")
    .select("id, name, description, owner_id, updated_at, created_at")
    .order("updated_at", { ascending: false });
  if (error || !data) return [];
  const items =
    (await fetchAll<{ list_id: string }>((from, to, first) =>
      supabase
        .from("directory_list_items")
        .select("id, list_id", first ? { count: "exact" } : undefined)
        .order("id")
        .range(from, to),
    )) ?? [];
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.list_id, (counts.get(i.list_id) ?? 0) + 1);
  const names = await profileNames(data.map((l) => l.owner_id));
  return data.map((l) => ({
    ...l,
    owner_name: l.owner_id ? (names.get(l.owner_id) ?? null) : null,
    item_count: counts.get(l.id) ?? 0,
  }));
}

export async function getDirectoryList(
  id: string,
): Promise<{ list: DirectoryList; items: DirectoryListItem[] } | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data: list } = await supabase
    .from("directory_lists")
    .select("id, name, description, owner_id, updated_at, created_at")
    .eq("id", id)
    .single();
  if (!list) return null;
  const items =
    (await fetchAll<Omit<DirectoryListItem, "added_by_name">>((from, to, first) =>
      supabase
        .from("directory_list_items")
        .select("company_id, note, added_by, created_at", first ? { count: "exact" } : undefined)
        .eq("list_id", id)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    )) ?? [];
  const names = await profileNames([list.owner_id, ...items.map((i) => i.added_by)]);
  return {
    list: {
      ...list,
      owner_name: list.owner_id ? (names.get(list.owner_id) ?? null) : null,
      item_count: items.length,
    },
    items: items.map((i) => ({ ...i, added_by_name: i.added_by ? (names.get(i.added_by) ?? null) : null })),
  };
}

/** Lists a firm sits on, for its profile. */
export async function listsForCompany(companyId: string): Promise<{ id: string; name: string }[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("directory_list_items")
    .select("list_id")
    .eq("company_id", companyId);
  const listIds = [...new Set((data ?? []).map((d) => d.list_id as string))];
  if (!listIds.length) return [];
  const { data: lists } = await supabase.from("directory_lists").select("id, name").in("id", listIds);
  return (lists ?? []) as { id: string; name: string }[];
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("saved_searches")
    .select("id, name, query, filters, owner_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  const names = await profileNames(data.map((s) => s.owner_id));
  return data.map((s) => ({
    ...s,
    filters: (s.filters ?? {}) as Record<string, string>,
    owner_name: s.owner_id ? (names.get(s.owner_id) ?? null) : null,
  }));
}

// --- Company one-pager ----------------------------------------------------------

export type FiledProvider = {
  id: string;
  role: string | null;
  provider_key: string | null;
  provider_brand: string | null;
  provider_company_id: string | null;
  provider_entities: string[];
  provider_locations: string[];
  fund_count: number | null;
  fund_examples: string[];
  source: string | null;
  filed: string | null;
};

/** Every provider link on a firm's own record, filed or sample. */
export async function getFiledProviders(companyId: string): Promise<FiledProvider[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rich = await supabase
    .from("service_relationships")
    .select(
      "id, role, provider_key, provider_brand, provider_company_id, provider_entities, provider_locations, fund_count, fund_examples, source, filed",
    )
    .eq("client_company_id", companyId);
  let data = rich.data as Record<string, unknown>[] | null;
  if (rich.error) {
    // Before migration 0013: the hand-entered links, without the filed detail.
    const base = await supabase
      .from("service_relationships")
      .select("id, role, provider_company_id")
      .eq("client_company_id", companyId);
    data = (base.data ?? []).map((r) => ({
      ...r,
      provider_key: null,
      provider_brand: null,
      provider_entities: [],
      provider_locations: [],
      fund_count: null,
      fund_examples: [],
      source: "sample",
      filed: null,
    }));
  }
  if (!data) return [];
  // Hand-entered and sample links carry a provider company but no brand.
  const unnamed = [
    ...new Set(data.filter((r) => !r.provider_brand && r.provider_company_id).map((r) => r.provider_company_id as string)),
  ];
  const names = new Map<string, string>();
  for (const batch of chunk(unnamed, 150)) {
    const { data: cos } = await supabase.from("companies").select("id, name").in("id", batch);
    for (const c of cos ?? []) names.set(c.id, c.name);
  }
  return data.map((r) => ({
    ...r,
    provider_brand:
      (r.provider_brand as string | null) ??
      (r.provider_company_id ? (names.get(r.provider_company_id as string) ?? null) : null),
    provider_entities: (r.provider_entities as string[] | null) ?? [],
    provider_locations: (r.provider_locations as string[] | null) ?? [],
    fund_examples: (r.fund_examples as string[] | null) ?? [],
  })) as FiledProvider[];
}

export type DisclosedCommitment = {
  id: string;
  lp_company_id: string | null;
  gp_company_id: string | null;
  fund_id: string | null;
  lp_name: string | null;
  gp_name: string | null;
  fund_name: string | null;
  amount: number | null;
  amount_usd: number | null;
  currency: string | null;
  amount_text: string | null;
  commitment_date: string | null;
  commitment_date_text: string | null;
  commitment_year: number | null;
  disclosure_type: string | null;
  source: string | null;
  source_url: string | null;
};

const COMMITMENT_COLUMNS =
  "id, lp_company_id, gp_company_id, fund_id, lp_name, gp_name, fund_name, amount, amount_usd, currency, amount_text, commitment_date, commitment_date_text, commitment_year, disclosure_type, source, source_url";

/** Commitments where the firm is the LP or the manager. */
export async function getDisclosedCommitments(
  companyId: string,
): Promise<{ asLp: DisclosedCommitment[]; asGp: DisclosedCommitment[] }> {
  const supabase = getReadClient();
  if (!supabase) return { asLp: [], asGp: [] };
  const [lp, gp] = await Promise.all([
    supabase.from("commitments").select(COMMITMENT_COLUMNS).eq("lp_company_id", companyId),
    supabase.from("commitments").select(COMMITMENT_COLUMNS).eq("gp_company_id", companyId),
  ]);
  const order = (a: DisclosedCommitment, b: DisclosedCommitment) =>
    (b.commitment_year ?? 0) - (a.commitment_year ?? 0) || (b.amount ?? 0) - (a.amount ?? 0);
  if (lp.error) {
    // Before migration 0013: the original columns only, as sample rows.
    const base = await supabase
      .from("commitments")
      .select("id, lp_company_id, fund_id, amount_usd, commitment_date")
      .eq("lp_company_id", companyId);
    const rows = (base.data ?? []).map((r) => ({
      ...r,
      gp_company_id: null,
      lp_name: null,
      gp_name: null,
      fund_name: null,
      amount: null,
      currency: null,
      amount_text: null,
      commitment_date_text: null,
      commitment_year: null,
      disclosure_type: null,
      source: "sample",
      source_url: null,
    })) as DisclosedCommitment[];
    return { asLp: rows.sort(order), asGp: [] };
  }
  return {
    asLp: ((lp.data ?? []) as DisclosedCommitment[]).sort(order),
    asGp: ((gp.data ?? []) as DisclosedCommitment[]).sort(order),
  };
}

export type DirectoryImport = {
  id: string;
  filename: string | null;
  stats: Record<string, unknown>;
  result: Record<string, unknown>;
  imported_by: string | null;
  created_at: string;
};

export async function getLastDirectoryImport(): Promise<DirectoryImport | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("directory_imports")
    .select("id, filename, stats, result, imported_by, created_at")
    .order("created_at", { ascending: false })
    .limit(1);
  return (data?.[0] as DirectoryImport) ?? null;
}

/** Has migration 0013 run? Asked fresh, never from a cache. */
export async function probeDirectorySchema(): Promise<boolean> {
  const supabase = getReadClient();
  if (!supabase) return false;
  const { error } = await supabase.from("companies").select("external_id").limit(1);
  return !error;
}

/** Illustrative rows from the original seed, which the importer can clear. */
export async function countSampleRows(): Promise<{ relationships: number; commitments: number }> {
  const supabase = getReadClient();
  if (!supabase) return { relationships: 0, commitments: 0 };
  const [rel, com] = await Promise.all([
    supabase.from("service_relationships").select("id", { count: "exact", head: true }).eq("source", "sample"),
    supabase.from("commitments").select("id", { count: "exact", head: true }).eq("source", "sample"),
  ]);
  return { relationships: rel.count ?? 0, commitments: com.count ?? 0 };
}

export type ProviderClient = {
  id: string;
  role: string | null;
  fund_count: number | null;
  fund_examples: string[];
  provider_entities: string[];
  source: string | null;
  client: {
    id: string;
    name: string;
    category: string;
    domain: string | null;
    city: string | null;
    country: string | null;
    sub_type: string | null;
  } | null;
};

/** Firms whose filings name this provider (an SP linked to a brand). */
export async function getProviderClients(companyId: string): Promise<ProviderClient[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows =
    (await fetchAll<Omit<ProviderClient, "client"> & { client_company_id: string | null }>((from, to, first) =>
      supabase
        .from("service_relationships")
        .select(
          "id, role, fund_count, fund_examples, provider_entities, source, client_company_id",
          first ? { count: "exact" } : undefined,
        )
        .eq("provider_company_id", companyId)
        .order("id")
        .range(from, to),
    )) ?? [];
  const ids = [...new Set(rows.map((r) => r.client_company_id).filter(Boolean))] as string[];
  const clients = new Map<string, ProviderClient["client"]>();
  for (const batch of chunk(ids, 150)) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, category, domain, city, country, sub_type")
      .in("id", batch);
    for (const c of data ?? []) clients.set(c.id, c as ProviderClient["client"]);
  }
  return rows.map(({ client_company_id, ...r }) => ({
    ...r,
    fund_examples: r.fund_examples ?? [],
    provider_entities: r.provider_entities ?? [],
    client: client_company_id ? (clients.get(client_company_id) ?? null) : null,
  }));
}

/** Names for the ids a commitment points at, so a row reads without joins. */
export async function nameCommitments(rows: DisclosedCommitment[]): Promise<
  (DisclosedCommitment & { fund_label: string | null; lp_label: string | null; gp_label: string | null })[]
> {
  const supabase = getReadClient();
  if (!supabase || !rows.length) return rows.map((r) => ({ ...r, fund_label: r.fund_name, lp_label: r.lp_name, gp_label: r.gp_name }));
  const fundIds = [...new Set(rows.map((r) => r.fund_id).filter(Boolean))] as string[];
  const funds = new Map<string, { name: string; company_id: string | null }>();
  for (const batch of chunk(fundIds, 150)) {
    const { data } = await supabase.from("funds").select("id, name, company_id").in("id", batch);
    for (const f of data ?? []) funds.set(f.id, f as { name: string; company_id: string | null });
  }
  const companyIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.lp_company_id, r.gp_company_id, r.fund_id ? funds.get(r.fund_id)?.company_id ?? null : null])
        .filter(Boolean),
    ),
  ] as string[];
  const names = new Map<string, string>();
  for (const batch of chunk(companyIds, 150)) {
    const { data } = await supabase.from("companies").select("id, name").in("id", batch);
    for (const c of data ?? []) names.set(c.id, c.name);
  }
  return rows.map((r) => {
    const fund = r.fund_id ? funds.get(r.fund_id) : undefined;
    const gpId = r.gp_company_id ?? fund?.company_id ?? null;
    return {
      ...r,
      gp_company_id: gpId,
      fund_label: r.fund_name ?? fund?.name ?? null,
      lp_label: r.lp_name ?? (r.lp_company_id ? (names.get(r.lp_company_id) ?? null) : null),
      gp_label: r.gp_name ?? (gpId ? (names.get(gpId) ?? null) : null),
    };
  });
}

export type BrandLink = {
  client_company_id: string | null;
  role: string | null;
  fund_count: number | null;
  fund_examples: string[];
  provider_entities: string[];
  provider_locations: string[];
  source: string | null;
};

/** Every filed link for one provider brand. */
export async function getBrandLinks(key: string): Promise<BrandLink[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows =
    (await fetchAll<BrandLink>((from, to, first) =>
      supabase
        .from("service_relationships")
        .select(
          "id, client_company_id, role, fund_count, fund_examples, provider_entities, provider_locations, source",
          first ? { count: "exact" } : undefined,
        )
        .eq("provider_key", key)
        .order("id")
        .range(from, to),
    )) ?? [];
  return rows.map((r) => ({
    ...r,
    fund_examples: r.fund_examples ?? [],
    provider_entities: r.provider_entities ?? [],
    provider_locations: r.provider_locations ?? [],
  }));
}

export type CompanyFund = {
  id: string;
  name: string;
  name_filed: string | null;
  vehicle_kind: string | null;
  domicile: string | null;
  currency: string | null;
  vintage_year: number | null;
  fund_size_usd: number | null;
  target_size_usd: number | null;
  strategy: string | null;
  status: string | null;
  source: string | null;
  filed: string | null;
  source_url: string | null;
  service_providers: { role: string; key: string; brand: string }[];
};

/** A manager's funds: the Form ADV lineup plus any added by hand. */
export async function getCompanyFunds(companyId: string): Promise<CompanyFund[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("funds").select("*").eq("company_id", companyId).limit(2000);
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((f) => ({
      id: f.id as string,
      name: f.name as string,
      name_filed: (f.name_filed as string | null) ?? null,
      vehicle_kind: (f.vehicle_kind as string | null) ?? null,
      domicile: (f.domicile as string | null) ?? null,
      currency: (f.currency as string | null) ?? null,
      vintage_year: (f.vintage_year as number | null) ?? null,
      fund_size_usd: (f.fund_size_usd as number | null) ?? null,
      target_size_usd: (f.target_size_usd as number | null) ?? null,
      strategy: (f.strategy as string | null) ?? null,
      status: (f.status as string | null) ?? null,
      source: (f.source as string | null) ?? null,
      filed: (f.filed as string | null) ?? null,
      source_url: (f.source_url as string | null) ?? null,
      service_providers: Array.isArray(f.service_providers)
        ? (f.service_providers as { role: string; key: string; brand: string }[])
        : [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The latest publicly disclosed LP commitments, newest first. */
export async function getRecentCommitments(
  limit = 12,
): Promise<(DisclosedCommitment & { fund_label: string | null; lp_label: string | null; gp_label: string | null })[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("commitments")
    .select(COMMITMENT_COLUMNS)
    .eq("source", "lp_disclosure")
    .order("commitment_year", { ascending: false, nullsFirst: false })
    .order("commitment_date", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error || !data) return [];
  return nameCommitments(data as DisclosedCommitment[]);
}
