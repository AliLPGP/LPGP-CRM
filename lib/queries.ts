import { getReadClient } from "./supabase/server";
import { chunk, fetchAll } from "./supabase/paged";
import type {
  Category,
  Company,
  Contact,
  ContactWithCompany,
  ClientLink,
  Fund,
  FundCommitment,
  FundManager,
  FundWithManager,
  LpCommitment,
  Note,
  ProviderLink,
} from "./types";

export type CategoryCounts = Record<Category, number> & { total: number };

export async function getCategoryCounts(): Promise<CategoryCounts> {
  const empty: CategoryCounts = { LP: 0, GP: 0, SP: 0, UN: 0, total: 0 };
  const supabase = getReadClient();
  if (!supabase) return empty;
  // Head-only counts: exact past the 1,000-row response cap, and no rows moved.
  const books: Category[] = ["LP", "GP", "SP", "UN"];
  const results = await Promise.all(
    books.map((b) =>
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("category", b),
    ),
  );
  const counts = { ...empty };
  results.forEach((r, i) => {
    counts[books[i]] = r.count ?? 0;
    counts.total += r.count ?? 0;
  });
  return counts;
}

export async function getContactCount(): Promise<number> {
  const supabase = getReadClient();
  if (!supabase) return 0;
  const { count } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function listCompanies(opts: {
  category?: Category;
  search?: string;
} = {}): Promise<Company[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<Company>((from, to, first) => {
    let query = supabase
      .from("companies")
      .select("*", first ? { count: "exact" } : undefined)
      .order("name")
      .order("id");
    if (opts.category) query = query.eq("category", opts.category);
    if (opts.search) query = query.ilike("name", `%${opts.search}%`);
    return query.range(from, to);
  });
  return rows ?? [];
}

export type CompanyLite = { id: string; name: string; category: Category };

/** id/name/category only — for pickers and the New-lead dialog. Much lighter
 *  than listCompanies() which pulls full firmographics. */
export async function listCompaniesLite(): Promise<CompanyLite[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<CompanyLite>((from, to, first) =>
    supabase
      .from("companies")
      .select("id, name, category", first ? { count: "exact" } : undefined)
      .order("name")
      .order("id")
      .range(from, to),
  );
  return rows ?? [];
}

export async function listPortfolioCompanies(): Promise<Company[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const rows = await fetchAll<Company>((from, to, first) =>
    supabase
      .from("companies")
      .select("*", first ? { count: "exact" } : undefined)
      .eq("in_portfolio", true)
      .order("name")
      .order("id")
      .range(from, to),
  );
  return rows ?? [];
}

export async function getCompany(id: string): Promise<Company | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase.from("companies").select("*").eq("id", id).single();
  return (data as Company) ?? null;
}

export async function listContacts(opts: {
  search?: string;
  companyId?: string;
} = {}): Promise<ContactWithCompany[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  // Fetch contacts plainly (no embed) so a join quirk can never drop rows,
  // then attach company data in JS.
  const contacts = await fetchAll<Contact>((from, to, first) => {
    let query = supabase
      .from("contacts")
      .select("*", first ? { count: "exact" } : undefined)
      .order("full_name")
      .order("id");
    if (opts.companyId) query = query.eq("company_id", opts.companyId);
    if (opts.search) query = query.ilike("full_name", `%${opts.search}%`);
    return query.range(from, to);
  });
  if (!contacts) return [];

  const companyIds = [...new Set(contacts.map((c) => c.company_id).filter(Boolean))] as string[];
  const companyMap = new Map<string, ContactWithCompany["company"]>();
  // Batched: two thousand ids in one `in` filter overflow the request URL.
  for (const ids of chunk(companyIds, 150)) {
    const { data: companies } = await supabase
      .from("companies")
      .select("id, name, category, logo_url, domain")
      .in("id", ids);
    for (const co of companies ?? []) {
      companyMap.set(co.id, co as ContactWithCompany["company"]);
    }
  }

  return contacts.map((c) => ({
    ...c,
    company: c.company_id ? companyMap.get(c.company_id) ?? null : null,
  }));
}

export async function getContact(id: string): Promise<ContactWithCompany | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase.from("contacts").select("*").eq("id", id).single();
  if (!data) return null;
  const contact = data as Contact;
  let company: ContactWithCompany["company"] = null;
  if (contact.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("id, name, category, logo_url")
      .eq("id", contact.company_id)
      .single();
    company = (co as ContactWithCompany["company"]) ?? null;
  }
  return { ...contact, company };
}

export async function getContactsForCompany(companyId: string): Promise<Contact[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .order("full_name");
  return (data as Contact[]) ?? [];
}

async function managerMap(
  supabase: NonNullable<ReturnType<typeof getReadClient>>,
  ids: string[],
): Promise<Map<string, FundManager>> {
  const map = new Map<string, FundManager>();
  const unique = [...new Set(ids.filter(Boolean))];
  for (const batch of chunk(unique, 150)) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, category, domain")
      .in("id", batch);
    for (const c of data ?? []) map.set(c.id, c as FundManager);
  }
  return map;
}

