import Link from "next/link";
import { notFound } from "next/navigation";
import { assetClassBySlug } from "@/lib/directory/asset-classes";
import { getClassPage } from "@/lib/directory/asset-class-data";
import { getClassMetrics } from "@/lib/directory/strategy-data";
import { STRATEGIES_BY_CLASS } from "@/lib/directory/strategies";
import { getBookSummary, getFundOfferings, getOfferingStats, listCreditLenders } from "@/lib/directory/filings-queries";
import { getSessionUser } from "@/lib/auth";
import { ResearchClassButton } from "@/components/intel/research-buttons";
import { StrategiesPanel } from "@/components/intel/strategies-panel";
import { CompanyLogo } from "@/components/company-logo";
import { Columns, ShareBar } from "@/components/intel/charts";
import { LenderTable, OfferingTable } from "@/components/intel/filings-tables";
import { IntelShell } from "@/components/intel/shell";
import { CommitmentTable, DealTable, FirmTable, ProviderMini, SignalList } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { formatUsd } from "@/lib/utils";
import { formatMoney } from "@/lib/directory/intelligence-types";

export const dynamic = "force-dynamic";

const TABS = ["overview", "strategies", "managers", "funds", "commitments", "deals", "raises", "loans", "signals"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cls = assetClassBySlug(slug);
  return { title: cls ? `${cls.name} — LPGP Connect` : "Asset class — LPGP Connect" };
}

export default async function AssetClassPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; strategy?: string }>;
}) {
  const [{ slug }, { tab: tabParam, strategy: strategyParam }] = await Promise.all([params, searchParams]);
  const cls = assetClassBySlug(slug);
  if (!cls) notFound();
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const isSports = cls.key === "sports";
  const isCredit = cls.key === "private_credit";
  // Form D raises are read per class; the loan books only on the credit desk.
  const [page, user, raises, offerings, book, lenders] = await Promise.all([
    getClassPage(cls),
    getSessionUser(),
    isSports ? null : getOfferingStats(cls.key),
    tabParam === "raises" && !isSports ? getFundOfferings({ assetClass: cls.key, limit: 600 }) : Promise.resolve([]),
    isCredit ? getBookSummary() : null,
    tabParam === "loans" && isCredit ? listCreditLenders() : Promise.resolve([]),
  ]);
  // Strategy metrics run every strategy's placement over every manager and
  // fund in the class; only the tab that shows them pays for them.
  const strategyCount = STRATEGIES_BY_CLASS[cls.key].length;
  const metrics = tab === "strategies" && strategyCount ? await getClassMetrics(cls, page.managers, page.funds, page.brands) : null;
  const selectedStrategy = metrics?.strategies.find((s) => s.strategy.key === strategyParam) ?? null;
  const isAdmin = user?.role === "admin";
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
                <Empty>No disclosed commitments in this class yet.</Empty>
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
            <div className="overflow-x-auto">
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
                  {page.funds.slice(0, 400).map((f) => (
                    <tr key={f.id}>
                      <td className="max-w-[360px]">
                        <Link href={`/funds/${f.id}`} className="font-medium">
                          {f.name}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">
                        {f.manager ? (
                          <Link href={`/companies/${f.manager.id}`} className="inline-flex items-center gap-1.5">
                            <CompanyLogo name={f.manager.name} domain={f.manager.domain} size={16} /> {f.manager.name}
                          </Link>
                        ) : (
                          (f.managerName ?? "—")
                        )}
                      </td>
                      <td>
                        <Tag strong={f.basis === "name"}>{f.basis === "name" ? "Fund name" : "Manager type"}</Tag>
                      </td>
                      <td className="text-muted-foreground">{f.kind ?? "—"}</td>
                      <td className="text-muted-foreground">{f.domicile ?? "—"}</td>
                      <td className="num">{f.size != null ? formatUsd(f.size) : "—"}</td>
                      <td className="text-[11.5px] text-muted-foreground">
                        {f.providers
                          .slice(0, 3)
                          .map((p) => p.name)
                          .join(" · ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {page.funds.length > 400 ? <p className="px-3 py-2 text-[11px] text-muted-foreground">Showing 400 of {page.funds.length.toLocaleString("en-US")} — the Funds page searches all of them.</p> : null}
            </div>
          ) : (
            <Empty>No funds placed in this class yet.</Empty>
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
            {raises.filings > offerings.length ? <p className="px-3 py-2 text-[11px] text-muted-foreground">Showing the newest {offerings.length.toLocaleString("en-US")} of {raises.filings.toLocaleString("en-US")}.</p> : null}
          </Box>
        </div>
      ) : null}

      {tab === "loans" && book ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Fair value by seniority" defn="Every parsed lender's latest book, grouped by what the tagged instrument says.">
              <ShareBar segments={book.byInstrument.map((s, i) => ({ key: s.label, label: s.label, value: s.value, hue: `var(--chart-${(i % 7) + 1})` }))} format={(v) => formatUsd(v)} />
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

      {tab === "signals" ? (
        <Box title="Signals" count={page.signals.length} flush>
          <SignalList signals={page.signals} showClass={false} />
        </Box>
      ) : null}

    </IntelShell>
  );
}
