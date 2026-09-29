import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { normDomain, normName } from "@/lib/directory/normalize";
import { isOperatingRole, OPERATING_TITLES } from "@/lib/directory/operating";
import { lushaConfigured, lushaContactSearch, LushaError, type LushaPreview } from "@/lib/lusha";
import { getAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/paged";

// Operating partners for one or more GPs, from Lusha's people search. Search
// previews only — names, titles, locations, LinkedIn — so this never spends a
// reveal credit; Lusha bills about one credit per 25 people returned. Emails
// stay a per-person reveal, as everywhere else in the app.

export const maxDuration = 300;

const DOMAINS_PER_SEARCH = 40;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;

type Firm = { id: string; name: string; domain: string | null; category: string };

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!lushaConfigured()) return NextResponse.json({ error: "LUSHA_API_KEY is not configured." }, { status: 503 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });

  let body: { companyIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const ids = Array.isArray(body.companyIds) ? [...new Set(body.companyIds.map(String))].slice(0, 200) : [];
  if (!ids.length) return NextResponse.json({ error: "No firms given" }, { status: 400 });
  // One firm from its profile is anyone's call; a batch spends real credits.
  if (ids.length > 1 && user.role !== "admin") {
    return NextResponse.json({ error: "Only admins can look up firms in bulk." }, { status: 403 });
  }

  const firms: Firm[] = [];
  for (const batch of chunk(ids, 150)) {
    const { data } = await supabase.from("companies").select("id, name, domain, category").in("id", batch);
    firms.push(...((data ?? []) as Firm[]));
  }
  const byDomain = new Map<string, Firm>();
  for (const f of firms) {
    const d = normDomain(f.domain);
    if (d && !byDomain.has(d)) byDomain.set(d, f);
  }
  const skipped = firms.length - byDomain.size;
  if (!byDomain.size) {
    return NextResponse.json({ ok: true, searched: 0, found: 0, added: 0, updated: 0, skipped, results: 0 });
  }

  const found: { firm: Firm; p: LushaPreview }[] = [];
  let results = 0;
  try {
    for (const domains of chunk([...byDomain.keys()], DOMAINS_PER_SEARCH)) {
      for (let page = 0; page < MAX_PAGES; page++) {
        const r = await lushaContactSearch({ companyDomains: domains, jobTitles: OPERATING_TITLES, page, size: PAGE_SIZE });
        results += r.contacts.length;
        for (const p of r.contacts) {
          const firm = byDomain.get(normDomain(p.companyDomain) ?? "");
          // Lusha matches titles loosely ("Chief Operating Officer"); keep operators only.
          if (firm && p.contactId && isOperatingRole(p.jobTitle) && (p.firstName || p.lastName)) found.push({ firm, p });
        }
        if (r.contacts.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= r.total) break;
      }
    }
  } catch (err) {
    const status = err instanceof LushaError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Lusha search failed" }, { status });
  }

  // Existing people: by Lusha id, then by name at the same firm.
  const firmIds = [...new Set(found.map((f) => f.firm.id))];
  const existing: { id: string; company_id: string | null; full_name: string | null; lusha_contact_id: string | null }[] = [];
  for (const batch of chunk(firmIds, 100)) {
    const { data } = await supabase
      .from("contacts")
      .select("id, company_id, full_name, lusha_contact_id")
      .in("company_id", batch);
    existing.push(...(data ?? []));
  }
  const byLusha = new Map(existing.filter((e) => e.lusha_contact_id).map((e) => [e.lusha_contact_id!, e]));
  const byPerson = new Map(existing.map((e) => [`${e.company_id}|${normName(e.full_name ?? "")}`, e]));

  const updates: Record<string, unknown>[] = [];
  const inserts: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const { firm, p } of found) {
    if (seen.has(p.contactId)) continue;
    seen.add(p.contactId);
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ");
    const match = byLusha.get(p.contactId) ?? byPerson.get(`${firm.id}|${normName(name)}`);
    const row = {
      company_id: firm.id,
      first_name: p.firstName,
      last_name: p.lastName,
      job_title: p.jobTitle,
      linkedin_url: p.linkedinUrl,
      city: p.city,
      country: p.country,
      lusha_contact_id: p.contactId,
    };
    if (match) {
      updates.push({ id: match.id, job_title: p.jobTitle, linkedin_url: p.linkedinUrl, lusha_contact_id: match.lusha_contact_id ?? p.contactId });
    } else {
      inserts.push({ ...row, source: "lusha" });
    }
  }

  let added = 0;
  let updated = 0;
  for (const batch of chunk(updates, 200)) {
    for (const u of batch) {
      const { id, ...patch } = u;
      const { error } = await supabase.from("contacts").update(patch).eq("id", id as string);
      if (!error) updated += 1;
    }
  }
  for (const batch of chunk(inserts, 200)) {
    const { data, error } = await supabase
      .from("contacts")
      .upsert(batch, { onConflict: "lusha_contact_id", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ error: `Saving contacts: ${error.message}`, added, updated }, { status: 500 });
    added += data?.length ?? 0;
  }

  revalidateTag(DIRECTORY_TAG, { expire: 0 });
  return NextResponse.json({
    ok: true,
    searched: byDomain.size,
    skipped,
    results,
    found: seen.size,
    added,
    updated,
    firms: firmIds.length,
  });
}
