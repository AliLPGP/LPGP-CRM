import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import type { Benchmark } from "@/lib/directory/intelligence-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { ClassMetrics, Quartiles, StrategyMetrics } from "@/lib/directory/strategy-data";
import { METRIC_LABEL } from "@/lib/directory/strategies";
import { formatUsd } from "@/lib/utils";
import { dateLabel, FirmTable } from "./tables";
import { Bar, Box, Empty, Src, Stat, StatStrip, Tag } from "./ui";

// The Strategies tab of an asset class: one row per strategy with the
// directory's own metrics, then the chosen strategy's managers, funds,
// providers and published benchmarks.

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function Q({ q }: { q: Quartiles | null }) {
  if (!q) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="figure" title={`n=${q.n} · min ${formatUsd(q.min)} · Q1 ${formatUsd(q.q1)} · median ${formatUsd(q.median)} · Q3 ${formatUsd(q.q3)} · max ${formatUsd(q.max)}`}>
      {formatUsd(q.median)} <span className="text-[10.5px] text-muted-foreground">med</span>
    </span>
  );
}

export function BenchmarkValue({ b }: { b: Benchmark }) {
  if (b.value == null) return <span className="text-muted-foreground">—</span>;
  if (b.unit === "pct") return <>{b.value}%</>;
  if (b.unit === "bps") return <>{b.value} bps</>;
  if (b.unit === "x") return <>{b.value}x</>;
  if (b.unit === "count") return <>{b.value.toLocaleString("en-US")}</>;
  // A money figure whose currency isn't on record is a plain number, never
  // presented as money in a currency the source didn't state.
  if (!b.unit || b.unit === "other") return <>{b.value.toLocaleString("en-US")}</>;
  return <>{formatMoney(b.value, b.unit)}</>;
}

