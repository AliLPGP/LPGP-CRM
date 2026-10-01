import Link from "next/link";
import {
  ArrowUpRight,
  Briefcase,
  CircleCheck,
  CircleDashed,
  FileText,
  Handshake,
  Landmark,
  Mail,
  ScrollText,
  Sparkles,
} from "lucide-react";
import type { Company } from "@/lib/types";
import type { DisclosedCommitment, FiledProvider, ProviderClient } from "@/lib/directory/queries";
import type { SimilarHit } from "@/lib/directory/similar";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL, ROLE_PLURAL } from "@/lib/directory/providers";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { cn, formatUsd } from "@/lib/utils";

// The Inven-style one-pager, section by section. Server components: nothing
// here needs the browser.

function Panel({
  icon,
  title,
  count,
  action,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number | string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("sheen overflow-hidden rounded-2xl border bg-card", className)}>
      <div className="flex items-center gap-2 border-b px-5 py-3.5">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        {count != null ? <span className="text-sm text-muted-foreground">({count})</span> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string | null }) {
  return (
    <div className="min-w-0 bg-card p-4">
      <p className="eyebrow">{label}</p>
      <div className="figure mt-2 truncate text-xl">{value}</div>
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground" title={hint}>{hint}</p> : null}
    </div>
  );
}

/** Headline size and what it is, from the best figure the record has. */
export function headlineSize(c: Company): { value: number | null; basis: string | null } {
  if (c.brand_aum_total_usd) {
    return {
      value: Number(c.brand_aum_total_usd),
      basis: c.brand_entity_count && c.brand_entity_count > 1
        ? `Form ADV · ${c.brand_entity_count} SEC entities`
        : "Regulatory AUM · Form ADV",
    };
  }
  if (c.regulatory_aum_usd) return { value: Number(c.regulatory_aum_usd), basis: "Regulatory AUM · Form ADV" };
  if (c.total_assets_usd) return { value: Number(c.total_assets_usd), basis: "Total assets" };
  if (c.aum_usd) return { value: Number(c.aum_usd), basis: "AUM" };
  if (c.private_fund_gross_assets) {
    return { value: Number(c.private_fund_gross_assets), basis: "Fund gross assets · Form ADV (ERA)" };
  }
  if (c.assets_monitored_usd) return { value: Number(c.assets_monitored_usd), basis: "Assets on the platform" };
  return { value: null, basis: null };
}

export function KeyFacts({
  company,
  contacts,
  connectable,
  signal,
}: {
  company: Company;
  contacts: number;
  connectable: number;
  /** Replaces the Form ADV fact for books where it says nothing (LPs, SPs). */
  signal?: { label: string; value: React.ReactNode; hint?: string | null };
}) {
  const size = headlineSize(company);
  const staff = company.employee_count ?? company.adv_employee_count ?? null;
  const staffHint = company.employee_count ? "Lusha" : company.adv_employee_count ? "Form ADV" : company.employee_range;
  const us = company.country === "United States";
  const hq = (
    us && company.city
      ? [company.city, company.state]
      : [company.city, company.country]
  )
    .filter(Boolean)
    .join(", ");
  const adv = company.adv_firm_type === "ERA" ? "Exempt reporting" : company.adv_firm_type === "Registered" ? "SEC registered" : null;
  return (
    <div className="sheen grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
      <Fact label="Size" value={size.value != null ? formatUsd(size.value) : company.aum ?? "—"} hint={size.basis} />
      <Fact label="Team" value={staff != null ? staff.toLocaleString("en-US") : company.employee_range ?? "—"} hint={staffHint} />
      <Fact label="Founded" value={company.founded_year ?? "—"} hint={company.years_active ? `${company.years_active} years active` : null} />
      <Fact label="HQ" value={<span className="font-sans text-base font-semibold">{hq || company.hq_location || company.region || "—"}</span>} />
      {signal && !adv ? (
        <Fact label={signal.label} value={signal.value} hint={signal.hint} />
      ) : (
        <Fact
          label="Form ADV"
          value={<span className="font-sans text-base font-semibold">{adv ?? "Not on file"}</span>}
          hint={company.private_fund_count != null ? `${company.private_fund_count} private funds` : company.adv_last_filed ? `Filed ${company.adv_last_filed}` : null}
        />
      )}
      <Fact
        label="Key contacts"
        value={contacts}
        hint={connectable ? `${connectable} with a direct email on file` : contacts ? "Names and titles" : null}
      />
    </div>
  );
}

