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

