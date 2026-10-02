"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Loader2, Plus, Search, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { Columns } from "@/components/intel/charts";
import { FacetChips, FacetMenu, type FacetOption } from "@/components/intel/facet-menu";
import { Box, Empty, Src, Stat, Tag } from "@/components/intel/ui";
import { DEAL_BASIS_LABEL, type PortfolioCompany } from "@/lib/directory/portfolio";
import { chiefExec, financeLead, operationsLead, portcoHref, type PortcoIntel } from "@/lib/directory/portco-intel";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { addPortfolioCompany, removePortfolioCompany } from "@/lib/directory/portfolio-actions";
import { DESK_BUTTON, MORE_BUTTON } from "./profile-sections";

// A GP's portfolio tab on the desk register: a `Box` per section, a bar of
// facet menus over the companies, cards at 4px, and every figure with the
// page that states it.

export type OperatorRow = {
  id: string;
  full_name: string | null;
  job_title: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
  source: string | null;
};

const INPUT = "h-8 rounded-[4px] border border-input bg-card px-2 text-[12.5px] outline-none focus-visible:border-ring";

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
    <Box
      id="operators"
      title="Operating partners"
      count={rows.length}
      flush
      defn="People at this firm whose title names an operating role — operating partner, operating executive, value-creation lead — from the directory and from a people-database search by the firm's domain. Names and titles only; no reveals."
      action={
        lushaReady && hasDomain ? (
          <button type="button" onClick={find} disabled={pending} className={DESK_BUTTON}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            {rows.length ? "Refresh from Lusha" : "Find on Lusha"}
          </button>
        ) : null
      }
    >
      {message ? <p className="border-b px-3 py-2 text-[11.5px] text-muted-foreground">{message}</p> : null}
      {rows.length ? (
        <ul className="grid gap-px bg-border sm:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="flex items-center gap-2.5 bg-card px-3 py-2">
              <PersonAvatar name={c.full_name} size={28} />
              <Link href={`/contacts/${c.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium hover:underline">{c.full_name ?? "—"}</span>
                <span className="block truncate text-[11.5px] text-muted-foreground">{[c.job_title, [c.city, c.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
              </Link>
              {c.linkedin_url ? (
                <a
                  href={c.linkedin_url.startsWith("http") ? c.linkedin_url : `https://${c.linkedin_url}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[4px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                  aria-label={`${c.full_name} on LinkedIn`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <Empty>
          {lushaReady && hasDomain
            ? "None on file yet. “Find on Lusha” lists operating partners, operating executives and value-creation leads by title — names and titles only, about one credit per 25 people."
            : hasDomain
              ? "None on file. Set LUSHA_API_KEY to look them up."
              : "None on file. Add the firm's website to look them up on Lusha."}
        </Empty>
      )}
    </Box>
  );
}

const STATUS_LABEL: Record<string, string> = { current: "Current", realized: "Realized", unstated: "Not stated" };

/** The last part of an HQ string, as the country or state the sponsor wrote. */
const placeOf = (r: PortfolioCompany) => r.hq?.split(",").pop()?.trim() || null;

/** Distinct values of one field across the portfolio, most common first. */
function facetOf(rows: PortfolioCompany[], pick: (r: PortfolioCompany) => string | null | undefined, label?: (k: string) => string): FacetOption[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = pick(r)?.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: label ? label(key) : key, count }));
}

