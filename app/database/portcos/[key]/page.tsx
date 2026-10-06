import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Globe, Layers } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { PositionTable } from "@/components/intel/filings-tables";
import { InvestmentLedger, InvestmentStrip, moneyFacts } from "@/components/intel/investments";
import { confirmedLeaders, profileFacts, SourceMark } from "@/components/intel/portco-profile";
import { dateLabel } from "@/components/intel/tables";
import { Box, Src } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { holdingStatus } from "@/components/story/portco-card";
import { BackLink, Chapter, Chip, Figure, Figures, StoryPage } from "@/components/story/story";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { borrowerPositions, getBorrower, getPortcoIntel, portcoHolders, type PortcoHolder } from "@/lib/directory/filings-queries";
import { holdingFunds } from "@/lib/directory/fund-portfolio";
import { signalsNaming } from "@/lib/directory/intelligence-queries";
import { AMOUNT_BASIS_LABEL, formatMoney } from "@/lib/directory/intelligence-types";
import { LEAD_ROLE_LABEL, leadership, type PortcoIntel } from "@/lib/directory/portco-intel";
import { getPortcoDeals } from "@/lib/directory/portco-queries";
import { DEAL_BASIS_LABEL } from "@/lib/directory/portfolio";
import { formatUsd } from "@/lib/utils";

// A company behind the deals, read as a story like a firm's or a fund's:
// who it is in a sentence, its headline figures, then who backs it (and
// through which fund), what it is, who runs it, the money announced around
// it, its filed accounts, the loan books that hold it and the news. Every
// sponsor leads to the sponsor, every fund to the fund. Nothing here is
// estimated; a chapter with nothing on file is not drawn.

export const dynamic = "force-dynamic";

const REGISTER = "https://find-and-update.company-information.service.gov.uk/company/";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const k = decodeURIComponent(key);
  const [intel, borrower, holders, deals] = await Promise.all([getPortcoIntel([k]), getBorrower(k), portcoHolders(k), getPortcoDeals(k)]);
  const name = holders[0]?.name ?? intel.get(k)?.name ?? borrower?.borrower ?? deals[0]?.target;
  return { title: name ? `${name} — LPGP Intelligence` : "Company — LPGP Intelligence" };
}

const year = (d: string | null | undefined) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);
const lowerFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
const listOf = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** "Backed by Nordic Capital since 2026 through Nordic Capital Evolution I." — only what the holdings say. */
function backedSentence(holders: PortcoHolder[]): string | null {
  if (!holders.length) return null;
  const held = holders.filter((h) => holdingStatus(h.status)?.held !== false);
  const exited = holders.filter((h) => holdingStatus(h.status)?.held === false);
  const parts: string[] = [];
  if (held.length) {
    const h = held[0];
    const who = listOf(held.map((x) => x.gp_name ?? "a sponsor"));
    parts.push(`Backed by ${who}${held.length === 1 && h.invested_year ? ` since ${h.invested_year}` : ""}${held.length === 1 && h.fund_name ? ` through ${h.fund_name}` : ""}.`);
  }
  if (exited.length) parts.push(`Formerly held by ${listOf(exited.map((x) => `${x.gp_name ?? "a sponsor"}${x.exit_year ? ` (exited ${x.exit_year})` : ""}`))}.`);
  return parts.join(" ");
}

