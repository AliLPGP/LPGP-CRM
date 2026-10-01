import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfileDirectory } from "./initials";
import { listOpsCompanies, listOpsDeals } from "./ops";
import { opsMatchKey, type OpsDeal, type OpsResult } from "./ops-types";

/**
 * A deal in the ops panel means a sponsor, and a sponsor is an account.
 *
 * This keeps the Accounts section in step with the tracker: every company
 * with a deal gets an account (created the first time, matched by name after
 * that), every deal is linked to it with a fresh snapshot, and the fields the
 * tracker knows better (the company's spelling there, the first year it
 * sponsored, whether it is active) are refreshed. Fields people own — tier,
 * health, notes, owner once set — are never touched.
 *
 * It runs after a deal is recorded from here, from the daily cron, and on
 * demand from the Accounts page, so a deal entered straight into the tracker
 * still becomes an account within a day.
 */

export type AccountSyncResult = {
  ok: boolean;
  error?: string;
  deals: number;
  companies: number;
  created: number;
  updated: number;
  linked: number;
  /** Names the sync could not place on any account, for a person to look at. */
  unmatched: string[];
  /** Sponsors whose account could not be written, with the database's reason. */
  failed?: string[];
};

type AccountRow = { id: string; name: string; ops_company: string | null; owner_id: string | null; company_id: string | null; first_sponsored_year: number | null; status: string };
type CompanyRow = { id: string; name: string; category: string | null; domain: string | null; website: string | null; country: string | null };

const empty = (error?: string): AccountSyncResult => ({ ok: !error, error, deals: 0, companies: 0, created: 0, updated: 0, linked: 0, unmatched: [] });

/** The year a deal counts for: its fiscal year, else its month, else when it was entered. */
function dealYear(d: OpsDeal): number | null {
  if (d.fiscal_year) return d.fiscal_year;
  const m = d.deal_month?.match(/^(\d{4})/);
  if (m) return Number(m[1]);
  const y = d.created_at?.slice(0, 4);
  return y && /^\d{4}$/.test(y) ? Number(y) : null;
}

