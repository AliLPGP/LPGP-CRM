import { Fragment } from "react";
import Link from "next/link";
import { CircleCheck, CircleDashed, Mail } from "lucide-react";
import type { Company } from "@/lib/types";
import type { FiledProvider, ProviderClient } from "@/lib/directory/queries";
import type { SimilarHit } from "@/lib/directory/similar";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL, ROLE_PLURAL } from "@/lib/directory/providers";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Box, Src, Tag } from "@/components/intel/ui";
import { cn, formatUsd } from "@/lib/utils";

// The Inven-style one-pager, section by section, on the desk register: a
// `Box` per section, `.kv` for facts, `.desk-table` for ledgers, and a `Src`
// on every figure that came from a page. Server components: nothing here
// needs the browser.

/** The one "Show N more" button style every desk screen uses. */
export const MORE_BUTTON = "rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent disabled:opacity-50";

/** A desk action button, level with the facet menus (h-8). */
export const DESK_BUTTON = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12px] hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

/**
 * A tab's content. It fades in over 160 ms (nothing else on a profile is
 * animated) and keeps a floor height, so the tab bar above it never moves
 * while the next tab is loading. Key it by the tab so a switch replays the
 * fade on a fresh node.
 */
export function TabPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("fade-in min-h-[480px] [animation:topnav-in_.16s_ease-out] motion-reduce:[animation:none]", className)}>{children}</div>;
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

