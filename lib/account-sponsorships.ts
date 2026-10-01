import "server-only";
import { getAdminClient } from "./supabase/admin";

// What a sponsor paid, per year, as the sales team's sponsor lists state it
// (migration 0031). The table has row level security and no policy, so the
// anon key can never read it; this reads with the service role on the server.
// The ops panel stays the source of truth for money: where an account is
// linked to tracker deals, those figures are the live ones.

export type Sponsorship = { year: number; amount: number | null; currency: string; deals: number };

type Row = { account_id: string; year: number; amount: number | string | null; currency: string; deals: number };

function shape(r: Row): Sponsorship {
  return { year: r.year, amount: r.amount == null ? null : Number(r.amount), currency: r.currency, deals: r.deals };
}

/** Every account's years, newest first. Empty when the service role is not set. */
export async function sponsorshipsByAccount(): Promise<Record<string, Sponsorship[]>> {
  const supabase = getAdminClient();
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("account_sponsorships")
    .select("account_id, year, amount, currency, deals")
    .order("year", { ascending: false })
    .limit(5000);
  if (error || !data) return {};
  const out: Record<string, Sponsorship[]> = {};
  for (const r of data as Row[]) (out[r.account_id] ??= []).push(shape(r));
  return out;
}

export async function sponsorshipsFor(accountId: string): Promise<Sponsorship[]> {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("account_sponsorships")
    .select("account_id, year, amount, currency, deals")
    .eq("account_id", accountId)
    .order("year", { ascending: false });
  if (error || !data) return [];
  return (data as Row[]).map(shape);
}

/** A year's total per currency, across accounts. Currencies are never added together. */
export function totalsByYear(all: Record<string, Sponsorship[]>): { year: number; currency: string; amount: number; accounts: number }[] {
  const m = new Map<string, { year: number; currency: string; amount: number; accounts: number }>();
  for (const rows of Object.values(all)) {
    for (const r of rows) {
      const k = `${r.year}|${r.currency}`;
      const e = m.get(k) ?? { year: r.year, currency: r.currency, amount: 0, accounts: 0 };
      e.amount += r.amount ?? 0;
      e.accounts += 1;
      m.set(k, e);
    }
  }
  return [...m.values()].sort((a, b) => b.year - a.year || a.currency.localeCompare(b.currency));
}
