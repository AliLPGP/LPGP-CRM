import type { LeadStage } from "./pipeline";
import type { OpsMatch } from "./ops-types";

/** LP / GP / SP, plus UN for firms the Master Directory hasn't classified yet. */
export type Category = "LP" | "GP" | "SP" | "UN";

export type Allocation = { label: string; value: number };

export type Company = {
  id: string;
  name: string;
  category: Category;
  sub_type: string | null;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  logo_url: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  hq_location: string | null;
  employee_range: string | null;
  aum: string | null;
  lusha_company_id: string | null;
  // Profile / visualization fields (migration 0002)
  aum_usd: number | null;
  region: string | null;
  status: string | null;
  investment_thesis: string | null;
  check_size: string | null;
  preferred_stages: string | null;
  geographic_focus: string | null;
  active_funds: number | null;
  allocations: Allocation[];
  in_portfolio: boolean;
  created_at: string;
  updated_at: string;
} & Partial<DirectoryFields>;

/** Columns migration 0013 adds; absent until it runs, hence optional. */
export type DirectoryFields = {
  external_id: string | null;
  external_ids: string[];
  source: string | null;
  directory_vertical: string | null;
  state: string | null;
  founded_year: number | null;
  years_active: number | null;
  employee_count: number | null;
  industry: string | null;
  lusha_verified_on: string | null;
  catalog_updated_at: string | null;
  sources: { label: string; url: string | null }[];
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
  adv_entities: {
    crd: string | null;
    file_number: string | null;
    entity: string | null;
    firm_type: string | null;
    regulatory_aum_usd: number | null;
    last_filed: string | null;
    source_url: string | null;
  }[];
  investor_type: string | null;
  total_assets_usd: number | null;
  alts_allocation_pct: number | null;
  discloses_commitments: string | null;
  disclosure_source_url: string | null;
  assets_monitored_usd: number | null;
  assets_monitored_display: string | null;
  lifecycle: string[];
  service_lines: { name: string; description: string | null; capabilities: string[] }[];
};

export type Contact = {
  id: string;
  company_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  job_title: string | null;
  seniority: string | null;
  department: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  country: string | null;
  city: string | null;
  lusha_contact_id: string | null;
  // Relationship fields (migration 0003)
  relationship_strength: number | null;
  priority: string | null;
  status: string | null;
  last_contacted: string | null;
  created_at: string;
  updated_at: string;
  // Master Directory provenance (migration 0013)
  external_ref?: string | null;
  source?: string | null;
  /** The team's master sheet holds a direct email for this person. */
  connectable?: boolean | null;
};

export type Fund = {
  id: string;
  company_id: string | null;
  name: string;
  vintage_year: number | null;
  fund_size_usd: number | null;
  target_size_usd: number | null;
  strategy: string | null;
  geography: string | null;
  status: string | null;
  created_at: string;
  // Directory columns (0013/0014); absent on an older database.
  external_key?: string | null;
  manager_name?: string | null;
  source?: string | null;
  name_filed?: string | null;
  vehicle_kind?: string | null;
  domicile?: string | null;
  currency?: string | null;
  service_providers?: { role: string; key: string; brand: string }[] | null;
  filed?: string | null;
  source_url?: string | null;
};

export type FundManager = { id: string; name: string; category: Category; domain: string | null };
export type FundWithManager = Fund & { manager: FundManager | null };

export type Commitment = {
  id: string;
  lp_company_id: string | null;
  fund_id: string | null;
  amount_usd: number | null;
  commitment_date: string | null;
  created_at: string;
};

// A commitment as seen from a fund (which LP committed).
export type FundCommitment = {
  id: string;
  amount_usd: number | null;
  commitment_date: string | null;
  lp: { id: string; name: string; category: Category } | null;
  // Disclosed commitments keep their own currency and the source (0013).
  amount?: number | null;
  currency?: string | null;
  amount_text?: string | null;
  commitment_date_text?: string | null;
  disclosure_type?: string | null;
  source_url?: string | null;
  lp_name?: string | null;
};

// A commitment as seen from an LP (which fund they backed).
export type LpCommitment = {
  id: string;
  amount_usd: number | null;
  commitment_date: string | null;
  fund: FundWithManager | null;
};

// A service provider used by a client (GP/LP).
export type ProviderLink = {
  id: string;
  role: string | null;
  provider: { id: string; name: string; category: Category; sub_type: string | null; domain: string | null } | null;
};

// A client served by a provider (SP).
export type ClientLink = {
  id: string;
  role: string | null;
  client: { id: string; name: string; category: Category; domain: string | null } | null;
};

export type Note = {
  id: string;
  entity_type: "company" | "contact" | "lead" | "account";
  entity_id: string;
  body: string;
  author: string | null;
  created_at: string;
};

export type ContactWithCompany = Contact & {
  company: Pick<Company, "id" | "name" | "category" | "logo_url"> | null;
};

// --- CRM leads -------------------------------------------------------------
export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  /** Matches the initials stamped on deals in the ops panel. */
  initials: string | null;
};

