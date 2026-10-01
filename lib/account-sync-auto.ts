import "server-only";
import { revalidatePath } from "next/cache";
import { syncAccountsFromOps, type AccountSyncResult } from "./account-sync";
import { isOpsConfigured } from "./ops";
import { getAdminClient } from "./supabase/admin";

// Accounts follow the tracker's deals. The daily cron and the Sync button do
// it on a schedule and on demand; this makes opening the Accounts page enough,
// so a sponsor never waits for either. At most one attempt per instance every
// ten minutes, and it never throws.

const EVERY_MS = 10 * 60_000;
let lastAttempt = 0;

export async function syncAccountsIfDue(opts: { force?: boolean } = {}): Promise<AccountSyncResult | null> {
  if (!opts.force && Date.now() - lastAttempt < EVERY_MS) return null;
  if (!isOpsConfigured()) return null;
  const supabase = getAdminClient();
  if (!supabase) return null;
  lastAttempt = Date.now();
  try {
    const result = await syncAccountsFromOps(supabase);
    if (result.created || result.updated || result.linked) {
      try {
        revalidatePath("/accounts");
      } catch {
        /* revalidating from inside a render is refused; the next visit reads fresh anyway */
      }
    }
    return result;
  } catch {
    return null;
  }
}
