"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bookmark, Briefcase, ExternalLink, ListChecks, Mail, Sparkles, Users } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";
import { brandDomain } from "@/lib/directory/brand-domains";
import { EMPTY_FILTERS, type DirectoryFilters } from "@/lib/directory/filters";
import { showcase, type Insights } from "@/lib/directory/insights";
import { PROVIDER_ROLES, ROLE_PLURAL, type ProviderRole } from "@/lib/directory/providers";
import { locationLabel } from "@/lib/directory/records";
import type { WorldGeometry } from "@/lib/directory/world-map";
import type { Category } from "@/lib/types";
import { CompanyLogo } from "@/components/company-logo";
import { cn, formatUsd } from "@/lib/utils";
import type { Directory } from "./use-directory";
import { BarRow, LogoStack, Panel, PanelLink } from "./viz";
import { WorldMap } from "./world-panel";

export type OverviewCommitment = {
  id: string;
  lp: { id: string | null; name: string } | null;
  gp: { id: string | null; name: string } | null;
  fund: string | null;
  fundId: string | null;
  amount: number | null;
  currency: string | null;
  amountText: string | null;
  when: string | null;
  kind: string | null;
  sourceUrl: string | null;
};

const BOOK_ORDER: Category[] = ["GP", "LP", "SP"];

const BOOK_LINE: Record<Category, string> = {
  GP: "Private equity, credit, venture, real assets and hedge fund managers",
  LP: "Pensions, sovereign wealth, insurers, endowments, foundations and family offices",
  SP: "Administrators, auditors, banks, law firms, placement agents and tech",
  UN: "Firms waiting to be placed in a book",
};

function money(amount: number | null, currency: string | null, text: string | null): string {
  if (amount == null) return text ?? "Undisclosed";
  const symbol: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", CHF: "CHF ", CAD: "C$", AUD: "A$", JPY: "¥" };
  const s = currency ? (symbol[currency] ?? `${currency} `) : "";
  return formatUsd(amount).replace("$", s);
}

