import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { chLatestAccounts, chOfficers, chProfile, chSearch, companiesHouseConfigured, ebitdaFrom } from "./companies-house";
import { lushaConfigured, lushaContactSearch } from "../lusha";
import { OUT_OF_TIME, timeLeft } from "./research";

/**
 * Enrich the companies behind the deals -- a sponsor's portfolio companies
 * and the borrowers in the loan books -- with what the public record and a
 * people database hold: filed accounts and officers from Companies House for
 * UK companies, and the finance and operating executives a search preview
 * names for the company's domain (names and titles only; an email is
 * revealed from a person's page, never in bulk).
 *
 * One `portco_intel` row per company key. Re-running refreshes; it never
 * invents: a company the register cannot match stays without accounts.
 */

const EXEC_TITLES = ["Chief Financial Officer", "CFO", "Chief Operating Officer", "COO", "Finance Director", "Chief Executive Officer", "CEO", "Managing Director", "Chief Transformation Officer", "Chief Restructuring Officer"];

export type EnrichResult = { considered: number; matched: number; accounts: number; executives: number; errors: string[]; outOfTime: boolean };

type Target = { key: string; name: string; domain: string | null; country: string | null };

/** Companies worth a look: portfolio companies, then the largest borrowers. */
async function targets(supabase: SupabaseClient, limit: number, onlyUk: boolean): Promise<Target[]> {
  const out = new Map<string, Target>();
  const { data: portcos } = await supabase.from("portfolio_companies").select("intel_key, name, domain, hq").not("intel_key", "is", null).limit(2000);
  for (const p of (portcos as { intel_key: string; name: string; domain: string | null; hq: string | null }[] | null) ?? []) {
    if (!out.has(p.intel_key)) out.set(p.intel_key, { key: p.intel_key, name: p.name, domain: p.domain, country: p.hq });
  }
  const { data: borrowers } = await supabase.from("borrowers").select("key, borrower").order("fair_value", { ascending: false, nullsFirst: false }).limit(limit);
  for (const b of (borrowers as { key: string; borrower: string }[] | null) ?? []) {
    if (!out.has(b.key)) out.set(b.key, { key: b.key, name: b.borrower, domain: null, country: null });
  }
  // Already enriched recently: skip.
  const keys = [...out.keys()];
  const { data: done } = await supabase.from("portco_intel").select("key, ch_at, executives_at").in("key", keys.slice(0, 1000));
  const fresh = new Set(((done as { key: string; ch_at: string | null }[] | null) ?? []).filter((d) => d.ch_at && Date.now() - new Date(d.ch_at).getTime() < 90 * 86400_000).map((d) => d.key));
  const list = keys.filter((k) => !fresh.has(k)).map((k) => out.get(k)!);
  // A UK-only pass keeps register lookups to names that read British (Limited, Ltd, plc, LLP) or say so.
  return onlyUk ? list.filter((t) => /\b(limited|ltd|plc|llp)\b/i.test(t.name) || /united kingdom|\buk\b|england|scotland|london/i.test(t.country ?? "")) : list;
}

export async function enrichPortcos(supabase: SupabaseClient, opts: { deadline: number; limit?: number; onlyUk?: boolean; log?: (s: string) => void }): Promise<EnrichResult> {
  const log = opts.log ?? (() => {});
  const result: EnrichResult = { considered: 0, matched: 0, accounts: 0, executives: 0, errors: [], outOfTime: false };
  const chOn = companiesHouseConfigured();
  const lushaOn = lushaConfigured();
  if (!chOn && !lushaOn) {
    result.errors.push("Neither COMPANIES_HOUSE_API_KEY nor LUSHA_API_KEY is set.");
    return result;
  }
  const list = await targets(supabase, opts.limit ?? 300, opts.onlyUk ?? true);
  for (const t of list) {
    if (timeLeft(opts.deadline) < 15_000) {
      result.outOfTime = true;
      break;
    }
    result.considered += 1;
    const row: Record<string, unknown> = { key: t.key, name: t.name, domain: t.domain, country: t.country, updated_at: new Date().toISOString() };
    try {
      if (chOn) {
        const hit = await chSearch(t.name);
        if (hit) {
          const [profile, officers, accounts] = await Promise.all([chProfile(hit.number), chOfficers(hit.number), chLatestAccounts(hit.number)]);
          const p = profile ?? hit;
          Object.assign(row, {
            ch_number: p.number, ch_name: p.name, ch_status: p.status, ch_type: p.type, sic_codes: p.sic, incorporated_on: p.incorporated, registered_address: p.address,
            officers: officers.filter((o) => !o.resigned_on).slice(0, 40), ch_at: new Date().toISOString(),
            country: t.country ?? "United Kingdom",
          });
          result.matched += 1;
          if (accounts) {
            Object.assign(row, {
              accounts_period_end: accounts.period_end, accounts_type: accounts.type, accounts_url: accounts.url, currency: accounts.currency,
              revenue: accounts.revenue, gross_profit: accounts.gross_profit, operating_profit: accounts.operating_profit, profit_before_tax: accounts.profit_before_tax,
              depreciation: accounts.depreciation, amortisation: accounts.amortisation, ebitda_derived: ebitdaFrom(accounts), employees: accounts.employees,
              net_assets: accounts.net_assets, cash: accounts.cash, creditors_over_year: accounts.creditors_over_year,
            });
            if (accounts.revenue != null || accounts.operating_profit != null) result.accounts += 1;
          }
        } else {
          row.ch_at = new Date().toISOString();
        }
      }
      if (lushaOn && t.domain) {
        const found = await lushaContactSearch({ companyDomains: [t.domain], jobTitles: EXEC_TITLES, size: 10 });
        const execs = found.contacts.filter((c) => c.name && c.jobTitle).map((c) => ({ name: c.name, title: c.jobTitle, linkedin_url: c.linkedinUrl, has_email: c.hasEmail, source: "lusha" }));
        if (execs.length) {
          row.executives = execs;
          row.executives_at = new Date().toISOString();
          result.executives += 1;
        }
      }
      const { error } = await supabase.from("portco_intel").upsert(row, { onConflict: "key" });
      if (error) result.errors.push(`${t.name}: ${error.message}`);
      log(`${t.name}: ${row.ch_number ? `CH ${row.ch_number}` : "no register match"}${row.revenue != null ? `, revenue ${row.revenue}` : ""}${row.executives ? `, ${(row.executives as unknown[]).length} executives` : ""}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === OUT_OF_TIME) {
        result.outOfTime = true;
        break;
      }
      result.errors.push(`${t.name}: ${msg}`);
    }
  }
  return result;
}
