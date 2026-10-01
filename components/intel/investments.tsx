import Link from "next/link";
import { BadgeCheck, CircleAlert } from "lucide-react";
import { DEAL_KIND_ORDER, KIND_HUE } from "@/components/intel/charts";
import { dateLabel } from "@/components/intel/tables";
import { Empty, Src } from "@/components/intel/ui";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { AMOUNT_BASIS_LABEL, formatMoney, type Deal } from "@/lib/directory/intelligence-types";

// The commitments into one company over time: who put money in, when, how
// much and what the figure is, each with the page that states it. A strip
// of marks on one year axis shows the rhythm; the ledger beneath it says
// everything a mark stands for. Colour carries the kind of deal, in the
// validated slot order, and the legend names every kind shown.

const yearOf = (d: Deal) => (d.date ? Number(d.date.slice(0, 4)) : d.date_text && /\d{4}/.test(d.date_text) ? Number(d.date_text.match(/\d{4}/)![0]) : null);

function KindDot({ kind, size = 8 }: { kind: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: KIND_HUE[kind] ?? "var(--chart-bar)" }} aria-hidden />;
}

/** Marks on a year axis, one per dated deal, coloured by kind. */
export function InvestmentStrip({ deals }: { deals: Deal[] }) {
  const dated = deals.map((d) => ({ d, y: yearOf(d) })).filter((x): x is { d: Deal; y: number } => x.y != null);
  if (dated.length < 2) return null;
  const lo = Math.min(...dated.map((x) => x.y));
  const hi = Math.max(...dated.map((x) => x.y), lo + 1);
  const years: number[] = [];
  for (let y = lo; y <= hi; y++) years.push(y);
  const byYear = new Map<number, Deal[]>();
  for (const x of dated) byYear.set(x.y, [...(byYear.get(x.y) ?? []), x.d]);
  const kinds = DEAL_KIND_ORDER.filter((k) => deals.some((d) => d.kind === k));
  const other = deals.some((d) => !KIND_HUE[d.kind]);
  const tick = years.length > 14 ? 5 : years.length > 7 ? 2 : 1;
  return (
    <div className="px-3 pb-2 pt-3">
      <div className="flex items-end gap-px" role="img" aria-label={dated.map((x) => `${x.y} ${DEAL_KIND_LABEL[x.d.kind] ?? x.d.kind}`).join(", ")}>
        {years.map((y) => {
          const here = byYear.get(y) ?? [];
          return (
            <div key={y} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="flex min-h-[52px] flex-col-reverse items-center justify-start gap-[3px] pb-1">
                {here.map((d) => (
                  <Link
                    key={d.id}
                    href={`/database/deals/${d.id}`}
                    className="grid h-[14px] w-[14px] place-items-center rounded-full hover:bg-accent"
                    title={`${dateLabel(d.date, d.date_text)} · ${DEAL_KIND_LABEL[d.kind] ?? d.kind} · ${d.investor}${d.amount != null ? ` · ${formatMoney(d.amount, d.currency)}` : ""}`}
                  >
                    <KindDot kind={d.kind} size={9} />
                  </Link>
                ))}
              </div>
              <div className="h-px w-full bg-border" />
              <span className="figure mt-1 h-3 text-[10px] leading-none text-muted-foreground">{(y - lo) % tick === 0 || y === hi ? String(y) : ""}</span>
            </div>
          );
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {kinds.map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <KindDot kind={k} />
            {DEAL_KIND_LABEL[k] ?? k}
          </li>
        ))}
        {other ? (
          <li className="flex items-center gap-1.5">
            <KindDot kind="other" />
            Other
          </li>
        ) : null}
      </ul>
    </div>
  );
}

/** Every deal on file for the company, grouped by year, newest first. */
export function InvestmentLedger({ deals }: { deals: Deal[] }) {
  if (!deals.length) return <Empty>No announcement on file for this company yet.</Empty>;
  const groups = new Map<string, Deal[]>();
  for (const d of deals) {
    const y = yearOf(d);
    const k = y ? String(y) : "Undated";
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  const order = [...groups.keys()].sort((a, b) => (a === "Undated" ? 1 : b === "Undated" ? -1 : Number(b) - Number(a)));
  return (
    <div className="divide-y">
      {order.map((y) => (
        <section key={y}>
          <div className="desk-label bg-muted/40 px-3 py-1">{y}</div>
          <ul className="divide-y">
            {groups.get(y)!.map((d) => {
              const basis = d.amount_basis ? (AMOUNT_BASIS_LABEL[d.amount_basis] ?? d.amount_basis) : null;
              return (
                <li key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <KindDot kind={d.kind} />
                        <span className="text-foreground">{DEAL_KIND_LABEL[d.kind] ?? d.kind}</span>
                      </span>
                      {d.round ? <span>{d.round}</span> : null}
                      <span>{dateLabel(d.date, d.date_text)}</span>
                    </div>
                    <Link href={`/database/deals/${d.id}`} className="mt-0.5 block font-medium leading-snug hover:underline">
                      {d.headline}
                    </Link>
                    <div className="mt-0.5 text-[11.5px] leading-snug">
                      {d.investor_company_id ? <Link href={`/companies/${d.investor_company_id}?tab=portfolio`}>{d.investor}</Link> : <span>{d.investor}</span>}
                      {d.co_investors?.length ? <span className="text-muted-foreground"> with {d.co_investors.join(", ")}</span> : null}
                      {d.seller ? <span className="text-muted-foreground"> · from {d.seller}</span> : null}
                    </div>
                    {d.evidence ? <p className="mt-1 line-clamp-2 border-l-2 pl-2 text-[11.5px] leading-snug text-muted-foreground">{d.evidence}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 text-right">
                    {d.amount != null ? (
                      <span className="figure text-[14px] leading-tight">{formatMoney(d.amount, d.currency)}</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">amount not stated</span>
                    )}
                    {d.amount != null && basis ? <span className="text-[10.5px] text-muted-foreground">{basis}</span> : null}
                    {d.stake_pct != null ? <span className="figure text-[11px] text-muted-foreground">{d.stake_pct}% stake</span> : null}
                    <span className="flex items-center gap-1.5">
                      {d.verified ? (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground" title="Re-read against the source page before it was stored">
                          <BadgeCheck className="h-3 w-3" /> checked
                        </span>
                      ) : d.verified === false ? (
                        <span className="inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground" title="The source page could not be re-read when the figure was checked">
                          <CircleAlert className="h-3 w-3" /> unchecked
                        </span>
                      ) : null}
                      <Src url={d.source_url} name={d.source_name ?? "Source"} />
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Figures a reader can trust about the money around one company, per currency and never converted:
 *  the largest stated deal (with what the figure is), and the total raised in funding rounds. */
export function moneyFacts(deals: Deal[]): {
  largest: { currency: string; amount: number; basis: string | null; kind: string; id: string }[];
  raised: { currency: string; total: number; n: number }[];
} {
  const top = new Map<string, Deal>();
  const raised = new Map<string, { total: number; n: number }>();
  for (const d of deals) {
    if (d.amount == null || !d.currency || d.kind === "debt_financing") continue;
    const t = top.get(d.currency);
    if (!t || Number(d.amount) > Number(t.amount)) top.set(d.currency, d);
    if (d.kind === "funding_round" && d.amount_basis === "round_size") {
      const e = raised.get(d.currency) ?? { total: 0, n: 0 };
      e.total += Number(d.amount);
      e.n += 1;
      raised.set(d.currency, e);
    }
  }
  return {
    largest: [...top.values()].map((d) => ({ currency: d.currency!, amount: Number(d.amount), basis: d.amount_basis ?? null, kind: d.kind, id: d.id })).sort((a, b) => b.amount - a.amount),
    raised: [...raised.entries()].map(([currency, e]) => ({ currency, ...e })),
  };
}