export function BenchmarkTable({ rows }: { rows: Benchmark[] }) {
  if (!rows.length) return <Empty>No published benchmarks on file yet — “Refresh benchmarks” searches for the latest editions.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>As published</th>
            <th className="num">Value</th>
            <th>Period</th>
            <th>Geography</th>
            <th>Publisher</th>
            <th>Published</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <Tag strong>{METRIC_LABEL[b.metric] ?? b.metric}</Tag>
              </td>
              <td className="max-w-[360px]">
                {b.label}
                {b.note ? <div className="text-[11px] text-muted-foreground">{b.note}</div> : null}
              </td>
              <td className="num">
                <BenchmarkValue b={b} />
              </td>
              <td className="whitespace-nowrap text-muted-foreground">{b.period ?? "—"}</td>
              <td className="text-muted-foreground">{b.geography ?? "—"}</td>
              <td>
                <Src url={b.source_url} name={b.publisher} />
              </td>
              <td className="whitespace-nowrap text-muted-foreground">{dateLabel(b.published_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StrategiesPanel({ metrics, selected, base, domainOf }: { metrics: ClassMetrics; selected: StrategyMetrics | null; base: string; domainOf: (id: string | null) => string | null }) {
  const max = Math.max(1, ...metrics.strategies.map((s) => s.managers.length + s.funds.length));
  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat label="Strategies" value={metrics.strategies.length} basis={`${metrics.unplaced} managers not placed`} defn="A manager is placed in a strategy by what its vertical or overview says it does, or by what its fund names say. Managers whose records say neither stay unplaced." />
        <Stat label="Regulatory AUM, median" value={metrics.raumQuartiles ? formatUsd(metrics.raumQuartiles.median) : "—"} basis={metrics.raumQuartiles ? `Q1 ${formatUsd(metrics.raumQuartiles.q1)} · Q3 ${formatUsd(metrics.raumQuartiles.q3)} · n=${metrics.raumQuartiles.n}` : "no Form ADV sizes"} defn="Distribution of Form ADV regulatory AUM across the class's SEC filers, brand totals counted once." />
        <Stat label="Private funds per manager" value={metrics.privateFunds ? metrics.privateFunds.median : "—"} basis={metrics.privateFunds ? `median · Q3 ${metrics.privateFunds.q3} · max ${metrics.privateFunds.max}` : undefined} defn="Number of private funds each SEC-registered manager reports on Form ADV." />
        <Stat label="Exempt reporting share" value={pct(metrics.eraShare)} basis="of managers with a Form ADV" defn="Exempt reporting advisers file a lighter Form ADV — typically venture and smaller private fund managers." />
        <Stat label="Published benchmarks" value={metrics.classBenchmarks.length + metrics.strategies.reduce((a, s) => a + s.benchmarks.length, 0)} basis="figures with publisher and page" />
      </StatStrip>

      {selected ? (
        <div className="space-y-4">
          <div className="desk-label">Strategy · {selected.strategy.name}</div>
          <StatStrip>
            <Stat label="Managers" value={selected.managers.length} basis={`${selected.managersByText} by their own overview or vertical`} />
            <Stat label="Funds named" value={selected.funds.length} basis="by the fund's own name" />
            <Stat label="Regulatory AUM" value={selected.raum.firms ? formatUsd(selected.raum.sum) : "—"} basis={selected.raum.firms ? `${selected.raum.firms} filers` : undefined} />
            <Stat label="Median size" value={selected.raum.quartiles ? formatUsd(selected.raum.quartiles.median) : "—"} basis={selected.raum.quartiles ? `Q1 ${formatUsd(selected.raum.quartiles.q1)} · Q3 ${formatUsd(selected.raum.quartiles.q3)}` : undefined} />
            <Stat label="ERA share" value={pct(selected.eraShare)} />
          </StatStrip>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <Box title="Managers" count={selected.managers.length} flush>
                <FirmTable firms={selected.managers} limit={60} />
              </Box>
              <Box title="Funds" count={selected.funds.length} flush>
                {selected.funds.length ? (
                  <div className="overflow-x-auto">
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>Fund</th>
                          <th>Manager</th>
                          <th>Vehicle</th>
                          <th>Domicile</th>
                          <th>Administrator</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.funds.slice(0, 80).map((f) => (
                          <tr key={f.id}>
                            <td className="max-w-[340px]">
                              <Link href={`/funds/${f.id}`} className="font-medium">
                                {f.name}
                              </Link>
                            </td>
                            <td className="whitespace-nowrap">{f.manager ? <Link href={`/companies/${f.manager.id}`}>{f.manager.name}</Link> : (f.managerName ?? "—")}</td>
                            <td className="text-muted-foreground">{f.kind ?? "—"}</td>
                            <td className="text-muted-foreground">{f.domicile ?? "—"}</td>
                            <td className="text-[11.5px] text-muted-foreground">{f.providers.filter((p) => p.role === "administrator").map((p) => p.name).join(" · ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {selected.funds.length > 80 ? <p className="px-3 py-2 text-[11px] text-muted-foreground">Showing 80 of {selected.funds.length}.</p> : null}
                  </div>
                ) : (
                  <Empty>No fund names state this strategy.</Empty>
                )}
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="Published benchmarks" count={selected.benchmarks.length} flush>
                <BenchmarkTable rows={selected.benchmarks} />
              </Box>
              <Box title="Providers these managers use">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["Administrators", selected.administrators],
                    ["Auditors", selected.auditors],
                  ].map(([label, rows]) => (
                    <div key={label as string}>
                      <div className="desk-label mb-1.5">{label as string}</div>
                      <ul className="space-y-1">
                        {(rows as { key: string; name: string; clients: number }[]).map((r) => (
                          <li key={r.key}>
                            <Link href={`/database/providers/${r.key}`} className="flex items-center gap-1.5 text-[12px]">
                              <CompanyLogo name={r.name} domain={brandDomain(r.key, domainOf(null))} size={16} />
                              <span className="min-w-0 flex-1 truncate">{r.name}</span>
                              <span className="figure text-[11px] text-muted-foreground">{r.clients}</span>
                            </Link>
                          </li>
                        ))}
                        {(rows as unknown[]).length === 0 ? <li className="text-[11.5px] text-muted-foreground">—</li> : null}
                      </ul>
                    </div>
                  ))}
                </div>
              </Box>
              <Box title="Where they are">
                <ul className="space-y-1 text-[12px]">
                  {selected.countries.map(([c, n]) => (
                    <li key={c} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{c}</span>
                      <Bar value={n} max={selected.countries[0]?.[1] ?? 1} />
                      <span className="figure w-6 text-right text-[11px] text-muted-foreground">{n}</span>
                    </li>
                  ))}
                  {selected.countries.length === 0 ? <li className="text-muted-foreground">—</li> : null}
                </ul>
              </Box>
            </div>
          </div>
        </div>
      ) : null}
      <Box title="Strategies" flush defn="Metrics from the directory's own records: managers placed in the strategy, funds whose names state it, their Form ADV sizes, exempt-reporting share and the administrators they use.">
        <div className="overflow-x-auto">
          <table className="desk-table">
            <thead>
              <tr>
                <th>Strategy</th>
                <th className="num">Managers</th>
                <th className="num">Funds</th>
                <th />
                <th className="num">Reg. AUM</th>
                <th className="num">Median size</th>
                <th className="num">ERA share</th>
                <th>Top administrators</th>
                <th>Top markets</th>
                <th className="num">Benchmarks</th>
              </tr>
            </thead>
            <tbody>
              {metrics.strategies.map((s) => (
                <tr key={s.strategy.key} className={selected?.strategy.key === s.strategy.key ? "bg-accent/40" : undefined}>
                  <td className="max-w-[260px]">
                    <Link href={`${base}?tab=strategies&strategy=${s.strategy.key}`} className="font-medium">
                      {s.strategy.name}
                    </Link>
                    <div className="text-[11px] leading-snug text-muted-foreground">{s.strategy.blurb}</div>
                  </td>
                  <td className="num">{s.managers.length}</td>
                  <td className="num">{s.funds.length}</td>
                  <td>
                    <Bar value={s.managers.length + s.funds.length} max={max} />
                  </td>
                  <td className="num">{s.raum.firms ? formatUsd(s.raum.sum) : "—"}</td>
                  <td className="num">
                    <Q q={s.raum.quartiles} />
                  </td>
                  <td className="num">{pct(s.eraShare)}</td>
                  <td className="text-[11.5px]">{s.administrators.slice(0, 3).map((a) => a.name).join(" · ") || "—"}</td>
                  <td className="text-[11.5px] text-muted-foreground">{s.countries.slice(0, 3).map(([c, n]) => `${c} ${n}`).join(" · ") || "—"}</td>
                  <td className="num">{s.benchmarks.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Box>

      {metrics.classBenchmarks.length ? (
        <Box title="Published benchmarks for the class" count={metrics.classBenchmarks.length} flush>
          <BenchmarkTable rows={metrics.classBenchmarks} />
        </Box>
      ) : null}

    </div>
  );
}
