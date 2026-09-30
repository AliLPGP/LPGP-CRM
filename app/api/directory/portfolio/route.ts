import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { portfolioRows } from "@/lib/directory/jobs";
import { researchPortfolio } from "@/lib/directory/portfolio-research";
import { getAdminClient } from "@/lib/supabase/admin";

// Research one GP's portfolio companies from its own site and the press, and
// save each with the page that names it. Re-running refreshes the list:
// companies found again are updated, none are deleted.

export const maxDuration = 300;

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured." }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Portfolio research needs ANTHROPIC_API_KEY on the server." }, { status: 503 });
  }

  let body: { companyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const companyId = typeof body.companyId === "string" ? body.companyId : null;
  if (!companyId) return NextResponse.json({ error: "No firm given" }, { status: 400 });

  const { data: firm } = await supabase.from("companies").select("id, name, domain, country").eq("id", companyId).single();
  if (!firm) return NextResponse.json({ error: "Firm not found" }, { status: 404 });

  const result = await researchPortfolio(firm as { name: string; domain: string | null; country: string | null });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });

  const rows = portfolioRows(companyId, result.companies, user.id);
  if (rows.length) {
    const { error } = await supabase.from("portfolio_companies").upsert(rows, { onConflict: "external_key" });
    if (error) return NextResponse.json({ error: `Saving: ${error.message}` }, { status: 500 });
  }
  await supabase.from("companies").update({ portfolio_note: result.note.slice(0, 600) || null, portfolio_researched_at: new Date().toISOString() }).eq("id", companyId);
  revalidateTag(DIRECTORY_TAG, { expire: 0 });
  return NextResponse.json({ ok: true, saved: rows.length, note: result.note });
}
