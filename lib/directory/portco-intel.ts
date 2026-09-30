// What is on file about a company behind a deal (migration 0022): the UK
// register's facts and latest filed accounts, and the executives a people
// database previews. Types and pure helpers only, so client components can
// render a record without pulling the server-only reads into the bundle.

export type PortcoOfficer = { name: string; role: string | null; occupation: string | null; appointed_on: string | null; resigned_on: string | null };
export type PortcoExecutive = { name: string; title: string; linkedin_url: string | null; has_email: boolean; source: string };

/** What is on file about a company behind a deal: register facts, filed accounts, people. */
export type PortcoIntel = {
  key: string;
  name: string;
  domain: string | null;
  country: string | null;
  ch_number: string | null;
  ch_name: string | null;
  ch_status: string | null;
  ch_type: string | null;
  sic_codes: string[];
  incorporated_on: string | null;
  registered_address: string | null;
  officers: PortcoOfficer[];
  accounts_period_end: string | null;
  accounts_type: string | null;
  accounts_url: string | null;
  currency: string | null;
  revenue: number | null;
  gross_profit: number | null;
  operating_profit: number | null;
  profit_before_tax: number | null;
  depreciation: number | null;
  amortisation: number | null;
  ebitda_derived: number | null;
  employees: number | null;
  net_assets: number | null;
  cash: number | null;
  creditors_over_year: number | null;
  executives: PortcoExecutive[];
  executives_at: string | null;
  ch_at: string | null;
};

/** The finance lead a record names: an executive titled for finance first, else a director whose occupation says so. */
export function financeLead(intel: PortcoIntel | undefined): { name: string; title: string } | null {
  if (!intel) return null;
  const exec = intel.executives.find((e) => /\b(cfo|chief financial|finance director|financial director)\b/i.test(e.title));
  if (exec) return { name: exec.name, title: exec.title };
  const officer = intel.officers.find((o) => !o.resigned_on && /\b(cfo|chief financial|finance director|financial director|financial controller)\b/i.test(o.occupation ?? ""));
  if (officer) return { name: officer.name, title: officer.occupation ?? "Director" };
  return null;
}


/** The page for a company behind the deals, by its key. */
export function portcoHref(key: string): string {
  return `/database/portcos/${encodeURIComponent(key)}`;
}

export type LeadRole = "finance" | "operations" | "chief" | "other";

/** What a title says the person runs. */
export function leadRole(title: string | null | undefined): LeadRole {
  const t = title ?? "";
  if (/\b(cfo|chief financial|finance director|financial director|financial controller|head of finance|vp finance|treasurer)\b/i.test(t)) return "finance";
  if (/\b(coo|chief operating|operations director|director of operations|head of operations|vp operations|chief transformation|chief restructuring)\b/i.test(t)) return "operations";
  if (/\b(ceo|chief executive|managing director|president|founder|chairman|chair)\b/i.test(t)) return "chief";
  return "other";
}

export const LEAD_ROLE_LABEL: Record<LeadRole, string> = { finance: "Finance", operations: "Operations", chief: "Chief executive", other: "" };

/** Everyone on file for a company, executives first, each with what they run. */
export function leadership(intel: PortcoIntel): { name: string; title: string; role: LeadRole; source: "lusha" | "companies_house"; since: string | null; linkedin_url: string | null }[] {
  const out: ReturnType<typeof leadership> = [];
  for (const e of intel.executives) out.push({ name: e.name, title: e.title, role: leadRole(e.title), source: "lusha", since: null, linkedin_url: e.linkedin_url });
  for (const o of intel.officers) {
    if (o.resigned_on) continue;
    const title = [o.occupation, o.role ? o.role.replace(/-/g, " ") : null].filter(Boolean).join(", ") || "Officer";
    out.push({ name: o.name, title, role: leadRole(o.occupation), source: "companies_house", since: o.appointed_on, linkedin_url: null });
  }
  const rank: Record<LeadRole, number> = { finance: 0, operations: 1, chief: 2, other: 3 };
  return out.sort((a, b) => rank[a.role] - rank[b.role] || (a.source === "lusha" ? -1 : 1) - (b.source === "lusha" ? -1 : 1));
}
