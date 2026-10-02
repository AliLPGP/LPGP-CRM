"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, type AssetClassKey } from "@/lib/directory/asset-classes";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { PackedFundUniverse } from "@/lib/directory/fund-universe";
import { PROVIDER_ROLES, ROLE_LABEL, type ProviderRole } from "@/lib/directory/providers";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { FUND_SIZE_BANDS, FUNDRAISING_STATUSES, INDUSTRY_BY_CODE, REGION_BY_CODE } from "@/lib/directory/taxonomy";
import { cn, formatUsd } from "@/lib/utils";
import { Figure } from "./viz";

const PAGE = 100;
const COLUMNS: ProviderRole[] = ["auditor", "administrator", "custodian"];

/** The statuses that mean a fund is still taking money. */
const OPEN_STATUSES = new Set<string>(["Pre-marketing", "Raising", "First close", "Interim close"]);

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
  strategyCode: string | null;
  sectorCodes: string[];
  regionCodes: string[];
  sizeBand: string | null;
  status: string | null;
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

/** Counts over a list-valued facet: a fund in two regions counts in both. */
function countsMany(rows: Row[], key: (r: Row) => string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) for (const k of key(r)) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const sectorName = (code: string) => STRATEGY_BY_KEY[code]?.name ?? INDUSTRY_BY_CODE[code]?.name ?? code;
const regionName = (code: string) => REGION_BY_CODE[code]?.name ?? code;
const bandLabel = (key: string) => FUND_SIZE_BANDS.find((b) => b.key === key)?.label ?? key;

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

/** One facet row: the label, an "Any" pill and a pill per value with its count. */
function Facet({
  label,
  value,
  onChange,
  options,
  name,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: [string, number][];
  name?: (key: string) => string;
}) {
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="eyebrow mr-1">{label}</span>
      <Pill on={!value} onClick={() => onChange(null)}>
        Any
      </Pill>
      {options.map(([k, n]) => (
        <Pill key={k} on={value === k} onClick={() => onChange(value === k ? null : k)}>
          {name ? name(k) : k} <span className="figure opacity-70">{n}</span>
        </Pill>
      ))}
    </div>
  );
}

/**
 * Every fund on file — mostly the private funds managers name on Form ADV
 * Schedule D — searchable by name, manager or provider, and faceted by what
 * the fund's own legal name says (vehicle kind, domicile, strategy, sector,
 * region, size band) and, once researched, by its fundraising status.
 *
 * `?strategy=<key>` and `?status=<value>` seed the facets on first render so a
 * link from the navigation opens the right cut; after that the state is local.
 */
