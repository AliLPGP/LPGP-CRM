/**
 * Fill the intelligence desk from a terminal — the same jobs the buttons
 * and crons run, against whichever database the env points at, with no
 * function time limit and a log line per class or club.
 *
 *   npx tsx --conditions react-server scripts/research.ts benchmarks
 *   npx tsx --conditions react-server scripts/research.ts deals [--since 2025-01-01] [--class private_credit]
 *   npx tsx --conditions react-server scripts/research.ts signals [--days 30]
 *   npx tsx --conditions react-server scripts/research.ts clubs [--limit 20] [--verify] [--all]
 *   npx tsx --conditions react-server scripts/research.ts commitments [--limit 20] [--since 2024-01-01]
 *   npx tsx --conditions react-server scripts/research.ts portfolios [--limit 50] [--roster] [--redo]
 *   npx tsx --conditions react-server scripts/research.ts portfolios --targets sponsors.json --out rows.sql
 *   npx tsx --conditions react-server scripts/research.ts investors [--limit 20] [--offset 0] [--id <company uuid>]
 *   npx tsx --conditions react-server scripts/research.ts funds [--limit 20] [--offset 0] [--id <fund uuid>]
 *   npx tsx --conditions react-server scripts/research.ts all
 *
 * Needs ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY (read from .env.local when present). "clubs"
 * takes the clubs without figures; "--all" re-researches every club.
 * "investors" takes the next page of LPs with no profile on file (migration
 * 0033's investor_research_batch) and "funds" the next page of funds with no
 * profile (0032's fund_research_batch), best-documented first; "--offset"
 * pages past a batch already run, "--id" names one record instead and
 * re-researches it. Neither runs under "all": each record is a minute of
 * paid searching.
 * The react-server condition is what lets the server-only modules load
 * outside Next.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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
  const job = process.argv[2];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!job || !["benchmarks", "deals", "signals", "clubs", "commitments", "portfolios", "investors", "funds", "all"].includes(job)) {
    console.error("usage: research.ts benchmarks | deals | signals | clubs | commitments | portfolios | investors | funds | all");
    process.exit(2);
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");
  // Portfolios can run without a database key: sponsors in from a JSON file
  // ([{ id, name, domain, country }]), one idempotent upsert per company out
  // to a SQL file, for a machine that holds the research key only.
  if (job === "portfolios" && arg("targets")) {
    const out = arg("out");
    if (!out) throw new Error("--targets needs --out <file.sql>");
    const { appendFileSync, writeFileSync } = await import("node:fs");
    const { portfolioRowSql, runPortfolios } = await import("../lib/directory/jobs");
    const firms = JSON.parse(readFileSync(arg("targets")!, "utf8")) as { id: string; name: string; domain: string | null; country: string | null }[];
    const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
    log(`portfolios: ${firms.length} sponsors from ${arg("targets")}`);
    writeFileSync(out, `-- portfolio_companies rows from web research, ${new Date().toISOString()}\n`);
    const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
    const r = await runPortfolios(null as never, firms, {
      deadline: Date.now() + 48 * 60 * 60 * 1000,
      addedBy: null,
      log,
      save: async (firm, rows, note) => {
        appendFileSync(out, rows.map(portfolioRowSql).join("\n") + (rows.length ? "\n" : ""));
        appendFileSync(out, `update public.companies set portfolio_note = ${note ? q(note.slice(0, 600)) : "null"}, portfolio_researched_at = now() where id = ${q(firm.id)};\n`);
      },
    });
    log(`portfolios done: ${r.companies} companies across ${r.firms} sponsors in ${out}, errors: ${r.errors.join("; ") || "none"}`);
    return;
  }
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Imported after the env is loaded: these modules read it at import time.
  const { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey } = await import("../lib/directory/asset-classes");
  const { disclosingLps, portfolioTargets, runBenchmarks, runClubs, runCommitments, runDeals, runFundDetails, runInvestors, runPortfolios, runSignals } = await import("../lib/directory/jobs");
  const log = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  const far = Date.now() + 6 * 60 * 60 * 1000; // no function limit here: six hours
  const cls = arg("class");
  const classes = cls && isAssetClassKey(cls) ? [ASSET_CLASS_BY_KEY[cls]] : ASSET_CLASSES;

  if (job === "benchmarks" || job === "all") {
    const r = await runBenchmarks(supabase, classes, far, log);
    log(`benchmarks done: ${r.added} figures, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "deals" || job === "all") {
    const since = arg("since") ?? `${new Date().getUTCFullYear() - 1}-01-01`;
    const r = await runDeals(supabase, classes, { since, deadline: far, addedBy: null, log });
    log(`deals done: ${r.added} deals, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "signals" || job === "all") {
    const r = await runSignals(supabase, { deadline: far, days: Number(arg("days") ?? 5), log });
    log(`signals done: ${r.added} new of ${r.found} found, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "commitments" || job === "all") {
    const lps = await disclosingLps(supabase, Number(arg("limit") ?? 20));
    const since = arg("since") ?? `${new Date().getUTCFullYear() - 2}-01-01`;
    log(`commitments: ${lps.length} disclosing LPs since ${since}`);
    const r = await runCommitments(supabase, lps, { since, deadline: far, log });
    log(`commitments done: ${r.added} rows from ${r.lps} LPs, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "clubs" || job === "all") {
    const limit = Number(arg("limit") ?? 20);
    let q = supabase.from("sports_teams").select("id, name, revenue, valuation, ownership_summary").order("league").order("name");
    if (!flag("all")) q = q.is("revenue", null).is("valuation", null).is("ownership_summary", null);
    const { data, error } = await q.limit(limit);
    if (error) throw new Error(error.message);
    const teamIds = (data ?? []).map((t) => t.id as string);
    log(`clubs: ${teamIds.length} to research${flag("verify") ? ", with a fact-check pass" : ""}`);
    const results = await runClubs(supabase, { teamIds, clubs: [], verify: flag("verify"), deadline: far, addedBy: null, log });
    log(`clubs done: ${results.filter((r) => r.ok).length} researched, ${results.filter((r) => !r.ok).length} failed`);
  }
  if (job === "portfolios") {
    // Sponsors with nothing on file, the directory's first; "--roster" adds the SEC roster's private-equity and venture advisers; "--redo" re-reads everyone.
    const firms = await portfolioTargets(supabase, { limit: Number(arg("limit") ?? 50), includeRoster: flag("roster"), redo: flag("redo") });
    log(`portfolios: ${firms.length} sponsors to read`);
    const r = await runPortfolios(supabase, firms, { deadline: far, addedBy: null, log });
    log(`portfolios done: ${r.companies} companies across ${r.firms} sponsors, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "investors") {
    // The next page of LPs with no profile on file, or the one named with --id.
    const id = arg("id");
    const r = await runInvestors(supabase, { limit: id ? 1 : Number(arg("limit") ?? 20), offset: Number(arg("offset") ?? 0), ids: id ? [id] : undefined, deadline: far, log });
    log(`investors done: ${r.done} profiles, ${r.fields} fields, ${r.plans} plans${r.dropped ? `, ${r.dropped} values dropped for want of a source` : ""}, errors: ${r.errors.join("; ") || "none"}`);
  }
  if (job === "funds") {
    // The next page of funds with no profile on file, or the one named with --id.
    const id = arg("id");
    const r = await runFundDetails(supabase, { limit: id ? 1 : Number(arg("limit") ?? 20), offset: Number(arg("offset") ?? 0), ids: id ? [id] : undefined, deadline: far, log });
    log(`funds done: ${r.done} profiles, ${r.fields} fields, ${r.placed} placed in the taxonomy${r.dropped ? `, ${r.dropped} values dropped for want of a source` : ""}, errors: ${r.errors.join("; ") || "none"}`);
  }
  log("Open the app: cached reads refresh within the hour, or press any research button once to refresh them now.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
