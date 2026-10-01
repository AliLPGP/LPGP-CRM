import { NextResponse } from "next/server";
import { isAssetClassKey } from "@/lib/directory/asset-classes";
import { searchDeals } from "@/lib/directory/intelligence-queries";

// One page of the deals ledger for the filters in the query string.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const cls = p.get("class");
  const sort = p.get("sort");
  const year = Number(p.get("year"));
  const result = await searchDeals({
    cls: cls && isAssetClassKey(cls) ? cls : null,
    kind: (p.get("kind") ?? "").slice(0, 60) || null,
    year: Number.isInteger(year) && year > 1900 && year < 2200 ? year : null,
    q: (p.get("q") ?? "").slice(0, 120),
    sort: sort === "amount" || sort === "valuation" ? sort : "date",
    offset: Math.max(0, Math.floor(Number(p.get("offset")) || 0)),
    limit: Math.min(200, Math.max(1, Math.floor(Number(p.get("limit")) || 100))),
  });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=120" } });
}