export function FundUniverse({ data }: { data: PackedFundUniverse }) {
  const params = useSearchParams();

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
          strategyCode: f[12] ?? null,
          sectorCodes: f[13] ?? [],
          regionCodes: f[14] ?? [],
          sizeBand: f[15] ?? null,
          status: f[16] ?? null,
          text: [f[2], managerName, ...providers.map((p) => data.brands[p.brand]?.[1])].join(" ").toLowerCase(),
        };
      }),
    [data],
  );

  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  const [domicile, setDomicile] = useState<string | null>(null);
  const [strategyKey, setStrategyKey] = useState<string | null>(() => {
    const v = params.get("strategy");
    return v && STRATEGY_BY_KEY[v] ? v : null;
  });
  const [sector, setSector] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [sizeBand, setSizeBand] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(() => params.get("status")?.trim() || null);
  const [provider, setProvider] = useState<{ brand: number; role: ProviderRole } | null>(null);
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(
      (r) =>
        (!kind || r.kind === kind) &&
        (!domicile || r.domicile === domicile) &&
        (!strategyKey || r.strategyCode === strategyKey) &&
        (!sector || r.sectorCodes.includes(sector)) &&
        (!region || r.regionCodes.includes(region)) &&
        (!sizeBand || r.sizeBand === sizeBand) &&
        (!status || r.status === status) &&
        (!provider || r.providers.some((p) => p.brand === provider.brand && p.role === provider.role)) &&
        words.every((w) => r.text.includes(w)),
    );
  }, [rows, q, kind, domicile, strategyKey, sector, region, sizeBand, status, provider]);

  const kinds = useMemo(() => counts(rows, (r) => r.kind), [rows]);
  const domiciles = useMemo(() => counts(rows, (r) => r.domicile), [rows]);
  // Strategies grouped by asset class, in the classes' own order; within a
  // class the most-used first.
  const strategyGroups = useMemo(() => {
    const all = counts(rows, (r) => r.strategyCode);
    const byClass = new Map<AssetClassKey, [string, number][]>();
    for (const [k, n] of all) {
      const cls = STRATEGY_BY_KEY[k]?.classKey;
      if (!cls) continue;
      const list = byClass.get(cls) ?? [];
      list.push([k, n]);
      byClass.set(cls, list);
    }
    return ASSET_CLASSES.filter((c) => byClass.has(c.key)).map((c) => ({ cls: c, options: byClass.get(c.key)! }));
  }, [rows]);
  const sectors = useMemo(() => countsMany(rows, (r) => r.sectorCodes), [rows]);
  const regions = useMemo(() => countsMany(rows, (r) => r.regionCodes), [rows]);
  const sizeBands = useMemo(() => {
    const m = new Map(counts(rows, (r) => r.sizeBand));
    return FUND_SIZE_BANDS.filter((b) => m.has(b.key)).map((b) => [b.key, m.get(b.key)!] as [string, number]);
  }, [rows]);
  const statuses = useMemo(() => {
    const order = (s: string) => {
      const i = (FUNDRAISING_STATUSES as readonly string[]).indexOf(s);
      return i < 0 ? FUNDRAISING_STATUSES.length : i;
    };
    return counts(rows, (r) => r.status).sort((a, b) => order(a[0]) - order(b[0]) || b[1] - a[1]);
  }, [rows]);
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
  const withStrategy = rows.filter((r) => r.strategyCode).length;
  const raising = rows.filter((r) => r.status && OPEN_STATUSES.has(r.status)).length;

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

  const strategyOn = strategyKey ? STRATEGY_BY_KEY[strategyKey] : null;

  return (
    <div className="space-y-5">
      <section className="stand rounded-3xl px-5 py-6 md:px-8">
        <div className="stand-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
          <Figure label="Funds on file" value={rows.length.toLocaleString("en-US")} sub={`${adv.toLocaleString("en-US")} named on Form ADV Schedule D`} />
          <Figure label="Managers" value={new Set(rows.map((r) => r.managerName).filter(Boolean)).size.toLocaleString("en-US")} sub="with at least one fund" />
          <Figure label="With a stated strategy" value={withStrategy.toLocaleString("en-US")} sub="by the fund's own name, or as researched" />
          <Figure label="Raising" value={raising.toLocaleString("en-US")} sub="pre-marketing to interim close, as researched" />
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
        <Facet label="Vehicle" value={kind} onChange={setKind} options={kinds} />
        <Facet label="Domicile" value={domicile} onChange={setDomicile} options={domiciles} />
        {strategyGroups.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="eyebrow mr-1">Strategy</span>
            <Pill on={!strategyKey} onClick={() => setStrategyKey(null)}>
              Any
            </Pill>
            {strategyGroups.map(({ cls, options }) => (
              <span key={cls.key} className="inline-flex flex-wrap items-center gap-1.5">
                <span className="ml-1.5 text-[10.5px] uppercase tracking-wide text-muted-foreground/80">{cls.short}</span>
                {options.map(([k, n]) => (
                  <Pill key={k} on={strategyKey === k} onClick={() => setStrategyKey(strategyKey === k ? null : k)}>
                    {STRATEGY_BY_KEY[k]?.name ?? k} <span className="figure opacity-70">{n}</span>
                  </Pill>
                ))}
              </span>
            ))}
          </div>
        ) : null}
        <Facet label="Sector" value={sector} onChange={setSector} options={sectors} name={sectorName} />
        <Facet label="Region" value={region} onChange={setRegion} options={regions} name={regionName} />
        <Facet label="Size band" value={sizeBand} onChange={setSizeBand} options={sizeBands} name={bandLabel} />
        <Facet label="Status" value={status} onChange={setStatus} options={statuses} />
        {status && !statuses.some(([k]) => k === status) ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="eyebrow">Status</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-2 pr-1.5">
              {status} <span className="text-muted-foreground">· none on file</span>
              <button type="button" onClick={() => setStatus(null)} aria-label="Clear status">
                <X className="h-3 w-3" />
              </button>
            </span>
          </div>
        ) : null}
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
          {strategyOn ? (
            <span className="text-xs text-muted-foreground">
              {ASSET_CLASS_BY_KEY[strategyOn.classKey].name} · {strategyOn.name}
            </span>
          ) : null}
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
                      {r.strategyCode ? (
                        <span className="rounded border border-primary/30 px-1.5 text-foreground">{STRATEGY_BY_KEY[r.strategyCode]?.name ?? r.strategyCode}</span>
                      ) : null}
                      {r.regionCodes.map((code) => (
                        <span key={code} className="rounded border px-1.5">
                          {regionName(code)}
                        </span>
                      ))}
                      {r.status ? (
                        <span className={cn("rounded border px-1.5", OPEN_STATUSES.has(r.status) && "border-[var(--brass)] text-foreground")}>{r.status}</span>
                      ) : null}
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
        Luxembourg-domiciled only when its legal name says so; its strategy, sector and region are read from that name, or from
        the researched profile where one is on file; providers are the ones the filing names alongside it. A fundraising status
        appears only once a fund has been researched.
      </p>
    </div>
  );
}
