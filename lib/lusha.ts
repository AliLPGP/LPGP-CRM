import "server-only";

// ===========================================================================
// Lusha Prospecting API client (server-only).
//
// Flow: /prospecting/contact/search returns a requestId + lightweight preview
// rows (no emails/phones, cheaper). /prospecting/contact/enrich then reveals
// emails + phones for the contactIds you choose (this is what spends credits).
//
// Field shapes differ a little between Lusha API revisions, so parsing below is
// defensive (checks several likely keys). Docs: https://docs.lusha.com/apis
// ===========================================================================

// Overridable for local testing against a stand-in server.
const BASE = process.env.LUSHA_API_BASE ?? "https://api.lusha.com";

export function lushaConfigured(): boolean {
  return Boolean(process.env.LUSHA_API_KEY);
}

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    api_key: process.env.LUSHA_API_KEY ?? "",
  };
}

export type LushaSearchParams = {
  jobTitles?: string[];
  departments?: string[];
  seniority?: number[];
  countries?: string[];
  companyNames?: string[];
  companyDomains?: string[];
  names?: string[];
  page?: number;
  size?: number;
};

export type LushaPreview = {
  contactId: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  companyName: string | null;
  companyDomain: string | null;
  country: string | null;
  city: string | null;
  linkedinUrl: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
};

export type LushaEnriched = {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  department: string | null;
  seniority: string | null;
  companyName: string | null;
  companyDomain: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  country: string | null;
  city: string | null;
};

type Json = Record<string, unknown>;

function asObj(v: unknown): Json {
  return v && typeof v === "object" ? (v as Json) : {};
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export class LushaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function post(path: string, body: Json): Promise<Json> {
  if (!lushaConfigured()) {
    throw new LushaError("LUSHA_API_KEY is not set", 500);
  }
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    /* non-JSON error body */
  }
  if (!res.ok) {
    const msg =
      str(json.message) ?? str((asObj(json.error) as Json).message) ?? text ?? "Lusha request failed";
    throw new LushaError(msg, res.status);
  }
  return json;
}

export async function lushaContactSearch(
  params: LushaSearchParams,
): Promise<{ requestId: string | null; contacts: LushaPreview[]; total: number }> {
  const contactsInclude: Json = {};
  if (params.jobTitles?.length) contactsInclude.jobTitles = params.jobTitles;
  if (params.departments?.length) contactsInclude.departments = params.departments;
  if (params.seniority?.length) contactsInclude.seniority = params.seniority;
  if (params.names?.length) contactsInclude.names = params.names;
  if (params.countries?.length)
    contactsInclude.locations = params.countries.map((c) => ({ country: c }));

  const companiesInclude: Json = {};
  if (params.companyNames?.length) companiesInclude.names = params.companyNames;
  if (params.companyDomains?.length) companiesInclude.domains = params.companyDomains;

  const filters: Json = { contacts: { include: contactsInclude } };
  if (Object.keys(companiesInclude).length) {
    (filters as { companies?: Json }).companies = { include: companiesInclude };
  }

  const reqBody: Json = {
    filters,
    pages: { page: params.page ?? 0, size: Math.min(params.size ?? 40, 50) },
  };

  const json = await post("/prospecting/contact/search", reqBody);

  const rows = arr(json.data).length ? arr(json.data) : arr(json.contacts).length ? arr(json.contacts) : arr(json.results);
  const contacts = rows.map(normalizePreview);
  const pagination = asObj(json.pagination);
  const total =
    (typeof json.totalResults === "number" && json.totalResults) ||
    (typeof json.total === "number" && (json.total as number)) ||
    (typeof pagination.total === "number" && (pagination.total as number)) ||
    contacts.length;

  return { requestId: str(json.requestId), contacts, total };
}

