import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { syncAccountsFromOps } from "@/lib/account-sync";
import { isOpsConfigured } from "@/lib/ops";
import { getAdminClient } from "@/lib/supabase/admin";

// Accounts follow the tracker's deals. Daily from Vercel cron (GET with the
// CRON_SECRET bearer), or now from the Accounts page (POST, signed in).

export const maxDuration = 120;

function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(linkedBy: string | null) {
  if (!isOpsConfigured()) return NextResponse.json({ error: "The ops panel is not connected." }, { status: 503 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  const result = await syncAccountsFromOps(supabase, { linkedBy });
  if (result.created || result.updated || result.linked) {
    revalidatePath("/accounts");
    revalidatePath("/leads");
  }
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return run(user.id);
}

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run(null);
}
