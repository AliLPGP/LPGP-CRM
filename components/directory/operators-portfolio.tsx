"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, ExternalLink, Link2, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PortfolioCompany } from "@/lib/directory/portfolio";
import { financeLead, type PortcoIntel } from "@/lib/directory/portco-intel";
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
            {shown.slice(0, limit).map((c) => (
              <li key={c.id} className="group relative flex gap-3 rounded-xl border bg-background/50 p-3">
                <CompanyLogo name={c.name} domain={c.domain} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13.5px] font-medium">{c.name}</span>
                    {c.status ? (
                      <span
                        className={cn(
                          "shrink-0 rounded border px-1.5 text-[10px] font-medium",
                          c.status === "current" ? "text-[var(--success)]" : "text-muted-foreground",
                        )}
                      >
                        {STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {[c.sector, c.hq, c.invested_year ? `since ${c.invested_year}` : null, c.exit_year ? `exited ${c.exit_year}` : null]
                      .filter(Boolean)
                      .join(" · ") || (c.domain ?? "")}
                  </p>
                  {c.description ? <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{c.description}</p> : null}
                  <PortcoFacts intel={c.intel_key ? intel[c.intel_key] : undefined} />
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
              </li>
            ))}
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

/** Filed figures and the finance lead, when the register or a people preview holds them. */
function PortcoFacts({ intel }: { intel: PortcoIntel | undefined }) {
  if (!intel) return null;
  const lead = financeLead(intel);
  const facts = [
    intel.revenue != null ? `Turnover ${formatMoney(intel.revenue, intel.currency)}` : null,
    intel.ebitda_derived != null ? `EBITDA ${formatMoney(intel.ebitda_derived, intel.currency)}` : null,
    intel.employees != null ? `${intel.employees.toLocaleString("en-US")} staff` : null,
    intel.net_assets != null ? `Net assets ${formatMoney(intel.net_assets, intel.currency)}` : null,
  ].filter(Boolean);
  if (!facts.length && !lead) return null;
  return (
    <div className="mt-1 text-[11.5px] leading-snug">
      {facts.length ? (
        <p>
          {intel.accounts_url ? (
            <a href={intel.accounts_url} target="_blank" rel="noreferrer" className="hover:underline" title={`Accounts filed at Companies House${intel.accounts_period_end ? `, to ${intel.accounts_period_end}` : ""}`}>
              {facts.join(" · ")}
            </a>
          ) : (
            facts.join(" · ")
          )}
        </p>
      ) : null}
      {lead ? (
        <p className="text-muted-foreground" title={lead.title}>
          Finance: <span className="text-foreground">{lead.name}</span>
        </p>
      ) : null}
    </div>
  );
}
