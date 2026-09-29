import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { runDeals } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// Deals for one asset class (or all), announced since a date, from web
// search on the server. Admin only; parties are linked to directory firms.
// Classes the function's time limit doesn't reach are named in the reply.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can run deal research." }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });

  let body: { assetClass?: unknown; since?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as { assetClass?: unknown; since?: unknown };
  } catch {
    /* empty body: every class */
  }
  const classes = isAssetClassKey(body.assetClass) ? [ASSET_CLASS_BY_KEY[body.assetClass]] : ASSET_CLASSES;
  const since = typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since) ? body.since : `${new Date().getUTCFullYear() - 1}-01-01`;
  try {
    const result = await runDeals(supabase, classes, { since, deadline: deadlineAfter(270_000), addedBy: user.id });
    if (result.added) revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 500 });
  }
}
