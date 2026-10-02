import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { runInvestors } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { getAdminClient } from "@/lib/supabase/admin";

// Investor profiles and next-twelve-month plans from what the LPs publish —
// annual reports, investment policy statements, board papers, RFPs, press —
// for the next page of LPs with nothing on file (or the one LP named by id).
// Admin only; each LP is a minute of paid searching. Values without a
// qualifying source never reach the database: `investor_profile_upsert`
// drops them and the response says how many.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Only admins can run investor research." }, { status: 403 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });

  let body: { id?: unknown; limit?: unknown; offset?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (parsed && typeof parsed === "object") body = parsed as typeof body;
  } catch {
    /* defaults */
  }
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  // Two LPs run side by side and each takes a minute or so: eight is what a
  // five-minute function reaches; the rest is reported as not reached.
  const limit = id ? 1 : Math.min(8, Math.max(1, typeof body.limit === "number" && Number.isFinite(body.limit) ? Math.floor(body.limit) : 4));
  const offset = typeof body.offset === "number" && Number.isFinite(body.offset) ? Math.max(0, Math.floor(body.offset)) : 0;
  try {
    const result = await runInvestors(supabase, { limit, offset, ids: id ? [id] : undefined, deadline: deadlineAfter(270_000) });
    if (!result.done && !result.failed.length && !result.outOfTime.length) return NextResponse.json({ error: id ? "That company is not an LP the database knows." : "No investors left to research." }, { status: 400 });
    if (result.done) {
      // The directory index carries the profile's type, allocations and preferences.
      revalidateTag(DIRECTORY_TAG, { expire: 0 });
      revalidateTag(INTEL_TAG, { expire: 0 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    revalidateTag(DIRECTORY_TAG, { expire: 0 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Research failed" }, { status: 500 });
  }
}
