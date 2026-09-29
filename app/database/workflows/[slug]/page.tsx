import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyLogo } from "@/components/company-logo";
import { IntelShell } from "@/components/intel/shell";
import { BenchmarkTable } from "@/components/intel/strategies-panel";
import { CommitmentTable, DealTable, dateLabel, FirmTable, ProviderMini, SignalList } from "@/components/intel/tables";
import { Bar, Box, Empty, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { WorkflowIcon } from "@/components/intel/workflow-icon";
import { ASSET_CLASS_BY_KEY, DEAL_KIND_LABEL, type AssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { getWorkflow, WORKFLOW_BY_SLUG, WORKFLOWS, type Count, type WorkflowData } from "@/lib/directory/workflows";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const w = WORKFLOW_BY_SLUG[slug];
  return { title: w ? `${w.name} — LPGP Connect` : "Workflow — LPGP Connect" };
}

function classTag(key: string) {
  const c = ASSET_CLASS_BY_KEY[key as AssetClassKey];
  return c ? (
    <Link key={key} href={`/database/asset-classes/${c.slug}`} className="tag hover:text-foreground">
      {c.short}
    </Link>
  ) : null;
}

/** Counts with a bar: the desk's answer to a pie. */
function CountList({ rows, href }: { rows: Count[]; href?: (key: string) => string }) {
  const max = rows[0]?.count ?? 1;
  if (!rows.length) return <Empty>Nothing on file.</Empty>;
  return (
    <ul className="space-y-1 text-[12px]">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-2">
          {href ? (
            <Link href={href(r.key)} className="min-w-0 flex-1 truncate hover:underline">
              {r.key}
            </Link>
          ) : (
            <span className="min-w-0 flex-1 truncate">{r.key}</span>
          )}
          <Bar value={r.count} max={max} />
          <span className="figure w-10 text-right text-[11px] text-muted-foreground">{r.count.toLocaleString("en-US")}</span>
        </li>
      ))}
    </ul>
  );
}

