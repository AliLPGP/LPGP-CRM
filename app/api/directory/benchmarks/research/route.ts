import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClass } from "@/lib/directory/asset-classes";
import { researchBenchmarks } from "@/lib/directory/benchmark-research";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { deadlineAfter, OUT_OF_TIME, timeLeft } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/paged";

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

  const deadline = deadlineAfter(270_000);
  let added = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  try {
    for (let i = 0; i < classes.length; i += 3) {
      const batch = classes.slice(i, i + 3);
      if (timeLeft(deadline) < 45_000) {
        skipped.push(...batch.map((c) => c.short));
        continue;
      }
      const results = await Promise.all(batch.map((cls) => researchBenchmarks(cls, { deadline })));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.error === OUT_OF_TIME) skipped.push(batch[j].short);
        else if (r.error) errors.push(`${batch[j].short}: ${r.error}`);
        for (const rows of chunk(r.rows, 200)) {
          const { error } = await supabase.from("benchmarks").upsert(rows, { onConflict: "external_key" });
          if (error) return NextResponse.json({ error: `Saving: ${error.message}`, added }, { status: 500 });
          added += rows.length;
        }
      }
    }
  } finally {
    if (added) revalidateTag(INTEL_TAG, { expire: 0 });
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not reached: ${skipped.join(", ")}.`);
  return NextResponse.json({ ok: true, added, classes: classes.length - skipped.length, skipped, errors });
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
