import { NextResponse } from "next/server";
import { getAllDeals } from "@/lib/directory/intelligence-queries";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { getFundUniverse } from "@/lib/directory/fund-universe";
import { getPortcoSummary } from "@/lib/directory/portco-queries";
import { getAllDisclosedCommitments } from "@/lib/directory/queries";

// Builds the big cached reads (the directory index, the fund universe, the
// deal and commitment ledgers, the portfolio summary) before anyone asks, so
// the first click after a deploy or an expiry is as quick as the second.
// Runs daily from Vercel cron (the CRON_SECRET bearer; sub-daily schedules are refused on the Hobby plan); nothing here is private.

export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const t = Date.now();
  const timed = async (name: string, f: () => Promise<unknown>) => {
    const s = Date.now();
    await f().catch(() => undefined);
    return [name, Date.now() - s] as const;
  };
  const ms = await Promise.all([
    timed("index", getDirectoryIndex),
    timed("funds", getFundUniverse),
    timed("deals", () => getAllDeals()),
    timed("commitments", getAllDisclosedCommitments),
    timed("portfolio", getPortcoSummary),
  ]);
  return NextResponse.json({ ok: true, totalMs: Date.now() - t, ms: Object.fromEntries(ms) });
}
