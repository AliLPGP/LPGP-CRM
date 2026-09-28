"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLink, Layers, Search } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { CompanyFund } from "@/lib/directory/queries";
import { formatUsd } from "@/lib/utils";

const ROLES = [
  ["auditor", "Auditor"],
  ["administrator", "Administrator"],
  ["custodian", "Custodian"],
  ["prime_broker", "Prime broker"],
] as const;

function Providers({ fund, role }: { fund: CompanyFund; role: string }) {
  const list = fund.service_providers.filter((p) => p.role === role);
  if (!list.length) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span className="flex flex-col gap-1">
      {list.slice(0, 3).map((p) => (
        <Link key={p.key} href={`/database/providers/${p.key}`} className="inline-flex items-center gap-1.5 hover:underline">
          <CompanyLogo name={p.brand} domain={brandDomain(p.key)} size={18} />
          <span className="truncate">{p.brand}</span>
        </Link>
      ))}
      {list.length > 3 ? <span className="text-[11px] text-muted-foreground">+{list.length - 3} more</span> : null}
    </span>
  );
}

/**
 * The manager's funds with who services each — the Schedule D view a sales
 * conversation actually needs ("which of their funds does Citco administer?").
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
  const [kind, setKind] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of funds) if (f.vehicle_kind) m.set(f.vehicle_kind, (m.get(f.vehicle_kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [funds]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return funds.filter(
      (f) =>
        (!kind || f.vehicle_kind === kind) &&
        (!needle ||
          f.name.toLowerCase().includes(needle) ||
          f.service_providers.some((p) => p.brand.toLowerCase().includes(needle))),
    );
  }, [funds, q, kind]);

  if (!funds.length) return null;
  const adv = funds.filter((f) => f.source === "form_adv").length;

  return (
    <section id="funds" className="sheen scroll-mt-20 overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">Fund lineup</h2>
          <span className="text-sm text-muted-foreground">
            ({funds.length.toLocaleString("en-US")}
            {reported && reported > funds.length ? ` named of ${reported.toLocaleString("en-US")} reported` : ""})
          </span>
        </div>
        {funds.length > 8 ? (
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Fund or provider…"
              className="h-8 w-full rounded-md border border-input bg-card pl-8 pr-2 text-xs outline-none focus-visible:border-ring"
            />
          </div>
        ) : null}
      </div>
      {kinds.length ? (
        <div className="flex flex-wrap gap-1.5 border-b px-5 py-2.5">
          <button
            type="button"
            onClick={() => setKind(null)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${kind === null ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            All
          </button>
          {kinds.map(([k, n]) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(kind === k ? null : k)}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${kind === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {k} <span className="figure opacity-70">{n}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-5 py-2 text-left font-medium">Fund</th>
              {ROLES.map(([, label]) => (
                <th key={label} className="px-3 py-2 text-left font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, limit).map((f) => (
              <tr key={f.id} className="border-t align-top">
                <td className="max-w-[320px] px-5 py-2.5">
                  <Link href={`/funds/${f.id}`} className="font-medium hover:underline" title={f.name_filed ?? undefined}>
                    {f.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                    {f.vehicle_kind ? <span className="rounded border px-1.5">{f.vehicle_kind}</span> : null}
                    {f.domicile ? <span className="rounded border px-1.5">{f.domicile}</span> : null}
                    {f.currency ? <span className="rounded border px-1.5">{f.currency}</span> : null}
                    {f.fund_size_usd != null ? <span className="figure">{formatUsd(f.fund_size_usd)}</span> : null}
                    {f.vintage_year ? <span>Vintage {f.vintage_year}</span> : null}
                  </div>
                </td>
                {ROLES.map(([role]) => (
                  <td key={role} className="px-3 py-2.5">
                    <Providers fund={f} role={role} />
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                  No fund matches that.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-2.5 text-[11.5px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          {adv ? `${adv.toLocaleString("en-US")} named on Form ADV Schedule D.` : null}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
              Filing <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </span>
        {shown.length > limit ? (
          <button type="button" onClick={() => setLimit(limit + 50)} className="rounded-md border bg-card px-2.5 py-1 text-foreground hover:bg-accent">
            Show {Math.min(50, shown.length - limit)} more
          </button>
        ) : null}
      </div>
    </section>
  );
}
