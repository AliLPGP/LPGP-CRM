import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Box, Empty, Src, Stat, StatStrip } from "@/components/intel/ui";
import { ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { CurrencyTotal, LpBook, LpClassSummary, LpCommitment } from "@/lib/directory/lp-profile";
import { formatUsd } from "@/lib/utils";

// An LP's page opens on its book: what it has, where it invests, with whom,
// and how those funds have done — every figure the LP's own disclosure, and
// a card per asset class that opens that class's funds and managers.

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);
const mult = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(2)}x`);

function Totals({ totals, max = 2 }: { totals: CurrencyTotal[]; max?: number }) {
  if (!totals.length) return <span className="text-muted-foreground">Amounts not disclosed</span>;
  return (
    <span className="figure">
      {totals.slice(0, max).map((t, i) => (
        <span key={t.currency}>
          {i ? " · " : ""}
          {formatMoney(t.amount, t.currency)}
        </span>
      ))}
      {totals.length > max ? <span className="text-muted-foreground"> +{totals.length - max}</span> : null}
    </span>
  );
}

function ClassCard({ c, base }: { c: LpClassSummary; base: string }) {
  const top = c.rows
    .slice()
    .sort((a, b) => (b.commitment_year ?? 0) - (a.commitment_year ?? 0))
    .slice(0, 3);
  return (
    <Link href={`${base}?tab=investor&class=${c.key}`} className="sheen group block rounded-[4px] border bg-card p-3 transition-colors hover:bg-accent/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="wordmark text-[10px] text-[var(--brass)]">{ASSET_CLASS_BY_KEY[c.key].short}</div>
          <div className="display mt-1 truncate text-[15px]">{c.name}</div>
        </div>
        <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="desk-label">Funds</dt>
          <dd className="figure text-[15px]">{c.funds}</dd>
        </div>
        <div>
          <dt className="desk-label">Managers</dt>
          <dd className="figure text-[15px]">{c.managers}</dd>
        </div>
        <div>
          <dt className="desk-label defn" data-tip="Median of the net IRRs this LP itself reports for its funds in this class; blank when it reports none.">Net IRR</dt>
          <dd className="figure text-[15px]">{pct(c.medianIrr)}</dd>
        </div>
      </dl>
      <div className="mt-2 truncate text-[11.5px]">
        <Totals totals={c.totals} />
        {c.latestYear ? <span className="text-muted-foreground"> · latest {c.latestYear}</span> : null}
      </div>
      <ul className="mt-2 space-y-0.5 border-t pt-2 text-[11px] text-muted-foreground">
        {top.map((r) => (
          <li key={r.id} className="truncate">
            {r.fund_label ?? "—"}
            {r.gp_label ? <span className="text-muted-foreground/70"> · {r.gp_label}</span> : null}
          </li>
        ))}
      </ul>
    </Link>
  );
}

export function LpOverview({ book, contacts, connectable, base }: { book: LpBook; contacts: number; connectable: number; base: string }) {
  return (
    <div className="space-y-4">

      {book.classes.length ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-medium">What it invests in</h2>
            <span className="text-[11px] text-muted-foreground">
              <span className="figure">{book.funds}</span> funds · <span className="figure">{book.managers}</span> managers · <span className="figure">{book.withPerformance}</span> with a reported IRR or multiple
              {contacts ? <> · <span className="figure">{connectable}</span> of {contacts} people with an email</> : ""}
              {book.unplaced ? ` · ${book.unplaced} not placed in a class` : ""}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {book.classes.map((c) => (
              <ClassCard key={c.key} c={c} base={base} />
            ))}
          </div>
        </div>
      ) : (
        <Box title="What it invests in">
          <Empty>
            No disclosed commitment on file for this investor, so no asset class can be placed. The investor profile tab says what research would fill, and the commitments desk lists every LP that discloses.
          </Empty>
        </Box>
      )}
    </div>
  );
}

// --- The drill-down: one class, its funds, managers and figures ---------------

function ManagerRollup({ rows }: { rows: LpCommitment[] }) {
  const by = new Map<string, { id: string | null; name: string; n: number; totals: Map<string, number>; irr: number[] }>();
  for (const c of rows) {
    const name = c.gp_label ?? "Manager not on file";
    const key = c.gp_company_id ?? `n:${name.toLowerCase()}`;
    const e = by.get(key) ?? { id: c.gp_company_id, name, n: 0, totals: new Map<string, number>(), irr: [] as number[] };
    e.n += 1;
    if (c.amount != null && c.currency) e.totals.set(c.currency, (e.totals.get(c.currency) ?? 0) + Number(c.amount));
    if (c.net_irr != null) e.irr.push(Number(c.net_irr));
    by.set(key, e);
  }
  const list = [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  return (
    <Box title="Managers in this class" count={list.length} flush defn="The general partners behind the funds this LP has committed to in this class, most funds first.">
      <div className="desk-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Manager</th>
              <th className="num">Funds</th>
              <th className="num">Committed</th>
              <th className="num">Net IRR (LP-reported)</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id ?? m.name}>
                <td className="font-medium">
                  {m.id ? (
                    <Link href={`/companies/${m.id}`} className="hover:underline">
                      {m.name}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{m.name}</span>
                  )}
                </td>
                <td className="num">{m.n}</td>
                <td className="num">
                  {m.totals.size ? [...m.totals.entries()].map(([ccy, v], i) => <span key={ccy}>{i ? " · " : ""}{formatMoney(v, ccy)}</span>) : "—"}
                </td>
                <td className="num">{m.irr.length ? pct(m.irr.sort((a, b) => a - b)[Math.floor(m.irr.length / 2)]) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Box>
  );
}

export function LpClassView({ book, cls, base }: { book: LpBook; cls: string; base: string }) {
  const summary = isAssetClassKey(cls) ? book.classes.find((c) => c.key === cls) : undefined;
  const meta = isAssetClassKey(cls) ? ASSET_CLASS_BY_KEY[cls] : null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Link href={`${base}?tab=investor`} className="tag hover:text-foreground">
          All classes
        </Link>
        {book.classes.map((c) => (
          <Link key={c.key} href={`${base}?tab=investor&class=${c.key}`} className={c.key === cls ? "tag tag-strong" : "tag hover:text-foreground"}>
            {c.name} <span className="figure ml-1 text-muted-foreground">{c.commitments}</span>
          </Link>
        ))}
      </div>

      {!summary ? (
        <Box title={meta?.name ?? "Asset class"}>
          <Empty>No disclosed commitment of this investor is placed in {meta?.name ?? "this class"}.</Empty>
        </Box>
      ) : (
        <>
          <StatStrip>
            <Stat label="Commitments" value={summary.commitments} basis={summary.latestYear ? `latest ${summary.latestYear}` : " "} />
            <Stat label="Funds" value={summary.funds} basis={`${summary.managers} manager${summary.managers === 1 ? "" : "s"}`} />
            <Stat label="Committed" value={<Totals totals={summary.totals} max={1} />} basis={summary.totals.length > 1 ? `and ${summary.totals.length - 1} more currenc${summary.totals.length === 2 ? "y" : "ies"}` : "stated amounts, own currency"} />
            <Stat label="Net IRR" value={pct(summary.medianIrr)} basis={summary.withIrr ? `median of ${summary.withIrr} LP-reported` : "none reported"} defn="The median net IRR across the funds in this class for which this LP reports one. Never estimated." />
            <Stat label="Multiple" value={mult(summary.medianMultiple)} basis="median, LP-reported" href={`/database/asset-classes/${summary.slug}`} />
          </StatStrip>

          <Box
            title={`${summary.name}: the funds`}
            count={summary.rows.length}
            flush
            defn="Each fund this LP has disclosed a commitment to in this class, with its manager, the amount in its own currency, and the performance figures the LP itself reports. The sample column is what every LP holding the fund reports, from the performance desk."
          >
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Fund</th>
                    <th>Manager</th>
                    <th className="num">Year</th>
                    <th className="num">Committed</th>
                    <th className="num">Net IRR</th>
                    <th className="num">Multiple</th>
                    <th className="num">Called</th>
                    <th className="num">Sample IRR</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.rows
                    .slice()
                    .sort((a, b) => (b.commitment_year ?? 0) - (a.commitment_year ?? 0) || (a.fund_label ?? "").localeCompare(b.fund_label ?? ""))
                    .map((c) => {
                      const called = c.contributed != null && c.amount != null && Number(c.amount) > 0 ? (Number(c.contributed) / Number(c.amount)) * 100 : null;
                      return (
                        <tr key={c.id} className="align-top">
                          <td className="max-w-[340px] font-medium">
                            {c.fund_id ? (
                              <Link href={`/funds/${c.fund_id}`} className="hover:underline">
                                {c.fund_label ?? "—"}
                              </Link>
                            ) : (
                              (c.fund_label ?? "—")
                            )}
                          </td>
                          <td className="max-w-[220px] text-muted-foreground">
                            {c.gp_company_id ? (
                              <Link href={`/companies/${c.gp_company_id}`} className="hover:underline">
                                {c.gp_label ?? "—"}
                              </Link>
                            ) : (
                              (c.gp_label ?? "—")
                            )}
                          </td>
                          <td className="num text-muted-foreground">{c.commitment_year ?? c.commitment_date_text ?? "—"}</td>
                          <td className="num">{c.amount != null && c.currency ? formatMoney(c.amount, c.currency) : c.amount_usd != null ? formatUsd(c.amount_usd) : <span className="text-[11px] text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>}</td>
                          <td className="num" title={c.as_of ? `as of ${c.as_of}` : undefined}>{pct(c.net_irr)}</td>
                          <td className="num">{mult(c.multiple)}</td>
                          <td className="num">{called != null ? `${called.toFixed(0)}%` : "—"}</td>
                          <td className="num text-muted-foreground" title={c.sample ? `${c.sample.lps} LP${c.sample.lps === 1 ? "" : "s"} report this fund` : undefined}>
                            {c.sample?.net_irr_median != null ? pct(c.sample.net_irr_median) : "—"}
                          </td>
                          <td className="whitespace-nowrap">
                            <Src url={c.source_url} name={c.disclosure_type ?? "source"} asOf={c.as_of} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </Box>

          <ManagerRollup rows={summary.rows} />
        </>
      )}
    </div>
  );
}
