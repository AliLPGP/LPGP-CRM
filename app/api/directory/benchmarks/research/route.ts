import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClass } from "@/lib/directory/asset-classes";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { runBenchmarks } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// Published benchmark figures for one asset class (or all), from web
// search on the server. POST is an admin pressing "Refresh benchmarks";
// GET is only ever the cron (CRON_SECRET bearer) — a session cookie alone
// must not start a paid job from a link. The cron fires daily on the 1st–8th
// of the month and does the class whose turn it is that day, so every class
// is refreshed monthly, one per function run.

export const maxDuration = 300;

function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

function classesFor(assetClass: unknown, cron: boolean): AssetClass[] {
  if (isAssetClassKey(assetClass)) return [ASSET_CLASS_BY_KEY[assetClass]];
  if (cron) return [ASSET_CLASSES[(new Date().getUTCDate() - 1) % ASSET_CLASSES.length]];
  return ASSET_CLASSES;
}

async function run(classes: AssetClass[]) {
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });
  try {
    const result = await runBenchmarks(supabase, classes, deadlineAfter(270_000));
    if (result.added) revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    revalidateTag(INTEL_TAG, { expire: 0 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can refresh benchmarks." }, { status: 403 });
  let body: { assetClass?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as { assetClass?: unknown };
  } catch {
    /* empty body: every class */
  }
  return run(classesFor(body.assetClass, false));
}

export async function GET(req: Request) {
  if (!isCron(req)) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  return run(classesFor(new URL(req.url).searchParams.get("assetClass"), true));
}
