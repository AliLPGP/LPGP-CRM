"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, ExternalLink, Link2, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEAL_BASIS_LABEL, type PortfolioCompany } from "@/lib/directory/portfolio";
import { Columns } from "@/components/intel/charts";
import { chiefExec, financeLead, operationsLead, portcoHref, type PortcoIntel } from "@/lib/directory/portco-intel";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { addPortfolioCompany, removePortfolioCompany } from "@/lib/directory/portfolio-actions";
import { cn } from "@/lib/utils";

export type OperatorRow = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  source: string | null;
};

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: String(json.error ?? `Failed (${res.status})`) };
    return { ok: true, message: JSON.stringify(json) };
  } catch {
    return { ok: false, message: "Network error" };
  }
}

/** The operators a GP puts into its companies — from Lusha, by title. */
export function OperatingPartners({
  companyId,
  hasDomain,
  rows,
  lushaReady,
}: {
  companyId: string;
  hasDomain: boolean;
  rows: OperatorRow[];
  lushaReady: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function find() {
    setMessage(null);
    start(async () => {
      const r = await post("/api/directory/operating-partners", { companyIds: [companyId] });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      const j = JSON.parse(r.message) as { found: number; added: number; updated: number };
      setMessage(
        j.found
          ? `Found ${j.found} on Lusha — ${j.added} added, ${j.updated} already on file.`
          : "Lusha has no operating partners listed at this firm's domain.",
      );
      router.refresh();
    });
  }

  return (
    <section id="operators" className="sheen scroll-mt-20 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
        <Briefcase className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Operating partners</h2>
        <span className="text-sm text-muted-foreground">({rows.length})</span>
        <div className="ml-auto">
          {lushaReady && hasDomain ? (
            <Button size="sm" variant="outline" onClick={find} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {rows.length ? "Refresh from Lusha" : "Find on Lusha"}
            </Button>
          ) : null}
        </div>
      </div>
      {message ? <p className="border-b px-5 py-2 text-xs text-muted-foreground">{message}</p> : null}
      {rows.length ? (
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-3 bg-card px-5 py-3">
              <PersonAvatar name={c.full_name} size={38} />
              <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium hover:underline">{c.full_name ?? "—"}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{c.job_title}</span>
                {c.city || c.country ? (
                  <span className="block truncate text-[11.5px] text-muted-foreground">{[c.city, c.country].filter(Boolean).join(", ")}</span>
                ) : null}
              </Link>
              {c.linkedin_url ? (
                <a
                  href={c.linkedin_url.startsWith("http") ? c.linkedin_url : `https://${c.linkedin_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`${c.full_name} on LinkedIn`}
                >
                  <Link2 className="h-4 w-4" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {lushaReady && hasDomain
            ? "None on file yet. Lusha lists operating partners, operating executives and value-creation leads by title — names and titles only, about one credit per 25 people."
            : hasDomain
              ? "None on file. Set LUSHA_API_KEY to look them up."
              : "None on file. Add the firm's website to look them up on Lusha."}
        </p>
      )}
    </section>
  );
}

const STATUS_LABEL: Record<string, string> = { current: "Current", realized: "Realized" };

/** What the GP owns (and has owned), each company with where it was found. */
export function PortfolioCompanies({
  companyId,
  rows,
  aiReady,
  intel = {},
}: {
  companyId: string;
  rows: PortfolioCompany[];
  aiReady: boolean;
  /** What is on file about each company (by `intel_key`): filed accounts, officers, executives. */
  intel?: Record<string, PortcoIntel>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "current" | "realized">("all");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", status: "current", investedYear: "", sourceUrl: "" });
  const [limit, setLimit] = useState(36);

  function research() {
    setMessage("Reading the manager's site and press — this takes a minute or two…");
    start(async () => {
      const r = await post("/api/directory/portfolio", { companyId });
      if (!r.ok) {
        setMessage(r.message);
        return;
      }
      const j = JSON.parse(r.message) as { saved: number; note: string };
      setMessage(`${j.saved} portfolio compan${j.saved === 1 ? "y" : "ies"} saved with their sources.${j.note ? ` ${j.note}` : ""}`);
      router.refresh();
    });
  }

  const counts = { current: rows.filter((r) => r.status === "current").length, realized: rows.filter((r) => r.status === "realized").length };
  const shown = rows.filter((r) => filter === "all" || r.status === filter);

  return (
    <section id="portfolio" className="sheen scroll-mt-20 rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3.5">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">Portfolio companies</h2>
        <span className="text-sm text-muted-foreground">({rows.length})</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(!adding)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
          {aiReady ? (
            <Button size="sm" variant="outline" onClick={research} disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {rows.length ? "Refresh from sources" : "Research portfolio"}
            </Button>
          ) : null}
        </div>
      </div>
      {message ? <p className="border-b px-5 py-2 text-xs text-muted-foreground">{message}</p> : null}
      {adding ? (
        <form
          className="grid gap-2 border-b px-5 py-3 sm:grid-cols-[1.4fr_1fr_110px_90px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await addPortfolioCompany(companyId, form);
              if (!r.ok) {
                setMessage(r.error ?? "Couldn't add.");
                return;
              }
              setForm({ name: "", website: "", status: "current", investedYear: "", sourceUrl: "" });
              setAdding(false);
              router.refresh();
            });
          }}
        >
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company" autoFocus />
          <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" />
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
          >
            <option value="current">Current</option>
            <option value="realized">Realized</option>
            <option value="">Unknown</option>
          </select>
          <Input value={form.investedYear} onChange={(e) => setForm({ ...form, investedYear: e.target.value })} placeholder="Year" inputMode="numeric" />
          <Button type="submit" disabled={pending || !form.name.trim()}>
            Save
          </Button>
        </form>
      ) : null}
      {rows.length ? (
        <>
          <PortfolioSummary rows={rows} intel={intel} />
          <div className="flex flex-wrap gap-1.5 px-5 pt-3">
            {(
              [
                ["all", `All ${rows.length}`],
                ["current", `Current ${counts.current}`],
                ["realized", `Realized ${counts.realized}`],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs",
                  filter === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <ul className="grid gap-2.5 p-5 sm:grid-cols-2">
            {shown.slice(0, limit).map((c) => {
              const ci = c.intel_key ? intel[c.intel_key] : undefined;
              const cfo = financeLead(ci);
              const coo = operationsLead(ci);
              const ceo = chiefExec(ci);
              const facts: { k: string; v: string; title?: string; href?: string | null }[] = [];
              if (c.deal_value != null) facts.push({ k: DEAL_BASIS_LABEL[c.deal_value_basis ?? "unspecified"], v: formatMoney(c.deal_value, c.deal_currency), href: c.deal_source_url, title: "The transaction value a page states, in its currency" });
              if (c.equity_invested != null) facts.push({ k: "equity", v: formatMoney(c.equity_invested, c.deal_currency), href: c.deal_source_url, title: "The sponsor's own equity, as stated" });
              if (c.stake_pct != null) facts.push({ k: "stake", v: `${c.stake_pct}%`, href: c.deal_source_url });
              if (c.invested_year) facts.push({ k: c.exit_year ? "held" : "since", v: c.exit_year ? `${c.invested_year}–${c.exit_year}` : String(c.invested_year) });
              else if (c.exit_year) facts.push({ k: "exited", v: String(c.exit_year) });
              if (c.fund_name) facts.push({ k: "fund", v: c.fund_name });
              return (
                <li key={c.id} className="group relative rounded-xl border bg-background/50 p-3">
                  <div className="flex items-start gap-3">
                    <CompanyLogo name={c.name} domain={c.domain} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {c.intel_key ? (
                          <Link href={portcoHref(c.intel_key)} className="truncate text-[13.5px] font-medium hover:underline">
                            {c.name}
                          </Link>
                        ) : (
                          <span className="truncate text-[13.5px] font-medium">{c.name}</span>
                        )}
                        {c.status ? (
                          <span className={cn("shrink-0 rounded border px-1.5 text-[10px] font-medium", c.status === "current" ? "text-[var(--success)]" : "text-muted-foreground")}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[11.5px] text-muted-foreground">{[c.sector, c.hq].filter(Boolean).join(" · ") || (c.domain ?? "")}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {c.source_url ? (
                        <a href={c.source_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Where this was found">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                      {c.source === "manual" ? (
                        <button
                          type="button"
                          onClick={() =>
                            start(async () => {
                              await removePortfolioCompany(c.id, companyId);
                              router.refresh();
                            })
                          }
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                          aria-label={`Remove ${c.name}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {facts.length ? (
                    <dl className="mt-2.5 grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
                      {facts.map((f) => (
                        <div key={f.k + f.v} className="min-w-0" title={f.title}>
                          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.k}</dt>
                          <dd className="figure truncate text-[13px]">
                            {f.href ? (
                              <a href={f.href} target="_blank" rel="noreferrer" className="hover:underline" title="The page that states it">
                                {f.v}
                              </a>
                            ) : (
                              f.v
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                  {c.co_investors?.length ? <p className="mt-1.5 text-[11.5px] text-muted-foreground">With {c.co_investors.join(", ")}</p> : null}
                  {cfo || coo || ceo ? (
                    <ul className="mt-2 grid gap-x-3 gap-y-1 border-t pt-2 sm:grid-cols-3">
                      {[
                        ["CFO", cfo],
                        ["COO", coo],
                        ["CEO", ceo],
                      ].map(([role, who]) =>
                        who && typeof who === "object" ? (
                          <li key={String(role)} className="min-w-0 text-[11.5px]" title={who.title}>
                            <span className="text-muted-foreground">{String(role)} </span>
                            <span className="truncate font-medium">{who.name}</span>
                          </li>
                        ) : null,
                      )}
                    </ul>
                  ) : null}
                  <PortcoFacts intel={ci} />
                  {c.description ? <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{c.description}</p> : null}
                </li>
              );
            })}
          </ul>
          {shown.length > limit ? (
            <div className="border-t px-5 py-2.5">
              <button type="button" onClick={() => setLimit(limit + 60)} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                Show {Math.min(60, shown.length - limit)} more
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="px-5 py-6 text-sm text-muted-foreground">
          {aiReady
            ? "None on file yet. “Research portfolio” reads the manager's own portfolio page and press releases, and saves each company with the page that names it."
            : "None on file yet. Add companies by hand, or set ANTHROPIC_API_KEY to research them from the manager's site."}
        </p>
      )}
    </section>
  );
}

/** Filed figures from the register, when the latest accounts state them. */
function PortcoFacts({ intel }: { intel: PortcoIntel | undefined }) {
  if (!intel) return null;
  const facts = [
    intel.revenue != null ? `Turnover ${formatMoney(intel.revenue, intel.currency)}` : null,
    intel.ebitda_derived != null ? `EBITDA ${formatMoney(intel.ebitda_derived, intel.currency)}` : null,
    intel.employees != null ? `${intel.employees.toLocaleString("en-US")} staff` : null,
    intel.net_assets != null ? `Net assets ${formatMoney(intel.net_assets, intel.currency)}` : null,
  ].filter(Boolean);
  if (!facts.length) return null;
  return (
    <p className="mt-1.5 text-[11.5px] leading-snug">
      {intel.accounts_url ? (
        <a href={intel.accounts_url} target="_blank" rel="noreferrer" className="hover:underline" title={`Accounts filed at Companies House${intel.accounts_period_end ? `, to ${intel.accounts_period_end}` : ""}`}>
          {facts.join(" · ")}
        </a>
      ) : (
        facts.join(" · ")
      )}
    </p>
  );
}

/** The portfolio at a glance: how many, what was paid where stated (per currency, never summed across), where, and what. */
function PortfolioSummary({ rows, intel }: { rows: PortfolioCompany[]; intel: Record<string, PortcoIntel> }) {
  const current = rows.filter((r) => r.status === "current").length;
  const realized = rows.filter((r) => r.status === "realized").length;
  const byCcy = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    if (r.deal_value == null) continue;
    const ccy = r.deal_currency ?? "?";
    const e = byCcy.get(ccy) ?? { total: 0, n: 0 };
    e.total += Number(r.deal_value);
    e.n += 1;
    byCcy.set(ccy, e);
  }
  const top = (pick: (r: PortfolioCompany) => string | null | undefined, n: number) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r)?.trim();
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  };
  const sectors = top((r) => r.sector, 4);
  const places = top((r) => r.hq?.split(",").pop() ?? null, 4);
  const withLeads = rows.filter((r) => r.intel_key && intel[r.intel_key] && (financeLead(intel[r.intel_key]) || operationsLead(intel[r.intel_key]))).length;
  const withAccounts = rows.filter((r) => r.intel_key && intel[r.intel_key]?.revenue != null).length;
  const yearCounts = new Map<number, number>();
  for (const r of rows) if (r.invested_year) yearCounts.set(r.invested_year, (yearCounts.get(r.invested_year) ?? 0) + 1);
  const lastYear = Math.max(0, ...yearCounts.keys());
  const byYear = lastYear
    ? Array.from({ length: Math.min(12, lastYear - Math.min(...yearCounts.keys()) + 1) }, (_, i) => lastYear - 11 + i)
        .filter((y) => y >= Math.min(...yearCounts.keys()))
        .map((y) => ({ label: `’${String(y).slice(2)}`, value: yearCounts.get(y) ?? 0, hint: String(y) }))
    : [];
  const cell = "min-w-0 border-l px-4 py-3 first:border-l-0";
  const label = "text-[10px] uppercase tracking-wide text-muted-foreground";
  const bars = (items: [string, number][]) => (
    <ul className="mt-1 space-y-0.5">
      {items.map(([k, n]) => (
        <li key={k} className="flex items-center gap-2 text-[11.5px]">
          <span className="min-w-0 flex-1 truncate">{k}</span>
          <span className="h-[5px] w-14 overflow-hidden rounded-[2px] bg-muted">
            <span className="block h-full bg-foreground/70" style={{ width: `${Math.max(6, Math.round((n / (items[0]?.[1] || 1)) * 100))}%` }} />
          </span>
          <span className="figure w-5 text-right text-[11px] text-muted-foreground">{n}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="grid border-b" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      <div className={cell}>
        <div className={label}>Companies</div>
        <div className="figure text-[22px] leading-tight">{rows.length}</div>
        <div className="text-[11.5px] text-muted-foreground">
          {current} current · {realized} realized{rows.length - current - realized ? ` · ${rows.length - current - realized} unstated` : ""}
        </div>
      </div>
      <div className={cell} title="Transaction values as the press states them, mostly enterprise value; each currency on its own, never added together.">
        <div className={label}>Deal value stated</div>
        {byCcy.size ? (
          <ul className="mt-0.5">
            {[...byCcy.entries()].map(([ccy, e]) => (
              <li key={ccy} className="flex items-baseline gap-2">
                <span className="figure text-[18px] leading-tight">{formatMoney(e.total, ccy === "?" ? null : ccy)}</span>
                <span className="text-[11px] text-muted-foreground">{e.n} deal{e.n === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-[11.5px] text-muted-foreground">None stated yet</div>
        )}
      </div>
      <div className={cell}>
        <div className={label}>On file per company</div>
        <div className="mt-0.5 text-[11.5px]">
          <span className="figure text-[18px] leading-tight">{withLeads}</span> <span className="text-muted-foreground">with a CFO or COO named</span>
        </div>
        <div className="text-[11.5px]">
          <span className="figure text-[18px] leading-tight">{withAccounts}</span> <span className="text-muted-foreground">with filed accounts</span>
        </div>
      </div>
      {sectors.length ? (
        <div className={cell}>
          <div className={label}>Sectors</div>
          {bars(sectors)}
        </div>
      ) : null}
      {places.length ? (
        <div className={cell}>
          <div className={label}>Where</div>
          {bars(places)}
        </div>
      ) : null}
      {byYear.length >= 3 ? (
        <div className={cn(cell, "min-w-[220px]")} title="Companies by the year of investment the sponsor or the announcement gives.">
          <div className={label}>Investments per year</div>
          <Columns rows={byYear} height={44} className="mt-1" />
        </div>
      ) : null}
    </div>
  );
}
