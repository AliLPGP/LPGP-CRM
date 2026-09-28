import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getReadClient, isSupabaseConfigured } from "../supabase/server";

// What the directory still needs before it can show anything: the SQL that
// adds its columns, and one import of the Master Directory workbook. Discover
// and the import page both ask, fresh on every request, and walk an admin
// through whichever step is missing — with the exact SQL to paste and a link
// straight to this project's Supabase SQL editor.

export type SqlPart = { name: string; sql: string };

export type DirectorySetup = {
  configured: boolean;
  /** Migration 0013: workbook columns, lists, saved searches. */
  directory: boolean;
  /** Migration 0014: the Form ADV fund lineup columns. */
  funds: boolean;
  lastImport: { at: string; filename: string | null } | null;
  /** This project's SQL editor, when the URL is a *.supabase.co project. */
  sqlEditorUrl: string | null;
};

export function supabaseSqlEditorUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    const host = new URL(url).hostname;
    const m = host.match(/^([a-z0-9]{12,40})\.supabase\.(co|in)$/i);
    return m ? `https://supabase.com/dashboard/project/${m[1]}/sql/new` : "https://supabase.com/dashboard/projects";
  } catch {
    return null;
  }
}

export async function getDirectorySetup(): Promise<DirectorySetup> {
  const supabase = getReadClient();
  const sqlEditorUrl = supabaseSqlEditorUrl();
  if (!supabase || !isSupabaseConfigured()) {
    return { configured: false, directory: false, funds: false, lastImport: null, sqlEditorUrl };
  }
  const [dir, funds] = await Promise.all([
    supabase.from("companies").select("external_id").limit(1),
    supabase.from("funds").select("service_providers").limit(1),
  ]);
  let lastImport: DirectorySetup["lastImport"] = null;
  if (!dir.error) {
    const { data } = await supabase
      .from("directory_imports")
      .select("filename, created_at")
      .order("created_at", { ascending: false })
      .limit(1);
    const row = data?.[0] as { filename: string | null; created_at: string } | undefined;
    if (row) lastImport = { at: row.created_at, filename: row.filename };
  }
  return { configured: true, directory: !dir.error, funds: !funds.error, lastImport, sqlEditorUrl };
}

const ROOT = process.cwd();

/** The paste-sized parts of migrations 0013 + 0014 (supabase/sql-parts/3-directory). */
export async function directorySqlParts(): Promise<SqlPart[]> {
  const dir = path.join(ROOT, "supabase", "sql-parts", "3-directory");
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
    return await Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), "utf8") })));
  } catch {
    return [];
  }
}

/** Migration 0014 on its own, for a database that already has 0013. */
export async function fundsSqlPart(): Promise<SqlPart[]> {
  try {
    const sql = await readFile(path.join(ROOT, "supabase", "migrations", "0014_fund_lineup.sql"), "utf8");
    return [{ name: "0014_fund_lineup.sql", sql }];
  } catch {
    return [];
  }
}

/** Whatever SQL this database is still missing, in paste order. */
export async function missingSql(setup: DirectorySetup): Promise<SqlPart[]> {
  if (!setup.configured) return [];
  if (!setup.directory) return directorySqlParts();
  if (!setup.funds) return fundsSqlPart();
  return [];
}
