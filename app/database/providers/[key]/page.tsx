import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Building2, Landmark, MapPin } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { filers, leagueTable } from "@/lib/directory/market";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/directory/providers";
import { getBrandLinks, listDirectoryLists } from "@/lib/directory/queries";
import { packIndex } from "@/lib/directory/records";
import { ProviderClientsTable, type ClientMeta } from "@/components/directory/provider-clients-table";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const index = await getDirectoryIndex();
  const brand = index.brands.find((b) => b.key === key);
  return { title: brand ? `${brand.name} — providers — LPGP Connect` : "Provider — LPGP Connect" };
}

/** Distinct values with counts; spellings that differ only in case or
 *  spacing count as one. */
function tally(values: string[]): [string, number][] {
  const m = new Map<string, { label: string; n: number }>();
  for (const v of values) {
    const key = v.replace(/\s+/g, " ").trim().toUpperCase();
    if (!key) continue;
    const e = m.get(key) ?? { label: v.replace(/\s+/g, " ").trim(), n: 0 };
    e.n += 1;
    m.set(key, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n).map((e) => [e.label, e.n]);
}

export default async function ProviderPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [index, links, user, lists] = await Promise.all([
    getDirectoryIndex(),
    getBrandLinks(key),
    getSessionUser(),
    listDirectoryLists(),
  ]);
  const brandIndex = index.brands.findIndex((b) => b.key === key);
  const brand = index.brands[brandIndex];
  if (!brand || !links.length) notFound();

  const filed = links.filter((l) => l.source !== "sample");
  const meta: Record<string, ClientMeta> = {};
  for (const l of filed) {
    if (!l.client_company_id) continue;
    const m = meta[l.client_company_id] ?? { roles: [], funds: 0, examples: [] };
    const role = ROLE_LABEL[normalizeRole(l.role)];
    if (!m.roles.includes(role)) m.roles.push(role);
    m.funds += l.fund_count ?? 0;
    for (const e of l.fund_examples) if (m.examples.length < 3 && !m.examples.includes(e)) m.examples.push(e);
    meta[l.client_company_id] = m;
  }
  const managers = filers(index.records);
  const ranks = PROVIDER_ROLES.map((role) => {
    const league = leagueTable(managers, index.brands, role, 10_000);
    const at = league.rows.findIndex((r) => r.brandIndex === brandIndex);
    return at >= 0 ? { role, rank: at + 1, clients: league.rows[at].clients, of: league.covered, share: league.rows[at].share } : null;
  }).filter(Boolean) as { role: (typeof PROVIDER_ROLES)[number]; rank: number; clients: number; of: number; share: number }[];

  const funds = filed.reduce((a, l) => a + (l.fund_count ?? 0), 0);
  const entities = tally(filed.flatMap((l) => l.provider_entities));
  const locations = tally(filed.flatMap((l) => l.provider_locations));
  const clientIds = new Set(Object.keys(meta));
  const packed = packIndex({
    ...index,
    records: index.records.filter((r) => clientIds.has(r.id)).map((r) => ({ ...r, description: null, lines: null })),
    brands: [],
  });

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-8 space-y-6">
      <Link href="/database/market" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Market map
      </Link>

      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Service provider · Form ADV</p>
          <h1 className="display mt-1 text-[28px] leading-tight md:text-[34px]">{brand.name}</h1>
          <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">
            Named by {Object.keys(meta).length.toLocaleString("en-US")} managers in their Form ADV Schedule D filings, across{" "}
            {funds.toLocaleString("en-US")} private funds.
          </p>
        </div>
        {brand.companyId ? (
          <Link
            href={`/companies/${brand.companyId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <Building2 className="h-4 w-4" /> Directory profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>

      {ranks.length ? (
        <div className="flex flex-wrap gap-3">
          {ranks.map((r) => (
            <Link
              key={r.role}
              href={`/database/market?role=${r.role}`}
              className="lift sheen min-w-[190px] flex-1 rounded-2xl border bg-card p-4 sm:max-w-[260px]"
            >
              <p className="eyebrow">{ROLE_LABEL[r.role]}</p>
              <p className="figure mt-2 text-2xl">#{r.rank}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.clients} of {r.of.toLocaleString("en-US")} managers · {Math.round(r.share * 100)}%
              </p>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">Clients</h2>
            <span className="text-sm text-muted-foreground">({Object.keys(meta).length})</span>
          </div>
          <ProviderClientsTable
            packed={packed}
            meta={meta}
            lists={lists.map((l) => ({ id: l.id, name: l.name, item_count: l.item_count }))}
            isAdmin={user?.role === "admin"}
            signedIn={Boolean(user)}
          />
        </div>
        <div className="space-y-6">
          <section className="sheen rounded-2xl border bg-card">
            <div className="border-b px-5 py-3.5">
              <h2 className="font-semibold">Filed as</h2>
              <p className="text-xs text-muted-foreground">The legal names managers used for this provider</p>
            </div>
            <ul className="max-h-80 divide-y overflow-y-auto">
              {entities.map(([name, n]) => (
                <li key={name} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
                  <span className="min-w-0 truncate" title={name}>
                    {name}
                  </span>
                  <span className="tabular text-xs text-muted-foreground">{n}</span>
                </li>
              ))}
            </ul>
          </section>
          {locations.length ? (
            <section className="sheen rounded-2xl border bg-card">
              <div className="flex items-center gap-2 border-b px-5 py-3.5">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-semibold">Offices named</h2>
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto">
                {locations.slice(0, 20).map(([name, n]) => (
                  <li key={name} className="flex items-baseline justify-between gap-3 px-5 py-2 text-sm">
                    <span className="truncate">{name}</span>
                    <span className="tabular text-xs text-muted-foreground">{n}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
