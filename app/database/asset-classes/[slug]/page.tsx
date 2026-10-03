import Link from "next/link";
import { notFound } from "next/navigation";
import { searchPortcos } from "@/lib/directory/portco-queries";
import { portcoHref } from "@/lib/directory/portco-intel";
import { assetClassBySlug } from "@/lib/directory/asset-classes";
import { getClassPage } from "@/lib/directory/asset-class-data";
import { getClassMetrics } from "@/lib/directory/strategy-data";
import { STRATEGIES_BY_CLASS } from "@/lib/directory/strategies";
import { getBookSummary, getFundOfferings, getOfferingStats, listCreditLenders } from "@/lib/directory/filings-queries";
import { INSTRUMENT_HUE } from "@/lib/directory/filings-types";
import { getSessionUser } from "@/lib/auth";
import { ResearchClassButton } from "@/components/intel/research-buttons";
import { StrategiesPanel } from "@/components/intel/strategies-panel";
import { CompanyLogo } from "@/components/company-logo";
import { Columns, ShareBar } from "@/components/intel/charts";
import { LenderTable, OfferingTable } from "@/components/intel/filings-tables";
import { IntelShell } from "@/components/intel/shell";
import { CommitmentTable, DealTable, FirmTable, ProviderMini, ShowMore, SignalList } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";
import { formatMoney } from "@/lib/directory/intelligence-types";

export const dynamic = "force-dynamic";

const TABS = ["overview", "strategies", "managers", "funds", "commitments", "deals", "raises", "loans", "assets", "signals"] as const;
/** Rows a ledger tab shows before "Show more". */
const STEP = 200;

// What "the asset" means in each class: the unit an investor actually owns.
const ASSET_VIEW: Record<string, { tab: string; title: string; blurb: string; kind?: "company" | "infrastructure_asset" | "property"; cls?: string }> = {
  private_equity: { tab: "Portfolio companies", title: "Portfolio companies", blurb: "In private equity the asset is the company: what a sponsor bought or backed, with the page that names it.", kind: "company" },
  venture_capital: { tab: "Portfolio companies", title: "Portfolio companies", blurb: "In venture the asset is the company a fund backed.", kind: "company", cls: "venture" },
  infrastructure: { tab: "Infrastructure assets", title: "Infrastructure assets", blurb: "In infrastructure the asset is the physical thing: a toll road, a bridge, a pipeline, a wind or solar portfolio, a port. Listed with where it is, who holds it and how.", kind: "infrastructure_asset" },
  real_estate: { tab: "Properties & developments", title: "Properties and developments", blurb: "In real estate the asset is the property or development the money went into.", kind: "property" },
  private_credit: { tab: "Loans", title: "Loans", blurb: "In private credit the asset is the loan: who borrowed, from which lenders, how much, at what spread and mark, and when it matures." },
};
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cls = assetClassBySlug(slug);
  return { title: cls ? `${cls.name} — LPGP Intelligence` : "Asset class — LPGP Intelligence" };
}

