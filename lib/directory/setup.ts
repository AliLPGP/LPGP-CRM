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
  /** Migration 0015: portfolio companies. */
  portfolio: boolean;
  /** Migration 0016: deals, signals and sports. */
  intelligence: boolean;
  /** The intelligence dataset has been loaded at least once. */
  datasetLoaded: boolean;
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
    return {
      configured: false, directory: false, funds: false, portfolio: false, intelligence: false,
      datasetLoaded: false, lastImport: null, sqlEditorUrl,
    };
  }
  // 0016 creates six tables; a paste that stopped after the first few would
  // still answer for sports_teams, so every one it creates is asked for.
  const [dir, funds, portfolio, ...intel] = await Promise.all([
    supabase.from("companies").select("external_id").limit(1),
    supabase.from("funds").select("service_providers").limit(1),
    supabase.from("portfolio_companies").select("id").limit(1),
    supabase.from("sports_teams").select("id").limit(1),
    supabase.from("sports_team_owners").select("id").limit(1),
    supabase.from("deals").select("id").limit(1),
    supabase.from("signals").select("id").limit(1),
    supabase.from("benchmarks").select("id").limit(1),
  ]);
  let lastImport: DirectorySetup["lastImport"] = null;
  let datasetLoaded = false;
  if (!dir.error) {
    // The dataset loader logs to the same table under its own name; only a
    // workbook counts as an import, and only that name counts as a load.
    const [{ data: imports }, { data: loads }] = await Promise.all([
      supabase
        .from("directory_imports")
        .select("filename, created_at")
        .not("filename", "like", "intelligence-dataset@%")
        .order("created_at", { ascending: false })
        .limit(1),
      supabase.from("directory_imports").select("id").like("filename", "intelligence-dataset@%").limit(1),
    ]);
    const row = imports?.[0] as { filename: string | null; created_at: string } | undefined;
    if (row) lastImport = { at: row.created_at, filename: row.filename };
    datasetLoaded = (loads?.length ?? 0) > 0;
  }
  return {
    configured: true,
    directory: !dir.error,
    funds: !funds.error,
    portfolio: !portfolio.error,
    intelligence: intel.every((r) => !r.error),
    datasetLoaded,
    lastImport,
    sqlEditorUrl,
  };
}

const ROOT = process.cwd();

async function sqlParts(folder: string): Promise<SqlPart[]> {
  const dir = path.join(ROOT, "supabase", "sql-parts", folder);
  try {
    const names = (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort();
    return await Promise.all(names.map(async (name) => ({ name, sql: await readFile(path.join(dir, name), "utf8") })));
  } catch {
    return [];
  }
}

/** The paste-sized parts of migrations 0013–0016 (supabase/sql-parts/3-directory). */
export function directorySqlParts(): Promise<SqlPart[]> {
  return sqlParts("3-directory");
}

/** Migration 0016 on its own, in paste-sized parts: at 11 KB whole it is
 *  exactly the size a browser editor truncates. */
export function intelligenceSqlParts(): Promise<SqlPart[]> {
  return sqlParts("4-intelligence");
}

async function migration(name: string): Promise<SqlPart[]> {
  try {
    return [{ name, sql: await readFile(path.join(ROOT, "supabase", "migrations", name), "utf8") }];
  } catch {
    return [];
  }
}

/** True when the directory tables exist but a later update hasn't run. */
export function upgradeOnly(setup: DirectorySetup): boolean {
  return setup.directory && (!setup.funds || !setup.portfolio || !setup.intelligence);
}

/** Every directory table and column is in place. */
export function sqlDone(setup: DirectorySetup): boolean {
  return setup.directory && setup.funds && setup.portfolio && setup.intelligence;
}

/** Whatever SQL this database is still missing, in paste order. */
export async function missingSql(setup: DirectorySetup): Promise<SqlPart[]> {
  if (!setup.configured) return [];
  if (!setup.directory) return directorySqlParts();
  return [
    ...(setup.funds ? [] : await migration("0014_fund_lineup.sql")),
    ...(setup.portfolio ? [] : await migration("0015_portfolio_companies.sql")),
    ...(setup.intelligence ? [] : await intelligenceSqlParts()),
  ];
}
