"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { PackedFundUniverse } from "@/lib/directory/fund-universe";
import { PROVIDER_ROLES, ROLE_LABEL, type ProviderRole } from "@/lib/directory/providers";
import { cn, formatUsd } from "@/lib/utils";
import { Figure } from "./viz";

const PAGE = 100;
const COLUMNS: ProviderRole[] = ["auditor", "administrator", "custodian"];

type Row = {
  id: string;
  manager: PackedFundUniverse["managers"][number] | null;
  managerName: string | null;
  name: string;
  kind: string | null;
  domicile: string | null;
  currency: string | null;
  size: number | null;
  vintage: number | null;
  strategy: string | null;
  source: string | null;
  providers: { brand: number; role: ProviderRole }[];
  text: string;
};

function counts(rows: Row[], key: (r: Row) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Every fund on file — mostly the private funds managers name on Form ADV
 * Schedule D — searchable by name, manager or provider, and faceted by what
 * the fund's own legal name says (vehicle kind, domicile).
 */
export function FundUniverse({ data }: { data: PackedFundUniverse }) {
  const rows = useMemo<Row[]>(
    () =>
      data.funds.map((f) => {
        const manager = f[1] >= 0 ? data.managers[f[1]] : null;
        const providers: Row["providers"] = [];
        for (let i = 0; i + 1 < f[10].length; i += 2) {
          providers.push({ brand: f[10][i], role: PROVIDER_ROLES[f[10][i + 1]] ?? "other" });
        }
        const managerName = manager?.[1] ?? f[11];
        return {
          id: f[0],
          manager,
          managerName,
          name: f[2],
          kind: f[3],
          domicile: f[4],
          currency: f[5],
          size: f[6],
          vintage: f[7],
          strategy: f[8],
          source: f[9],
          providers,
          text: [f[2], managerName, ...providers.map((p) => data.brands[p.brand]?.[1])].join(" ").toLowerCase(),
        };
      }),
    [data],
  );

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [domicile, setDomicile] = useState<string | null>(null);
  const [provider, setProvider] = useState<{ brand: number; role: ProviderRole } | null>(null);
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!domicile || r.domicile === domicile) &&
        (!provider || r.providers.some((p) => p.brand === provider.brand && p.role === provider.role)) &&
        words.every((w) => r.text.includes(w)),
    );
  }, [rows, q, kind, domicile, provider]);

  const kinds = useMemo(() => counts(rows, (r) => r.kind), [rows]);
  const domiciles = useMemo(() => counts(rows, (r) => r.domicile), [rows]);
  const managers = useMemo(() => new Set(filtered.map((r) => r.managerName).filter(Boolean)).size, [filtered]);
  const topProviders = useMemo(() => {
    const out = new Map<ProviderRole, [number, number][]>();
    for (const role of COLUMNS) {
      const m = new Map<number, number>();
      for (const r of filtered) for (const p of r.providers) if (p.role === role) m.set(p.brand, (m.get(p.brand) ?? 0) + 1);
      out.set(role, [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5));
    }
    return out;
  }, [filtered]);
  const adv = rows.filter((r) => r.source === "form_adv").length;

  if (!rows.length) {
    return (
      <div className="sheen rounded-2xl border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
        No funds on file yet. Importing the Master Directory loads every fund managers name on Form ADV.
      </div>
    );
  }

  const logo = (brand: number) => {
    const [key, name] = data.brands[brand];
    return <CompanyLogo name={name} domain={brandDomain(key)} size={18} />;
  };

  return (
    <div className="space-y-5">
      <section className="stand rounded-3xl px-5 py-6 md:px-8">
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Figure label="Funds on file" value={rows.length.toLocaleString("en-US")} sub={`${adv.toLocaleString("en-US")} named on Form ADV Schedule D`} />
          <Figure label="Managers" value={new Set(rows.map((r) => r.managerName).filter(Boolean)).size.toLocaleString("en-US")} sub="with at least one fund" />
          <Figure label="Co-investment vehicles" value={(kinds.find(([k]) => k === "Co-investment")?.[1] ?? 0).toLocaleString("en-US")} sub="by the fund's own name" />
          <Figure label="Luxembourg vehicles" value={(domiciles.find(([k]) => k === "Luxembourg")?.[1] ?? 0).toLocaleString("en-US")} sub="SCSp, RAIF and named Lux funds" />
        </div>
      </section>

      <div className="sheen space-y-3 rounded-2xl border bg-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search funds, managers or providers — “credit opportunities”, “KKR”, “Citco”…"
            className="h-11 w-full rounded-xl border border-input bg-background/60 pl-10 pr-3 text-sm outline-none focus-visible:border-ring"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1">Vehicle</span>
          <Pill on={!kind} onClick={() => setKind(null)}>
            Any
          </Pill>
          {kinds.map(([k, n]) => (
            <Pill key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)}>
              {k} <span className="figure opacity-70">{n}</span>
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="eyebrow mr-1">Domicile</span>
          <Pill on={!domicile} onClick={() => setDomicile(null)}>
            Any
          </Pill>
          {domiciles.map(([k, n]) => (
            <Pill key={k} on={domicile === k} onClick={() => setDomicile(domicile === k ? null : k)}>
              {k} <span className="figure opacity-70">{n}</span>
            </Pill>
          ))}
        </div>
        {provider ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="eyebrow">Provider</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-1.5">
              {logo(provider.brand)} {data.brands[provider.brand][1]} · {ROLE_LABEL[provider.role]}
              <button type="button" onClick={() => setProvider(null)} aria-label="Clear provider">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {COLUMNS.map((role) => (
          <div key={role} className="rounded-2xl border bg-card p-4">
            <p className="eyebrow">Top {ROLE_LABEL[role].toLowerCase()}s · these funds</p>
            <div className="mt-2 space-y-1">
              {(topProviders.get(role) ?? []).map(([b, n]) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setProvider({ brand: b, role })}
                  className="flex w-full items-center gap-2 text-left text-[12.5px] hover:underline"
                >
                  {logo(b)}
                  <span className="min-w-0 flex-1 truncate">{data.brands[b][1]}</span>
                  <span className="figure text-[11px] text-muted-foreground">{n.toLocaleString("en-US")}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sheen overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-3 text-sm">
          <span>
            <span className="figure">{filtered.length.toLocaleString("en-US")}</span>{" "}
            <span className="text-muted-foreground">funds · {managers.toLocaleString("en-US")} managers</span>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Fund</th>
                <th className="px-3 py-2.5 text-left font-medium">Manager</th>
                {COLUMNS.map((role) => (
                  <th key={role} className="hidden px-3 py-2.5 text-left font-medium lg:table-cell">
                    {ROLE_LABEL[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, shown).map((r) => (
                <tr key={r.id} className="border-t align-top hover:bg-muted/30">
                  <td className="max-w-[360px] px-5 py-2.5">
                    <Link href={`/funds/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                      {r.kind ? <span className="rounded border px-1.5">{r.kind}</span> : null}
                      {r.domicile ? <span className="rounded border px-1.5">{r.domicile}</span> : null}
                      {r.currency ? <span className="rounded border px-1.5">{r.currency}</span> : null}
                      {r.size != null ? <span className="figure">{formatUsd(r.size)}</span> : null}
                      {r.vintage ? <span>Vintage {r.vintage}</span> : null}
                      {r.strategy ? <span>{r.strategy}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.manager ? (
                      <Link href={`/companies/${r.manager[0]}`} className="inline-flex items-center gap-2 hover:underline">
                        <CompanyLogo name={r.manager[1]} domain={r.manager[2]} size={22} />
                        <span className="max-w-[180px] truncate">{r.manager[1]}</span>
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{r.managerName ?? "—"}</span>
                    )}
                  </td>
                  {COLUMNS.map((role) => {
                    const list = r.providers.filter((p) => p.role === role);
                    return (
                      <td key={role} className="hidden px-3 py-2.5 lg:table-cell">
                        {list.length ? (
                          <span className="flex flex-col gap-1">
                            {list.slice(0, 2).map((p) => (
                              <button
                                key={p.brand}
                                type="button"
                                onClick={() => setProvider(p)}
                                className="inline-flex items-center gap-1.5 text-left hover:underline"
                              >
                                {logo(p.brand)}
                                <span className="max-w-[140px] truncate">{data.brands[p.brand][1]}</span>
                              </button>
                            ))}
                            {list.length > 2 ? <span className="text-[11px] text-muted-foreground">+{list.length - 2}</span> : null}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > shown ? (
          <div className="border-t px-5 py-2.5">
            <button type="button" onClick={() => setShown(shown + PAGE * 2)} className="rounded-md border bg-card px-3 py-1.5 text-xs hover:bg-accent">
              Show {Math.min(PAGE * 2, filtered.length - shown)} more of {filtered.length.toLocaleString("en-US")}
            </button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Fund names are as filed on Form ADV Schedule D, shown in title case. A fund is called a feeder, co-investment vehicle or
        Luxembourg-domiciled only when its legal name says so; providers are the ones the filing names alongside it.
      </p>
    </div>
  );
}
