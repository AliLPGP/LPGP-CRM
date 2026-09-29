import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { ASSET_CLASSES } from "@/lib/directory/asset-classes";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { normName } from "@/lib/directory/normalize";
import { deadlineAfter } from "@/lib/directory/research";
import { refreshAllSignals, signalKey } from "@/lib/directory/signals-refresh";
import { getAdminClient } from "@/lib/supabase/admin";
import { chunk, fetchAll } from "@/lib/supabase/paged";

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

  // The order rotates daily so a class the deadline cuts off one day goes
  // first the next.
  const order = [...ASSET_CLASSES.slice(rotate), ...ASSET_CLASSES.slice(0, rotate)];
  const outcomes = await refreshAllSignals(5, deadlineAfter(270_000), order);

  // Firms named in a headline get linked to their profile.
  const firms =
    (await fetchAll<{ id: string; name: string }>((from, to, first) =>
      supabase.from("companies").select("id, name", first ? { count: "exact" } : undefined).order("id").range(from, to),
    )) ?? [];
  const byName = new Map(firms.map((f) => [normName(f.name), f.id]));

  const rows = outcomes.flatMap((o) =>
    o.items.map((i) => ({
      external_key: signalKey(i.source_url),
      date: i.date && /^\d{4}-\d{2}-\d{2}$/.test(i.date) ? i.date : null,
      asset_class: o.cls.key,
      kind: i.kind,
      headline: i.headline.slice(0, 300),
      summary: i.summary.slice(0, 600),
      entities: (i.entities ?? []).slice(0, 12),
      company_ids: [...new Set((i.entities ?? []).map((e) => byName.get(normName(e))).filter(Boolean))],
      source_name: i.source_name.slice(0, 120),
      source_url: i.source_url.slice(0, 600),
      source: "refresh",
    })),
  );
  // Stories already on file stay as they are.
  const keys = rows.map((r) => r.external_key);
  const existing = new Set<string>();
  for (const batch of chunk(keys, 150)) {
    const { data } = await supabase.from("signals").select("external_key").in("external_key", batch);
    for (const r of data ?? []) existing.add(r.external_key as string);
  }
  const fresh = rows.filter((r) => !existing.has(r.external_key));
  const seen = new Set<string>();
  const unique = fresh.filter((r) => (seen.has(r.external_key) ? false : (seen.add(r.external_key), true)));
  let added = 0;
  try {
    for (const batch of chunk(unique, 200)) {
      const { error } = await supabase.from("signals").upsert(batch, { onConflict: "external_key", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: `Saving: ${error.message}`, added }, { status: 500 });
      added += batch.length;
    }
  } finally {
    if (added) revalidateTag(INTEL_TAG, { expire: 0 });
  }
  return NextResponse.json({
    ok: true,
    added,
    found: rows.length,
    classes: outcomes.filter((o) => !o.error).length,
    errors: outcomes.filter((o) => o.error).map((o) => `${o.cls.short}: ${o.error}`),
  });
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
