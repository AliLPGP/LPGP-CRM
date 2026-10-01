import Link from "next/link";
import { Columns, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { CommitmentTable } from "@/components/intel/tables";
import { Bar, Box, Empty, Stat, StatStrip } from "@/components/intel/ui";
import { ASSET_CLASS_BY_KEY, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { commitmentClass } from "@/lib/directory/intelligence-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { getAllDisclosedCommitments, type NamedCommitment } from "@/lib/directory/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "LP commitments — LPGP Connect" };

// Every commitment a limited partner has disclosed to a fund, from the LPs'
// own reports and minutes and the public registers. A commitment keeps the
// currency it was disclosed in; amounts are never converted or added across
// currencies, and a figure the document does not print is blank.

type Search = { q?: string; lp?: string; gp?: string; year?: string; cls?: string; page?: string };
const PAGE = 100;

const nameOf = (c: NamedCommitment) => c.lp_label ?? c.lp_name ?? "Unnamed LP";
const mgrOf = (c: NamedCommitment) => c.gp_label ?? c.gp_name ?? "Unnamed manager";
const short = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, "");

function top<T>(rows: T[], key: (r: T) => string | null, n: number) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

export default async function CommitmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [all, index] = await Promise.all([getAllDisclosedCommitments(), getDirectoryIndex()]);
  const typeOf = new Map(index.records.map((r) => [r.id, r.subType]));
  const classOf = (c: NamedCommitment) => commitmentClass({ ...c, gp_type: c.gp_company_id ? (typeOf.get(c.gp_company_id) ?? null) : null });
  const q = (sp.q ?? "").trim().toLowerCase();
  const year = Number(sp.year) || null;
  const cls = sp.cls && ASSET_CLASS_BY_KEY[sp.cls as AssetClassKey] ? sp.cls : "";
  const rows = all.filter(
    (c) =>
      (!sp.lp || nameOf(c) === sp.lp) &&
      (!sp.gp || mgrOf(c) === sp.gp) &&
      (!year || c.commitment_year === year) &&
      (!cls || classOf(c) === cls) &&
      (!q || `${nameOf(c)} ${mgrOf(c)} ${c.fund_label ?? c.fund_name ?? ""}`.toLowerCase().includes(q)),
  );
  const lps = new Set(all.map((c) => nameOf(c)));
  const gps = new Set(all.map((c) => mgrOf(c)));
  const funds = new Set(all.map((c) => c.fund_id ?? c.fund_name).filter(Boolean));
  const byCcy = new Map<string, { total: number; n: number }>();
  for (const c of all) {
    if (c.amount == null || !c.currency) continue;
    const e = byCcy.get(c.currency) ?? { total: 0, n: 0 };
    e.total += Number(c.amount);
    e.n += 1;
    byCcy.set(c.currency, e);
  }
  const ccy = [...byCcy.entries()].sort((a, b) => b[1].n - a[1].n);
  const thisYear = new Date().getUTCFullYear();
  const yearCounts = new Map<number, number>();
  for (const c of all) if (c.commitment_year) yearCounts.set(c.commitment_year, (yearCounts.get(c.commitment_year) ?? 0) + 1);
  const years = Array.from({ length: 12 }, (_, i) => thisYear - 11 + i).map((y) => ({ label: `’${String(y).slice(2)}`, value: yearCounts.get(y) ?? 0, hint: String(y) }));
  const classCounts = new Map<string, number>();
  for (const c of all) {
    const k = classOf(c);
    if (k) classCounts.set(k, (classCounts.get(k) ?? 0) + 1);
  }
  const topLps = top(all, nameOf, 12);
  const topGps = top(all, mgrOf, 12);
  const withPerf = all.filter((c) => c.net_irr != null || c.multiple != null).length;
  const page = Math.max(1, Number(sp.page) || 1);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const href = (patch: Partial<Search>) => {
    const next = { q: sp.q, lp: sp.lp, gp: sp.gp, year: sp.year, cls: sp.cls, ...patch };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return `/database/commitments${qs ? `?${qs}` : ""}`;
  };
  const filtered = Boolean(q || sp.lp || sp.gp || year || cls);

  return (
    <IntelShell
      crumbs={[{ href: "/database/workflows/fundraising", label: "Fundraising" }, { label: "LP commitments" }]}
      kicker="Fundraising"
      title="LP commitments"
      description="What limited partners have disclosed committing to funds: pension and super funds' own reports and minutes, public registers and press, each with the page that states it. A commitment keeps its own currency; nothing is converted or added across currencies, and a figure the document doesn't print is blank."
      actions={
        <form action="/database/commitments" className="flex flex-wrap items-center gap-1.5">
          {sp.year ? <input type="hidden" name="year" value={sp.year} /> : null}
          {sp.cls ? <input type="hidden" name="cls" value={sp.cls} /> : null}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="LP, manager or fund…" className="h-8 w-60 rounded-[4px] border bg-card px-2.5 text-[12px] outline-none focus:border-foreground" />
          <button type="submit" className="h-8 rounded-[4px] border bg-card px-2.5 text-[12px] font-medium hover:bg-accent">
            Search
          </button>
        </form>
      }
    >
      <StatStrip>
        <Stat label="Commitments" value={all.length.toLocaleString("en-US")} basis="disclosed by the LPs themselves or in public registers" />
        <Stat label="Limited partners" value={lps.size.toLocaleString("en-US")} basis="that disclose fund by fund" />
        <Stat label="Managers" value={gps.size.toLocaleString("en-US")} basis="receiving them" />
        <Stat label="Funds" value={funds.size.toLocaleString("en-US")} basis="named in a disclosure" />
        <Stat label="With a stated amount" value={all.filter((c) => c.amount != null).length.toLocaleString("en-US")} basis="the rest name the fund only" />
        <Stat label="With performance" value={withPerf.toLocaleString("en-US")} basis="IRR or multiple from the LP's own review" />
      </StatStrip>

      {ccy.length ? (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground">
          <span className="desk-label">Stated amounts</span>
          {ccy.slice(0, 5).map(([c, e]) => (
            <span key={c} title="Added within one currency only; other currencies are never converted in.">
              <span className="figure text-foreground">{formatMoney(e.total, c)}</span> {c} across {e.n.toLocaleString("en-US")} commitments
            </span>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Commitments per year" defn="By the year each was approved or reported, last twelve years.">
          <Columns rows={years} height={110} />
        </Box>
        <Box title="By asset class" defn="Placed by the LP's own programme, else the fund's name, else the manager's type.">
          <ShareBar segments={[...classCounts.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: ASSET_CLASS_BY_KEY[k as AssetClassKey]?.name ?? k, value: v }))} />
        </Box>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Box title="Most active limited partners" flush>
          <ul className="space-y-1 px-3 py-2 text-[12px]">
            {topLps.map(([n, c]) => (
              <li key={n} className="flex items-center gap-2">
                <Link href={href({ lp: n, page: undefined })} className="min-w-0 flex-1 truncate hover:underline" title={n}>
                  {short(n)}
                </Link>
                <Bar value={c} max={topLps[0][1]} />
                <span className="figure w-10 text-right text-[11px] text-muted-foreground">{c}</span>
              </li>
            ))}
          </ul>
        </Box>
        <Box title="Managers raising the most" flush>
          <ul className="space-y-1 px-3 py-2 text-[12px]">
            {topGps.map(([n, c]) => (
              <li key={n} className="flex items-center gap-2">
                <Link href={href({ gp: n, page: undefined })} className="min-w-0 flex-1 truncate hover:underline" title={n}>
                  {n}
                </Link>
                <Bar value={c} max={topGps[0][1]} />
                <span className="figure w-10 text-right text-[11px] text-muted-foreground">{c}</span>
              </li>
            ))}
          </ul>
        </Box>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[...Object.keys(ASSET_CLASS_BY_KEY)].filter((k) => classCounts.has(k)).map((k) => (
          <Link key={k} href={href({ cls: cls === k ? undefined : k, page: undefined })} className={`tag hover:text-foreground ${cls === k ? "bg-foreground text-background" : ""}`}>
            {ASSET_CLASS_BY_KEY[k as AssetClassKey].short}
          </Link>
        ))}
        {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
          <Link key={y} href={href({ year: year === y ? undefined : String(y), page: undefined })} className={`tag hover:text-foreground ${year === y ? "bg-foreground text-background" : ""}`}>
            {y}
          </Link>
        ))}
        {sp.lp ? <Link href={href({ lp: undefined, page: undefined })} className="tag hover:text-foreground">{short(sp.lp)} ×</Link> : null}
        {sp.gp ? <Link href={href({ gp: undefined, page: undefined })} className="tag hover:text-foreground">{sp.gp} ×</Link> : null}
        {filtered ? <Link href="/database/commitments" className="text-[11.5px] text-muted-foreground hover:text-foreground">Clear</Link> : null}
      </div>

      <Box title={filtered ? "Matching commitments" : "Latest disclosed commitments"} count={rows.length} flush defn={`Newest first, ${PAGE} per page.`}>
        {rows.length ? (
          <>
            <CommitmentTable rows={shown} showClass />
            {rows.length > PAGE ? (
              <div className="flex items-center justify-between border-t px-3 py-2 text-[12px] text-muted-foreground">
                <span>
                  {((page - 1) * PAGE + 1).toLocaleString("en-US")}–{Math.min(page * PAGE, rows.length).toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
                </span>
                <span className="flex gap-3">
                  {page > 1 ? <Link href={href({ page: String(page - 1) })} className="hover:text-foreground">← Newer</Link> : null}
                  {page * PAGE < rows.length ? <Link href={href({ page: String(page + 1) })} className="hover:text-foreground">Older →</Link> : null}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <Empty>No commitment matches.</Empty>
        )}
      </Box>
    </IntelShell>
  );
}
