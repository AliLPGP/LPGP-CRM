"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { FacetChips, FacetMenu, type FacetOption } from "@/components/intel/facet-menu";
import { Box, Empty, Src, Tag } from "@/components/intel/ui";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { CompanyFund } from "@/lib/directory/queries";
import { formatUsd } from "@/lib/utils";
import { MORE_BUTTON } from "./profile-sections";

const ROLES = [
  ["auditor", "Auditor"],
  ["administrator", "Administrator"],
  ["custodian", "Custodian"],
  ["prime_broker", "Prime broker"],
] as const;

function Providers({ fund, role }: { fund: CompanyFund; role: string }) {
  const list = fund.service_providers.filter((p) => p.role === role);
  if (!list.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {list.slice(0, 3).map((p) => (
        <Link key={p.key} href={`/database/providers/${p.key}`} className="inline-flex items-center gap-1.5 hover:underline">
          <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={16} />
          <span className="truncate">{p.brand}</span>
        </Link>
      ))}
      {list.length > 3 ? <span className="text-[11px] text-muted-foreground">+{list.length - 3} more</span> : null}
    </span>
  );
}

/** Distinct values of one field across the lineup, most common first, as facet options. */
function facetOf(funds: CompanyFund[], pick: (f: CompanyFund) => (string | null | undefined)[]): FacetOption[] {
  const m = new Map<string, number>();
  for (const f of funds) for (const k of new Set(pick(f).filter((x): x is string => Boolean(x)))) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([key, count]) => ({ key, label: key, count }));
}

/**
 * The manager's funds with who services each — the Schedule D view a sales
 * conversation actually needs ("which of their funds does Citco administer?").
 * The filters are a bar of facet menus over the whole lineup; the table is
 * the desk ledger.
 */
export function FundLineup({
  funds,
  reported,
  sourceUrl,
}: {
  funds: CompanyFund[];
  /** Private funds the manager reports on Form ADV, when known. */
  reported: number | null;
  sourceUrl: string | null;
}) {
  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<string[]>([]);
  const [domiciles, setDomiciles] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [limit, setLimit] = useState(25);

  // Counts over the whole lineup, so a ticked value never vanishes from its menu.
  const facets = useMemo(
    () => ({
      kinds: facetOf(funds, (f) => [f.vehicle_kind]),
      domiciles: facetOf(funds, (f) => [f.domicile]),
      brands: facetOf(funds, (f) => f.service_providers.map((p) => p.brand)),
    }),
    [funds],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return funds.filter(
      (f) =>
        (!kinds.length || (f.vehicle_kind != null && kinds.includes(f.vehicle_kind))) &&
        (!domiciles.length || (f.domicile != null && domiciles.includes(f.domicile))) &&
        (!brands.length || f.service_providers.some((p) => brands.includes(p.brand))) &&
        (!needle || f.name.toLowerCase().includes(needle) || f.service_providers.some((p) => p.brand.toLowerCase().includes(needle))),
    );
  }, [funds, q, kinds, domiciles, brands]);

  if (!funds.length) return null;
  const adv = funds.filter((f) => f.source === "form_adv").length;
  const chips = [
    ...kinds.map((k) => ({ key: `kind:${k}`, label: k, remove: () => setKinds(kinds.filter((x) => x !== k)) })),
    ...domiciles.map((k) => ({ key: `dom:${k}`, label: k, remove: () => setDomiciles(domiciles.filter((x) => x !== k)) })),
    ...brands.map((k) => ({ key: `brand:${k}`, label: k, remove: () => setBrands(brands.filter((x) => x !== k)) })),
  ];
  const clearAll = () => {
    setKinds([]);
    setDomiciles([]);
    setBrands([]);
  };

  return (
    <Box
      id="funds"
      title="Fund lineup"
      count={`${funds.length.toLocaleString("en-US")}${reported && reported > funds.length ? ` named of ${reported.toLocaleString("en-US")} reported` : ""}`}
      flush
      defn="The manager's private funds as named on Form ADV Schedule D, with the auditor, administrator, custodian and prime broker it names for each; funds added by hand sit beside them."
      action={
        adv ? (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {adv.toLocaleString("en-US")} on Form ADV Schedule D
            <Src url={sourceUrl} name="Filing" />
          </span>
        ) : null
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
        {funds.length > 8 ? (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Fund or provider…"
              aria-label="Search the lineup"
              className="h-8 w-52 rounded-[4px] border border-input bg-card pl-7 pr-2 text-[12.5px] outline-none focus-visible:border-ring"
            />
          </div>
        ) : null}
        <FacetMenu label="Vehicle" groups={[{ label: "", options: facets.kinds }]} selected={kinds} onChange={setKinds} width={240} />
        <FacetMenu label="Domicile" groups={[{ label: "", options: facets.domiciles }]} selected={domiciles} onChange={setDomiciles} width={240} />
        <FacetMenu label="Provider" groups={[{ label: "", options: facets.brands }]} selected={brands} onChange={setBrands} />
        <span className="figure ml-auto text-[11px] text-muted-foreground">
          {shown.length.toLocaleString("en-US")} of {funds.length.toLocaleString("en-US")}
        </span>
      </div>
      {chips.length ? (
        <div className="border-b px-3 py-2">
          <FacetChips chips={chips} onClearAll={clearAll} />
        </div>
      ) : null}
      <div className="desk-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Fund</th>
              {ROLES.map(([, label]) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((f) => (
              <tr key={f.id} className="align-top">
                <td className="max-w-[340px]">
                  <Link href={`/funds/${f.id}`} className="font-medium hover:underline" title={f.name_filed ?? undefined}>
                    {f.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                    {f.vehicle_kind ? <Tag>{f.vehicle_kind}</Tag> : null}
                    {f.domicile ? <Tag>{f.domicile}</Tag> : null}
                    {f.currency ? <Tag>{f.currency}</Tag> : null}
                    {f.fund_size_usd != null ? <span className="figure">{formatUsd(f.fund_size_usd)}</span> : null}
                    {f.vintage_year ? <span>Vintage {f.vintage_year}</span> : null}
                  </div>
                </td>
                {ROLES.map(([role]) => (
                  <td key={role}>
                    <Providers fund={f} role={role} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <Empty>No fund in the lineup matches these filters. Clear one to widen it.</Empty> : null}
      </div>
      {shown.length > limit ? (
        <div className="border-t px-3 py-2">
          <button type="button" onClick={() => setLimit(limit + 50)} className={MORE_BUTTON}>
            Show {Math.min(50, shown.length - limit)} more
          </button>
        </div>
      ) : null}
    </Box>
  );
}
