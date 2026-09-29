import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES } from "@/lib/directory/asset-classes";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { runSignals } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// The signals job. Runs daily from Vercel cron (GET with the CRON_SECRET
// bearer, which Vercel sends) or now, by an admin, from the Signals page
// (POST). A session cookie alone never starts it from a GET: that would let
// any link an admin follows run a paid job.

export const maxDuration = 300;

function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(rotate: number) {
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set on the server." }, { status: 503 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  try {
    const result = await runSignals(supabase, { deadline: deadlineAfter(270_000), rotate });
    if (result.added) revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Refresh failed" }, { status: 500 });
  }
}

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can refresh signals." }, { status: 403 });
  return run(0);
}

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run(new Date().getUTCDate() % ASSET_CLASSES.length);
}