function ClassTable({ classes }: { classes: WorkflowData["classes"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="desk-table">
        <thead>
          <tr>
            <th>Asset class</th>
            <th className="num">Managers</th>
            <th className="num">Reg. AUM</th>
            <th className="num">Funds</th>
            <th className="num">Deals</th>
            <th className="num">Signals</th>
          </tr>
        </thead>
        <tbody>
          {classes.map((c) => (
            <tr key={c.cls.key}>
              <td>
                <Link href={`/database/asset-classes/${c.cls.slug}`} className="font-medium">
                  {c.cls.name}
                </Link>
              </td>
              <td className="num">{c.managers.toLocaleString("en-US")}</td>
              <td className="num">{c.raum ? formatUsd(c.raum) : "—"}</td>
              <td className="num">{c.funds.toLocaleString("en-US")}</td>
              <td className="num">{c.deals.toLocaleString("en-US")}</td>
              <td className="num">{c.signals.toLocaleString("en-US")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Split({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">{children}</div>;
}

export default async function WorkflowPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const workflow = WORKFLOW_BY_SLUG[slug];
  if (!workflow) notFound();
  const d = await getWorkflow(workflow);
  const i = d.insights;
  const k = workflow.key;

  return (
    <IntelShell
      crumbs={[{ href: "/database/workflows", label: "Workflows" }, { label: workflow.name }]}
      kicker="Workflow"
      title={
        <span className="flex items-center gap-2.5">
          <WorkflowIcon name={workflow.icon} className="h-5 w-5 text-muted-foreground" />
          {workflow.name}
        </span>
      }
      description={workflow.blurb}
      tabs={<SubTabs items={WORKFLOWS.map((w) => ({ href: `/database/workflows/${w.slug}`, label: w.name, active: w.key === k }))} />}
    >
      {k === "market_intelligence" ? (
        <>
          <StatStrip>
            <Stat label="Firms" value={i.total.toLocaleString("en-US")} basis={`${i.books.GP} managers · ${i.books.LP} LPs · ${i.books.SP} providers`} href="/database?view=table" />
            <Stat label="Regulatory AUM" value={formatUsd(i.raum.sum)} basis={`${i.raum.firms} SEC filers, brand totals once`} />
            <Stat label="Funds" value={i.funds.toLocaleString("en-US")} basis="named on Form ADV" href="/funds" />
            <Stat label="Deals" value={d.deals.length.toLocaleString("en-US")} basis="sourced transactions" href="/database/deals" />
            <Stat label="Signals" value={d.signals.length.toLocaleString("en-US")} basis="dated news items" href="/database/signals" />
            <Stat label="People" value={i.people.toLocaleString("en-US")} basis={`${i.connectable.toLocaleString("en-US")} reachable`} href="/contacts" />
          </StatStrip>
          <Split>
            <div className="space-y-4">
              <Box title="The market by class" flush>
                <ClassTable classes={d.classes} />
              </Box>
              <Box title="Latest signals" count={d.signals.length} flush>
                <SignalList signals={d.signals} limit={12} />
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="Latest Form ADV filings" flush defn="Managers by the date of their most recent Form ADV, newest first.">
                <ul className="divide-y">
                  {d.filings.map((f) => (
                    <li key={f.id}>
                      <Link href={`/companies/${f.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={f.name} domain={f.domain} size={18} />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="text-[11px] text-muted-foreground">{dateLabel(f.adv_last_filed)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Box>
              <Box title="Where the managers are">
                <CountList rows={i.countries.slice(0, 10).map((c) => ({ key: c.key, count: c.count }))} href={(c) => `/database?book=GP&country=${encodeURIComponent(c)}`} />
              </Box>
              <Box title="Manager types">
                <CountList rows={i.types.slice(0, 10).map((c) => ({ key: c.key, count: c.count }))} href={(t) => `/database?type=${encodeURIComponent(t)}`} />
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "deal_sourcing" ? (
        <>
          <StatStrip>
            <Stat label="Deals on file" value={d.deals.length.toLocaleString("en-US")} href="/database/deals" />
            <Stat label="Active investors" value={d.activeInvestors.length ? d.activeInvestors[0].deals : "—"} basis={d.activeInvestors[0] ? `most: ${d.activeInvestors[0].name}` : undefined} />
            <Stat label="Fund closes" value={d.closes.length} basis="closes and fundraising milestones" />
            <Stat label="Clubs with institutional money" value={d.backedClubs.length} href="/database/sports" />
            <Stat label="Deal signals" value={d.signals.filter((s) => s.kind === "deal").length} basis="news items tagged deal" />
          </StatStrip>
          <Split>
            <div className="space-y-4">
              <Box title="Newest deals" flush>
                <DealTable deals={d.deals.slice(0, 25)} />
              </Box>
              <Box title="Fund closes and fundraising milestones" count={d.closes.length} flush>
                <DealTable deals={d.closes} compact />
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="Most active investors" flush>
                <table className="desk-table">
                  <tbody>
                    {d.activeInvestors.map((a) => (
                      <tr key={a.name}>
                        <td>
                          {a.companyId ? <Link href={`/companies/${a.companyId}`} className="font-medium">{a.name}</Link> : a.investorId ? <Link href={`/database/sports/investors/${a.investorId}`} className="font-medium">{a.name}</Link> : a.name}
                          <div className="mt-0.5 flex flex-wrap gap-1">{a.classes.map(classTag)}</div>
                        </td>
                        <td className="num">{a.deals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
              <Box title="Clubs with institutional money" flush>
                <ul className="divide-y">
                  {d.backedClubs.map((t) => (
                    <li key={t.id}>
                      <Link href={`/database/sports/${t.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={t.short_name ?? t.name} domain={t.domain} size={18} />
                        <span className="min-w-0 flex-1 truncate">
                          {t.short_name ?? t.name} <span className="text-muted-foreground">· {t.investors.slice(0, 2).join(", ")}</span>
                        </span>
                        <span className="figure text-[11px] text-muted-foreground">{formatMoney(t.valuation, t.valuation_currency)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Box>
              <Box title="Deals by kind">
                <CountList rows={d.dealKinds.map((c) => ({ key: DEAL_KIND_LABEL[c.key] ?? c.key, count: c.count }))} />
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "deal_execution" ? (
        <>
          <StatStrip>
            <Stat label="Managers with filed providers" value={i.filers.toLocaleString("en-US")} basis={`of ${i.books.GP} managers`} />
            {d.leagues.map((l) => (
              <Stat key={l.role} label={`${l.role.replace("_", " ")}s named`} value={l.covered.toLocaleString("en-US")} basis={l.rows[0] ? `most used: ${l.rows[0].brand.name}` : undefined} className="capitalize" />
            ))}
          </StatStrip>
          <Box title="Who the managers run their funds through" defn="Form ADV Schedule D names each private fund's administrator, auditor, custodian, prime broker and placement agent. Counted as distinct managers per brand.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {d.leagues.map((l) => (
                <ProviderMini key={l.role} role={l.role} rows={l.rows.map((r) => ({ key: r.brand.key, name: r.brand.name, companyId: r.brand.companyId ?? null, clients: r.clients, share: r.share }))} covered={l.covered} domainOf={d.domainOf} />
              ))}
            </div>
          </Box>
          <Box title="Deals with stated terms" count={d.termedDeals.length} flush defn="Transactions where the source states an amount and a stake or valuation — the ones a comparable can be drawn from.">
            <DealTable deals={d.termedDeals} />
          </Box>
        </>
      ) : null}

      {k === "networking" ? (
        <>
          <StatStrip>
            <Stat label="People on file" value={i.people.toLocaleString("en-US")} href="/contacts" />
            <Stat label="Reachable" value={i.connectable.toLocaleString("en-US")} basis="with an email or a Lusha match" defn="Contacts with an email on file or a Lusha search preview behind them; emails only — phones are never revealed." />
            <Stat label="Operating partners" value={i.operators.toLocaleString("en-US")} basis="contacts with an operating title" />
            <Stat label="Firms with people" value={d.records.filter((r) => r.contacts > 0).length.toLocaleString("en-US")} />
          </StatStrip>
          <Split>
            <Box title="Deepest benches" count={d.deepestBench.length} flush defn="Firms with the most people on file, whatever their book.">
              <FirmTable firms={d.deepestBench} />
            </Box>
            <div className="space-y-4">
              <Box title="Managers with operating partners" flush>
                <ul className="divide-y">
                  {d.operatorFirms.map((m) => (
                    <li key={m.id}>
                      <Link href={`/companies/${m.id}?tab=people`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={m.name} domain={m.domain} size={18} />
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        <span className="figure text-[11px] text-muted-foreground">{m.operators}</span>
                      </Link>
                    </li>
                  ))}
                  {d.operatorFirms.length === 0 ? <li className="px-3 py-2 text-[12px] text-muted-foreground">None on file yet — “Find operating partners” on a manager&rsquo;s profile searches Lusha by domain.</li> : null}
                </ul>
              </Box>
              <Box title="Go further">
                <ul className="space-y-1 text-[12.5px]">
                  <li><Link href="/contacts" className="hover:underline">People — search every contact by firm, title and role</Link></li>
                  <li><Link href="/database/lists" className="hover:underline">Lists — the firms you are working</Link></li>
                  <li><Link href="/events" className="hover:underline">Event performance — who attended what</Link></li>
                </ul>
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "due_diligence" ? (
        <>
          <StatStrip>
            <Stat label="SEC-registered" value={d.registration.registered.toLocaleString("en-US")} basis="full Form ADV" />
            <Stat label="Exempt reporting" value={d.registration.era.toLocaleString("en-US")} basis="lighter Form ADV" defn="Exempt reporting advisers file a lighter Form ADV — typically venture and smaller private fund managers." />
            <Stat label="No filing on file" value={d.registration.unfiled.toLocaleString("en-US")} basis="non-US or unmatched" />
            <Stat label="Private funds named" value={i.funds.toLocaleString("en-US")} href="/funds" />
            <Stat label="Provider links" value={i.providerLinks.toLocaleString("en-US")} basis="filed on Schedule D" />
          </StatStrip>
          <Split>
            <Box title="Largest managers, as filed" count={i.largest.length} flush defn="Regulatory AUM, the fund count and registration status, straight from Form ADV.">
              <FirmTable firms={i.largest} limit={25} />
            </Box>
            <div className="space-y-4">
              <Box title="Latest filings" flush>
                <ul className="divide-y">
                  {d.filings.map((f) => (
                    <li key={f.id}>
                      <Link href={`/companies/${f.id}?tab=providers`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={f.name} domain={f.domain} size={18} />
                        <span className="min-w-0 flex-1 truncate">{f.name}</span>
                        <span className="text-[11px] text-muted-foreground">{dateLabel(f.adv_last_filed)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Box>
              <Box title="Fund domiciles">
                <CountList rows={d.domiciles} />
              </Box>
              <Box title="Vehicle kinds">
                <CountList rows={d.vehicles} />
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "fundraising" ? (
        <>
          <StatStrip>
            <Stat label="Limited partners" value={i.books.LP.toLocaleString("en-US")} href="/database?book=LP" />
            <Stat label="Disclosing commitments" value={d.records.filter((r) => r.category === "LP" && r.discloses).length.toLocaleString("en-US")} basis="publish fund-level commitments" />
            <Stat label="Commitments on file" value={d.commitments.length.toLocaleString("en-US")} basis="from public disclosures" />
            <Stat label="LP assets" value={formatUsd(i.lpAssets.sum)} basis={`${i.lpAssets.firms} LPs stating total assets`} />
            <Stat label="Fund closes" value={d.closes.length} basis="sourced closes and milestones" />
          </StatStrip>
          <Split>
            <div className="space-y-4">
              <Box title="Latest disclosed commitments" flush>
                <CommitmentTable rows={d.commitments.slice(0, 30)} />
              </Box>
              <Box title="Fund closes on record" count={d.closes.length} flush>
                <DealTable deals={d.closes} compact />
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="LPs that disclose, by size" flush>
                <FirmTable firms={d.disclosingLps} />
              </Box>
              <Box title="LP types">
                <CountList rows={d.lpTypes} href={(t) => `/database?book=LP&type=${encodeURIComponent(t)}`} />
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "benchmarking" ? (
        <>
          <StatStrip>
            <Stat label="Published benchmarks" value={d.benchmarks.length.toLocaleString("en-US")} basis="figures with publisher and page" />
            <Stat label="Classes covered" value={new Set(d.benchmarks.map((b) => b.asset_class)).size} basis="of 8" />
            <Stat label="Publishers" value={new Set(d.benchmarks.map((b) => b.publisher)).size} />
            <Stat label="Managers sized" value={d.sizeByClass.reduce((a, s) => a + (s.q?.n ?? 0), 0).toLocaleString("en-US")} basis="with Form ADV regulatory AUM" />
          </StatStrip>
          <Box title="Manager size by class" flush defn="Form ADV regulatory AUM across each class's SEC filers, brand totals counted once — the distribution a manager can be placed against.">
            <div className="overflow-x-auto">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Asset class</th>
                    <th className="num">Filers</th>
                    <th className="num">Min</th>
                    <th className="num">Q1</th>
                    <th className="num">Median</th>
                    <th className="num">Q3</th>
                    <th className="num">Max</th>
                    <th className="num">ERA share</th>
                    <th className="num">Benchmarks</th>
                  </tr>
                </thead>
                <tbody>
                  {d.sizeByClass.map((s) => (
                    <tr key={s.cls.key}>
                      <td>
                        <Link href={`/database/asset-classes/${s.cls.slug}?tab=strategies`} className="font-medium">
                          {s.cls.name}
                        </Link>
                      </td>
                      <td className="num">{s.q?.n ?? 0}</td>
                      <td className="num">{s.q ? formatUsd(s.q.min) : "—"}</td>
                      <td className="num">{s.q ? formatUsd(s.q.q1) : "—"}</td>
                      <td className="num">{s.q ? formatUsd(s.q.median) : "—"}</td>
                      <td className="num">{s.q ? formatUsd(s.q.q3) : "—"}</td>
                      <td className="num">{s.q ? formatUsd(s.q.max) : "—"}</td>
                      <td className="num">{s.era == null ? "—" : `${Math.round(s.era * 100)}%`}</td>
                      <td className="num">{d.benchmarks.filter((b) => b.asset_class === s.cls.key).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
          <Box title="Published benchmarks" count={d.benchmarks.length} flush>
            <BenchmarkTable rows={d.benchmarks} />
          </Box>
        </>
      ) : null}

      {k === "business_development" ? (
        <>
          <StatStrip>
            <Stat label="Solution providers" value={i.books.SP.toLocaleString("en-US")} href="/database?book=SP" />
            <Stat label="Named on a filing" value={d.topProviders.length ? d.records.filter((r) => r.category === "SP" && r.clientCount > 0).length : 0} basis="providers a manager files" />
            <Stat label="Managers to serve" value={i.books.GP.toLocaleString("en-US")} basis={`${i.filers} with providers on file`} />
            <Stat label="Managers without a filed provider" value={(i.books.GP - i.filers).toLocaleString("en-US")} basis="white space" defn="Managers in the directory whose Form ADV names no provider — either not a US filer or the lineup isn't on file. The list to work." />
          </StatStrip>
          <Split>
            <div className="space-y-4">
              <Box title="Providers by managers served" count={d.topProviders.length} flush defn="Distinct managers whose filings name the provider, brand-level.">
                <FirmTable firms={d.topProviders} />
              </Box>
              <Box title="Largest providers by headcount" flush>
                <FirmTable firms={d.largestSps} />
              </Box>
            </div>
            <div className="space-y-4">
              <Box title="Provider types">
                <CountList rows={d.spTypes} href={(t) => `/database?book=SP&type=${encodeURIComponent(t)}`} />
              </Box>
              <Box title="Go further">
                <ul className="space-y-1 text-[12.5px]">
                  <li><Link href="/database/market" className="hover:underline">Service providers — league tables by role</Link></li>
                  <li><Link href="/pipeline" className="hover:underline">Pipeline — the sponsors being worked</Link></li>
                  <li><Link href="/accounts" className="hover:underline">Accounts — sponsors won</Link></li>
                </ul>
              </Box>
            </div>
          </Split>
        </>
      ) : null}

      {k === "asset_allocation" ? (
        <>
          <StatStrip>
            <Stat label="Disclosed commitments" value={d.commitments.length.toLocaleString("en-US")} />
            <Stat label="Placed in a class" value={d.allocation.reduce((a, c) => a + c.commitments, 0).toLocaleString("en-US")} basis="by the fund's name or the manager's type" />
            <Stat label="LPs disclosing" value={d.topDisclosers.length ? new Set(d.commitments.map((c) => c.lp_company_id ?? c.lp_label)).size : 0} />
            <Stat label="Stated in USD" value={d.allocation.reduce((a, c) => a + c.usdCount, 0).toLocaleString("en-US")} basis="the only ones summed below" />
          </StatStrip>
          <Split>
            <Box title="Where disclosed capital goes" flush defn="Commitments per class. The USD column adds only commitments the disclosure states in USD; other currencies are counted, never converted.">
              <div className="overflow-x-auto">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Asset class</th>
                      <th className="num">Commitments</th>
                      <th />
                      <th className="num">LPs</th>
                      <th className="num">USD-stated total</th>
                      <th className="num">of</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.allocation.map((a) => (
                      <tr key={a.cls.key}>
                        <td>
                          <Link href={`/database/asset-classes/${a.cls.slug}?tab=commitments`} className="font-medium">
                            {a.cls.name}
                          </Link>
                        </td>
                        <td className="num">{a.commitments}</td>
                        <td>
                          <Bar value={a.commitments} max={Math.max(1, ...d.allocation.map((x) => x.commitments))} />
                        </td>
                        <td className="num">{a.lps}</td>
                        <td className="num">{a.usdCount ? formatUsd(a.usd) : "—"}</td>
                        <td className="num text-muted-foreground">{a.usdCount || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Box>
            <Box title="LPs disclosing the most" flush>
              <table className="desk-table">
                <tbody>
                  {d.topDisclosers.map((l) => (
                    <tr key={l.id ?? l.name}>
                      <td>
                        {l.id ? <Link href={`/companies/${l.id}?tab=funds`} className="font-medium">{l.name}</Link> : l.name}
                        <div className="mt-0.5 flex flex-wrap gap-1">{l.classes.map(classTag)}</div>
                      </td>
                      <td className="num">{l.commitments}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Split>
          <Box title="Largest limited partners" flush defn="By total assets as the directory records them — the allocators whose disclosures matter most.">
            <FirmTable firms={d.largestLps} />
          </Box>
        </>
      ) : null}

      {k === "portfolio_management" ? (
        <>
          <StatStrip>
            <Stat label="Portfolio companies" value={i.portcos.toLocaleString("en-US")} basis="on file, each with the page that names it" />
            <Stat label="Managers with holdings on file" value={d.portcoOwners.length.toLocaleString("en-US")} />
            <Stat label="Operating partners" value={i.operators.toLocaleString("en-US")} />
            {d.portcoStatus.map((s) => (
              <Stat key={s.key} label={s.key} value={s.count} className="capitalize" />
            ))}
          </StatStrip>
          <Split>
            <Box title="Portfolio companies" count={d.portcos.length} flush>
              {d.portcos.length ? (
                <div className="overflow-x-auto">
                  <table className="desk-table">
                    <thead>
                      <tr>
                        <th>Company</th>
                        <th>Owner</th>
                        <th>Sector</th>
                        <th>HQ</th>
                        <th className="num">Invested</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.portcos.slice(0, 60).map((p) => (
                        <tr key={p.id}>
                          <td>
                            <span className="flex items-center gap-2 font-medium">
                              <CompanyLogo name={p.name} domain={p.domain} size={18} />
                              {p.name}
                            </span>
                          </td>
                          <td>{p.gp ? <Link href={`/companies/${p.gp.id}?tab=portfolio`}>{p.gp.name}</Link> : "—"}</td>
                          <td className="text-muted-foreground">{p.sector ?? "—"}</td>
                          <td className="text-muted-foreground">{p.hq ?? "—"}</td>
                          <td className="num">{p.invested_year ?? "—"}{p.exit_year ? <span className="text-muted-foreground"> → {p.exit_year}</span> : null}</td>
                          <td>{p.status ? <Tag>{p.status}</Tag> : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty>No portfolio companies on file yet — “Research portfolio” on a manager&rsquo;s profile reads its own site, or run it in bulk from Import → Master directory.</Empty>
              )}
            </Box>
            <div className="space-y-4">
              <Box title="Managers by holdings on file" flush>
                <ul className="divide-y">
                  {d.portcoOwners.map((m) => (
                    <li key={m.id}>
                      <Link href={`/companies/${m.id}?tab=portfolio`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                        <CompanyLogo name={m.name} domain={m.domain} size={18} />
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        <span className="figure text-[11px] text-muted-foreground">{m.portcos}</span>
                      </Link>
                    </li>
                  ))}
                  {d.portcoOwners.length === 0 ? <li className="px-3 py-2 text-[12px] text-muted-foreground">None yet.</li> : null}
                </ul>
              </Box>
              <Box title="Sectors">
                <CountList rows={d.sectors} />
              </Box>
            </div>
          </Split>
        </>
      ) : null}
    </IntelShell>
  );
}
