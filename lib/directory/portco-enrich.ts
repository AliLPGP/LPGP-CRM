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
 *
 * `enrichTargets` is the loop; `enrichPortcos` feeds it from the database
 * and writes back. `scripts/enrich-portcos.ts` feeds it from a file and
 * writes SQL, for a machine that has the register key but no database key.
 */

/** The people a restructuring or operating adviser asks for first: who runs the money and the operations. */
export const EXEC_TITLES = [
  "Chief Financial Officer",
  "CFO",
  "Finance Director",
  "Financial Director",
  "Financial Controller",
  "Chief Operating Officer",
  "COO",
  "Operations Director",
  "Director of Operations",
  "Head of Operations",
  "VP Operations",
  "Chief Executive Officer",
  "CEO",
  "Managing Director",
  "Chief Transformation Officer",
  "Chief Restructuring Officer",
];

export type EnrichResult = { considered: number; matched: number; accounts: number; executives: number; errors: string[]; outOfTime: boolean };

export type Target = { key: string; name: string; domain: string | null; country: string | null };

export type EnrichOptions = {
  deadline: number;
  log?: (s: string) => void;
  /** Where a finished row goes: the database, or a file of SQL. */
  save: (row: Record<string, unknown>) => Promise<string | null>;
};

/** Does a name or country read British? The register only holds UK companies. */
export function looksUk(t: Pick<Target, "name" | "country">): boolean {
  return /\b(limited|ltd|plc|llp)\b/i.test(t.name) || /united kingdom|\buk\b|england|scotland|wales|london/i.test(t.country ?? "");
}

/** Companies worth a look: portfolio companies, then the largest borrowers. */
export async function portcoTargets(supabase: SupabaseClient, limit: number, onlyUk: boolean): Promise<Target[]> {
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
  const fresh = new Set<string>();
  for (let i = 0; i < keys.length; i += 500) {
    const { data: done } = await supabase.from("portco_intel").select("key, ch_at").in("key", keys.slice(i, i + 500));
    for (const d of (done as { key: string; ch_at: string | null }[] | null) ?? []) {
      if (d.ch_at && Date.now() - new Date(d.ch_at).getTime() < 90 * 86400_000) fresh.add(d.key);
    }
  }
  const list = keys.filter((k) => !fresh.has(k)).map((k) => out.get(k)!);
  return onlyUk ? list.filter(looksUk) : list;
}

/** Look each target up and hand the row to `save`. */
export async function enrichTargets(list: Target[], opts: EnrichOptions): Promise<EnrichResult> {
  const log = opts.log ?? (() => {});
  const result: EnrichResult = { considered: 0, matched: 0, accounts: 0, executives: 0, errors: [], outOfTime: false };
  const chOn = companiesHouseConfigured();
  const lushaOn = lushaConfigured();
  if (!chOn && !lushaOn) {
    result.errors.push("Neither COMPANIES_HOUSE_API_KEY nor LUSHA_API_KEY is set.");
    return result;
  }
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
      const problem = await opts.save(row);
      if (problem) result.errors.push(`${t.name}: ${problem}`);
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

/** The in-app job: targets from the database, rows back into it. */
export async function enrichPortcos(supabase: SupabaseClient, opts: { deadline: number; limit?: number; onlyUk?: boolean; log?: (s: string) => void }): Promise<EnrichResult> {
  const list = await portcoTargets(supabase, opts.limit ?? 300, opts.onlyUk ?? true);
  return enrichTargets(list, {
    deadline: opts.deadline,
    log: opts.log,
    save: async (row) => {
      const { error } = await supabase.from("portco_intel").upsert(row, { onConflict: "key" });
      return error ? error.message : null;
    },
  });
}

/** One idempotent upsert per row, for a run that writes SQL instead of rows. */
export function rowToSql(row: Record<string, unknown>): string {
  const cols = Object.keys(row);
  const lit = (v: unknown): string => {
    if (v == null) return "null";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
    if (typeof v === "boolean") return v ? "true" : "false";
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return `array[${(v as string[]).map((x) => `'${x.replace(/'/g, "''")}'`).join(", ")}]::text[]`;
    if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
    return `'${String(v).replace(/'/g, "''")}'`;
  };
  const updates = cols.filter((c) => c !== "key").map((c) => `${c} = excluded.${c}`);
  return `insert into public.portco_intel (${cols.join(", ")}) values (${cols.map((c) => lit(row[c])).join(", ")}) on conflict (key) do update set ${updates.join(", ")};`;
}