export default async function AssetClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; strategy?: string; n?: string }>;
}) {
  const [{ slug }, { tab: tabParam, strategy: strategyParam, n: nParam }] = await Promise.all([params, searchParams]);
  const cls = assetClassBySlug(slug);
  if (!cls) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const limit = Math.min(3000, Math.max(STEP, Math.floor(Number(nParam)) || STEP));
  const isSports = cls.key === "sports";
  const isCredit = cls.key === "private_credit";
  // Form D raises are read per class; the loan books only on the credit desk.
  const [page, user, raises, offerings, book, lenders] = await Promise.all([
    getClassPage(cls),
    getSessionUser(),
    isSports ? null : getOfferingStats(cls.key),
    tabParam === "raises" && !isSports ? getFundOfferings({ assetClass: cls.key, limit }) : Promise.resolve([]),
    isCredit ? getBookSummary() : null,
    tabParam === "loans" && isCredit ? listCreditLenders() : Promise.resolve([]),
  ]);
  // Strategy metrics run every strategy's placement over every manager and
  // fund in the class; only the tab that shows them pays for them.
  const strategyCount = STRATEGIES_BY_CLASS[cls.key].length;
  const metrics = tab === "strategies" && strategyCount ? await getClassMetrics(cls, page.managers, page.funds, page.brands) : null;
  const selectedStrategy = metrics?.strategies.find((s) => s.strategy.key === strategyParam) ?? null;
  const isAdmin = user?.role === "admin";
  const assetView = ASSET_VIEW[cls.key];
  const assetRows = tab === "assets" && assetView && cls.key !== "private_credit" ? await searchPortcos({ assetKind: assetView.kind, assetClass: assetView.cls, limit: 200 }) : [];
  const aiReady = Boolean(process.env.ANTHROPIC_API_KEY);
  const base = `/database/asset-classes/${cls.slug}`;
  const domainOf = (companyId: string | null) => (companyId ? (page.managers.find((m) => m.id === companyId)?.domain ?? null) : null);

  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes", label: "Asset classes" }, { label: cls.name }]}
      kicker="Asset class"
      title={cls.name}
      description={cls.blurb}
      actions={
        <>
          {isAdmin ? <ResearchClassButton assetClass={cls.key} kind="deals" aiReady={aiReady} /> : null}
          {isAdmin ? <ResearchClassButton assetClass={cls.key} kind="benchmarks" aiReady={aiReady} /> : null}
          {isSports ? (
            <Link href="/database/sports" className="rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
              Open the sports desk
            </Link>
          ) : (
            <Link href={`/database?book=GP&type=${encodeURIComponent(cls.gpTypes[0] ?? "")}`} className="rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
              Search these managers
            </Link>
          )}
        </>
      }
      tabs={
        <SubTabs
          items={[
            { href: base, label: "Overview", active: tab === "overview" },
            ...(strategyCount ? [{ href: `${base}?tab=strategies`, label: "Strategies & benchmarks", count: strategyCount, active: tab === "strategies" }] : []),
            { href: `${base}?tab=managers`, label: "Managers", count: page.managers.length, active: tab === "managers" },
            { href: `${base}?tab=funds`, label: "Funds", count: page.funds.length, active: tab === "funds" },
            { href: `${base}?tab=commitments`, label: "LP commitments", count: page.commitments.length, active: tab === "commitments" },
            { href: `${base}?tab=deals`, label: "Deals", count: page.deals.length, active: tab === "deals" },
            ...(raises ? [{ href: `${base}?tab=raises`, label: "Form D raises", count: raises.filings, active: tab === "raises" }] : []),
            ...(ASSET_VIEW[cls.key] ? [{ href: `${base}?tab=assets`, label: ASSET_VIEW[cls.key].tab, active: tab === "assets" }] : []),
            ...(book ? [{ href: `${base}?tab=loans`, label: "Loan books", count: book.lenders, active: tab === "loans" }] : []),
            { href: `${base}?tab=signals`, label: "Signals", count: page.signals.length, active: tab === "signals" },
          ]}
        />
      }
    >
      <StatStrip>
        <Stat label="Managers" value={page.managers.length.toLocaleString("en-US")} basis={`${page.filers} with Form ADV providers`} href={`${base}?tab=managers`} />
        <Stat
          label="Regulatory AUM"
          value={page.raum.firms ? formatUsd(page.raum.sum) : "—"}
          basis={page.raum.firms ? `${page.raum.firms} SEC filers, brand totals once` : "no Form ADV sizes"}
          defn="Form ADV regulatory assets under management, summed across the managers in this class. A brand filing one total across several entities is counted once."
        />
        <Stat label="Funds" value={page.funds.length.toLocaleString("en-US")} basis={`${page.fundsByName} named as such in the fund's own name`} href={`${base}?tab=funds`} />
        <Stat label="LP commitments" value={page.commitments.length.toLocaleString("en-US")} basis="publicly disclosed" href={`${base}?tab=commitments`} />
        <Stat label="Deals" value={page.deals.length.toLocaleString("en-US")} basis="sourced transactions" href={`${base}?tab=deals`} />
        {raises ? (
          <Stat
            label="Form D raises"
            value={raises.filings.toLocaleString("en-US")}
            basis={raises.sold ? `${formatUsd(raises.sold)} sold, ${raises.raising.toLocaleString("en-US")} funds with money in` : "read from EDGAR"}
            href={`${base}?tab=raises`}
            defn="Pooled funds that filed a Form D and whose name or stated fund type places them in this class. Sold-to-date is the fund's own figure on its latest filing."
          />
        ) : null}
        {book ? <Stat label="Loan books" value={book.lenders.toLocaleString("en-US")} basis={`${book.positions.toLocaleString("en-US")} positions, ${formatUsd(book.fairValue)}`} href={`${base}?tab=loans`} /> : null}
        <Stat label="Signals" value={page.signals.length.toLocaleString("en-US")} basis="dated news items" href={`${base}?tab=signals`} />
      </StatStrip>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            {!isSports ? (
              <Box title="Largest managers" count={page.largest.length} action={<Link href={`${base}?tab=managers`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All managers</Link>} flush>
                <FirmTable firms={page.largest} />
              </Box>
            ) : null}
            <Box title="Latest deals" count={page.deals.length} action={<Link href={`${base}?tab=deals`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All deals</Link>} flush>
              <DealTable deals={page.deals.slice(0, 10)} showClass={false} compact />
            </Box>
            {!isSports ? (
              <Box title="Who these managers use" defn="Auditors, administrators, custodians, prime brokers and placement agents the class's managers name on Form ADV Schedule D. Counts are distinct managers, not filings.">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {page.leagues.map((l) => (
                    <ProviderMini
                      key={l.role}
                      role={l.role}
                      covered={l.covered}
                      rows={l.rows.map((r) => ({ key: r.brand.key, name: r.brand.name, companyId: r.brand.companyId, clients: r.clients, share: r.share }))}
                      domainOf={domainOf}
                    />
                  ))}
                </div>
              </Box>
            ) : null}
          </div>
          <div className="space-y-4">
            <Box title="Signals" count={page.signals.length} action={<Link href={`${base}?tab=signals`} className="text-[11.5px] text-muted-foreground hover:text-foreground">All</Link>} flush>
              <SignalList signals={page.signals} showClass={false} limit={8} />
            </Box>
            {!isSports ? (
              <Box title="Where they are" count={page.countries.length}>
                <ul className="space-y-1">
                  {page.countries.slice(0, 10).map(([c, n]) => (
                    <li key={c} className="flex items-center gap-2 text-[12px]">
                      <Link href={`/database?book=GP&type=${encodeURIComponent(cls.gpTypes[0] ?? "")}&country=${encodeURIComponent(c)}`} className="min-w-0 flex-1 truncate">
                        {c}
                      </Link>
                      <span className="inline-block h-[4px] w-14 overflow-hidden rounded-[2px] bar-track">
                        <span className="block h-full bar-fill" style={{ width: `${Math.round((n / (page.countries[0]?.[1] || 1)) * 100)}%` }} />
                      </span>
                      <span className="figure w-8 text-right text-[11px] text-muted-foreground">{n}</span>
                    </li>
                  ))}
                </ul>
              </Box>
            ) : null}
            {!isSports && page.newest.length ? (
              <Box title="Newest managers">
                <ul className="space-y-1.5">
                  {page.newest.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-[12px]">
                      <CompanyLogo name={m.name} domain={m.domain} size={18} />
                      <Link href={`/companies/${m.id}`} className="min-w-0 flex-1 truncate">
                        {m.name}
                      </Link>
                      <span className="figure text-[11px] text-muted-foreground">{m.founded}</span>
                    </li>
                  ))}
                </ul>
              </Box>
            ) : null}
            <Box title="Recent LP commitments" count={page.commitments.length} flush>
              {page.commitments.length ? (
                <ul className="divide-y">
                  {page.commitments.slice(0, 6).map((c) => (
                    <li key={c.id} className="px-3 py-2 text-[12px]">
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 truncate">
                          {c.lp_company_id ? <Link href={`/companies/${c.lp_company_id}`} className="font-medium">{c.lp_label}</Link> : <span className="font-medium">{c.lp_label}</span>}
                          <span className="text-muted-foreground"> → </span>
                          {c.gp_company_id ? <Link href={`/companies/${c.gp_company_id}`}>{c.gp_label}</Link> : c.gp_label}
                        </span>
                        <span className="figure shrink-0">{c.amount != null ? formatMoney(c.amount, c.currency) : (c.amount_text ?? "")}</span>
                      </div>
                      <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{c.fund_label}</span>
                        <Src url={c.source_url} name={c.commitment_date_text ?? (c.commitment_year ? String(c.commitment_year) : null)} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No disclosed commitment is placed in this class yet. They arrive with the LP disclosures the database loads monthly.</Empty>
              )}
            </Box>
          </div>
        </div>
      ) : null}

      {tab === "strategies" && metrics ? <StrategiesPanel metrics={metrics} selected={selectedStrategy} base={base} domainOf={domainOf} /> : null}

      {tab === "managers" ? (
        <Box title="Managers" count={page.managers.length} flush>
          <FirmTable firms={[...page.managers].sort((a, b) => (b.aum ?? 0) - (a.aum ?? 0) || b.contacts - a.contacts)} />
        </Box>
      ) : null}

      {tab === "funds" ? (
        <Box title="Funds" count={page.funds.length} flush defn="Funds whose own name places them in this class come first (tagged 'by name'); the rest are funds of managers in the class.">
          {page.funds.length ? (
            <>
              <div className="desk-scroll">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Fund</th>
                      <th>Manager</th>
                      <th>Placed by</th>
                      <th>Vehicle</th>
                      <th>Domicile</th>
                      <th className="num">Size</th>
                      <th>Providers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.funds.slice(0, limit).map((f) => (
                      <tr key={f.id} className="linked">
                        <td className="min-w-[240px] max-w-[360px]">
                          <Link href={`/funds/${f.id}`} className="cover block truncate font-medium" title={f.name}>
                            {f.name}
                          </Link>
                        </td>
                        <td className="max-w-[220px] whitespace-nowrap">
                          {f.manager ? (
                            <Link href={`/companies/${f.manager.id}`} className="inline-flex max-w-full items-center gap-1.5">
                              <CompanyLogo name={f.manager.name} domain={f.manager.domain} size={16} /> <span className="truncate">{f.manager.name}</span>
                            </Link>
                          ) : (
                            <span className="block truncate text-muted-foreground">{f.managerName ?? "—"}</span>
                          )}
                        </td>
                        <td>
                          <Tag strong={f.basis === "name"}>{f.basis === "name" ? "Fund name" : "Manager type"}</Tag>
                        </td>
                        <td className="text-muted-foreground">{f.kind ?? "—"}</td>
                        <td className="text-muted-foreground">{f.domicile ?? "—"}</td>
                        <td className="num">{f.size != null ? formatUsd(f.size) : "—"}</td>
                        <td className="max-w-[260px] truncate text-[11.5px] text-muted-foreground" title={f.providers.map((p) => p.name).join(", ")}>
                          {f.providers
                            .slice(0, 3)
                            .map((p) => p.name)
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ShowMore href={`${base}?tab=funds&n=${limit + STEP}`} step={STEP} left={page.funds.length - Math.min(limit, page.funds.length)} />
            </>
          ) : (
            <Empty>
              No funds placed in this class yet. Funds arrive with the Master Directory import (Form ADV Schedule D) and the SEC&rsquo;s Form D filings;{" "}
              <Link href="/funds" className="underline underline-offset-2 hover:text-foreground">
                the Funds page
              </Link>{" "}
              searches every one on file.
            </Empty>
          )}
        </Box>
      ) : null}

      {tab === "commitments" ? (
        <Box title="LP commitments" count={page.commitments.length} flush defn="Commitments limited partners have published (board papers, annual reports, press). Placed in this class by the fund's name or the manager's type.">
          <CommitmentTable rows={page.commitments} />
        </Box>
      ) : null}

      {tab === "deals" ? (
        <Box title="Deals" count={page.deals.length} flush>
          <DealTable deals={page.deals} showClass={false} />
        </Box>
      ) : null}

      {tab === "raises" && raises ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Box title="Filings by month" defn="Latest Form D per fund, by the month it was filed. Bars are filings; hover for the amount sold.">
              <Columns rows={raises.byMonth.map((m) => ({ label: m.label, value: m.count, hint: `${formatUsd(m.sold)} sold` }))} height={90} />
            </Box>
            <Box title="Sold to date by fund type" defn="What the funds state they have sold so far, by the fund type ticked on the form.">
              <ShareBar segments={raises.byType.map((t, i) => ({ key: t.label, label: t.label, value: t.sold, hue: `var(--chart-${(i % 7) + 1})` }))} format={(v) => formatUsd(v)} />
            </Box>
            <Box title="Placement agents" count={raises.agents.length} defn="Broker-dealers named as sales compensation recipients, by the number of funds that name them.">
              {raises.agents.length ? (
                <ul className="space-y-1">
                  {raises.agents.slice(0, 8).map((a) => (
                    <li key={a.name} className="flex items-center gap-2 text-[12px]">
                      <span className="min-w-0 flex-1 truncate">{a.name}</span>
                      <span className="inline-block h-[4px] w-14 overflow-hidden rounded-[2px] bar-track">
                        <span className="block h-full bar-fill" style={{ width: `${Math.round((a.funds / (raises.agents[0]?.funds || 1)) * 100)}%` }} />
                      </span>
                      <span className="figure w-6 text-right text-[11px] text-muted-foreground">{a.funds}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>None named yet.</Empty>
              )}
            </Box>
          </div>
          <Box title="Form D raises" count={raises.filings} flush defn="The latest Form D per pooled fund in this class, newest filing first. Sold-to-date and investor counts are the fund's own figures; the general partner is the related person the filing names as such.">
            <OfferingTable rows={offerings} showClass={false} />
            <ShowMore href={`${base}?tab=raises&n=${limit + STEP}`} step={STEP} left={raises.filings - offerings.length} />
          </Box>
        </div>
      ) : null}

      {tab === "loans" && book ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Fair value by seniority" defn="Every parsed lender's latest book, grouped by what the tagged instrument says.">
              <ShareBar segments={book.byInstrument.map((s) => ({ key: s.label, label: s.label, value: s.value, hue: INSTRUMENT_HUE[s.label] }))} format={(v) => formatUsd(v)} />
            </Box>
            <Box title="Spread distribution" defn="Positions by spread over the reference rate, in 100 bp bins.">
              <Columns rows={book.spreadBins.map((b) => ({ label: b.label, value: b.count }))} height={90} />
            </Box>
          </div>
          <Box
            title="Lenders"
            count={lenders.length}
            flush
            action={<Link href="/database/lenders" className="text-[11.5px] text-muted-foreground hover:text-foreground">Open the loan books</Link>}
            defn="Business development companies whose schedule of investments the database has parsed from their own 10-Q and 10-K."
          >
            <LenderTable rows={lenders} />
          </Box>
        </div>
      ) : null}

      {tab === "assets" && ASSET_VIEW[cls.key] ? (
        <Box
          title={ASSET_VIEW[cls.key].title}
          flush
          defn={ASSET_VIEW[cls.key].blurb}
          action={
            cls.key === "private_credit" ? (
              <Link href="/database/borrowers" className="text-[11.5px] text-muted-foreground hover:text-foreground">Open the borrowers desk →</Link>
            ) : (
              <Link href="/database/portcos" className="text-[11.5px] text-muted-foreground hover:text-foreground">Open the portfolio desk →</Link>
            )
          }
        >
          <p className="border-b px-3 py-2 text-[12px] text-muted-foreground">{ASSET_VIEW[cls.key].blurb}</p>
          {cls.key === "private_credit" ? (
            <p className="px-3 py-4 text-[12.5px]">
              The loan-by-loan view lives on the <Link href="/database/borrowers" className="underline">borrowers desk</Link> (22,000+ borrowers across every parsed lender) and the <Link href="/database/lenders" className="underline">loan books</Link>.
            </p>
          ) : assetRows.length ? (
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Held by</th>
                    <th>Where</th>
                    <th>Sector</th>
                    <th className="num">Since</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {assetRows.map((r) => (
                    <tr key={r.id} className={r.intel_key ? "linked" : undefined}>
                      <td className="max-w-[300px]">
                        <span className="block truncate font-medium" title={r.name}>
                          {r.intel_key ? (
                            <Link href={portcoHref(r.intel_key)} className="cover">
                              {r.name}
                            </Link>
                          ) : (
                            r.name
                          )}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate" title={r.gp?.name ?? undefined}>
                        <Link href={`/companies/${r.gp_company_id}?tab=portfolio`}>{r.gp?.name ?? "Sponsor"}</Link>
                      </td>
                      <td className="max-w-[200px] truncate text-muted-foreground" title={r.asset_location ?? r.hq ?? undefined}>{r.asset_location ?? r.hq ?? "—"}</td>
                      <td className="max-w-[180px] truncate text-muted-foreground" title={r.sector ?? undefined}>{r.sector ?? "—"}</td>
                      <td className="num text-muted-foreground">{r.invested_year ?? "—"}</td>
                      <td>{r.status ? <Tag>{r.status}</Tag> : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              None on file yet for this class. The portfolio research now asks for the physical asset itself (the road, the bridge, the pipeline, the building) with where it is; it fills this table as sponsors are read.
            </Empty>
          )}
        </Box>
      ) : null}

      {tab === "signals" ? (
        <Box title="Signals" count={page.signals.length} flush>
          <SignalList signals={page.signals} showClass={false} />
        </Box>
      ) : null}

    </IntelShell>
  );
}