export async function listFunds(): Promise<FundWithManager[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("funds")
    .select("*")
    .order("fund_size_usd", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  const funds = data as Fund[];
  const managers = await managerMap(
    supabase,
    funds.map((f) => f.company_id).filter(Boolean) as string[],
  );
  return funds.map((f) => ({ ...f, manager: f.company_id ? managers.get(f.company_id) ?? null : null }));
}

export async function getFund(id: string): Promise<FundWithManager | null> {
  const supabase = getReadClient();
  if (!supabase) return null;
  const { data } = await supabase.from("funds").select("*").eq("id", id).single();
  if (!data) return null;
  const fund = data as Fund;
  let manager: FundManager | null = null;
  if (fund.company_id) {
    const { data: c } = await supabase
      .from("companies")
      .select("id, name, category, domain")
      .eq("id", fund.company_id)
      .single();
    manager = (c as FundManager) ?? null;
  }
  return { ...fund, manager };
}

export async function getCommitmentsForFund(fundId: string): Promise<FundCommitment[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase.from("commitments").select("*").eq("fund_id", fundId);
  const rows =
    (data as ({ id: string; lp_company_id: string | null; amount_usd: number | null; commitment_date: string | null } & Partial<
      Record<"amount", number | null> &
        Record<"currency" | "amount_text" | "commitment_date_text" | "disclosure_type" | "source_url" | "lp_name", string | null>
    >)[]) ?? [];
  const lps = await managerMap(supabase, rows.map((r) => r.lp_company_id).filter(Boolean) as string[]);
  return rows
    .map((r) => ({
      id: r.id,
      amount_usd: r.amount_usd,
      commitment_date: r.commitment_date,
      lp: r.lp_company_id ? lps.get(r.lp_company_id) ?? null : null,
      amount: r.amount ?? null,
      currency: r.currency ?? null,
      amount_text: r.amount_text ?? null,
      commitment_date_text: r.commitment_date_text ?? null,
      disclosure_type: r.disclosure_type ?? null,
      source_url: r.source_url ?? null,
      lp_name: r.lp_name ?? null,
    }))
    // Largest first within each currency; amounts in different currencies
    // are never compared.
    .sort(
      (a, b) =>
        (a.currency ?? "USD").localeCompare(b.currency ?? "USD") ||
        (b.amount_usd ?? b.amount ?? 0) - (a.amount_usd ?? a.amount ?? 0),
    );
}

export async function getCommitmentsForLp(lpCompanyId: string): Promise<LpCommitment[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase.from("commitments").select("*").eq("lp_company_id", lpCompanyId);
  const rows = (data as { id: string; fund_id: string | null; amount_usd: number | null; commitment_date: string | null }[]) ?? [];
  const fundIds = [...new Set(rows.map((r) => r.fund_id).filter(Boolean))] as string[];
  const fundMap = new Map<string, FundWithManager>();
  if (fundIds.length) {
    const { data: funds } = await supabase.from("funds").select("*").in("id", fundIds);
    const managers = await managerMap(
      supabase,
      (funds ?? []).map((f) => f.company_id).filter(Boolean) as string[],
    );
    for (const f of (funds as Fund[]) ?? []) {
      fundMap.set(f.id, { ...f, manager: f.company_id ? managers.get(f.company_id) ?? null : null });
    }
  }
  return rows
    .map((r) => ({
      id: r.id,
      amount_usd: r.amount_usd,
      commitment_date: r.commitment_date,
      fund: r.fund_id ? fundMap.get(r.fund_id) ?? null : null,
    }))
    .sort((a, b) => (b.amount_usd ?? 0) - (a.amount_usd ?? 0));
}

export async function getProvidersForClient(companyId: string): Promise<ProviderLink[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("service_relationships")
    .select("*")
    .eq("client_company_id", companyId);
  const rows = (data as { id: string; provider_company_id: string | null; role: string | null }[]) ?? [];
  const ids = [...new Set(rows.map((r) => r.provider_company_id).filter(Boolean))] as string[];
  const map = new Map<string, ProviderLink["provider"]>();
  if (ids.length) {
    const { data: cos } = await supabase
      .from("companies")
      .select("id, name, category, sub_type, domain")
      .in("id", ids);
    for (const c of cos ?? []) map.set(c.id, c as ProviderLink["provider"]);
  }
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    provider: r.provider_company_id ? map.get(r.provider_company_id) ?? null : null,
  }));
}

export async function getClientsForProvider(companyId: string): Promise<ClientLink[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("service_relationships")
    .select("*")
    .eq("provider_company_id", companyId);
  const rows = (data as { id: string; client_company_id: string | null; role: string | null }[]) ?? [];
  const ids = [...new Set(rows.map((r) => r.client_company_id).filter(Boolean))] as string[];
  const map = new Map<string, ClientLink["client"]>();
  if (ids.length) {
    const { data: cos } = await supabase
      .from("companies")
      .select("id, name, category, domain")
      .in("id", ids);
    for (const c of cos ?? []) map.set(c.id, c as ClientLink["client"]);
  }
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    client: r.client_company_id ? map.get(r.client_company_id) ?? null : null,
  }));
}

export async function getFundsForCompany(companyId: string): Promise<Fund[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("funds")
    .select("*")
    .eq("company_id", companyId)
    .order("vintage_year", { ascending: false, nullsFirst: false });
  if (error || !data) return [];
  return data as Fund[];
}

export async function getNotes(
  entityType: "company" | "contact" | "lead" | "account",
  entityId: string,
): Promise<Note[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  return (data as Note[]) ?? [];
}
