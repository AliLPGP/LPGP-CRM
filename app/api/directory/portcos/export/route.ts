import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchAll } from "@/lib/supabase/paged";
import { getReadClient } from "@/lib/supabase/server";

// The portfolio sheet: one row per holding, the desk's columns in the desk's
// order (portco_export, migration 0025). Revenue, EBITDA, employees and the
// named executives are only ever there from primary sources or major press;
// the Sources column lists every page behind the row. Signed-in users only.

export const maxDuration = 60;

const COLUMNS = [
  "Name", "Status", "Status Note", "Class", "Deal Type", "Sector", "Subsector", "Country", "Website", "Email", "Email Type",
  "Description", "Business Model", "CEO", "CFO", "COO", "Managing Director", "Employees", "Employees As Of",
  "Revenue", "Revenue Currency", "Revenue Period", "EBITDA", "EBITDA Currency", "EBITDA Period", "Value Creation Plan", "Notes", "Sources", "Sponsor",
] as const;

function cell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const supabase = getReadClient();
  if (!supabase) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  const url = new URL(req.url);
  const sponsor = url.searchParams.get("sponsor");
  const status = url.searchParams.get("status");
  const select = COLUMNS.map((c) => `"${c}"`).join(",");
  const rows =
    (await fetchAll<Record<string, unknown>>((from, to, first) => {
      let q = supabase.from("portco_export").select(select, first ? { count: "exact" } : undefined);
      if (sponsor && /^[0-9a-f-]{36}$/i.test(sponsor)) q = q.eq("sponsor_id", sponsor);
      if (status === "current" || status === "realized") q = q.eq("Status", status === "current" ? "Current" : "Realized");
      return q.order("Sponsor").order("Name").range(from, to);
    })) ?? [];
  const body = "﻿" + [COLUMNS.join(","), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(","))].join("\r\n");
  const name = `portfolio-companies${sponsor ? "-" + String(rows[0]?.Sponsor ?? "sponsor").toLowerCase().replace(/[^a-z0-9]+/g, "-") : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
