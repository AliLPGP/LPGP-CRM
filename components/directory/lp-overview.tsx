import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Chip, ClassIcon, Figure, Figures, Meter, MoreLink, fmtMult, fmtPct } from "@/components/story/story";
import { ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { STRATEGY_BY_KEY, strategiesInFundName } from "@/lib/directory/strategies";
import { formatMoney } from "@/lib/directory/intelligence-types";
import type { LpBook, LpCommitment } from "@/lib/directory/lp-profile";
import { formatUsd } from "@/lib/utils";

// One asset class of an LP's book, opened from its card: the funds it has
// committed to in that class, each with its manager, what it committed and
// how the fund has done as the LP reports it, then the managers behind them.
// Every fund leads to the fund, every manager to the manager: the journey
// goes on from here.

const STEP = 60;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export type ClassSort = "newest" | "irr" | "amount";

export function LpClassView({ book, cls, base, name, shown, sort = "newest", strategy = null }: { book: LpBook; cls: string; base: string; name: string; shown?: number; sort?: ClassSort; strategy?: string | null }) {
  const summary = isAssetClassKey(cls) ? book.classes.find((c) => c.key === cls) : undefined;
  const meta = isAssetClassKey(cls) ? ASSET_CLASS_BY_KEY[cls] : null;
  const limit = Math.max(STEP, shown ?? STEP);

  return (
    <div>
      <nav className="chapter-nav-row mt-6" aria-label="Asset classes">
        <Link href={`${base}#invests`} className="chapter-pill">
          All classes
        </Link>
        {book.classes.map((c) => (
          <Link key={c.key} href={`${base}?class=${c.key}`} className="chapter-pill" aria-current={c.key === cls ? "true" : undefined}>
            {c.name} <span className="chapter-pill-count">{c.commitments.toLocaleString("en-US")}</span>
          </Link>
        ))}
      </nav>

      {!summary ? (
        <div className="story-card mt-8 p-6 text-[14px] text-muted-foreground">No disclosed commitment of {name} is placed in {meta?.name ?? "this class"}.</div>
      ) : (
        <ClassBody rows={summary.rows} summary={summary} base={base} name={name} limit={limit} sort={sort} strategy={strategy} />
      )}
    </div>
  );
}

const SORTS: { key: ClassSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "irr", label: "Best net IRR" },
  { key: "amount", label: "Largest commitment" },
];

/** The strategy a fund's own name states within its class ("Direct lending", "Mezzanine"), or null when the name states none. */
function strategyOf(c: LpCommitment, cls: AssetClassKey): string | null {
  return strategiesInFundName(c.fund_label ?? c.fund_name, cls).find((s) => s.axis === "strategy")?.key ?? null;
}

const UNSTATED = "unstated";