/** What the GP owns (and has owned), each company with where it was found. */
export function PortfolioCompanies({
  companyId,
  rows,
  aiReady,
  intel = {},
  total,
  moreHref,
}: {
  companyId: string;
  rows: PortfolioCompany[];
  aiReady: boolean;
  /** How many the firm has in all, when `rows` is only the first part of them. */
  total?: number;
  moreHref?: string;
  /** What is on file about each company (by `intel_key`): filed accounts, officers, executives. */
  intel?: Record<string, PortcoIntel>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [places, setPlaces] = useState<string[]>([]);
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

  // Counts over the whole list, so a ticked value never vanishes from its menu.
  const facets = useMemo(
    () => ({
      status: facetOf(rows, (r) => r.status || "unstated", (k) => STATUS_LABEL[k] ?? k),
      sector: facetOf(rows, (r) => r.sector),
      place: facetOf(rows, placeOf),
    }),
    [rows],
  );
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!statuses.length || statuses.includes(r.status || "unstated")) &&
        (!sectors.length || (r.sector != null && sectors.includes(r.sector.trim()))) &&
        (!places.length || places.includes(placeOf(r) ?? "")) &&
        (!needle || r.name.toLowerCase().includes(needle) || (r.sector ?? "").toLowerCase().includes(needle) || (r.hq ?? "").toLowerCase().includes(needle)),
    );
  }, [rows, q, statuses, sectors, places]);
  const chips = [
    ...statuses.map((k) => ({ key: `status:${k}`, label: STATUS_LABEL[k] ?? k, remove: () => setStatuses(statuses.filter((x) => x !== k)) })),
    ...sectors.map((k) => ({ key: `sector:${k}`, label: k, remove: () => setSectors(sectors.filter((x) => x !== k)) })),
    ...places.map((k) => ({ key: `place:${k}`, label: k, remove: () => setPlaces(places.filter((x) => x !== k)) })),
  ];
  const clearAll = () => {
    setStatuses([]);
    setSectors([]);
    setPlaces([]);
  };

  return (
    <Box
      id="portfolio"
      title="Portfolio companies"
      count={total != null && total > rows.length ? `${rows.length.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : rows.length}
      flush
      defn="Companies the manager's own site or press names in its portfolio, each with the page that names it and what the press states was paid — in its currency, with what the figure is. Nothing is estimated or converted."
      action={
        <>
          {rows.length ? (
            <a href={`/api/directory/portcos/export?sponsor=${companyId}`} className={DESK_BUTTON}>
              Download sheet
            </a>
          ) : null}
          <button type="button" onClick={() => setAdding(!adding)} className={DESK_BUTTON}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
          {aiReady ? (
            <button type="button" onClick={research} disabled={pending} className={DESK_BUTTON}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              {rows.length ? "Refresh from sources" : "Research portfolio"}
            </button>
          ) : null}
        </>
      }
    >
      {message ? <p className="border-b px-3 py-2 text-[11.5px] text-muted-foreground">{message}</p> : null}
      {adding ? (
        <form
          className="grid gap-1.5 border-b px-3 py-2 sm:grid-cols-[1.4fr_1fr_110px_80px_auto]"
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
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Company" autoFocus className={INPUT} />
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="Website" className={INPUT} />
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={INPUT}>
            <option value="current">Current</option>
            <option value="realized">Realized</option>
            <option value="">Unknown</option>
          </select>
          <input value={form.investedYear} onChange={(e) => setForm({ ...form, investedYear: e.target.value })} placeholder="Year" inputMode="numeric" className={INPUT} />
          <button type="submit" disabled={pending || !form.name.trim()} className={`${DESK_BUTTON} border-primary bg-primary text-primary-foreground hover:bg-primary-hover`}>
            Save
          </button>
        </form>
      ) : null}
      {rows.length ? (
        <>
          <PortfolioSummary rows={rows} intel={intel} />
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company, sector or place…" aria-label="Search the portfolio" className={`${INPUT} w-56 pl-7`} />
            </div>
            <FacetMenu label="Status" groups={[{ label: "", options: facets.status }]} selected={statuses} onChange={setStatuses} width={200} searchable={false} />
            <FacetMenu label="Sector" groups={[{ label: "", options: facets.sector }]} selected={sectors} onChange={setSectors} />
            <FacetMenu label="Where" groups={[{ label: "", options: facets.place }]} selected={places} onChange={setPlaces} width={240} />
            <span className="figure ml-auto text-[11px] text-muted-foreground">
              {shown.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
            </span>
          </div>
          {chips.length ? (
            <div className="border-b px-3 py-2">
              <FacetChips chips={chips} onClearAll={clearAll} />
            </div>
          ) : null}
          {shown.length ? (
            <ul className="grid gap-2 p-3 sm:grid-cols-2">
              {shown.slice(0, limit).map((c) => {
                const ci = c.intel_key ? intel[c.intel_key] : undefined;
                const leads = [
                  ["CFO", financeLead(ci)],
                  ["COO", operationsLead(ci)],
                  ["CEO", chiefExec(ci)],
                ].filter((x): x is [string, { name: string; title: string }] => Boolean(x[1]));
                const facts: { k: string; v: string; title?: string; href?: string | null }[] = [];
                if (c.deal_value != null) facts.push({ k: DEAL_BASIS_LABEL[c.deal_value_basis ?? "unspecified"], v: formatMoney(c.deal_value, c.deal_currency), href: c.deal_source_url, title: "The transaction value a page states, in its currency" });
                if (c.equity_invested != null) facts.push({ k: "Equity", v: formatMoney(c.equity_invested, c.deal_currency), href: c.deal_source_url, title: "The sponsor's own equity, as stated" });
                if (c.stake_pct != null) facts.push({ k: "Stake", v: `${c.stake_pct}%`, href: c.deal_source_url });
                if (c.invested_year) facts.push({ k: c.exit_year ? "Held" : "Since", v: c.exit_year ? `${c.invested_year}–${c.exit_year}` : String(c.invested_year) });
                else if (c.exit_year) facts.push({ k: "Exited", v: String(c.exit_year) });
                if (c.fund_name) facts.push({ k: "Fund", v: c.fund_name });
                return (
                  <li key={c.id} className="group relative rounded-[4px] border bg-background/40 p-2.5">
                    <div className="flex items-start gap-2.5">
                      <CompanyLogo name={c.name} domain={c.domain} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {c.intel_key ? (
                            <Link href={portcoHref(c.intel_key)} className="truncate text-[13px] font-medium hover:underline">
                              {c.name}
                            </Link>
                          ) : (
                            <span className="truncate text-[13px] font-medium">{c.name}</span>
                          )}
                          {c.status ? <Tag strong={c.status === "current"}>{STATUS_LABEL[c.status] ?? c.status}</Tag> : null}
                        </div>
                        <p className="truncate text-[11.5px] text-muted-foreground">{[c.sector, c.hq].filter(Boolean).join(" · ") || (c.domain ?? "")}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Src url={c.source_url} name="Named by" />
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
                      <dl className="mt-2 grid gap-x-3 gap-y-1" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))" }}>
                        {facts.map((f) => (
                          <div key={f.k + f.v} className="min-w-0" title={f.title}>
                            <dt className="desk-label">{f.k}</dt>
                            <dd className="figure truncate text-[12.5px]">
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
                    {leads.length ? (
                      <ul className="mt-2 grid gap-x-3 gap-y-0.5 border-t pt-1.5 sm:grid-cols-3">
                        {leads.map(([role, who]) => (
                          <li key={role} className="min-w-0 truncate text-[11.5px]" title={who.title}>
                            <span className="text-muted-foreground">{role} </span>
                            <span className="font-medium">{who.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <PortcoFacts intel={ci} />
                    {c.description ? <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{c.description}</p> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No company matches these filters. Clear one to widen the portfolio.</Empty>
          )}
          {shown.length > limit ? (
            <div className="border-t px-3 py-2">
              <button type="button" onClick={() => setLimit(limit + 60)} className={MORE_BUTTON}>
                Show {Math.min(60, shown.length - limit)} more
              </button>
            </div>
          ) : total != null && total > rows.length && moreHref ? (
            <div className="flex items-center gap-2 border-t px-3 py-2 text-[11.5px] text-muted-foreground">
              Showing {rows.length.toLocaleString("en-US")} of {total.toLocaleString("en-US")}.
              <Link href={moreHref} scroll={false} className={MORE_BUTTON}>
                Show {Math.min(120, total - rows.length)} more
              </Link>
            </div>
          ) : null}
        </>
      ) : (
        <Empty>
          {aiReady
            ? "None on file yet. “Research portfolio” reads the manager's own portfolio page and press releases, and saves each company with the page that names it."
            : "None on file yet. Add companies by hand, or set ANTHROPIC_API_KEY to research them from the manager's site."}
        </Empty>
      )}
    </Box>
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

/** The portfolio at a glance: how many, what was paid where stated (per currency, never summed across), what is on file per company, and the rhythm of investment. */
function PortfolioSummary({ rows, intel }: { rows: PortfolioCompany[]; intel: Record<string, PortcoIntel> }) {
  const current = rows.filter((r) => r.status === "current").length;
  const realized = rows.filter((r) => r.status === "realized").length;
  const unstated = rows.length - current - realized;
  const byCcy = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    if (r.deal_value == null) continue;
    const ccy = r.deal_currency ?? "?";
    const e = byCcy.get(ccy) ?? { total: 0, n: 0 };
    e.total += Number(r.deal_value);
    e.n += 1;
    byCcy.set(ccy, e);
  }
  const stated = [...byCcy.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 2);
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
  return (
    <div className="grid border-b" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      <Stat label="Companies" value={rows.length} basis={`${current} current · ${realized} realized${unstated ? ` · ${unstated} not stated` : ""}`} />
      {stated.map(([ccy, e]) => (
        <Stat
          key={ccy}
          label={`Deal value stated, ${ccy === "?" ? "no currency" : ccy}`}
          value={formatMoney(e.total, ccy === "?" ? null : ccy)}
          basis={`${e.n} deal${e.n === 1 ? "" : "s"} with a stated figure`}
          defn="Transaction values as the press states them, mostly enterprise value, added within one currency only. Currencies are never converted into each other."
        />
      ))}
      {!stated.length ? <Stat label="Deal value stated" value="—" basis="no page states a figure" /> : null}
      <Stat label="CFO or COO named" value={withLeads} basis="from the register or a people-database preview" />
      <Stat label="Filed accounts" value={withAccounts} basis="UK register, latest accounts" />
      {byYear.length >= 3 ? (
        <div className="min-w-[200px] border-l px-3 py-2" title="Companies by the year of investment the sponsor or the announcement gives.">
          <div className="desk-label">Investments per year</div>
          <Columns rows={byYear} height={40} className="mt-1" />
        </div>
      ) : null}
    </div>
  );
}
