import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { IntelShell } from "@/components/intel/shell";
import { Box, Empty, Stat, StatStrip } from "@/components/intel/ui";
import { getSessionUser } from "@/lib/auth";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { filers, leagueTable } from "@/lib/directory/market";
import { normalizeRole, PROVIDER_ROLES, ROLE_LABEL } from "@/lib/directory/providers";
import { getBrandLinks, listDirectoryLists } from "@/lib/directory/queries";
import { packIndex } from "@/lib/directory/records";
import { ProviderClientsTable, type ClientMeta } from "@/components/directory/provider-clients-table";

export const dynamic = "force-dynamic";

// One provider brand as the managers' Form ADV filings name it: its rank in
// each league table, the managers that file it and the funds behind them,
// the legal names and offices those filings use. Desk register throughout.

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

function NameList({ rows, limit }: { rows: [string, number][]; limit?: number }) {
  const list = limit ? rows.slice(0, limit) : rows;
  return (
    <ul className="max-h-80 divide-y overflow-y-auto">
      {list.map(([name, n]) => (
        <li key={name} className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-[12px]">
          <span className="min-w-0 truncate" title={name}>
            {name}
          </span>
          <span className="figure text-[11px] text-muted-foreground">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function ProviderPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const [index, links, user, lists] = await Promise.all([getDirectoryIndex(), getBrandLinks(key), getSessionUser(), listDirectoryLists()]);
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

  const clients = Object.keys(meta).length;
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
    <IntelShell
      crumbs={[{ href: "/database/market", label: "Service providers" }, { label: brand.name }]}
      kicker="Service provider · Form ADV"
      title={brand.name}
      description={`Named by ${clients.toLocaleString("en-US")} managers in their Form ADV Schedule D filings, across ${funds.toLocaleString("en-US")} private funds. Counts are distinct managers per brand, never filing rows.`}
      actions={
        brand.companyId ? (
          <Link href={`/companies/${brand.companyId}`} className="inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent">
            Directory profile <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null
      }
    >
      <StatStrip>
        <Stat label="Managers naming it" value={clients.toLocaleString("en-US")} basis="distinct filers, brand-level" />
        <Stat label="Private funds" value={funds.toLocaleString("en-US")} basis="across those filings" />
        {ranks.map((r) => (
          <Stat
            key={r.role}
            label={`${ROLE_LABEL[r.role]} rank`}
            value={`#${r.rank}`}
            basis={`${r.clients} of ${r.of.toLocaleString("en-US")} managers · ${Math.round(r.share * 100)}%`}
            href={`/database/market?role=${r.role}`}
            defn={`Place in the ${ROLE_LABEL[r.role].toLowerCase()} league table: managers whose Form ADV names this brand in that role, out of every manager that names any ${ROLE_LABEL[r.role].toLowerCase()}.`}
          />
        ))}
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Box title="Clients" count={clients} defn="The managers whose filings name this provider, with the role, the funds and examples per manager." className="min-w-0">
          <ProviderClientsTable packed={packed} meta={meta} lists={lists.map((l) => ({ id: l.id, name: l.name, item_count: l.item_count }))} isAdmin={user?.role === "admin"} signedIn={Boolean(user)} />
        </Box>
        <div className="space-y-4">
          <Box title="Filed as" count={entities.length} flush defn="The legal names managers used for this provider on Schedule D.">
            {entities.length ? <NameList rows={entities} /> : <Empty>No legal name on file: every link to this brand came from the seed, not a filing.</Empty>}
          </Box>
          <Box title="Offices named" count={locations.length} flush defn="The provider locations the filings give, most-named first.">
            {locations.length ? <NameList rows={locations} limit={20} /> : <Empty>No office named in a filing yet.</Empty>}
          </Box>
        </div>
      </div>
    </IntelShell>
  );
}