function ClassBody({ rows: all, summary, base, name, limit, sort, strategy }: { rows: LpCommitment[]; summary: NonNullable<LpBook["classes"][number]>; base: string; name: string; limit: number; sort: ClassSort; strategy: string | null }) {
  // The strategies the fund names in this class state, one card each; a click narrows everything below to it.
  const cls = summary.key as AssetClassKey;
  const groups = new Map<string, LpCommitment[]>();
  for (const c of all) {
    const k = strategyOf(c, cls) ?? UNSTATED;
    groups.set(k, [...(groups.get(k) ?? []), c]);
  }
  const named = [...groups.entries()].filter(([k]) => k !== UNSTATED).sort((a, b) => b[1].length - a[1].length);
  const picked = strategy && groups.has(strategy) ? strategy : null;
  const rows = picked ? (groups.get(picked) ?? []) : all;
  const pickedName = picked ? (picked === UNSTATED ? "funds whose name states no strategy" : (STRATEGY_BY_KEY[picked]?.name ?? picked)) : null;
  const q = (k: string | null, extra = "") => `${base}?class=${summary.key}${k ? `&strategy=${k}` : ""}${extra}`;
  const byYear = (a: LpCommitment, b: LpCommitment) => (b.commitment_year ?? 0) - (a.commitment_year ?? 0) || (a.fund_label ?? "").localeCompare(b.fund_label ?? "");
  // Best IRR: funds it reports a figure for, highest first, then the rest by year.
  // Largest: within the currency most of its amounts are in, never across currencies.
  const mainCcy = summary.totals[0]?.currency ?? null;
  const sorted = [...rows].sort(
    sort === "irr"
      ? (a, b) => (b.net_irr != null ? 1 : 0) - (a.net_irr != null ? 1 : 0) || Number(b.net_irr ?? 0) - Number(a.net_irr ?? 0) || byYear(a, b)
      : sort === "amount"
        ? (a, b) => (b.currency === mainCcy ? 1 : 0) - (a.currency === mainCcy ? 1 : 0) || Number(b.amount ?? 0) - Number(a.amount ?? 0) || byYear(a, b)
        : byYear,
  );
  const sortHref = (k: ClassSort) => `${q(picked, k === "newest" ? "" : `&sort=${k}`)}#funds`;
  const first = rows.reduce<number | null>((y, c) => (c.commitment_year != null && (y == null || c.commitment_year < y) ? c.commitment_year : y), null);
  const topIrr = Math.max(1, ...rows.map((c) => (c.net_irr != null ? Number(c.net_irr) : 0)));

  const managers = new Map<string, { id: string | null; name: string; n: number; irr: number[]; latest: number | null }>();
  for (const c of rows) {
    const label = c.gp_label ?? "Manager not on file";
    const key = c.gp_company_id ?? `n:${label.toLowerCase()}`;
    const e = managers.get(key) ?? { id: c.gp_company_id, name: label, n: 0, irr: [], latest: null };
    e.n += 1;
    if (c.net_irr != null) e.irr.push(Number(c.net_irr));
    if (c.commitment_year != null) e.latest = Math.max(e.latest ?? 0, c.commitment_year);
    managers.set(key, e);
  }
  const mgrs = [...managers.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const most = mgrs[0]?.n ?? 1;

  return (
    <>
      <div className="mt-10 flex items-start gap-4">
        <ClassIcon cls={summary.key} className="h-12 w-12 rounded-[14px]" />
        <div className="min-w-0">
          <h2 className="chapter-title mt-0" style={{ maxWidth: "40ch" }}>
            {name} has committed to {summary.funds.toLocaleString("en-US")} {summary.name.toLowerCase()} funds with {summary.managers.toLocaleString("en-US")} managers{first ? ` since ${first}` : ""}.
          </h2>
          <p className="chapter-lead">Every fund below opens the fund itself, and every manager its own story. Figures are the LP&rsquo;s own; nothing is estimated or converted.</p>
        </div>
      </div>

      <Figures>
        {summary.totals.map((t) => (
          <Figure key={t.currency} label={`Committed in ${t.currency}`} value={formatMoney(t.amount, t.currency)} basis={`${t.n.toLocaleString("en-US")} stated amounts`} />
        ))}
        {summary.medianIrr != null ? <Figure label="Median net IRR" value={fmtPct(summary.medianIrr)} basis={`of ${summary.withIrr.toLocaleString("en-US")} funds it reports`} /> : null}
        {summary.medianMultiple != null ? <Figure label="Median multiple" value={fmtMult(summary.medianMultiple)} basis="as it reports" /> : null}
        {summary.latestYear ? <Figure label="Latest commitment" value={summary.latestYear} /> : null}
      </Figures>

      {named.length ? (
        <section className="chapter" id="strategies">
          <div className="chapter-eyebrow">Strategies</div>
          <h3 className="chapter-title">How its {summary.name.toLowerCase()} splits by strategy.</h3>
          <p className="chapter-lead">By what each fund&rsquo;s own name states. Pick one to see only its funds and managers.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[...named, ...(groups.has(UNSTATED) ? [[UNSTATED, groups.get(UNSTATED)!] as [string, LpCommitment[]]] : [])].map(([k, rs]) => {
              const on = picked === k;
              const irr = median(rs.filter((c) => c.net_irr != null).map((c) => Number(c.net_irr)));
              const mgrs = new Set(rs.map((c) => c.gp_company_id ?? c.gp_label ?? "")).size;
              const share = (rs.length / all.length) * 100;
              return (
                <Link key={k} href={on ? `${q(null)}#strategies` : `${q(k)}#funds`} scroll={false} className={`story-card flex flex-col p-4 ${on ? "story-card-hero" : ""}`} aria-current={on ? "true" : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14.5px] font-medium leading-snug">{k === UNSTATED ? "Not stated in the name" : (STRATEGY_BY_KEY[k]?.name ?? k)}</span>
                    {on ? <Chip strong>Showing</Chip> : <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />}
                  </div>
                  {k !== UNSTATED && STRATEGY_BY_KEY[k]?.blurb ? <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{STRATEGY_BY_KEY[k].blurb}</p> : null}
                  <dl className="mt-auto grid grid-cols-3 gap-2 pt-4">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Funds</dt>
                      <dd className="figure text-[15px]">{rs.length.toLocaleString("en-US")}</dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Managers</dt>
                      <dd className="figure text-[15px]">{mgrs.toLocaleString("en-US")}</dd>
                    </div>
                    {irr != null ? (
                      <div>
                        <dt className="text-[11px] text-muted-foreground">Net IRR</dt>
                        <dd className="figure text-[15px]">{fmtPct(irr)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <Meter pct={share} className="mt-3" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="chapter" id="funds">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="chapter-eyebrow">The funds</div>
            <h3 className="chapter-title">{pickedName ? `${rows.length.toLocaleString("en-US")} ${pickedName === "funds whose name states no strategy" ? pickedName : `${pickedName.toLowerCase()} funds`}.` : `Every ${summary.name.toLowerCase()} fund in its book.`}</h3>
            {picked ? (
              <Link href={`${q(null)}#strategies`} scroll={false} className="mt-1 inline-block text-[12.5px] text-muted-foreground hover:text-foreground">
                Show every {summary.name.toLowerCase()} fund
              </Link>
            ) : null}
          </div>
          <div className="chapter-nav-row" role="group" aria-label="Sort the funds">
            {SORTS.map((s) => (
              <Link key={s.key} href={sortHref(s.key)} scroll={false} className="chapter-pill" aria-current={sort === s.key ? "true" : undefined}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="story-card story-rows mt-5 overflow-hidden">
          {sorted.slice(0, limit).map((c) => {
            const called = c.contributed != null && c.amount != null && Number(c.amount) > 0 ? (Number(c.contributed) / Number(c.amount)) * 100 : null;
            const inner = (
              <>
                <CompanyLogo name={c.gp_label ?? c.fund_label ?? "?"} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{c.fund_label ?? "—"}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[c.gp_label, c.commitment_year ?? c.commitment_date_text, called != null ? `${Math.round(called)}% called` : null].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="figure hidden w-[110px] text-right text-[13px] md:block">
                  {c.amount != null && c.currency ? formatMoney(c.amount, c.currency) : c.amount_usd != null ? formatUsd(c.amount_usd) : <span className="text-[11.5px] text-muted-foreground">{c.amount_text ?? "Undisclosed"}</span>}
                </span>
                <span className="hidden w-[140px] sm:block">{c.net_irr != null ? <Meter pct={(Math.max(0, Number(c.net_irr)) / topIrr) * 100} /> : null}</span>
                <span className="figure w-[60px] text-right text-[13.5px]" title={c.as_of ? `as of ${c.as_of}` : undefined}>
                  {c.net_irr != null ? fmtPct(c.net_irr) : <span className="text-muted-foreground">—</span>}
                </span>
                <span className="figure hidden w-[52px] text-right text-[12px] text-muted-foreground lg:block">{c.multiple != null ? fmtMult(c.multiple) : ""}</span>
              </>
            );
            return c.fund_id ? (
              <Link key={c.id} href={`/funds/${c.fund_id}`} className="story-row">
                {inner}
              </Link>
            ) : (
              <div key={c.id} className="story-row">
                {inner}
              </div>
            );
          })}
        </div>
        {sorted.length > limit ? (
          <div className="mt-4 flex justify-center">
            <MoreLink href={q(picked, `${sort === "newest" ? "" : `&sort=${sort}`}&n=${limit + STEP}`)}>Show {Math.min(STEP, sorted.length - limit)} more of {(sorted.length - limit).toLocaleString("en-US")}</MoreLink>
          </div>
        ) : null}
      </section>

      <section className="chapter" id="class-managers">
        <div className="chapter-eyebrow">The managers</div>
        <h3 className="chapter-title">Who it backs in {pickedName && picked !== UNSTATED ? pickedName.toLowerCase() : summary.name.toLowerCase()}.</h3>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {mgrs.slice(0, 24).map((m) => {
            const body = (
              <>
                <div className="flex items-center gap-3">
                  <CompanyLogo name={m.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{m.name}</span>
                    <span className="block text-[12px] text-muted-foreground">
                      {m.n.toLocaleString("en-US")} fund{m.n === 1 ? "" : "s"}
                      {m.latest ? ` · latest ${m.latest}` : ""}
                    </span>
                  </span>
                  {m.id ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Meter pct={(m.n / most) * 100} className="flex-1" />
                  {m.irr.length ? <Chip>{fmtPct(median(m.irr))} IRR</Chip> : null}
                </div>
              </>
            );
            return m.id ? (
              <Link key={m.id} href={`/companies/${m.id}`} className="story-card p-3.5">
                {body}
              </Link>
            ) : (
              <div key={m.name} className="story-card p-3.5">
                {body}
              </div>
            );
          })}
        </div>
        {mgrs.length > 24 ? <p className="mt-3 text-[12.5px] text-muted-foreground">And {(mgrs.length - 24).toLocaleString("en-US")} more, each in the fund list above.</p> : null}
      </section>
    </>
  );
}
