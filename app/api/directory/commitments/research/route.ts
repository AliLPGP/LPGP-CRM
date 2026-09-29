import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { disclosingLps, runCommitments } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// LP commitments from what the LPs publish — board minutes, annual reports,
// press releases — for the LPs the workbook says disclose, largest first
// (or the LPs named). Admin only; each LP is a minute of paid searching.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can run commitment research." }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });

  let body: { companyIds?: unknown; limit?: unknown; since?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as typeof body;
  } catch {
    /* defaults */
  }
  const ids = Array.isArray(body.companyIds) ? body.companyIds.filter((v): v is string => typeof v === "string") : [];
  const limit = Math.min(8, Math.max(1, typeof body.limit === "number" ? body.limit : 4));
  const since = typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : `${new Date().getUTCFullYear() - 1}-01-01`;
  const lps = await disclosingLps(supabase, limit, ids);
  if (!lps.length) return NextResponse.json({ error: "No disclosing LPs to research." }, { status: 400 });
  try {
    const result = await runCommitments(supabase, lps, { since, deadline: deadlineAfter(270_000) });
    if (result.added) revalidateTag(DIRECTORY_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result, researched: lps.map((l) => l.name) });
  } catch (error) {
    revalidateTag(DIRECTORY_TAG, { expire: 0 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 500 });
  }
}
