import { NextResponse } from "next/server";
import { getReadClient } from "@/lib/supabase/server";

// Type-ahead for the company pickers. The pickers used to ship every firm in
// the directory (about a megabyte) to the browser on each page load; now they
// ask for the dozen that match what was typed.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").replace(/[,()*%_\\]/g, " ").trim();
  const supabase = getReadClient();
  if (q.length < 2 || !supabase) return NextResponse.json({ companies: [] });
  const { data } = await supabase
    .from("companies")
    .select("id, name, category")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(15);
  return NextResponse.json(
    { companies: data ?? [] },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