export default async function PortcoPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const k = decodeURIComponent(key);
  const [intelMap, borrower, holders, deals] = await Promise.all([getPortcoIntel([k]), getBorrower(k), portcoHolders(k), getPortcoDeals(k)]);
  const intel = intelMap.get(k) ?? null;
  if (!intel && !borrower && !holders.length && !deals.length) notFound();
  const name = holders[0]?.name ?? intel?.name ?? borrower?.borrower ?? deals[0].target;
  const [positions, signals, funds] = await Promise.all([borrower ? borrowerPositions(k) : [], signalsNaming([name], 12), holdingFunds(holders)]);

  const money = moneyFacts(deals);
  const domain = intel?.domain ?? holders.find((h) => h.domain)?.domain ?? null;
  const description = intel?.description ?? holders.find((h) => h.description)?.description ?? null;
  const sector = intel?.sector ?? holders.find((h) => h.sector)?.sector ?? null;
  const place = intel?.country ?? holders.find((h) => h.hq)?.hq ?? null;
  const founded = intel?.founded_year ?? null;
  const facts = profileFacts(intel);
  const leaders = confirmedLeaders(intel);
  const leaderNames = new Set(leaders.map((l) => l.name.toLowerCase()));
  const others = intel ? leadership(intel).filter((p) => !leaderNames.has(p.name.toLowerCase())) : [];
  const unconfirmed = (intel?.leaders ?? []).filter((l) => !l.confirmed && !leaderNames.has(l.name.toLowerCase()));
  const filed = intel && (intel.revenue != null || intel.operating_profit != null || intel.net_assets != null);
  const firstDeal = deals.map((d) => year(d.date)).filter((y): y is number => y != null).sort()[0];
  const investedYear = holders.map((h) => h.invested_year).filter((y): y is number => y != null).sort()[0];
  const priced = holders.find((h) => h.deal_value != null);
  const kind = holders.length && borrower ? "Portfolio company · borrower" : holders.length ? "Portfolio company" : borrower ? "Borrower" : "Company";
  const ukName = /\b(limited|ltd|plc|llp)\b/i.test(name);

  // The sentence that says what it is, from the words its records carry.
  const what = description ?? (sector ? `A ${lowerFirst(sector)} company` : "A company");
  const where = !description && place ? ` based in ${place}` : "";
  const since = !description && founded ? `, founded in ${founded}` : "";
  const backed = backedSentence(holders);
  const lent = borrower ? `${borrower.lenders} lender${borrower.lenders === 1 ? " holds" : "s hold"} its debt in their latest books.` : null;

  const chapters: ChapterLink[] = [];
  let n = 0;
  const next = (id: string, label: string, count?: number | null) => {
    n += 1;
    chapters.push({ id, label, count });
    return n;
  };
  const nBackers = holders.length ? next("backers", "Backers", holders.length) : 0;
  const nCompany = facts.length ? next("company", "The company", null) : 0;
  const nPeople = leaders.length || others.length ? next("people", "People", leaders.length + others.length) : 0;
  const nMoney = deals.length ? next("investments", "Investments", deals.length) : 0;
  const nAccounts = filed || intel?.ch_number ? next("accounts", "Accounts", null) : 0;
  const nLoans = borrower ? next("loans", "Loan books", positions.length || borrower.lenders) : 0;
  const nNews = signals.length ? next("news", "News", signals.length) : 0;

  const turnover = intel?.revenue_stated != null ? { v: formatMoney(intel.revenue_stated, intel.revenue_currency), b: intel.revenue_period ?? "as stated" } : intel?.revenue != null ? { v: formatMoney(intel.revenue, intel.currency), b: intel.accounts_period_end ? `filed, to ${dateLabel(intel.accounts_period_end)}` : "filed accounts" } : null;
  const ebitda = intel?.ebitda_stated != null ? { v: formatMoney(intel.ebitda_stated, intel.ebitda_currency), b: [intel.ebitda_period, intel.ebitda_basis].filter(Boolean).join(" · ") || "as stated" } : intel?.ebitda_derived != null ? { v: formatMoney(intel.ebitda_derived, intel.currency), b: "operating profit + D&A, arithmetic" } : null;
  const staff = intel?.employees_text ?? (intel?.employees != null ? intel.employees.toLocaleString("en-US") : null);
  const largest = money.largest[0];

  return (
    <StoryPage>
      <BackLink href={holders.length ? "/database/portcos" : "/database/borrowers"} label={holders.length ? "Portfolio companies" : "Borrowers"} />
      <header className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <span className="story-logo shrink-0" style={{ borderRadius: 18 }}>
          <CompanyLogo name={name} domain={domain} size={72} />
        </span>
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">
            {kind}
            {sector ? ` · ${sector}` : ""}
          </div>
          <h1 className="story-name mt-2">{name}</h1>
          <p className="story-lede mt-3">
            <strong>
              {what}
              {where}
              {since}
              {/[.!?]$/.test(what) && !where && !since ? "" : "."}
            </strong>{" "}
            {[backed, lent].filter(Boolean).join(" ")}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {holders.length ? (() => {
              const s = holdingStatus(holders[0].status);
              return s ? <Chip strong={s.held}>{s.label}</Chip> : null;
            })() : null}
            {place ? <Chip>{place}</Chip> : null}
            {founded ? <Chip>Founded {founded}</Chip> : null}
            {intel?.business_model ? <Chip>{intel.business_model}</Chip> : null}
            {intel?.website ? (
              <a href={intel.website} target="_blank" rel="noreferrer" className="story-chip inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3 w-3" /> {intel.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
              </a>
            ) : null}
          </div>
        </div>
        {holders.length ? (
          <Link href={`/companies/${holders[0].gp_company_id}`} className="story-card flex w-full items-center gap-3 p-3 md:w-[280px]">
            <CompanyLogo name={holders[0].gp_name ?? "Sponsor"} domain={holders[0].gp_domain} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] text-muted-foreground">{holdingStatus(holders[0].status)?.held === false ? "Formerly held by" : "Backed by"}</span>
              <span className="block truncate text-[14px] font-medium">{holders[0].gp_name ?? "Sponsor"}</span>
              {holders.length > 1 ? <span className="block text-[11.5px] text-muted-foreground">and {holders.length - 1} more</span> : null}
            </span>
            <ArrowUpRight className="story-card-arrow h-4 w-4" />
          </Link>
        ) : null}
      </header>

      <Figures>
        {staff ? <Figure label="Employees" value={staff} basis={intel?.employees_as_of ? `as of ${intel.employees_as_of.slice(0, 10)}` : intel?.accounts_period_end && intel.employees != null ? "average, filed accounts" : undefined} href={nCompany ? "#company" : undefined} /> : null}
        {turnover ? <Figure label="Revenue" value={turnover.v} basis={turnover.b} /> : null}
        {ebitda ? <Figure label="EBITDA" value={ebitda.v} basis={ebitda.b} /> : null}
        {priced ? (
          <Figure label="Deal value" value={formatMoney(priced.deal_value!, priced.deal_currency)} basis={`${DEAL_BASIS_LABEL[priced.deal_value_basis ?? "unspecified"]}${priced.gp_name ? `, ${priced.gp_name}` : ""}`} href="#backers" />
        ) : largest ? (
          <Figure label={`Largest stated, ${largest.currency}`} value={formatMoney(largest.amount, largest.currency)} basis={`${AMOUNT_BASIS_LABEL[largest.basis ?? "unspecified"] ?? "as reported"} · ${(DEAL_KIND_LABEL[largest.kind] ?? largest.kind).toLowerCase()}`} href={`/database/deals/${largest.id}`} />
        ) : null}
        {investedYear ? <Figure label="Invested" value={investedYear} basis={holders.find((h) => h.invested_year === investedYear)?.gp_name ?? undefined} href="#backers" /> : null}
        {deals.length ? <Figure label="Deals on file" value={deals.length} basis={firstDeal ? `since ${firstDeal}` : undefined} href="#investments" /> : null}
        {borrower?.fair_value != null ? <Figure label="Debt held, fair value" value={formatUsd(borrower.fair_value)} basis={`${borrower.lenders} lender${borrower.lenders === 1 ? "" : "s"}`} href="#loans" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />

      {nBackers ? (
        <Chapter
          id="backers"
          n={nBackers}
          eyebrow="Backers"
          title={holders.length === 1 ? `${holders[0].gp_name ?? "One sponsor"} ${holdingStatus(holders[0].status)?.held === false ? "held" : "backs"} ${name}.` : `${holders.length} sponsors have backed ${name}.`}
          lead="As each sponsor's own site or release names it: when it went in, through which fund, what was paid when a page states it, and what the sponsor plans."
        >
          <div className="grid gap-3 lg:grid-cols-2">
            {holders.map((h, i) => {
              const s = holdingStatus(h.status);
              const fund = funds.get(h.id);
              return (
                <div key={h.id} className={`story-card p-4 ${i === 0 ? "story-card-hero" : ""}`}>
                  <Link href={`/companies/${h.gp_company_id}`} className="group flex items-center gap-3">
                    <CompanyLogo name={h.gp_name ?? "Sponsor"} domain={h.gp_domain} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium group-hover:underline">{h.gp_name ?? "Sponsor"}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{[h.asset_class, h.deal_type].filter(Boolean).join(" · ") || "Sponsor"}</span>
                    </span>
                    <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
                  </Link>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {s ? <Chip strong={s.held}>{s.label}</Chip> : null}
                    {h.invested_year ? <Chip>Since {h.invested_year}</Chip> : null}
                    {h.exit_year ? <Chip>Exited {h.exit_year}</Chip> : null}
                    {h.stake_pct != null ? <Chip>{h.stake_pct}% stake</Chip> : null}
                  </div>
                  {h.fund_name ? (
                    fund ? (
                      <Link href={`/funds/${fund.id}`} className="mt-3 flex items-center gap-2.5 rounded-[10px] border px-3 py-2 transition-colors hover:border-[var(--primary)]">
                        <span className="icon-tile h-7 w-7 rounded-[8px]">
                          <Layers className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] text-muted-foreground">Through the fund</span>
                          <span className="block truncate text-[13.5px] font-medium">{h.fund_name}</span>
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </Link>
                    ) : (
                      <div className="mt-3 flex items-center gap-2.5 rounded-[10px] border px-3 py-2">
                        <span className="icon-tile h-7 w-7 rounded-[8px]">
                          <Layers className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] text-muted-foreground">Through</span>
                          <span className="block truncate text-[13.5px] font-medium">{h.fund_name}</span>
                        </span>
                      </div>
                    )
                  ) : null}
                  {h.deal_value != null || h.equity_invested != null ? (
                    <dl className="mt-4 grid grid-cols-2 gap-3">
                      {h.deal_value != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Deal value</dt>
                          <dd className="figure text-[15px]">{formatMoney(h.deal_value, h.deal_currency)}</dd>
                          <dd className="text-[11px] text-muted-foreground">{DEAL_BASIS_LABEL[h.deal_value_basis ?? "unspecified"]}</dd>
                        </div>
                      ) : null}
                      {h.equity_invested != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Equity invested</dt>
                          <dd className="figure text-[15px]">{formatMoney(h.equity_invested, h.deal_currency)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  {h.co_investors?.length ? <p className="mt-3 text-[12.5px] text-muted-foreground">Alongside {listOf(h.co_investors)}.</p> : null}
                  {h.value_creation_plan ? (
                    <blockquote className="mt-4 border-l-2 border-[var(--primary)] pl-3 text-[13.5px] leading-relaxed">
                      <div className="mb-1 text-[11px] text-muted-foreground">The plan</div>
                      {h.value_creation_plan} {h.value_creation_source_url ? <Src url={h.value_creation_source_url} name="Source" /> : null}
                    </blockquote>
                  ) : null}
                  {h.status_note || h.notes ? <p className="mt-3 text-[12px] leading-snug text-muted-foreground">{[h.status_note, h.notes].filter(Boolean).join(" ")}</p> : null}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 text-[11.5px] text-muted-foreground">
                    <Src url={h.source_url} name="Portfolio page" />
                    {h.deal_source_url ? <Src url={h.deal_source_url} name="Deal terms" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Chapter>
      ) : null}

      {nCompany ? (
        <Chapter id="company" n={nCompany} eyebrow="The company" title={`What ${name} is.`} lead="Each fact with the page that states it; a check means the page is a primary source or major press. Hover a source for the sentence it uses.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {facts.map((f) => (
              <div key={f.k} className="story-card p-3.5">
                <div className="text-[11.5px] text-muted-foreground">{f.k}</div>
                <div className="mt-1 text-[14.5px] font-medium leading-snug">{f.v}</div>
                {f.src?.url ? (
                  <div className="mt-2 text-[11.5px]">
                    <SourceMark src={f.src} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </Chapter>
      ) : null}

      {nPeople ? (
        <Chapter id="people" n={nPeople} eyebrow="People" title={leaders.length ? `Who runs ${name}.` : `Who is on file at ${name}.`} lead="Named executives come from the company, the sponsor, a filing or major press. Officers are as the UK register lists them; previews name people by title only.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {leaders.map((l) => (
              <div key={`l-${l.name}`} className="story-card flex items-center gap-3 p-3.5">
                <PersonAvatar name={l.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{l.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{l.title}</span>
                  <span className="mt-1 block text-[11px]">
                    <SourceMark src={l.src} />
                  </span>
                </span>
                <Chip strong>{l.role}</Chip>
              </div>
            ))}
            {others.slice(0, 12).map((p, i) => {
              const body = (
                <>
                  <PersonAvatar name={p.name} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{p.title}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {p.source === "lusha" ? "People search preview" : `Companies House${p.since ? `, since ${dateLabel(p.since)}` : ""}`}
                    </span>
                  </span>
                  {p.role !== "other" ? <Chip>{LEAD_ROLE_LABEL[p.role]}</Chip> : null}
                </>
              );
              return p.linkedin_url ? (
                <a key={`o-${p.name}-${i}`} href={p.linkedin_url} target="_blank" rel="noreferrer" className="story-card flex items-center gap-3 p-3.5">
                  {body}
                </a>
              ) : (
                <div key={`o-${p.name}-${i}`} className="story-card flex items-center gap-3 p-3.5">
                  {body}
                </div>
              );
            })}
          </div>
          {unconfirmed.length ? (
            <p className="mt-4 text-[12px] text-muted-foreground">
              Not yet confirmed by a primary source: {unconfirmed.slice(0, 6).map((l) => `${l.name} (${l.title ?? l.role})`).join(", ")}.
            </p>
          ) : null}
        </Chapter>
      ) : null}

      {nMoney ? (
        <Chapter
          id="investments"
          n={nMoney}
          eyebrow="Investments"
          title={`${deals.length} announcement${deals.length === 1 ? "" : "s"} putting money into ${name}.`}
          lead="Buyouts, stakes, rounds, add-ons, financings and exits, each figure as its page states it and what it measures. A check means it was re-read against the page before it was stored."
        >
          <Figures>
            {money.largest.slice(0, 2).map((t) => (
              <Figure key={t.currency} label={`Largest stated, ${t.currency}`} value={formatMoney(t.amount, t.currency)} basis={`${AMOUNT_BASIS_LABEL[t.basis ?? "unspecified"] ?? "as reported"} · ${(DEAL_KIND_LABEL[t.kind] ?? t.kind).toLowerCase()}`} href={`/database/deals/${t.id}`} />
            ))}
            {money.raised.slice(0, 2).map((t) => (
              <Figure key={`r-${t.currency}`} label={`Raised in rounds, ${t.currency}`} value={formatMoney(t.total, t.currency)} basis={`${t.n} round${t.n === 1 ? "" : "s"} with a stated size`} />
            ))}
            <Figure label="Checked against the page" value={deals.filter((d) => d.verified).length} basis={`of ${deals.length}`} />
          </Figures>
          <div className="desk mt-5">
            <Box title="Every announcement" count={deals.length} flush>
              <InvestmentStrip deals={deals} />
              <InvestmentLedger deals={deals} />
            </Box>
          </div>
        </Chapter>
      ) : null}

      {nAccounts && intel ? <AccountsChapter n={nAccounts} intel={intel} name={name} /> : null}

      {nLoans && borrower ? (
        <Chapter id="loans" n={nLoans} eyebrow="Loan books" title={`${borrower.lenders} lender${borrower.lenders === 1 ? " holds" : "s hold"} its debt.`} lead="Every position naming it in each parsed lender's latest schedule of investments, as the lender tagged it.">
          <Figures>
            <Figure label="Fair value" value={formatUsd(borrower.fair_value ?? 0)} basis={borrower.as_of ? `as of ${dateLabel(borrower.as_of)}` : "latest books"} />
            {borrower.mark != null ? <Figure label="Mark" value={Math.round(borrower.mark * 100)} basis="fair value over cost, cents on the dollar" /> : null}
            {borrower.spread != null ? <Figure label="Spread" value={`${Math.round(borrower.spread * 100)} bp`} basis="fair-value weighted" /> : null}
            {borrower.rate != null ? <Figure label="Rate" value={`${borrower.rate.toFixed(2)}%`} basis="fair-value weighted" /> : null}
            {borrower.next_maturity ? <Figure label="Next maturity" value={dateLabel(borrower.next_maturity)} basis="earliest tagged" /> : null}
          </Figures>
          {positions.length ? (
            <div className="desk mt-5">
              <Box title="Positions" count={positions.length} flush>
                <PositionTable rows={positions} showLender limit={100} />
              </Box>
            </div>
          ) : null}
        </Chapter>
      ) : null}

      {nNews ? (
        <Chapter id="news" n={nNews} eyebrow="In the news" title="What has been said about it.">
          <div className="grid gap-3 md:grid-cols-2">
            {signals.slice(0, 8).map((s) => (
              <a key={s.id} href={s.source_url ?? undefined} target="_blank" rel="noreferrer" className="story-card p-4">
                <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
                  <span>{dateLabel(s.date)}</span>
                  {s.source_name ? <span>· {s.source_name}</span> : null}
                  <ArrowUpRight className="story-card-arrow ml-auto h-3.5 w-3.5" />
                </div>
                <p className="mt-2 text-[14px] font-medium leading-snug">{s.headline}</p>
                {s.summary ? <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{s.summary}</p> : null}
              </a>
            ))}
          </div>
        </Chapter>
      ) : null}

      {!chapters.length ? (
        <div className="story-card mt-10 p-6 text-[14px] text-muted-foreground">
          Nothing more is on file for {name} yet. The profile research fills the company, its people and its figures from its own site, filings and the sponsor&rsquo;s releases
          {ukName ? "; the daily enrichment reads the UK register" : ""}.
        </div>
      ) : null}
    </StoryPage>
  );
}

/** The UK register's view: the latest filed accounts as their tags state them, and the entry itself. */
function AccountsChapter({ n, intel, name }: { n: number; intel: PortcoIntel; name: string }) {
  const period = intel.accounts_period_end ? `to ${dateLabel(intel.accounts_period_end)}` : "latest filed";
  const m = (v: number | null) => (v == null ? null : formatMoney(v, intel.currency));
  const figs: [string, string | null, string][] = [
    ["Turnover", m(intel.revenue), period],
    ["Operating profit", m(intel.operating_profit), period],
    ["EBITDA", m(intel.ebitda_derived), "operating profit + D&A, arithmetic"],
    ["Profit before tax", m(intel.profit_before_tax), period],
    ["Net assets", m(intel.net_assets), period],
    ["Cash", m(intel.cash), period],
  ];
  return (
    <Chapter id="accounts" n={n} eyebrow="Accounts" title={intel.ch_number ? `${name} on the UK register.` : "Its filed accounts."} lead="Figures as the accounts filed at Companies House tag them. EBITDA is arithmetic on three filed figures and blank when any is missing.">
      {figs.some(([, v]) => v) ? (
        <Figures>
          {figs
            .filter(([, v]) => v)
            .map(([label, v, basis]) => (
              <Figure key={label} label={label} value={v} basis={basis} href={label === "Turnover" ? (intel.accounts_url ?? undefined) : undefined} />
            ))}
        </Figures>
      ) : null}
      {intel.ch_number ? (
        <a href={`${REGISTER}${intel.ch_number}`} target="_blank" rel="noreferrer" className="story-card mt-5 block p-4">
          <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
            Companies House · {intel.ch_number}
            <ArrowUpRight className="story-card-arrow ml-auto h-3.5 w-3.5" />
          </div>
          <div className="mt-1 text-[15px] font-medium">{intel.ch_name ?? name}</div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[11px] text-muted-foreground">Status</dt>
              <dd className="capitalize">{intel.ch_status?.replace(/-/g, " ") ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Incorporated</dt>
              <dd>{intel.incorporated_on ? dateLabel(intel.incorporated_on) : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">SIC</dt>
              <dd>{intel.sic_codes.length ? intel.sic_codes.join(", ") : "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted-foreground">Accounts</dt>
              <dd>{intel.accounts_type ?? "—"}</dd>
            </div>
          </dl>
          {intel.registered_address ? <p className="mt-3 text-[12px] text-muted-foreground">{intel.registered_address}</p> : null}
        </a>
      ) : null}
    </Chapter>
  );
}
