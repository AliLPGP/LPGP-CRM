import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { researchDeals } from "@/lib/directory/deals-research";
import { firmMatcher } from "@/lib/directory/firm-match";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { deadlineAfter, OUT_OF_TIME, timeLeft } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";
import { chunk } from "@/lib/supabase/paged";

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
  const today = new Date().toISOString().slice(0, 10);
  const firmId = await firmMatcher(supabase);
  const deadline = deadlineAfter(270_000);

  let added = 0;
  const errors: string[] = [];
  const skipped: string[] = [];
  try {
    for (const cls of classes) {
      if (timeLeft(deadline) < 45_000) {
        skipped.push(cls.short);
        continue;
      }
      const [closes, transactions] = await Promise.all([
        researchDeals(cls, { since, angle: "closes", today, deadline }),
        researchDeals(cls, { since, angle: "transactions", today, deadline }),
      ]);
      for (const r of [closes, transactions]) {
        if (r.error === OUT_OF_TIME) {
          if (!skipped.includes(cls.short)) skipped.push(cls.short);
        } else if (r.error) errors.push(`${cls.short}: ${r.error}`);
      }
      // The two angles can surface the same transaction; one row per key.
      const byKey = new Map([...closes.rows, ...transactions.rows].map((d) => [d.external_key, d]));
      const rows = [...byKey.values()].map((d) => ({
        ...d,
        investor_company_id: firmId(d.investor),
        target_company_id: d.target_kind === "company" || d.target_kind === "fund" ? firmId(d.target) : null,
        added_by: user.id,
      }));
      for (const batch of chunk(rows, 200)) {
        const { error } = await supabase.from("deals").upsert(batch, { onConflict: "external_key" });
        if (error) return NextResponse.json({ error: `Saving: ${error.message}`, added }, { status: 500 });
        added += batch.length;
      }
    }
  } finally {
    if (added) revalidateTag(INTEL_TAG, { expire: 0 });
  }
  if (skipped.length) errors.push(`${OUT_OF_TIME} Not finished: ${skipped.join(", ")}.`);
  return NextResponse.json({ ok: true, added, classes: classes.length - skipped.length, skipped, errors });
}
