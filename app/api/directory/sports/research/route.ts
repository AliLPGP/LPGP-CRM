import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { INTEL_TAG } from "@/lib/directory/intelligence-queries";
import { runClubs } from "@/lib/directory/jobs";
import { deadlineAfter } from "@/lib/directory/research";
import { clubInput, type ClubInput } from "@/lib/directory/sports-research";
import { getAdminClient } from "@/lib/supabase/admin";

// Research one club (from its profile) or several (admin bulk) with web
// search on the server, and save the record with its sources. Any member
// may research one club that is already on file; adding clubs from free
// text, and bulk runs, are for admins — each club is a minute of paid
// searching.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });

  let body: { teamIds?: unknown; clubs?: unknown; verify?: unknown } = {};
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object") return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const teamIds = Array.isArray(body.teamIds) ? [...new Set(body.teamIds.filter((v): v is string => typeof v === "string"))].slice(0, 20) : [];
  const clubs = Array.isArray(body.clubs) ? body.clubs.map(clubInput).filter((c): c is ClubInput => c !== null).slice(0, 20) : [];
  if (!teamIds.length && !clubs.length) return NextResponse.json({ error: "Nothing to research" }, { status: 400 });
  if (user.role !== "admin") {
    if (clubs.length) return NextResponse.json({ error: "Only admins can add clubs by name." }, { status: 403 });
    if (teamIds.length > 1) return NextResponse.json({ error: "Only admins can research clubs in bulk." }, { status: 403 });
  }

  const results = await runClubs(supabase, { teamIds, clubs, verify: body.verify === true, deadline: deadlineAfter(270_000), addedBy: user.id });
  if (results.some((r) => r.teamId)) {
    revalidateTag(INTEL_TAG, { expire: 0 });
    revalidateTag(DIRECTORY_TAG, { expire: 0 });
  }
  return NextResponse.json({ ok: true, researched: results.filter((r) => r.ok).length, results });
}
