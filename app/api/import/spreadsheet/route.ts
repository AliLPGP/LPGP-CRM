import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { DIRECTORY_TAG } from "@/lib/directory/index-server";
import { getAdminClient, isAdminConfigured } from "@/lib/supabase/admin";
import { isCategory } from "@/lib/categories";
import { importContactRows, type ImportRow } from "@/lib/import";
import type { Category } from "@/lib/types";

const MAX_ROWS = 10_000;

export async function POST(req: Request) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (!isAdminConfigured()) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY is not configured — cannot write rows." },
      { status: 503 },
    );
  }
  const supabase = getAdminClient()!;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const category = body.category;
  if (!isCategory(category)) {
    return NextResponse.json({ error: "Pick a default book: LP, GP or SP." }, { status: 400 });
  }
  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "No rows to import." }, { status: 400 });
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Too many rows (${body.rows.length}). Split into files of ${MAX_ROWS} or fewer.` },
      { status: 413 },
    );
  }

  const rows = (body.rows as Record<string, unknown>[]).map(normalizeRow);
  const result = await importContactRows(supabase, rows, category as Category);
  // New firms and people should show in Discover straight away.
  revalidateTag(DIRECTORY_TAG, { expire: 0 });
  return NextResponse.json(result);
}

function asStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function normalizeRow(raw: Record<string, unknown>): ImportRow {
  const category = asStr(raw.category)?.toUpperCase();
  return {
    firstName: asStr(raw.firstName),
    lastName: asStr(raw.lastName),
    jobTitle: asStr(raw.jobTitle),
    seniority: asStr(raw.seniority),
    department: asStr(raw.department),
    email: asStr(raw.email),
    phone: asStr(raw.phone),
    linkedinUrl: asStr(raw.linkedinUrl),
    country: asStr(raw.country),
    city: asStr(raw.city),
    companyName: asStr(raw.companyName),
    companyDomain: asStr(raw.companyDomain),
    companyWebsite: asStr(raw.companyWebsite),
    companyLinkedin: asStr(raw.companyLinkedin),
    subType: asStr(raw.subType),
    category: isCategory(category) ? category : null,
  };
}