export function Overview({ company }: { company: Company }) {
  const lines = Array.isArray(company.service_lines) ? company.service_lines : [];
  const lifecycle = new Set(Array.isArray(company.lifecycle) ? company.lifecycle : []);
  const stages = ["Formation", "Fundraising", "Operations", "Value creation", "Exit"];
  const lpFacts: [string, React.ReactNode][] = [];
  if (company.category === "LP") {
    if (company.investor_type) lpFacts.push(["Investor type", company.investor_type]);
    if (company.total_assets_usd) lpFacts.push(["Total assets", formatUsd(Number(company.total_assets_usd))]);
    if (company.alts_allocation_pct != null) lpFacts.push(["Alternatives allocation", `${company.alts_allocation_pct}%`]);
    if (company.discloses_commitments) {
      lpFacts.push([
        "Commitment disclosure",
        company.disclosure_source_url ? (
          <a href={company.disclosure_source_url} target="_blank" rel="noreferrer" className="hover:text-primary">
            {company.discloses_commitments} <ArrowUpRight className="inline h-3 w-3" />
          </a>
        ) : (
          company.discloses_commitments
        ),
      ]);
    }
  }
  const hasAnything = company.description || lines.length || lifecycle.size || lpFacts.length || company.directory_vertical || company.industry;
  if (!hasAnything) return null;
  return (
    <Panel icon={<FileText className="h-4 w-4" />} title="Overview">
      <div className="space-y-5 p-5">
        {company.description ? <p className="max-w-[75ch] text-[15px] leading-relaxed text-foreground/85">{company.description}</p> : null}
        {(company.directory_vertical || company.industry) ? (
          <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {company.directory_vertical ? (
              <div>
                <dt className="eyebrow">Vertical</dt>
                <dd className="mt-1">{company.directory_vertical}</dd>
              </div>
            ) : null}
            {company.industry ? (
              <div>
                <dt className="eyebrow">Industry (Lusha)</dt>
                <dd className="mt-1">{company.industry}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        {lpFacts.length ? (
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {lpFacts.map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="mt-1">{v}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {lifecycle.size ? (
          <div>
            <p className="eyebrow">Fund lifecycle coverage</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stages.map((s) => {
                const on = lifecycle.has(s);
                return (
                  <span
                    key={s}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                      on ? "border-primary/40 bg-accent text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {on ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {s}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}
        {lines.length ? (
          <div>
            <p className="eyebrow">Service lines</p>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              {lines.map((l) => (
                <div key={l.name} className="rounded-xl border bg-background/50 p-4">
                  <p className="font-semibold">{l.name}</p>
                  {l.description ? <p className="mt-1 text-sm text-muted-foreground">{l.description}</p> : null}
                  {l.capabilities?.length ? (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {l.capabilities.map((cap) => (
                        <span key={cap} className="rounded-md border bg-card px-1.5 py-0.5 text-[11.5px] text-foreground/80">
                          {cap}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function ProviderRow({ r }: { r: FiledProvider }) {
  const where = r.provider_locations.length ? `Office: ${r.provider_locations.join("; ")}` : "";
  const filed = r.provider_entities.length ? `Filed as: ${r.provider_entities.join("; ")}` : "";
  return (
    <li className="flex items-baseline gap-3 text-sm">
      <Link
        href={r.provider_key ? `/database/providers/${r.provider_key}` : "#"}
        className="min-w-0 flex-1 truncate font-medium hover:text-primary"
        title={[filed, where].filter(Boolean).join("\n") || undefined}
      >
        {r.provider_brand ?? r.provider_entities[0] ?? "Provider"}
      </Link>
      {r.fund_count ? (
        <span className="shrink-0 whitespace-nowrap tabular text-xs text-muted-foreground">
          {r.fund_count} fund{r.fund_count === 1 ? "" : "s"}
        </span>
      ) : null}
    </li>
  );
}

const SHOWN = 8;

/** The first few providers in a role, the rest a click away. */
function ProviderRows({ rows }: { rows: FiledProvider[] }) {
  return (
    <>
      <ul className="mt-2.5 space-y-1.5">
        {rows.slice(0, SHOWN).map((r) => (
          <ProviderRow key={r.id} r={r} />
        ))}
      </ul>
      {rows.length > SHOWN ? (
        <details className="group mt-1.5">
          <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
            <span className="group-open:hidden">Show {rows.length - SHOWN} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {rows.slice(SHOWN).map((r) => (
              <ProviderRow key={r.id} r={r} />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/** A GP's providers from Form ADV Schedule D, one block per role. */
export function FiledProviders({ rows }: { rows: FiledProvider[] }) {
  if (!rows.length) return null;
  const filed = rows.filter((r) => r.source !== "sample");
  const samples = rows.filter((r) => r.source === "sample");
  const byRole = new Map<string, FiledProvider[]>();
  for (const r of filed) {
    const role = normalizeRole(r.role);
    byRole.set(role, [...(byRole.get(role) ?? []), r]);
  }
  const roles = [...PROVIDER_ROLES, "other" as const].filter((r) => byRole.has(r));
  return (
    <Panel
      icon={<Briefcase className="h-4 w-4" />}
      title="Service providers"
      count={filed.length || undefined}
      action={filed[0]?.filed ? <span className="text-xs text-muted-foreground">Form ADV Schedule D · {filed[0].filed}</span> : null}
    >
      {roles.length ? (
        <div className="grid gap-px bg-border md:grid-cols-2">
          {roles.map((role) => (
            <div key={role} className="bg-card p-4">
              <p className="eyebrow">{ROLE_PLURAL[role]}</p>
              <ProviderRows rows={byRole.get(role)!.sort((a, b) => (b.fund_count ?? 0) - (a.fund_count ?? 0))} />
            </div>
          ))}
        </div>
      ) : null}
      {samples.length ? (
        <div className="border-t px-5 py-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Sample links from the original seed (illustrative, not filed):{" "}
            {samples.map((s) => `${s.provider_brand ?? "Provider"} (${s.role ?? "role"})`).join(", ")}
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

export type RoleRank = { role: (typeof PROVIDER_ROLES)[number]; rank: number; clients: number; of: number };

/** For a provider: who files it, and where it ranks. */
export function ProviderClients({
  clients,
  ranks,
  brandKey,
}: {
  clients: ProviderClient[];
  ranks: RoleRank[];
  brandKey: string | null;
}) {
  const filed = clients.filter((c) => c.source !== "sample" && c.client);
  const samples = clients.filter((c) => c.source === "sample" && c.client);
  if (!filed.length && !samples.length) return null;
  const byClient = new Map<string, { client: NonNullable<ProviderClient["client"]>; roles: Set<string>; funds: number }>();
  for (const c of filed) {
    const key = c.client!.id;
    const entry = byClient.get(key) ?? { client: c.client!, roles: new Set<string>(), funds: 0 };
    entry.roles.add(ROLE_LABEL[normalizeRole(c.role)]);
    entry.funds += c.fund_count ?? 0;
    byClient.set(key, entry);
  }
  const list = [...byClient.values()].sort((a, b) => b.funds - a.funds || a.client.name.localeCompare(b.client.name));
  return (
    <Panel
      icon={<Handshake className="h-4 w-4" />}
      title="Clients on Form ADV"
      count={list.length}
      action={
        brandKey ? (
          <Link href={`/database/providers/${brandKey}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            Provider page <ArrowUpRight className="inline h-3 w-3" />
          </Link>
        ) : null
      }
    >
      {ranks.length ? (
        <div className="flex flex-wrap gap-2 border-b px-5 py-3">
          {ranks.map((r) => (
            <span key={r.role} className="rounded-full border bg-accent/40 px-2.5 py-1 text-xs">
              <span className="font-semibold">#{r.rank}</span> {ROLE_LABEL[r.role].toLowerCase()} ·{" "}
              <span className="tabular">{r.clients}</span> of {r.of.toLocaleString("en-US")} managers
            </span>
          ))}
        </div>
      ) : null}
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/60 text-xs text-muted-foreground backdrop-blur">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Manager</th>
              <th className="px-3 py-2 text-left font-medium">Engaged as</th>
              <th className="px-5 py-2 text-right font-medium">Funds</th>
            </tr>
          </thead>
          <tbody>
            {list.map(({ client, roles, funds }) => (
              <tr key={client.id} className="border-t hover:bg-muted/30">
                <td className="px-5 py-2">
                  <Link href={`/companies/${client.id}`} className="inline-flex items-center gap-2 font-medium hover:text-primary">
                    <CompanyLogo name={client.name} domain={client.domain} size={22} />
                    {client.name}
                  </Link>
                  {client.sub_type ? <span className="ml-2 text-xs text-muted-foreground">{client.sub_type}</span> : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{[...roles].join(", ")}</td>
                <td className="px-5 py-2 text-right tabular">{funds || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {samples.length ? (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">
          Sample links from the original seed (illustrative, not filed):{" "}
          {samples.map((s) => `${s.client!.name} (${s.role ?? "role"})`).join(", ")}
        </p>
      ) : null}
    </Panel>
  );
}

type NamedCommitment = DisclosedCommitment & { fund_label: string | null; lp_label: string | null; gp_label: string | null };

function Amount({ c }: { c: DisclosedCommitment }) {
  if (c.amount != null && c.currency) {
    const n = c.amount;
    const short = n >= 1e9 ? `${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n.toLocaleString("en-US");
    const upTo = c.amount_text?.toLowerCase().startsWith("up to");
    return (
      <span title={c.amount_text ?? undefined}>
        {upTo ? <span className="mr-1 font-sans text-xs font-normal text-muted-foreground">up to</span> : null}
        {c.currency} {short}
      </span>
    );
  }
  if (c.amount_usd != null) return <>{formatUsd(c.amount_usd)}</>;
  return <span className="font-sans text-xs font-normal text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>;
}

/** Public commitments — as the LP that made them or the manager that won them. */
export function Commitments({ rows, as }: { rows: NamedCommitment[]; as: "lp" | "gp" }) {
  if (!rows.length) return null;
  return (
    <Panel
      icon={<Landmark className="h-4 w-4" />}
      title={as === "lp" ? "Commitments made" : "Commitments received"}
      count={rows.length}
      action={<span className="text-xs text-muted-foreground">Amounts in their own currency, never converted</span>}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Fund</th>
              <th className="px-3 py-2 text-left font-medium">{as === "lp" ? "Manager" : "LP"}</th>
              <th className="px-3 py-2 text-left font-medium">When</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-5 py-2 text-left font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const otherId = as === "lp" ? c.gp_company_id : c.lp_company_id;
              const otherName = as === "lp" ? c.gp_label : c.lp_label;
              return (
                <tr key={c.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-5 py-2.5 font-medium">
                    {c.fund_id ? (
                      <Link href={`/funds/${c.fund_id}`} className="hover:text-primary">
                        {c.fund_label ?? "—"}
                      </Link>
                    ) : (
                      c.fund_label ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {otherId ? (
                      <Link href={`/companies/${otherId}`} className="hover:text-primary">
                        {otherName ?? "—"}
                      </Link>
                    ) : (
                      otherName ?? "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                    {c.commitment_date_text ?? c.commitment_date ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular font-medium">
                    <Amount c={c} />
                  </td>
                  <td className="px-5 py-2.5 text-xs text-muted-foreground">
                    {c.source === "sample" ? (
                      <span className="rounded border border-dashed px-1.5 py-0.5">Sample</span>
                    ) : c.source_url ? (
                      <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-primary">
                        {c.disclosure_type ?? "Source"} <ArrowUpRight className="h-3 w-3" />
                      </a>
                    ) : (
                      c.disclosure_type ?? "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export function AdvPanel({ company }: { company: Company }) {
  const entities = Array.isArray(company.adv_entities) ? company.adv_entities : [];
  if (!company.sec_crd && !entities.length) return null;
  const facts: [string, string | null][] = [
    ["Regulatory AUM (this entity)", company.regulatory_aum_usd ? formatUsd(Number(company.regulatory_aum_usd)) : null],
    [
      "Regulatory AUM (brand)",
      company.brand_aum_total_usd
        ? `${formatUsd(Number(company.brand_aum_total_usd))}${company.brand_entity_count ? ` · ${company.brand_entity_count} entities` : ""}`
        : null,
    ],
    ["Private fund gross assets", company.private_fund_gross_assets ? formatUsd(Number(company.private_fund_gross_assets)) : null],
    ["Private funds", company.private_fund_count != null ? String(company.private_fund_count) : null],
    ["Employees (ADV)", company.adv_employee_count != null ? company.adv_employee_count.toLocaleString("en-US") : null],
    ["Last filed", company.adv_last_filed ?? null],
  ];
  return (
    <Panel
      icon={<ScrollText className="h-4 w-4" />}
      title="Form ADV"
      action={
        company.adv_source_url ? (
          <a href={company.adv_source_url} target="_blank" rel="noreferrer" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            IAPD <ArrowUpRight className="inline h-3 w-3" />
          </a>
        ) : null
      }
    >
      <dl className="grid gap-px bg-border sm:grid-cols-3">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="bg-card px-5 py-3">
              <dt className="eyebrow">{k}</dt>
              <dd className="figure mt-1.5 text-lg">{v}</dd>
            </div>
          ))}
      </dl>
      {entities.length ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Filing entity</th>
                <th className="px-3 py-2 text-left font-medium">CRD</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Regulatory AUM</th>
                <th className="px-5 py-2 text-left font-medium">Filed</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={`${e.crd}-${e.entity}`} className="border-t">
                  <td className="px-5 py-2 font-medium">{e.entity ?? "—"}</td>
                  <td className="px-3 py-2 tabular">
                    {e.source_url ? (
                      <a href={e.source_url} target="_blank" rel="noreferrer" className="hover:text-primary">
                        {e.crd ?? "—"}
                      </a>
                    ) : (
                      e.crd ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{e.firm_type === "ERA" ? "Exempt reporting" : e.firm_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular">{e.regulatory_aum_usd ? formatUsd(e.regulatory_aum_usd) : "—"}</td>
                  <td className="px-5 py-2 text-muted-foreground">{e.last_filed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">
        Regulatory AUM is reported per SEC-registered entity; exempt reporting advisers report private fund gross assets instead.
        The match to an entity comes from the Master Directory — check the CRD if a figure looks off.
      </p>
    </Panel>
  );
}

export function SimilarFirms({ hits, companyId }: { hits: SimilarHit[]; companyId: string }) {
  if (!hits.length) return null;
  return (
    <Panel
      icon={<Sparkles className="h-4 w-4" />}
      title="Similar firms"
      action={
        <Link href={`/database?like=${companyId}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          See all <ArrowUpRight className="inline h-3 w-3" />
        </Link>
      }
    >
      <ul className="divide-y">
        {hits.map((h) => (
          <li key={h.record.id} className="px-5 py-3">
            <div className="flex items-center gap-2.5">
              <CompanyLogo name={h.record.name} domain={h.record.domain} size={28} />
              <Link href={`/companies/${h.record.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-primary">
                {h.record.name}
              </Link>
              <CategoryBadge category={h.record.category} />
              <span className="tabular text-xs text-muted-foreground">{h.score}</span>
            </div>
            {h.reasons[0] ? <p className="mt-1 truncate pl-[38px] text-xs text-muted-foreground">{h.reasons[0]}</p> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}


export function ConnectableBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded border px-1.5 py-px text-[10px] font-medium text-[var(--success)]"
      title="The team's master sheet holds a direct email for this person. The import keeps only that yes/no, not the address, so it is not shown here."
    >
      <Mail className="h-2.5 w-2.5" /> Email in master sheet
    </span>
  );
}