export type Lead = {
  id: string;
  owner_id: string | null;
  company_id: string | null;
  company_name: string | null;
  category: Category | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  linkedin_url: string | null;
  market: string | null;
  stage: LeadStage;
  value_usd: number | null;
  source: string | null;
  next_step: string | null;
  next_step_date: string | null;
  // Sales workflow (migration 0008)
  title: string | null;
  disposition: string | null;
  callback_at: string | null;
  last_activity_at: string | null;
  call_count: number;
  do_not_call: boolean;
  priority: string;
  website: string | null;
  country: string | null;
  import_id: string | null;
  account_id: string | null;
  ops_deal_id: number | null;
  ops_checked_at: string | null;
  /** Events this lead is being pursued for (migration 0010). */
  target_events: LeadEvent[];
  created_at: string;
  updated_at: string;
};

/** An event a lead targets — the tracker's id plus a name snapshot. */
export type LeadEvent = { event_id: number; event_name: string };

export type LeadOwner = { id: string; full_name: string | null; email: string | null };

export type LeadWithRefs = Lead & {
  owner: LeadOwner | null;
  company: { id: string; name: string; category: Category; domain: string | null } | null;
};

// --- Accounts (sponsors) ---------------------------------------------------
export type Account = {
  id: string;
  company_id: string | null;
  name: string;
  category: Category | null;
  owner_id: string | null;
  status: string;
  tier: string | null;
  health: string | null;
  domain: string | null;
  website: string | null;
  linkedin_url: string | null;
  hq_location: string | null;
  country: string | null;
  ops_company: string | null;
  first_sponsored_year: number | null;
  renewal_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountContact = {
  id: string;
  account_id: string;
  contact_id: string | null;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  linkedin_url: string | null;
  role: string | null;
  is_primary: boolean;
  last_contacted: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountWithRefs = Account & {
  owner: LeadOwner | null;
  contact_count: number;
  primary_contact: AccountContact | null;
};

// --- Activity log ----------------------------------------------------------
export type ActivityType = "call" | "email" | "meeting" | "linkedin" | "note" | "task";

export type Activity = {
  id: string;
  type: ActivityType;
  outcome: string | null;
  subject: string | null;
  body: string | null;
  duration_seconds: number | null;
  occurred_at: string;
  owner_id: string | null;
  lead_id: string | null;
  account_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  account_contact_id: string | null;
  created_at: string;
};

/** Compact activity row for the call console's history strip. */
export type ActivityTimelineRow = {
  id: string;
  type: ActivityType;
  outcome: string | null;
  subject: string | null;
  body: string | null;
  duration_seconds: number | null;
  occurred_at: string;
  owner_name: string | null;
};

export type ActivityWithRefs = Activity & {
  owner: LeadOwner | null;
  lead_name: string | null;
  account_name: string | null;
};

// --- Tasks -----------------------------------------------------------------
export type Task = {
  id: string;
  title: string;
  notes: string | null;
  due_date: string | null;
  priority: string;
  done: boolean;
  done_at: string | null;
  owner_id: string | null;
  lead_id: string | null;
  account_id: string | null;
  created_at: string;
  updated_at: string;
};

// --- Ops panel link --------------------------------------------------------
/** `user` = a salesperson claiming an ops deal as one of "my deals". */
export type OpsLinkEntity = "lead" | "account" | "company" | "user";

export type OpsLink = {
  id: string;
  entity_type: OpsLinkEntity;
  entity_id: string;
  ops_deal_id: number;
  ops_company: string | null;
  confidence: number | null;
  /** Last payload the bridge returned — keeps the UI useful when it's down. */
  snapshot: Record<string, unknown>;
  synced_at: string;
  linked_by: string | null;
  created_at: string;
};

// --- Pipeline heads-up -----------------------------------------------------
// "Is anyone already on this company?" — answered before a lead is created.

export type TeammateLead = {
  leadId: string;
  ownerId: string | null;
  ownerName: string;
  isMine: boolean;
  stage: string;
  stageKind: "open" | "won" | "lost";
  events: LeadEvent[];
  updatedAt: string;
  lastActivityAt: string | null;
};

export type EventVerdict = {
  event_id: number;
  event_name: string;
  /** signed = already sponsoring per the ops panel; pipeline = a teammate is on it. */
  status: "clear" | "pipeline" | "signed";
  detail: string;
  leadId?: string;
  /** Who signed it, resolved from the deal's initials when we can. */
  signedBy?: string | null;
};

export type PipelineConflicts = {
  company: string;
  teammates: TeammateLead[];
  /** Best ops-panel match, when the bridge returned one. */
  ops: OpsMatch | null;
  /** One verdict per event the person selected. */
  verdicts: EventVerdict[];
  /** Everyone who has signed this company, per the ops panel's initials. */
  signedBy: string[];
  /** True when something here should give the person pause. */
  hasConflict: boolean;
};

export type LeadImport = {
  id: string;
  filename: string | null;
  row_count: number;
  created_count: number;
  skipped_count: number;
  mapping: Record<string, string>;
  owner_id: string | null;
  created_at: string;
};
