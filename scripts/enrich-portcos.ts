/**
 * Enrich portfolio companies and borrowers from a terminal -- the same job
 * the Borrowers desk button and the daily cron run, with no time limit.
 *
 *   npx tsx --conditions react-server scripts/enrich-portcos.ts [--limit 300] [--all]
 *   npx tsx --conditions react-server scripts/enrich-portcos.ts --targets targets.json --out rows.sql [--all]
 *
 * Needs COMPANIES_HOUSE_API_KEY (and LUSHA_API_KEY for executives). The
 * first form reads targets from the database and writes rows back, so it
 * also needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read
 * from .env.local when present). The second reads targets from a JSON file
 * -- [{ key, name, domain, country }], the columns of portfolio_companies
 * and borrowers -- and writes one idempotent upsert per company to a SQL
 * file, for a machine that has the register key but no database key.
 * "--all" also looks up names that do not read British; the register only
 * holds UK companies, so that mostly costs lookups.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Target } from "../lib/directory/portco-enrich";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(path.join(process.cwd(), file), "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* no file */
    }
  }
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  loadEnv();
  if (!process.env.COMPANIES_HOUSE_API_KEY && !process.env.LUSHA_API_KEY) throw new Error("COMPANIES_HOUSE_API_KEY (or LUSHA_API_KEY) is required");
  const { enrichTargets, looksUk, portcoTargets, rowToSql } = await import("../lib/directory/portco-enrich");
  const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  const far = Date.now() + 12 * 60 * 60 * 1000;
  const onlyUk = !flag("all");
  const targetsFile = arg("targets");
  const out = arg("out");

  if (targetsFile) {
    if (!out) throw new Error("--targets needs --out <file.sql>");
    const raw = JSON.parse(readFileSync(targetsFile, "utf8")) as Target[];
    const seen = new Set<string>();
    const list = raw.filter((t) => t.key && t.name && !seen.has(t.key) && seen.add(t.key)).filter((t) => !onlyUk || looksUk(t));
    log(`${list.length} targets from ${targetsFile}${onlyUk ? " (UK names only)" : ""}`);
    writeFileSync(out, `-- portco_intel rows from Companies House${process.env.LUSHA_API_KEY ? " and Lusha previews" : ""}, ${new Date().toISOString()}\n`);
    let n = 0;
    const r = await enrichTargets(list, {
      deadline: far,
      log,
      save: async (row) => {
        appendFileSync(out, rowToSql(row) + "\n");
        n += 1;
        return null;
      },
    });
    log(`done: ${r.considered} looked up, ${r.matched} on the register, ${r.accounts} with filed figures, ${r.executives} with executives; ${n} rows in ${out}; errors: ${r.errors.join("; ") || "none"}`);
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or use --targets/--out)");
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const list = await portcoTargets(supabase, Number(arg("limit") ?? 300), onlyUk);
  log(`${list.length} targets`);
  const r = await enrichTargets(list, {
    deadline: far,
    log,
    save: async (row) => {
      const { error } = await supabase.from("portco_intel").upsert(row, { onConflict: "key" });
      return error ? error.message : null;
    },
  });
  log(`done: ${r.considered} looked up, ${r.matched} on the register, ${r.accounts} with filed figures, ${r.executives} with executives; errors: ${r.errors.join("; ") || "none"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
