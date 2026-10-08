import { NextResponse } from "next/server";
import { getResultsPage, PAGE_SIZE } from "@/lib/directory/page-server";

// One page of Discover's results for a set of filters (the same query string
// the page's URL carries), so the first rows draw while the whole index is
// still on its way. Public facts only, like the index route. `?v=` names the
// directory version the page was rendered from, so the edge cache is keyed by
// it: an import is a new URL, never a stale hit.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const version = sp.get("v");
  const limit = Math.max(1, Math.min(Number(sp.get("limit")) || PAGE_SIZE, 200));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const filters = new URLSearchParams(sp);
  for (const k of ["v", "limit", "offset"]) filters.delete(k);
  const page = await getResultsPage(filters, limit, offset);
  // 204: this query needs the index (keywords, lookalikes) or the directory is empty.
  if (!page) return new NextResponse(null, { status: 204 });
  return NextResponse.json(page, {
    headers: { "Cache-Control": version ? "public, max-age=300, s-maxage=3600, stale-while-revalidate=3600" : "public, max-age=30, s-maxage=60" },
  });
}
