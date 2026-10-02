import { NextResponse } from "next/server";
import { getPackedIndexJson } from "@/lib/directory/index-server";

// The whole directory index, packed (lib/directory/records.ts), for Discover
// and the market map to fetch after the page has painted. The browser asks
// for the version the page was rendered from (`?v=`, the table fingerprint)
// and the wire format it understands (`?f=`), so the edge cache is keyed by
// both: an import or a deploy is a new URL, never a stale hit, and the body
// may sit in the CDN for a day. The answer is the index for the version
// asked (warm on the server already, since the page just rendered from it),
// so the fetch never waits for a rebuild because the ingest moved the
// fingerprint in between; with no version asked it is the current one.
// Public facts only (firm names, places, sizes, filed provider links), the
// same as the funds route. Compression is the platform's.

export const dynamic = "force-dynamic";

// The URL carries the version, so the browser may keep a versioned answer for
// an hour too: a preload hint replayed on a client-side navigation then comes
// from the HTTP cache, not the network.
const VERSIONED = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
/** No version in the URL: nothing to key the cache by, so only briefly. */
const UNVERSIONED = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("v");
  const { version, body } = await getPackedIndexJson(asked);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": asked ? VERSIONED : UNVERSIONED,
      "X-Directory-Version": version,
    },
  });
}