export function DiscoverOverview({
  dir,
  insights,
  geometry,
  commitments,
  lists,
  saved,
  onApply,
  onQuickLook,
}: {
  dir: Directory;
  insights: Insights;
  geometry: WorldGeometry | null;
  commitments: OverviewCommitment[];
  lists: { id: string; name: string; item_count: number }[];
  saved: { id: string; name: string; query: string | null; filters: Record<string, string> }[];
  onApply: (next: DirectoryFilters) => void;
  onQuickLook: (id: string) => void;
}) {
  const [role, setRole] = useState<ProviderRole>("administrator");
  const apply = (patch: Partial<DirectoryFilters>) => onApply({ ...EMPTY_FILTERS, ...patch });

  const byBook = useMemo(() => {
    const out = new Map<Category, typeof dir.records>();
    for (const r of dir.records) out.set(r.category, [...(out.get(r.category) ?? []), r]);
    return out;
  }, [dir]);

  const typesByBook = useMemo(() => {
    const out = new Map<Category, { key: string; count: number }[]>();
    for (const [book, recs] of byBook) {
      const m = new Map<string, number>();
      for (const r of recs) if (r.subType) m.set(r.subType, (m.get(r.subType) ?? 0) + 1);
      out.set(
        book,
        [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      );
    }
    return out;
  }, [byBook]);

  const gpTypes = typesByBook.get("GP") ?? [];
  const leaders = insights.leaders[role];
  const decadeMax = Math.max(1, ...insights.decades.map((d) => d.count));
  const decades = insights.decades.filter((d) => d.key >= 1950);
  const earlier = insights.decades.filter((d) => d.key < 1950).reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-5">
      {/* Books */}
      <div className="grid gap-4 md:grid-cols-3">
        {BOOK_ORDER.map((book) => {
          const recs = byBook.get(book) ?? [];
          const types = (typesByBook.get(book) ?? []).slice(0, 3);
          const logos = showcase(recs, 7);
          const share = insights.total ? recs.length / insights.total : 0;
          return (
            <button
              key={book}
              type="button"
              onClick={() => apply({ books: [book] })}
              className="sheen lift group flex flex-col rounded-2xl border bg-card p-5 text-left"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">{CATEGORIES[book].name}</p>
                  <p className="figure mt-2 text-[34px] leading-none">{recs.length.toLocaleString("en-US")}</p>
                </div>
                <span className="figure rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
                  {Math.round(share * 100)}%
                </span>
              </div>
              <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{BOOK_LINE[book]}</p>
              <div className="mt-4 space-y-1.5">
                {types.map((t) => (
                  <div key={t.key} className="flex items-center gap-2 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{t.key}</span>
                    <span className="h-1 w-16 overflow-hidden rounded-full bar-track">
                      <span
                        className="block h-full rounded-full bar-fill"
                        style={{ width: `${Math.round((t.count / (types[0]?.count || 1)) * 100)}%` }}
                      />
                    </span>
                    <span className="figure w-9 text-right text-[11.5px] text-muted-foreground">{t.count}</span>
                  </div>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between pt-5">
                <LogoStack items={logos} size={26} max={7} />
                <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                  Browse <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Map + countries */}
      {geometry && insights.countries.length ? (
        <Panel
          eyebrow="Geography"
          title={`Headquarters in ${insights.countries.length} countries`}
          action={<span className="text-xs text-muted-foreground">Circle area = number of firms · click to filter</span>}
          bodyClassName="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]"
        >
          <WorldMap geometry={geometry} counts={insights.countries} onPick={(c) => apply({ countries: [c] })} />
          <div className="space-y-0.5">
            {insights.countries.slice(0, 10).map((c, i) => (
              <BarRow
                key={c.key}
                rank={i + 1}
                label={c.key}
                value={c.count}
                max={insights.countries[0].count}
                onClick={() => apply({ countries: [c.key] })}
              />
            ))}
          </div>
        </Panel>
      ) : null}

      {/* Largest managers + providers */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          eyebrow="League table"
          title="Largest managers by regulatory AUM"
          action={<PanelLink onClick={() => apply({ books: ["GP"], sort: "aum" })}>All by size</PanelLink>}
        >
          <div className="space-y-0.5">
            {insights.largest.map((r, i) => (
              <BarRow
                key={r.id}
                rank={i + 1}
                leading={<CompanyLogo name={r.name} domain={r.domain} size={30} />}
                label={r.name}
                value={r.aum ?? 0}
                display={formatUsd(r.aum)}
                max={insights.largest[0]?.aum ?? 1}
                sub={[r.subType, locationLabel(r), r.adv === "ERA" ? "Exempt reporting" : "SEC registered"].filter(Boolean).join(" · ")}
                onClick={() => onQuickLook(r.id)}
              />
            ))}
            {insights.largest.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No Form ADV sizes on file yet.</p>
            ) : null}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Form ADV regulatory AUM, summed across a brand&rsquo;s SEC-registered entities where it has several.
          </p>
        </Panel>

        <Panel
          eyebrow="Form ADV Schedule D"
          title="Who the managers use"
          action={<PanelLink href="/database/market">Market map</PanelLink>}
        >
          <div className="-mx-1 mb-3 flex flex-wrap gap-1">
            {PROVIDER_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  role === r ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {ROLE_PLURAL[r]}
              </button>
            ))}
          </div>
          <div className="space-y-0.5">
            {leaders.map((l, i) => {
              const b = dir.brands[l.brand];
              const company = b.companyId ? dir.byId.get(b.companyId) : undefined;
              return (
                <BarRow
                  key={b.key}
                  rank={i + 1}
                  leading={<CompanyLogo name={b.name} domain={brandDomain(b.key, company?.domain)} size={30} />}
                  label={b.name}
                  value={l.clients}
                  display={`${l.clients.toLocaleString("en-US")}`}
                  max={leaders[0]?.clients ?? 1}
                  sub={`${Math.round(l.share * 100)}% of the ${insights.roleFilers[role].toLocaleString("en-US")} managers naming ${ROLE_PLURAL[role].toLowerCase()}`}
                  href={`/database/providers/${b.key}`}
                />
              );
            })}
            {leaders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No filed providers in this role yet.</p>
            ) : null}
          </div>
        </Panel>
      </div>

      {/* Strategy, vintage, commitments */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel eyebrow="General partners" title="Strategy mix">
          <div className="space-y-0.5">
            {gpTypes.slice(0, 9).map((t) => (
              <BarRow
                key={t.key}
                label={t.key}
                value={t.count}
                max={gpTypes[0]?.count ?? 1}
                onClick={() => apply({ books: ["GP"], types: [t.key] })}
              />
            ))}
          </div>
        </Panel>

        <Panel eyebrow="General partners" title="Managers founded, by decade">
          <div className="flex h-[210px] items-end gap-1.5 pt-4">
            {decades.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => apply({ books: ["GP"], foundedMin: d.key, foundedMax: d.key + 9 })}
                className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                title={`${d.count} founded in the ${d.key}s`}
              >
                <span className="figure text-[10.5px] text-muted-foreground group-hover:text-foreground">{d.count}</span>
                <span
                  className="w-full rounded-t-md bar-fill opacity-85 transition-opacity group-hover:opacity-100"
                  style={{ height: `${Math.max(3, (d.count / decadeMax) * 150)}px` }}
                />
                <span className="text-[10.5px] text-muted-foreground">{`’${String(d.key).slice(2)}s`}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            {earlier ? `${earlier} founded before 1950 not shown. ` : ""}Founding year from Lusha and firm sources.
          </p>
        </Panel>

        <Panel
          eyebrow="Public disclosures"
          title="Latest LP commitments"
          action={<PanelLink onClick={() => apply({ books: ["LP"], discloses: true })}>Disclosing LPs</PanelLink>}
          bodyClassName="px-0"
        >
          <ul className="divide-y">
            {commitments.slice(0, 7).map((c) => (
              <li key={c.id} className="px-5 py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[13px] font-medium">
                    {c.lp?.id ? (
                      <Link href={`/companies/${c.lp.id}`} className="hover:underline">
                        {c.lp.name}
                      </Link>
                    ) : (
                      c.lp?.name
                    )}
                    <span className="text-muted-foreground"> → </span>
                    {c.gp?.id ? (
                      <Link href={`/companies/${c.gp.id}`} className="hover:underline">
                        {c.gp.name}
                      </Link>
                    ) : (
                      c.gp?.name
                    )}
                  </span>
                  <span className="figure shrink-0 text-[12.5px]">{money(c.amount, c.currency, c.amountText)}</span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-3 text-[11.5px] text-muted-foreground">
                  <span className="truncate">
                    {c.fundId ? (
                      <Link href={`/funds/${c.fundId}`} className="hover:underline">
                        {c.fund}
                      </Link>
                    ) : (
                      c.fund
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {c.when}
                    {c.sourceUrl ? (
                      <a href={c.sourceUrl} target="_blank" rel="noreferrer" title={c.kind ?? "Source"} className="hover:text-foreground">
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
            {commitments.length === 0 ? (
              <li className="px-5 py-6 text-center text-sm text-muted-foreground">No disclosed commitments imported yet.</li>
            ) : null}
          </ul>
        </Panel>
      </div>

      {/* Reach + saved work */}
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel eyebrow="Reach" title="Decision-makers on file" className="lg:col-span-1">
          <div className="grid grid-cols-2 gap-4">
            <button type="button" onClick={() => apply({ hasContacts: true })} className="rounded-xl border p-3 text-left hover:bg-accent/40">
              <Users className="h-4 w-4 text-[var(--brass)]" />
              <p className="figure mt-2 text-2xl">{insights.people.toLocaleString("en-US")}</p>
              <p className="text-[11.5px] text-muted-foreground">key contacts named</p>
            </button>
            <button type="button" onClick={() => apply({ connectable: true })} className="rounded-xl border p-3 text-left hover:bg-accent/40">
              <Mail className="h-4 w-4 text-[var(--success)]" />
              <p className="figure mt-2 text-2xl">{insights.connectable.toLocaleString("en-US")}</p>
              <p className="text-[11.5px] text-muted-foreground">with a direct email</p>
            </button>
            <button type="button" onClick={() => apply({ books: ["GP"], hasOperators: true })} className="rounded-xl border p-3 text-left hover:bg-accent/40">
              <Briefcase className="h-4 w-4 text-[var(--brass)]" />
              <p className="figure mt-2 text-2xl">{insights.operators.toLocaleString("en-US")}</p>
              <p className="text-[11.5px] text-muted-foreground">operating partners at GPs</p>
            </button>
            <button type="button" onClick={() => apply({ books: ["GP"], hasPortcos: true })} className="rounded-xl border p-3 text-left hover:bg-accent/40">
              <Sparkles className="h-4 w-4 text-[var(--brass)]" />
              <p className="figure mt-2 text-2xl">{insights.portcos.toLocaleString("en-US")}</p>
              <p className="text-[11.5px] text-muted-foreground">portfolio companies</p>
            </button>
          </div>
          <PanelLink href="/contacts">Open contacts</PanelLink>
        </Panel>

        <Panel eyebrow="Team" title="Lists" action={<PanelLink href="/database/lists">All lists</PanelLink>} bodyClassName="px-0">
          <ul className="divide-y">
            {lists.slice(0, 5).map((l) => (
              <li key={l.id}>
                <Link href={`/database/lists/${l.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40">
                  <ListChecks className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{l.name}</span>
                  <span className="figure text-xs text-muted-foreground">{l.item_count}</span>
                </Link>
              </li>
            ))}
            {lists.length === 0 ? (
              <li className="px-5 py-5 text-sm text-muted-foreground">
                Select firms in any search and add them to a list — shared with the team.
              </li>
            ) : null}
          </ul>
        </Panel>

        <Panel eyebrow="Team" title="Saved searches" bodyClassName="px-0">
          <ul className="divide-y">
            {saved.slice(0, 5).map((s) => (
              <li key={s.id}>
                <Link
                  href={`/database?${new URLSearchParams(s.filters).toString()}`}
                  className="flex items-center gap-3 px-5 py-2.5 hover:bg-accent/40"
                >
                  <Bookmark className="h-4 w-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{s.name}</span>
                    {s.query ? <span className="block truncate text-[11.5px] text-muted-foreground">{s.query}</span> : null}
                  </span>
                </Link>
              </li>
            ))}
            {saved.length === 0 ? (
              <li className="px-5 py-5 text-sm text-muted-foreground">Run a search and press “Save search” to keep it here.</li>
            ) : null}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