function normalizePreview(raw: unknown): LushaPreview {
  const r = asObj(raw);
  const name = asObj(r.name);
  const company = asObj(r.company);
  const firstName = str(r.firstName) ?? str(name.first);
  const lastName = str(r.lastName) ?? str(name.last);
  const full =
    str(r.name) ?? str(name.full) ?? ([firstName, lastName].filter(Boolean).join(" ") || null);
  const has = arr(r.has).map(String);
  const location = asObj(r.location);
  return {
    contactId: String(r.contactId ?? r.id ?? ""),
    name: full,
    firstName,
    lastName,
    // Newer responses nest the title: { jobTitle: { title, departments } }.
    jobTitle: str(r.jobTitle) ?? str(asObj(r.jobTitle).title) ?? str(r.title),
    companyName: str(r.companyName) ?? str(company.name),
    companyDomain: str(r.fqdn) ?? str(r.companyDomain) ?? str(company.fqdn) ?? str(company.domain),
    country: str(r.country) ?? str(location.country),
    city: str(r.city) ?? str(location.city),
    linkedinUrl: str(asObj(r.socialLinks).linkedin) ?? str(r.linkedinUrl),
    hasEmail: Boolean(r.hasWorkEmail ?? r.hasEmail ?? r.hasEmails ?? has.includes("emails")),
    hasPhone: Boolean(r.hasPhones ?? r.hasPhone ?? has.includes("phones")),
  };
}

export async function lushaContactEnrich(
  requestId: string | null,
  contactIds: string[],
): Promise<LushaEnriched[]> {
  if (contactIds.length === 0) return [];
  const body: Json = { contactIds };
  if (requestId) body.requestId = requestId;
  const json = await post("/prospecting/contact/enrich", body);
  const rows = arr(json.contacts).length ? arr(json.contacts) : arr(json.data);
  return rows.map(normalizeEnriched);
}

function normalizeEnriched(raw: unknown): LushaEnriched {
  const top = asObj(raw);
  // Some responses nest the payload under `data`.
  const r = Object.keys(asObj(top.data)).length ? asObj(top.data) : top;
  const name = asObj(r.name);
  const company = asObj(r.company);
  const location = asObj(r.location);

  const firstName = str(r.firstName) ?? str(name.first);
  const lastName = str(r.lastName) ?? str(name.last);
  const fullName =
    str(name.full) ?? str(r.name) ?? ([firstName, lastName].filter(Boolean).join(" ") || null);

  // Emails: prefer work email.
  const emails = arr(r.emailAddresses).length ? arr(r.emailAddresses) : arr(r.emails);
  let email: string | null = null;
  for (const e of emails) {
    const eo = asObj(e);
    const addr = str(eo.email) ?? str(eo.address) ?? (typeof e === "string" ? e : null);
    if (!addr) continue;
    if (!email) email = addr;
    if ((str(eo.emailType) ?? str(eo.type))?.toLowerCase() === "work") {
      email = addr;
      break;
    }
  }

  const phones = arr(r.phoneNumbers).length ? arr(r.phoneNumbers) : arr(r.phones);
  let phone: string | null = null;
  for (const p of phones) {
    const po = asObj(p);
    const num = str(po.number) ?? str(po.phone) ?? (typeof p === "string" ? p : null);
    if (num) {
      phone = num;
      break;
    }
  }

  const social = asObj(r.social);
  const socialLink = arr(r.socialLinks)
    .map((s) => asObj(s))
    .find((s) => (str(s.type) ?? "").toLowerCase().includes("linkedin"));
  const linkedinUrl =
    str(r.linkedinUrl) ??
    str(social.linkedin) ??
    str(asObj(social.linkedin).url) ??
    str(socialLink?.url) ??
    null;

  return {
    contactId: String(top.id ?? r.id ?? r.contactId ?? ""),
    firstName,
    lastName,
    fullName,
    jobTitle: str(r.jobTitle) ?? str(r.title),
    department: str(r.department) ?? str(r.departments),
    seniority: str(r.seniority),
    companyName: str(r.companyName) ?? str(company.name),
    companyDomain: str(r.fqdn) ?? str(r.companyDomain) ?? str(company.fqdn) ?? str(company.domain),
    email,
    phone,
    linkedinUrl,
    country: str(location.country) ?? str(r.country),
    city: str(location.city) ?? str(r.city),
  };
}
