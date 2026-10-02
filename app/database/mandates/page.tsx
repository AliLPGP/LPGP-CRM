import Link from "next/link";
import { IntelShell } from "@/components/intel/shell";
import { ResearchQueueRunner } from "@/components/intel/research-buttons";
import { getSessionUser } from "@/lib/auth";
import { dateLabel, ShowMore } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { UrlFacets } from "@/components/intel/url-facets";
import { ASSET_CLASSES, ASSET_CLASS_BY_KEY, isAssetClassKey, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { listPlans, type PlanListRow } from "@/lib/directory/investor-queries";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { INVESTOR_TYPES, INVESTOR_TYPE_BY_CODE, PLAN_STATUSES, PLAN_STATUS_LABEL, REGIONS, REGION_BY_CODE, typeNameOf, type PlanStatus } from "@/lib/directory/taxonomy";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mandates & RFPs — LPGP Connect" };

// What investors say they will do over the next twelve months, as they say
// it: a pacing plan in a board paper, an investment policy statement, an RFP
// notice, an interview. One row per investor per asset class per statement,
// each with the page that states it. A ticket is shown in USD only and never
// converted; a figure the statement does not give is blank. The URL is the
// state: the class tabs and the facet toolbar both write it.

type Search = { class?: string; status?: string; region?: string; itype?: string; n?: string };

const STEP = 100;

/** A ticket range as stated, in USD; one bound alone reads as "from" or "up to". */
function ticketLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${formatMoney(min, "USD")}–${formatMoney(max, "USD")}`;
  if (min != null) return `from ${formatMoney(min, "USD")}`;
  if (max != null) return `up to ${formatMoney(max, "USD")}`;
  return null;
}

function TagList({ items, title }: { items: string[]; title?: string }) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1" title={title}>
      {items.map((s) => (
        <Tag key={s}>{s}</Tag>
      ))}
    </span>
  );
}

export default async function MandatesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const isAdmin = (await getSessionUser())?.role === "admin";
  const cls: AssetClassKey | null = isAssetClassKey(sp.class) ? sp.class : null;
  const status: PlanStatus | null = (PLAN_STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as PlanStatus) : null;
  const region = sp.region && REGION_BY_CODE[sp.region] ? sp.region : null;
  const itype = sp.itype && INVESTOR_TYPE_BY_CODE[sp.itype] ? sp.itype : null;
  const limit = Math.min(2000, Math.max(STEP, Math.floor(Number(sp.n)) || STEP));

  // Read every plan once so the tabs and each menu can count under the other
  // filters; the cut is made here.
  const every = await listPlans({ limit: 5000 });
  const passes = (p: PlanListRow, omit?: "class" | "status" | "region" | "itype") =>
    (omit === "class" || !cls || p.asset_class === cls) &&
    (omit === "status" || !status || p.status === status) &&
    (omit === "region" || !region || Boolean(p.regions?.includes(region))) &&
    (omit === "itype" || !itype || p.investor?.type_code === itype);
  const all = every.filter((p) => passes(p, "class"));
  const rows = every.filter((p) => passes(p));
  const shown = rows.slice(0, limit);

  const href = (patch: Partial<Search>) => {
    const next = { class: cls ?? undefined, status: status ?? undefined, region: region ?? undefined, itype: itype ?? undefined, ...patch };
    const qs = Object.entries(next)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join("&");
    return `/database/mandates${qs ? `?${qs}` : ""}`;
  };

  const classCounts = new Map<string, number>();
  for (const p of all) classCounts.set(p.asset_class, (classCounts.get(p.asset_class) ?? 0) + 1);
  const tabs = [
    { href: href({ class: undefined, n: undefined }), label: "All", count: all.length, active: !cls },
    ...ASSET_CLASSES.filter((c) => classCounts.has(c.key)).map((c) => ({ href: href({ class: c.key, n: undefined }), label: c.short, count: classCounts.get(c.key) ?? 0, active: cls === c.key })),
  ];
  const count = <K extends string>(omit: "status" | "region" | "itype", keysOf: (p: PlanListRow) => (K | null | undefined)[]) => {
    const m = new Map<K, number>();
    for (const p of every.filter((x) => passes(x, omit))) for (const k of keysOf(p)) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const statusCounts = count<PlanStatus>("status", (p) => [p.status as PlanStatus]);
  const regionCounts = count<string>("region", (p) => p.regions ?? []);
  const typeCounts = count<string>("itype", (p) => [p.investor?.type_code]);

  const investors = new Set(rows.map((p) => p.company_id));
  const investing = rows.filter((p) => p.status === "investing").length;
  const considering = rows.filter((p) => p.status === "considering").length;
  const withTicket = rows.filter((p) => p.ticket_min_usd != null || p.ticket_max_usd != null).length;
  const newest = rows.map((p) => p.as_of).filter(Boolean).sort().at(-1) ?? null;
  const filtered = Boolean(cls || status || region || itype);

  return (
    <IntelShell
      crumbs={[{ href: "/database?book=LP&view=table", label: "Investors" }, { label: "Mandates & RFPs" }]}
      kicker="Investors"
      title="Mandates & RFPs"
      description="What investors say they will do over the next twelve months, in their own words: pacing plans in board papers, investment policy statements, RFP notices and interviews, one line per asset class with the page that states it. A ticket is shown in USD only; a figure the statement does not give is blank."
      tabs={<SubTabs items={tabs} />}
    >
      <StatStrip>
        <Stat label="Plans on file" value={rows.length.toLocaleString("en-US")} basis="one per investor, asset class and statement" />
        <Stat label="Investors" value={investors.size.toLocaleString("en-US")} basis="that have said what comes next" />
        <Stat label="Investing" value={investing.toLocaleString("en-US")} basis="plans the investor calls active" href={href({ status: status === "investing" ? undefined : "investing", n: undefined })} />
        <Stat label="Considering" value={considering.toLocaleString("en-US")} basis="plans still under review" href={href({ status: status === "considering" ? undefined : "considering", n: undefined })} />
        <Stat label="With a stated ticket" value={withTicket.toLocaleString("en-US")} basis="USD, as the statement gives it" />
        <Stat label="Newest statement" value={newest ? dateLabel(newest) : "—"} basis="the latest as-of date on file" />
      </StatStrip>

      <UrlFacets
        facets={[
          {
            param: "status",
            label: "Plan status",
            searchable: false,
            width: 200,
            groups: [{ label: "", options: PLAN_STATUSES.map((s) => ({ key: s, label: PLAN_STATUS_LABEL[s], count: statusCounts.get(s) ?? 0 })) }],
          },
          {
            param: "region",
            label: "Target region",
            width: 260,
            groups: [{ label: "", options: REGIONS.filter((r) => regionCounts.has(r.code) || r.code === region).map((r) => ({ key: r.code, label: r.name, count: regionCounts.get(r.code) ?? 0 })) }],
          },
          {
            param: "itype",
            label: "Investor type",
            width: 280,
            groups: [{ label: "", options: INVESTOR_TYPES.filter((t) => typeCounts.has(t.code) || t.code === itype).map((t) => ({ key: t.code, label: t.name, count: typeCounts.get(t.code) ?? 0 })) }],
          },
        ]}
        count={{ value: rows.length, noun: "plans", of: all.length }}
        right={isAdmin ? <ResearchQueueRunner kind="investors" aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} /> : null}
      >
        <Box
          title={cls ? `${ASSET_CLASS_BY_KEY[cls].name} plans` : filtered ? "Matching plans" : "Latest stated plans"}
          count={rows.length}
          flush
          defn={`Newest statement first, ${STEP} at a time. Status, plans, strategies, regions and ticket are as the investor states them; a blank is a thing the statement does not say.`}
        >
          {shown.length ? (
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th className="num defn" data-tip="As the investor states it, in USD. Where no researched figure is on file, the directory's total assets stand in and say so.">AUM</th>
                    {!cls ? <th>Class</th> : null}
                    <th>Plan status</th>
                    <th>Date added</th>
                    <th>Plans</th>
                    <th>Strategies</th>
                    <th>Regions</th>
                    <th className="num">Ticket (USD)</th>
                    <th className="defn" data-tip="Whether the investor says it will take on new manager relationships, as against re-ups only.">New GP relationships</th>
                    <th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p: PlanListRow) => {
                    const inv = p.investor;
                    const typeName = inv ? typeNameOf("LP", inv.type_code) : null;
                    const location = inv ? [inv.city, inv.country].filter(Boolean).join(", ") : "";
                    const ticket = ticketLabel(p.ticket_min_usd, p.ticket_max_usd);
                    const strategies = (p.strategies ?? []).map((k) => STRATEGY_BY_KEY[k]?.name ?? k);
                    const regions = (p.regions ?? []).map((k) => REGION_BY_CODE[k]?.name ?? k);
                    return (
                      <tr key={p.id} className={inv ? "linked" : undefined}>
                        <td className="min-w-[180px] max-w-[280px]">
                          {inv ? (
                            <Link href={`/companies/${inv.id}?tab=investor`} className="cover block truncate font-medium" title={inv.name}>
                              {inv.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">Unnamed investor</span>
                          )}
                          {p.note ? (
                            <div className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-muted-foreground" title={p.note}>
                              {p.note}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-[160px] truncate text-muted-foreground" title={typeName ?? inv?.sub_type ?? undefined}>{typeName ?? inv?.sub_type ?? "—"}</td>
                        <td className="max-w-[160px] truncate text-muted-foreground" title={location || undefined}>{location || "—"}</td>
                        <td className="num whitespace-nowrap">
                          {inv?.aum_usd != null ? (
                            <>
                              <span className="figure">{formatMoney(inv.aum_usd, "USD")}</span>
                              <div className="text-[10px] text-muted-foreground">
                                USD{inv.aum_as_of ? `, ${inv.aum_as_of}` : ""} {inv.aum_source ? <Src url={inv.aum_source.url} name={inv.aum_source.name ?? "Source"} /> : null}
                              </div>
                            </>
                          ) : inv?.total_assets_usd != null ? (
                            <>
                              <span className="figure">{formatMoney(inv.total_assets_usd, "USD")}</span>
                              <div className="text-[10px] text-muted-foreground">USD, total assets</div>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        {!cls ? (
                          <td className="whitespace-nowrap">
                            {isAssetClassKey(p.asset_class) ? (
                              <Link href={href({ class: p.asset_class, n: undefined })} className="tag hover:text-foreground">
                                {ASSET_CLASS_BY_KEY[p.asset_class].short}
                              </Link>
                            ) : (
                              <Tag>{p.asset_class}</Tag>
                            )}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap">
                          <Tag strong={p.status === "investing"}>{PLAN_STATUS_LABEL[p.status] ?? p.status}</Tag>
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">{dateLabel(p.as_of)}</td>
                        <td className="max-w-[220px]">
                          <TagList items={p.plan_types ?? []} />
                        </td>
                        <td className="max-w-[240px]">
                          <TagList items={strategies} />
                        </td>
                        <td className="max-w-[200px]">
                          <TagList items={regions} />
                        </td>
                        <td className="num whitespace-nowrap">
                          {ticket ?? "—"}
                          {p.funds_planned != null ? <div className="text-[10px] text-muted-foreground">{p.funds_planned} fund{p.funds_planned === 1 ? "" : "s"} planned</div> : null}
                        </td>
                        <td className="text-muted-foreground">{p.new_gp_relationships == null ? "—" : p.new_gp_relationships ? "Yes" : "No"}</td>
                        <td className="max-w-[180px] whitespace-nowrap">
                          <span className="block truncate">
                            <Src url={p.source_url} name={p.source_name ?? p.source_kind ?? "Source"} asOf={p.as_of} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : filtered ? (
            <Empty>
              No plan matches this cut.{" "}
              <Link href="/database/mandates" className="underline underline-offset-2 hover:text-foreground">
                Clear the filters
              </Link>{" "}
              to see every stated plan.
            </Empty>
          ) : (
            <Empty>
              Nothing on file yet. The investor research job fills this desk from investors&rsquo; own statements — annual reports, board papers, investment policy statements and RFP notices —{" "}
              {isAdmin ? "run it from “Research investors” above." : "an admin runs it from this page."}
            </Empty>
          )}
          <ShowMore href={href({ n: String(limit + STEP) })} step={STEP} left={rows.length - shown.length} />
        </Box>
      </UrlFacets>
    </IntelShell>
  );
}
