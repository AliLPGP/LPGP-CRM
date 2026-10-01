import { NextResponse } from "next/server";
import { searchContacts } from "@/lib/queries";

// One page of the People list for the filters in the query string.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const cat = p.get("cat");
  const result = await searchContacts({
    cat: cat === "LP" || cat === "GP" || cat === "SP" || cat === "UN" ? cat : null,
    hasEmail: p.get("email") === "1",
    q: (p.get("q") ?? "").slice(0, 120),
    offset: Math.max(0, Math.floor(Number(p.get("offset")) || 0)),
    limit: Math.min(200, Math.max(1, Math.floor(Number(p.get("limit")) || 100))),
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=60" } });
}