export function Overview({ company }: { company: Company }) {
  const lines = Array.isArray(company.service_lines) ? company.service_lines : [];
  const lifecycle = new Set(Array.isArray(company.lifecycle) ? company.lifecycle : []);
  const stages = ["Formation", "Fundraising", "Operations", "Value creation", "Exit"];
  const facts: [string, React.ReactNode][] = [];
  const fact = (k: string, v: React.ReactNode) => facts.push([k, v]);
  if (company.directory_vertical) fact("Vertical", company.directory_vertical);
  if (company.industry) {
    fact(
      "Industry",
      <>
        {company.industry} <span className="text-[10.5px] text-muted-foreground">Lusha</span>
      </>,
    );
  }
  if (company.category === "LP") {
    if (company.investor_type) fact("Investor type", company.investor_type);
    if (company.total_assets_usd) fact("Total assets", <span className="figure">{formatUsd(Number(company.total_assets_usd))}</span>);
    if (company.alts_allocation_pct != null) fact("Alternatives allocation", <span className="figure">{company.alts_allocation_pct}%</span>);
    if (company.discloses_commitments) {
      fact(
        "Commitment disclosure",
        <>
          {company.discloses_commitments} <Src url={company.disclosure_source_url} name="disclosure page" />
        </>,
      );
    }
  }
  const hasAnything = company.description || lines.length || lifecycle.size || facts.length;
  if (!hasAnything) return null;
  return (
    <Box title="Overview">
      <div className="space-y-3">
        {company.description ? <p className="max-w-[80ch] text-[13px] leading-relaxed">{company.description}</p> : null}
        {facts.length ? (
          <dl className="kv text-[12.5px]">
            {facts.map(([k, v]) => (
              <Fragment key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </Fragment>
            ))}
          </dl>
        ) : null}
        {lifecycle.size ? (
          <div>
            <div className="desk-label">Fund lifecycle coverage</div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {stages.map((s) => {
                const on = lifecycle.has(s);
                return (
                  <Tag key={s} strong={on} className={on ? undefined : "opacity-60"}>
                    {on ? <CircleCheck className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                    {s}
                  </Tag>
                );
              })}
            </div>
          </div>
        ) : null}
        {lines.length ? (
          <div>
            <div className="desk-label">Service lines</div>
            <ul className="mt-1.5 divide-y rounded-[4px] border">
              {lines.map((l) => (
                <li key={l.name} className="px-3 py-2">
                  <p className="text-[12.5px] font-medium">{l.name}</p>
                  {l.description ? <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{l.description}</p> : null}
                  {l.capabilities?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {l.capabilities.map((cap) => (
                        <Tag key={cap}>{cap}</Tag>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Box>
  );
}

function ProviderRow({ r }: { r: FiledProvider }) {
  const where = r.provider_locations.length ? `Office: ${r.provider_locations.join("; ")}` : "";
  const filed = r.provider_entities.length ? `Filed as: ${r.provider_entities.join("; ")}` : "";
  return (
    <li className="flex items-baseline gap-3 text-[12.5px]">
      <Link
        href={r.provider_key ? `/database/providers/${r.provider_key}` : "#"}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
        title={[filed, where].filter(Boolean).join("\n") || undefined}
      >
        {r.provider_brand ?? r.provider_entities[0] ?? "Provider"}
      </Link>
      {r.fund_count ? (
        <span className="figure shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
          {r.fund_count} fund{r.fund_count === 1 ? "" : "s"}
        </span>
      ) : null}
    </li>
  );
}

const SHOWN = 8;

/** The first few providers in a role, the rest a click away (no browser state: a `details`). */
function ProviderRows({ rows }: { rows: FiledProvider[] }) {
  return (
    <>
      <ul className="mt-2 space-y-1">
        {rows.slice(0, SHOWN).map((r) => (
          <ProviderRow key={r.id} r={r} />
        ))}
      </ul>
      {rows.length > SHOWN ? (
        <details className="group mt-2">
          <summary className={cn("inline-block cursor-pointer list-none", MORE_BUTTON)}>
            <span className="group-open:hidden">Show {rows.length - SHOWN} more</span>
            <span className="hidden group-open:inline">Show fewer</span>
          </summary>
          <ul className="mt-2 space-y-1">
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
    <Box
      title="Service providers"
      count={filed.length || null}
      flush
      defn="The auditors, administrators, custodians, prime brokers and marketers this manager names for its private funds on Form ADV Schedule D, with how many of its funds each serves."
      action={filed[0]?.filed ? <span className="text-[11px] text-muted-foreground">Form ADV Schedule D · {filed[0].filed}</span> : null}
    >
      {roles.length ? (
        <div className="grid gap-px bg-border md:grid-cols-2">
          {roles.map((role) => (
            <div key={role} className="bg-card p-3">
              <div className="desk-label">{ROLE_PLURAL[role]}</div>
              <ProviderRows rows={byRole.get(role)!.sort((a, b) => (b.fund_count ?? 0) - (a.fund_count ?? 0))} />
            </div>
          ))}
        </div>
      ) : null}
      {samples.length ? (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Sample links from the original seed (illustrative, not filed):{" "}
          {samples.map((s) => `${s.provider_brand ?? "Provider"} (${s.role ?? "role"})`).join(", ")}
        </p>
      ) : null}
    </Box>
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
    <Box
      title="Clients on Form ADV"
      count={list.length}
      flush
      defn="Managers whose Form ADV Schedule D names this firm as a service provider, the role they engage it in, and how many of their private funds it serves."
      action={
        brandKey ? (
          <Link href={`/database/providers/${brandKey}`} className="text-[11.5px] text-muted-foreground hover:text-foreground">
            Provider page
          </Link>
        ) : null
      }
    >
      {ranks.length ? (
        <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
          {ranks.map((r) => (
            <Tag key={r.role} strong>
              <span className="figure">#{r.rank}</span> {ROLE_LABEL[r.role].toLowerCase()} · <span className="figure">{r.clients}</span> of {r.of.toLocaleString("en-US")} managers
            </Tag>
          ))}
        </div>
      ) : null}
      {list.length ? (
        <div className="desk-scroll max-h-[480px] overflow-y-auto">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Engaged as</th>
                <th className="num">Funds</th>
              </tr>
            </thead>
            <tbody>
              {list.map(({ client, roles, funds }) => (
                <tr key={client.id} className="linked">
                  <td>
                    <Link href={`/companies/${client.id}`} className="cover flex items-center gap-2 font-medium">
                      <CompanyLogo name={client.name} domain={client.domain} size={20} />
                      <span className="truncate">{client.name}</span>
                      {client.sub_type ? <span className="text-[11px] font-normal text-muted-foreground">{client.sub_type}</span> : null}
                    </Link>
                  </td>
                  <td className="text-muted-foreground">{[...roles].join(", ")}</td>
                  <td className="num">{funds || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {samples.length ? (
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Sample links from the original seed (illustrative, not filed):{" "}
          {samples.map((s) => `${s.client!.name} (${s.role ?? "role"})`).join(", ")}
        </p>
      ) : null}
    </Box>
  );
}

// The deal and commitment ledgers live in profile-ledgers.tsx: they
// lengthen in the browser, so every row comes with the page and none is
// drawn twice.

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
  ].filter((f): f is [string, string] => Boolean(f[1]));
  return (
    <Box
      title="Form ADV"
      flush
      defn="Regulatory AUM is reported per SEC-registered entity; exempt reporting advisers report private fund gross assets instead. The match to an entity comes from the Master Directory — check the CRD if a figure looks off."
      action={company.adv_source_url ? <Src url={company.adv_source_url} name="IAPD" className="text-[11.5px]" /> : null}
    >
      {facts.length ? (
        <dl className="kv px-3 py-1 text-[12.5px]">
          {facts.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd className="figure">{v}</dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      {entities.length ? (
        <div className={cn("desk-scroll", facts.length && "border-t")}>
          <table className="desk-table">
            <thead>
              <tr>
                <th>Filing entity</th>
                <th>CRD</th>
                <th>Status</th>
                <th className="num">Regulatory AUM</th>
                <th>Filed</th>
              </tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={`${e.crd}-${e.entity}`}>
                  <td className="font-medium">{e.entity ?? "—"}</td>
                  <td className="figure">
                    {e.source_url ? (
                      <a href={e.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                        {e.crd ?? "—"}
                      </a>
                    ) : (
                      (e.crd ?? "—")
                    )}
                  </td>
                  <td className="text-muted-foreground">{e.firm_type === "ERA" ? "Exempt reporting" : (e.firm_type ?? "—")}</td>
                  <td className="num">{e.regulatory_aum_usd ? formatUsd(e.regulatory_aum_usd) : "—"}</td>
                  <td className="text-muted-foreground">{e.last_filed ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Box>
  );
}

export function SimilarFirms({ hits, companyId }: { hits: SimilarHit[]; companyId: string }) {
  if (!hits.length) return null;
  return (
    <Box
      title="Similar firms"
      count={hits.length}
      flush
      defn="Firms the directory scores closest on book, type, size, place and the words in their own overviews. The score is out of 100."
      action={
        <Link href={`/database?like=${companyId}`} className="text-[11.5px] text-muted-foreground hover:text-foreground">
          See all
        </Link>
      }
    >
      <ul className="divide-y">
        {hits.map((h) => (
          <li key={h.record.id}>
            <Link href={`/companies/${h.record.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-accent/40">
              <CompanyLogo name={h.record.name} domain={h.record.domain} size={24} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">{h.record.name}</span>
                {h.reasons[0] ? <span className="block truncate text-[11px] text-muted-foreground">{h.reasons[0]}</span> : null}
              </span>
              <CategoryBadge category={h.record.category} className="rounded-[3px] px-1.5 py-0 text-[10px]" />
              <span className="figure w-6 text-right text-[11px] text-muted-foreground">{h.score}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Box>
  );
}

export function ConnectableBadge() {
  return (
    <span
      className="tag text-[var(--success)]"
      title="The team's master sheet holds a direct email for this person. The import keeps only that yes/no, not the address, so it is not shown here."
    >
      <Mail className="h-2.5 w-2.5" /> Email in master sheet
    </span>
  );
}
