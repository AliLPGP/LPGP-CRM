import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { enrichPortcos } from "@/lib/directory/portco-enrich";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// Portfolio-company and borrower enrichment: filed accounts and officers
// from Companies House, executives from a people-database preview. Runs
// daily from Vercel cron (GET with the CRON_SECRET bearer) and now, by an
// admin, from the Borrowers desk (POST). Each run works through what is
// not yet on file, or is older than ninety days, inside its time limit.

export const maxDuration = 300;

function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(onlyUk: boolean) {
  if (!process.env.COMPANIES_HOUSE_API_KEY && !process.env.LUSHA_API_KEY) {
    return NextResponse.json({ error: "Neither COMPANIES_HOUSE_API_KEY nor LUSHA_API_KEY is set on the server." }, { status: 503 });
  }
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  try {
    const result = await enrichPortcos(supabase, { deadline: deadlineAfter(270_000), onlyUk });
    if (result.matched || result.executives) revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Enrichment failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can run enrichment." }, { status: 403 });
  let onlyUk = true;
  try {
    const body = (await req.json()) as { onlyUk?: unknown };
    if (typeof body.onlyUk === "boolean") onlyUk = body.onlyUk;
  } catch {
    // No body: the UK-only default.
  }
  return run(onlyUk);
}

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run(true);
}
