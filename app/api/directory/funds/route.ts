import { NextResponse } from "next/server";
import { getFundUniverse } from "@/lib/directory/fund-universe";

// The whole fund universe, packed, for the Funds page to pull after it has
// painted the first slice. Public facts only (fund names, managers,
// providers), so it may sit in the CDN cache for a while.

export async function GET() {
  const data = await getFundUniverse();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
  });
}