/** The spelling most deals use, so the account reads the way the tracker does. */
function commonest(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/**
 * Every deal in the tracker, whatever page size the tracker allows. One bulk
 * read first; then the tracker's own company index says how many deals each
 * sponsor has, and any sponsor the bulk read shows fewer of is read by name.
 * A cap on the bulk read can therefore never leave a sponsor without an account.
 */
async function fetchTrackerDeals(company?: string): Promise<OpsResult<OpsDeal[]>> {
  const bulk = await listOpsDeals({ company, limit: 500 });
  if (!bulk.ok || company) return bulk;
  const index = await listOpsCompanies();
  if (!index.ok) return bulk;

  const seen = new Map<number, OpsDeal>(bulk.data.map((d) => [d.id, d]));
  const haveByKey = new Map<string, number>();
  for (const d of bulk.data) {
    const k = opsMatchKey(d.company);
    haveByKey.set(k, (haveByKey.get(k) ?? 0) + 1);
  }
  const short = index.data.filter((c) => (haveByKey.get(opsMatchKey(c.company)) ?? 0) < c.deal_count).map((c) => c.company);
  for (let i = 0; i < short.length; i += 5) {
    const batch = await Promise.all(short.slice(i, i + 5).map((name) => listOpsDeals({ company: name, limit: 500 })));
    for (const r of batch) if (r.ok) for (const d of r.data) seen.set(d.id, d);
  }
  return { ok: true, data: [...seen.values()] };
}

export async function syncAccountsFromOps(
  supabase: SupabaseClient,
  opts: { company?: string; linkedBy?: string | null } = {},
): Promise<AccountSyncResult> {
  const fetched = await fetchTrackerDeals(opts.company);
  if (!fetched.ok) return empty(fetched.error);
  const deals = fetched.data.filter((d) => d.company?.trim());
  const out = { ...empty(), deals: deals.length };
  if (!deals.length) return out;

  // Group the tracker's deals by company, on the same key the import
  // reconciliation uses, so "Barings LLC" and "Barings" are one sponsor.
  const groups = new Map<string, OpsDeal[]>();
  for (const d of deals) {
    const key = opsMatchKey(d.company);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  out.companies = groups.size;

  const [{ data: accountRows }, { data: linkRows }, { data: companyRows }, { data: profileRows }, directory] = await Promise.all([
    supabase.from("accounts").select("id, name, ops_company, owner_id, company_id, first_sponsored_year, status"),
    supabase.from("ops_links").select("entity_id, ops_deal_id").eq("entity_type", "account"),
    supabase.from("companies").select("id, name, category, domain, website, country"),
    supabase.from("profiles").select("id, full_name, email"),
    loadProfileDirectory(supabase),
  ]);
  const accounts = (accountRows as AccountRow[] | null) ?? [];
  const companies = (companyRows as CompanyRow[] | null) ?? [];

  // Three ways an account can already be this sponsor: it was linked to one of
  // these deals, its ops spelling matches, or its own name does.
  const accountByDeal = new Map<number, string>();
  for (const l of (linkRows as { entity_id: string; ops_deal_id: number }[] | null) ?? []) accountByDeal.set(l.ops_deal_id, l.entity_id);
  const accountByKey = new Map<string, AccountRow>();
  for (const a of accounts) {
    if (a.ops_company) accountByKey.set(opsMatchKey(a.ops_company), a);
  }
  for (const a of accounts) {
    const k = opsMatchKey(a.name);
    if (k && !accountByKey.has(k)) accountByKey.set(k, a);
  }
  const companyByKey = new Map<string, CompanyRow>();
  for (const c of companies) {
    const k = opsMatchKey(c.name);
    if (k && !companyByKey.has(k)) companyByKey.set(k, c);
  }
  // Profiles by initials, so a deal signed by a colleague lands on their account.
  const profileIdByName = new Map<string, string>();
  for (const p of (profileRows as { id: string; full_name: string | null; email: string | null }[] | null) ?? []) {
    const label = p.full_name || p.email;
    if (label) profileIdByName.set(label, p.id);
  }
  const ownerFor = (initials: string | null | undefined): string | null => {
    const name = directory.nameForInitials(initials);
    return name ? (profileIdByName.get(name) ?? null) : null;
  };

  const year = new Date().getUTCFullYear();

  for (const [key, group] of groups) {
    const live = group.filter((d) => !d.cancelled);
    const spelling = commonest(group.map((d) => d.company.trim()));
    const firstYear = group.map(dealYear).filter((y): y is number => y != null).sort((a, b) => a - b)[0] ?? null;
    const latestYear = group.map(dealYear).filter((y): y is number => y != null).sort((a, b) => b - a)[0] ?? null;

    let account: AccountRow | undefined =
      accounts.find((a) => group.some((d) => accountByDeal.get(d.id) === a.id)) ?? accountByKey.get(key);

    if (!account) {
      // Only a live deal makes a new sponsor; a company whose every deal was
      // cancelled is not one, though an existing account still gets updated.
      if (!live.length) {
        out.unmatched.push(spelling);
        continue;
      }
      const firm = companyByKey.get(key) ?? null;
      const signer = ownerFor(live[0]?.initials) ?? opts.linkedBy ?? null;
      const { data: created, error } = await supabase
        .from("accounts")
        .insert({
          name: firm?.name ?? spelling,
          ops_company: spelling,
          company_id: firm?.id ?? null,
          category: firm?.category && firm.category !== "UN" ? firm.category : null,
          domain: firm?.domain ?? null,
          website: firm?.website ?? null,
          country: firm?.country ?? null,
          owner_id: signer,
          status: "Active",
          first_sponsored_year: firstYear,
          notes: "Created from the ops panel: this company has a recorded deal.",
        })
        .select("id, name, ops_company, owner_id, company_id, first_sponsored_year, status")
        .single();
      if (error || !created) {
        (out.failed ??= []).push(`${spelling}: ${error?.message ?? "no row returned"}`);
        continue;
      }
      account = created as AccountRow;
      accounts.push(account);
      accountByKey.set(key, account);
      out.created += 1;
    } else {
      // Refresh what the tracker knows better; leave everything a person set.
      const patch: Record<string, unknown> = {};
      if (!account.ops_company) patch.ops_company = spelling;
      if (firstYear != null && (account.first_sponsored_year == null || firstYear < account.first_sponsored_year)) patch.first_sponsored_year = firstYear;
      if (!account.company_id && companyByKey.get(key)) patch.company_id = companyByKey.get(key)!.id;
      if (!account.owner_id) {
        const signer = ownerFor(live[0]?.initials ?? group[0]?.initials);
        if (signer) patch.owner_id = signer;
      }
      // A sponsor with a live deal this year or later is active again,
      // whatever it was marked; a churned mark on a re-signed sponsor is stale.
      if (live.length && latestYear != null && latestYear >= year && account.status !== "Active") patch.status = "Active";
      if (Object.keys(patch).length) {
        patch.updated_at = new Date().toISOString();
        const { error } = await supabase.from("accounts").update(patch).eq("id", account.id);
        if (!error) out.updated += 1;
      }
    }

    // Every deal links to the account with a fresh snapshot, so allocations
    // and payments on the account page are the tracker's latest.
    const { error: linkError } = await supabase.from("ops_links").upsert(
      group.map((d) => ({
        entity_type: "account" as const,
        entity_id: account!.id,
        ops_deal_id: d.id,
        ops_company: d.company,
        confidence: 1,
        snapshot: { deal: d },
        synced_at: new Date().toISOString(),
        linked_by: opts.linkedBy ?? null,
      })),
      { onConflict: "entity_type,entity_id,ops_deal_id" },
    );
    if (!linkError) out.linked += group.filter((d) => accountByDeal.get(d.id) !== account!.id).length;

    // A lead confirmed against one of these deals belongs to this account.
    await supabase
      .from("leads")
      .update({ account_id: account.id })
      .in("ops_deal_id", group.map((d) => d.id))
      .is("account_id", null);
  }

  return out;
}
