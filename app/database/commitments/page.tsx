import Link from "next/link";
import { Columns, ShareBar } from "@/components/intel/charts";
import { IntelShell } from "@/components/intel/shell";
import { CommitmentTable, ShowMore } from "@/components/intel/tables";
import { Bar, Box, Empty, Stat, StatStrip } from "@/components/intel/ui";
import { UrlFacets } from "@/components/intel/url-facets";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, type AssetClassKey } from "@/lib/directory/asset-classes";
import { getDirectoryIndex } from "@/lib/directory/index-server";
import { commitmentClass } from "@/lib/directory/intelligence-queries";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { getAllDisclosedCommitments, type NamedCommitment } from "@/lib/directory/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "LP commitments — LPGP Intelligence" };

// Every commitment a limited partner has disclosed to a fund, from the LPs'
// own reports and minutes and the public registers. A commitment keeps the
// currency it was disclosed in; amounts are never converted or added across
// currencies, and a figure the document does not print is blank. The URL is
// the state: the toolbar writes it, the page reads it; class and year take
// several values at once, an LP or a manager one.

type Search = { q?: string; lp?: string; gp?: string; year?: string; cls?: string; n?: string };
const STEP = 100;

const nameOf = (c: NamedCommitment) => c.lp_label ?? c.lp_name ?? "Unnamed LP";
const mgrOf = (c: NamedCommitment) => c.gp_label ?? c.gp_name ?? "Unnamed manager";
const short = (n: string) => n.replace(/\s*\([^)]*\)\s*$/, "");
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

function countBy<T>(rows: T[], key: (r: T) => string | null): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export default async function CommitmentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [all, index] = await Promise.all([getAllDisclosedCommitments(), getDirectoryIndex()]);
  const typeOf = new Map(index.records.map((r) => [r.id, r.subType]));
  const classOf = (c: NamedCommitment) => commitmentClass({ ...c, gp_type: c.gp_company_id ? (typeOf.get(c.gp_company_id) ?? null) : null });
  const q = (sp.q ?? "").trim().toLowerCase();
  const years = list(sp.year).map(Number).filter((y) => Number.isInteger(y));
  const classes = list(sp.cls).filter((k) => ASSET_CLASS_BY_KEY[k as AssetClassKey]);
  const lp = sp.lp?.trim() || "";
  const gp = sp.gp?.trim() || "";
  // Each facet counts under every other filter but its own, so a menu says
  // what choosing a value would leave.
  const passes = (c: NamedCommitment, omit?: "lp" | "gp" | "year" | "cls") =>
    (omit === "lp" || !lp || nameOf(c) === lp) &&
    (omit === "gp" || !gp || mgrOf(c) === gp) &&
    (omit === "year" || !years.length || (c.commitment_year != null && years.includes(c.commitment_year))) &&
    (omit === "cls" || !classes.length || classes.includes(classOf(c) ?? "")) &&
    (!q || `${nameOf(c)} ${mgrOf(c)} ${c.fund_label ?? c.fund_name ?? ""}`.toLowerCase().includes(q));
  const rows = all.filter((c) => passes(c));
  const lpCounts = countBy(all.filter((c) => passes(c, "lp")), nameOf);
  const gpCounts = countBy(all.filter((c) => passes(c, "gp")), mgrOf).slice(0, 500);
  const yearFacet = countBy(all.filter((c) => passes(c, "year")), (c) => (c.commitment_year ? String(c.commitment_year) : null)).sort((a, b) => Number(b[0]) - Number(a[0]));
  const classFacet = new Map(countBy(all.filter((c) => passes(c, "cls")), classOf));

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
  const yearColumns = Array.from({ length: 12 }, (_, i) => thisYear - 11 + i).map((y) => ({ label: `’${String(y).slice(2)}`, value: yearCounts.get(y) ?? 0, hint: String(y) }));
  const classCounts = new Map(countBy(all, classOf));
  const topLps = countBy(all, nameOf).slice(0, 12);
  const topGps = countBy(all, mgrOf).slice(0, 12);
  const withPerf = all.filter((c) => c.net_irr != null || c.multiple != null).length;
  const limit = Math.min(5000, Math.max(STEP, Math.floor(Number(sp.n)) || STEP));
  const shown = rows.slice(0, limit);
  const href = (patch: Partial<Search>) => {
    const next = { q: sp.q, lp: sp.lp, gp: sp.gp, year: sp.year, cls: sp.cls, ...patch };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return `/database/commitments${qs ? `?${qs}` : ""}`;
  };
  const filtered = Boolean(q || lp || gp || years.length || classes.length);

  return (
    <IntelShell
      crumbs={[{ href: "/database/workflows/fundraising", label: "Fundraising" }, { label: "LP commitments" }]}
      kicker="Fundraising"
      title="LP commitments"
      description="What limited partners have disclosed committing to funds: pension and super funds' own reports and minutes, public registers and press, each with the page that states it. A commitment keeps its own currency; nothing is converted or added across currencies, and a figure the document doesn't print is blank."
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

      <UrlFacets
        search={{ param: "q", placeholder: "LP, manager or fund…" }}
        facets={[
          { param: "lp", label: "Limited partner", groups: [{ label: "", options: lpCounts.map(([k, n]) => ({ key: k, label: short(k), count: n })) }], width: 320 },
          { param: "gp", label: "Manager", groups: [{ label: "", options: gpCounts.map(([k, n]) => ({ key: k, label: k, count: n })) }], width: 320 },
          {
            param: "cls",
            label: "Asset class",
            multi: true,
            searchable: false,
            width: 220,
            groups: [{ label: "", options: ASSET_CLASSES.filter((c) => classFacet.has(c.key)).map((c) => ({ key: c.key, label: c.name, count: classFacet.get(c.key) ?? 0 })) }],
          },
          { param: "year", label: "Year", multi: true, searchable: false, width: 180, groups: [{ label: "", options: yearFacet.map(([k, n]) => ({ key: k, label: k, count: n })) }] },
        ]}
        count={{ value: rows.length, noun: "commitments", of: all.length }}
      >
        <Box title={filtered ? "Matching commitments" : "Latest disclosed commitments"} count={rows.length} flush defn={`Newest first, ${STEP} at a time.`}>
          {rows.length ? (
            <>
              <CommitmentTable rows={shown} showClass />
              <ShowMore href={href({ n: String(limit + STEP) })} step={STEP} left={rows.length - shown.length} />
            </>
          ) : filtered ? (
            <Empty>
              No disclosed commitment matches this cut.{" "}
              <Link href="/database/commitments" className="underline underline-offset-2 hover:text-foreground">
                Clear the filters
              </Link>{" "}
              to see every one on file.
            </Empty>
          ) : (
            <Empty>No disclosed commitments on file yet. They arrive with the LP disclosures the database loads monthly, and from “Research LP commitments” on the Fundraising workflow.</Empty>
          )}
        </Box>
      </UrlFacets>

      <div className="grid gap-4 xl:grid-cols-2">
        <Box title="Commitments per year" defn="By the year each was approved or reported, last twelve years.">
          <Columns rows={yearColumns} height={110} />
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
                <Link href={href({ lp: n, n: undefined })} className="min-w-0 flex-1 truncate hover:underline" title={n}>
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
                <Link href={href({ gp: n, n: undefined })} className="min-w-0 flex-1 truncate hover:underline" title={n}>
                  {n}
                </Link>
                <Bar value={c} max={topGps[0][1]} />
                <span className="figure w-10 text-right text-[11px] text-muted-foreground">{c}</span>
              </li>
            ))}
          </ul>
        </Box>
      </div>
    </IntelShell>
  );
}
