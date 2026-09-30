"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "./supabase/admin";
import { getSessionUser } from "./auth";
import { isOpsConfigured } from "./ops";
import { syncAccountsFromOps, type AccountSyncResult } from "./account-sync";

/** Pull every tracker deal into Accounts now, from the Accounts page. */
export async function syncAccountsNow(): Promise<AccountSyncResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in", deals: 0, companies: 0, created: 0, updated: 0, linked: 0, unmatched: [] };
  if (!isOpsConfigured()) return { ok: false, error: "Set OPS_PANEL_URL and OPS_BRIDGE_KEY to connect the ops panel.", deals: 0, companies: 0, created: 0, updated: 0, linked: 0, unmatched: [] };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured", deals: 0, companies: 0, created: 0, updated: 0, linked: 0, unmatched: [] };
  const result = await syncAccountsFromOps(supabase, { linkedBy: user.id });
  revalidatePath("/accounts");
  revalidatePath("/leads");
  return result;
}
