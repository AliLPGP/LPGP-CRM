import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { getCompanyFunds, getProviderClients, listDirectoryListNames, listsForCompany } from "@/lib/directory/queries";
import { fundClass } from "@/lib/directory/asset-classes";
import { DEAL_KIND_LABEL } from "@/lib/directory/asset-classes";
import { formatMoney, type Deal, type Signal } from "@/lib/directory/intelligence-types";
import { performanceSample } from "@/lib/directory/investor-queries";
import { getLpBook, type CurrencyTotal, type LpCommitment } from "@/lib/directory/lp-profile";
import { getGpBackers } from "@/lib/directory/gp-profile";
import { getProfilePortfolio, profileContacts, profileDeals, profileProviders, profileSignals, type ProfileCounts } from "@/lib/directory/profile-queries";
import { similarFirms } from "@/lib/directory/similar-server";
import { portcoHref } from "@/lib/directory/portco-intel";
import { ROLE_PLURAL, type ProviderRole } from "@/lib/directory/providers";
import { isOperatingRole } from "@/lib/directory/operating";
import { headlineSize } from "@/components/directory/profile-sections";
import { ClassifyControl } from "@/components/directory/profile-actions";
import { AddToListButton, FindSimilarButton } from "@/components/directory/profile-actions";
import { AddToPipelineButton } from "@/components/add-to-pipeline-button";
import { PortfolioButton } from "@/components/portfolio-button";
import { ReportButton } from "@/components/report-button";
import { CompanyLogo } from "@/components/company-logo";
import { PersonAvatar } from "@/components/person-avatar";
import { dateLabel } from "@/components/intel/tables";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { Chapter, Chip, ClassIcon, Figure, Figures, Meter, fmtMult, fmtPct } from "@/components/story/story";
import { formatUsd } from "@/lib/utils";
import type { Company, Contact } from "@/lib/types";

// A firm's profile as one story. The header (page.tsx) draws from the firm's
// own row at once; the figures and the chapters stream in behind it, each
// chapter drawn only when there is something to put in it. The chapters a
// firm gets follow what it is: an LP's book, a manager's backers, funds,
// portfolio and deals, a provider's clients. "See all" opens the chapter's
// whole list as a focused page (focus.tsx); every card leads to the next
// record in the journey: LP → class → fund → manager → its LPs.

const num = (n: number) => n.toLocaleString("en-US");
/** The profile reads at most this many deals (profileDeals); a firm at the cap has more. */
const DEALS_CAP = 300;
const dealCount = (n: number) => (n >= DEALS_CAP ? `${num(DEALS_CAP)}+` : n);
const plural = (n: number, one: string, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;

function Totals({ totals, max = 2 }: { totals: CurrencyTotal[]; max?: number }) {
  if (!totals.length) return null;
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

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// --- The header's actions and figures ----------------------------------------

export async function HeroActions({ company }: { company: Company }) {
  const [lists, onLists] = await Promise.all([listDirectoryListNames(), listsForCompany(company.id)]);
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-no-print>
      <PortfolioButton id={company.id} initial={company.in_portfolio} />
      <AddToPipelineButton companyId={company.id} />
      <AddToListButton companyId={company.id} lists={lists} onLists={onLists.map((l) => l.id)} />
      <FindSimilarButton companyId={company.id} />
      <ReportButton />
    </div>
  );
}

export async function HeroFigures({ company, counts, base }: { company: Company; counts: ProfileCounts; base: string }) {
  const size = headlineSize(company);
  const figures: React.ReactNode[] = [];
  if (size.value != null) figures.push(<Figure key="size" label={company.category === "LP" ? "Assets" : "Assets under management"} value={formatUsd(size.value)} basis={size.basis} />);

  if (company.category === "LP" && counts.asLpDisclosed > 0) {
    const book = await getLpBook(company.id);
    figures.push(<Figure key="c" label="Commitments disclosed" value={num(book.all.length)} basis={book.latestYear ? `latest in ${book.latestYear}` : undefined} href="#invests" />);
    if (book.managers) figures.push(<Figure key="m" label="Managers backed" value={num(book.managers)} basis={`across ${plural(book.classes.length, "asset class", "asset classes")}`} href="#managers" />);
    if (book.withPerformance) figures.push(<Figure key="p" label="Funds with performance" value={num(book.withPerformance)} basis="net IRR or multiple reported" href="#performance" />);
  }
  if (company.category === "GP") {
    if (counts.asGp > 0) {
      const { backers } = await getGpBackers(company.id);
      if (backers.length) figures.push(<Figure key="b" label="Investors backing it" value={num(backers.length)} basis="LPs with disclosed commitments" href="#backers" />);
    }
    if (counts.funds) figures.push(<Figure key="f" label="Funds" value={num(counts.funds)} basis={company.private_fund_count != null ? `${num(company.private_fund_count)} on Form ADV` : undefined} href="#funds" />);
    if (counts.portcos) figures.push(<Figure key="pc" label="Portfolio companies" value={num(counts.portcos)} href="#portfolio" />);
  }
  if (company.category === "SP" && counts.clients) figures.push(<Figure key="cl" label="Managers it serves" value={num(counts.clients)} basis="named on Form ADV" href="#clients" />);
  if (counts.deals && company.category !== "LP") figures.push(<Figure key="d" label="Deals" value={counts.deals >= DEALS_CAP ? `${num(DEALS_CAP)}+` : num(counts.deals)} href="#deals" />);
  if (counts.contacts) figures.push(<Figure key="pp" label="People" value={num(counts.contacts)} basis={counts.connectable ? `${num(counts.connectable)} with a direct email` : "names and titles"} href={`${base}?view=people`} />);
  if (!figures.length) return null;
  return <Figures>{figures.slice(0, 5)}</Figures>;
}

// --- Shared chapters -----------------------------------------------------------

function PeopleChapter({ id, n, contacts, base, name }: { id: string; n: number; contacts: Contact[]; base: string; name: string }) {
  const ranked = [...contacts].sort((a, b) => Number(Boolean(b.connectable)) - Number(Boolean(a.connectable)) || (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  const connectable = contacts.filter((c) => c.connectable).length;
  return (
    <Chapter
      id={id}
      n={n}
      eyebrow="People"
      title={`Who to talk to at ${name}`}
      lead={`${plural(contacts.length, "person", "people")} on file${connectable ? `, ${num(connectable)} with a direct email` : ""}.`}
      more={contacts.length > 6 ? { href: `${base}?view=people`, label: `All ${num(contacts.length)} people` } : null}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ranked.slice(0, 6).map((c) => (
          <Link key={c.id} href={`/contacts/${c.id}`} className="story-card flex items-center gap-3 p-3.5">
            <PersonAvatar name={c.full_name} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{c.full_name ?? "—"}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{c.job_title ?? "Title not on file"}</span>
            </span>
            {c.connectable ? <Mail className="h-4 w-4 shrink-0 text-[var(--success)]" aria-label="Direct email on file" /> : null}
            {isOperatingRole(c.job_title) ? <Chip>Operating</Chip> : null}
          </Link>
        ))}
      </div>
    </Chapter>
  );
}

function NewsChapter({ id, n, signals, base }: { id: string; n: number; signals: Signal[]; base: string }) {
  return (
    <Chapter id={id} n={n} eyebrow="In the news" title="What has been said lately" more={signals.length > 4 ? { href: `${base}?view=signals`, label: `All ${num(signals.length)}` } : null}>
      <div className="grid gap-3 md:grid-cols-2">
        {signals.slice(0, 4).map((s) => (
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
  );
}

function DealsChapter({ id, n, deals, base, title }: { id: string; n: number; deals: Deal[]; base: string; title: string }) {
  return (
    <Chapter id={id} n={n} eyebrow="Deals" title={title} more={deals.length > 8 ? { href: `${base}?view=deals`, label: deals.length >= DEALS_CAP ? "Every deal" : `All ${num(deals.length)} deals` } : null}>
      <div className="story-card story-rows overflow-hidden">
        {deals.slice(0, 8).map((d) => (
          <Link key={d.id} href={`/database/deals/${d.id}`} className="story-row">
            <span className="w-[92px] shrink-0 text-[12px] text-muted-foreground">{d.date ? new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : (d.date_text ?? "—")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{d.headline}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                <Chip>{DEAL_KIND_LABEL[d.kind] ?? d.kind}</Chip>
                <span className="truncate">{[d.investor, d.target].filter(Boolean).join(" → ")}</span>
              </span>
            </span>
            <span className="figure shrink-0 text-right text-[13px]">{d.amount != null ? formatMoney(d.amount, d.currency) : d.stake_pct != null ? `${d.stake_pct}%` : ""}</span>
          </Link>
        ))}
      </div>
    </Chapter>
  );
}

/** Firms like this one, at the end of the story. Reads the directory index, so it streams last. */
export async function SimilarChapter({ companyId }: { companyId: string }) {
  const hits = await similarFirms(companyId, 6);
  if (!hits.length) return null;
  return (
    <Chapter id="similar" eyebrow="Similar" title="Firms like this one" lead="By profile, type, size, place and the providers they share.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {hits.map((h) => (
          <Link key={h.record.id} href={`/companies/${h.record.id}`} className="story-card flex items-start gap-3 p-3.5">
            <CompanyLogo name={h.record.name} domain={h.record.domain} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium">{h.record.name}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{h.record.subType ?? h.record.category}</span>
              {h.reasons[0] ? <span className="mt-1 block truncate text-[11.5px] text-muted-foreground">{h.reasons[0]}</span> : null}
            </span>
            <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
          </Link>
        ))}
      </div>
    </Chapter>
  );
}

// --- An LP: where it invests, with whom, how it has done ---------------------

export async function LpStory({ company, counts, base }: { company: Company; counts: ProfileCounts; base: string }) {
  const [book, contacts, signals] = await Promise.all([counts.asLpDisclosed ? getLpBook(company.id) : null, profileContacts(company.id), profileSignals(company.id)]);
  const name = company.name;
  const chapters: ChapterLink[] = [];
  const blocks: React.ReactNode[] = [];
  let n = 0;

  if (book && book.classes.length) {
    n += 1;
    chapters.push({ id: "invests", label: "Where it invests", count: book.classes.length });
    const total = book.all.length;
    blocks.push(
      <Chapter
        key="invests"
        id="invests"
        n={n}
        eyebrow="Where it invests"
        title={`${name} commits across ${plural(book.classes.length, "asset class", "asset classes")}.`}
        lead={`${plural(book.funds, "fund")} with ${plural(book.managers, "manager")}, from its own disclosures. Open a class to see every fund in it, its manager and how it has done.`}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {book.classes.map((c, i) => {
            const share = (c.commitments / total) * 100;
            const managers = new Map<string, number>();
            for (const r of c.rows) if (r.gp_label) managers.set(r.gp_label, (managers.get(r.gp_label) ?? 0) + 1);
            const topManagers = [...managers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
            return (
              <Link key={c.key} href={`${base}?class=${c.key}`} className={`story-card flex flex-col p-4 ${i === 0 ? "story-card-hero" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <ClassIcon cls={c.key} />
                  <ArrowUpRight className="story-card-arrow h-4 w-4" />
                </div>
                <div className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">{c.name}</div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="figure text-[28px] leading-none">{Math.round(share)}%</span>
                  <span className="text-[12px] text-muted-foreground">of its commitments</span>
                </div>
                <Meter pct={share} className="mt-3" />
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Funds</dt>
                    <dd className="figure text-[15px]">{num(c.funds)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Managers</dt>
                    <dd className="figure text-[15px]">{num(c.managers)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Net IRR</dt>
                    <dd className="figure text-[15px]">{c.medianIrr != null ? fmtPct(c.medianIrr) : "—"}</dd>
                  </div>
                </dl>
                {c.totals.length ? (
                  <div className="mt-3 text-[12.5px]">
                    <Totals totals={c.totals} /> <span className="text-muted-foreground">committed</span>
                  </div>
                ) : null}
                {topManagers.length ? (
                  <div className="mt-auto flex items-center gap-2 border-t pt-3 text-[11.5px] text-muted-foreground" style={{ marginTop: 16 }}>
                    <span className="avatar-stack flex">
                      {topManagers.map(([m]) => (
                        <CompanyLogo key={m} name={m} size={22} />
                      ))}
                    </span>
                    <span className="truncate">{topManagers.map(([m]) => m).join(", ")}</span>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
        {book.unplaced ? <p className="mt-3 text-[12px] text-muted-foreground">{plural(book.unplaced, "commitment")} name neither a programme, a fund strategy nor a typed manager, so they are not placed in a class.</p> : null}
      </Chapter>,
    );

    // The managers it backs, most funds first.
    const gps = new Map<string, { id: string | null; name: string; n: number; first: number | null; latest: number | null; irr: number[] }>();
    for (const c of book.all) {
      const gname = c.gp_label ?? null;
      if (!gname) continue;
      const key = c.gp_company_id ?? `n:${gname.toLowerCase()}`;
      const e = gps.get(key) ?? { id: c.gp_company_id, name: gname, n: 0, first: null, latest: null, irr: [] };
      e.n += 1;
      if (c.commitment_year != null) {
        e.first = e.first == null ? c.commitment_year : Math.min(e.first, c.commitment_year);
        e.latest = e.latest == null ? c.commitment_year : Math.max(e.latest, c.commitment_year);
      }
      if (c.net_irr != null) e.irr.push(Number(c.net_irr));
      gps.set(key, e);
    }
    const managers = [...gps.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    if (managers.length) {
      n += 1;
      chapters.push({ id: "managers", label: "Managers", count: managers.length });
      const most = managers[0].n;
      blocks.push(
        <Chapter
          key="managers"
          id="managers"
          n={n}
          eyebrow="Relationships"
          title={`The managers ${name} backs.`}
          lead="Ranked by how many of their funds it has committed to. Each opens the manager's own story: its funds, its other investors, its portfolio."
          more={managers.length > 9 ? { href: `${base}?view=managers`, label: `All ${num(managers.length)} managers` } : null}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {managers.slice(0, 9).map((m) => {
              const body = (
                <>
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={m.name} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium">{m.name}</span>
                      <span className="block text-[12px] text-muted-foreground">
                        {plural(m.n, "fund")}
                        {m.first ? (m.first === m.latest ? ` in ${m.first}` : ` · ${m.first}–${m.latest}`) : ""}
                      </span>
                    </span>
                    {m.id ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Meter pct={(m.n / most) * 100} className="flex-1" />
                    <span className="figure w-[64px] text-right text-[12px] text-muted-foreground">{m.irr.length ? `${fmtPct(median(m.irr))} IRR` : ""}</span>
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
        </Chapter>,
      );
    }

    // How its funds have done, as it reports them.
    const withIrr = book.all.filter((c): c is LpCommitment & { net_irr: number } => c.net_irr != null);
    if (withIrr.length) {
      n += 1;
      chapters.push({ id: "performance", label: "Track record", count: withIrr.length });
      const best = [...withIrr].sort((a, b) => Number(b.net_irr) - Number(a.net_irr)).slice(0, 8);
      const top = Math.max(...best.map((c) => Number(c.net_irr)), 1);
      const med = median(withIrr.map((c) => Number(c.net_irr)));
      const mults = withIrr.map((c) => c.multiple).filter((v): v is number => v != null).map(Number);
      blocks.push(
        <Chapter
          key="performance"
          id="performance"
          n={n}
          eyebrow="Track record"
          title={`Its best-performing funds, as ${name} reports them.`}
          lead={`Net IRR for ${plural(withIrr.length, "fund")}, median ${fmtPct(med)}${mults.length ? `, median multiple ${fmtMult(median(mults))}` : ""}. Figures are the LP's own, never estimated.`}
          more={{ href: `${base}?view=commitments`, label: "Every commitment" }}
        >
          <div className="story-card story-rows overflow-hidden">
            {best.map((c) => (
              <Link key={c.id} href={c.fund_id ? `/funds/${c.fund_id}` : `${base}?view=commitments`} className="story-row">
                <ClassIcon cls={c.cls} className="h-8 w-8 rounded-[9px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{c.fund_label ?? "—"}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">
                    {[c.gp_label, c.commitment_year].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="hidden w-[180px] sm:block">
                  <Meter pct={(Math.max(0, Number(c.net_irr)) / top) * 100} />
                </span>
                <span className="figure w-[64px] text-right text-[14px]">{fmtPct(c.net_irr)}</span>
                <span className="figure hidden w-[52px] text-right text-[12px] text-muted-foreground sm:block">{c.multiple != null ? fmtMult(c.multiple) : ""}</span>
              </Link>
            ))}
          </div>
        </Chapter>,
      );
    }

    // Its latest commitments, as a timeline.
    const recent = [...book.all].filter((c) => c.commitment_year != null).sort((a, b) => (b.commitment_year ?? 0) - (a.commitment_year ?? 0) || (Number(b.amount) || 0) - (Number(a.amount) || 0)).slice(0, 8);
    if (recent.length) {
      n += 1;
      chapters.push({ id: "recent", label: "Latest", count: null });
      const years = [...new Set(recent.map((c) => c.commitment_year))];
      blocks.push(
        <Chapter key="recent" id="recent" n={n} eyebrow="Latest" title="Its most recent commitments." more={{ href: `${base}?view=commitments`, label: `All ${num(book.all.length)} commitments` }}>
          <div className="timeline">
            {years.map((y) => (
              <div key={y} className="relative pb-5">
                <span className="timeline-dot" />
                <div className="figure text-[13px] text-muted-foreground">{y}</div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {recent
                    .filter((c) => c.commitment_year === y)
                    .map((c) => (
                      <Link key={c.id} href={c.fund_id ? `/funds/${c.fund_id}` : `${base}?view=commitments`} className="story-card flex items-center gap-3 p-3">
                        <ClassIcon cls={c.cls} className="h-8 w-8 rounded-[9px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium">{c.fund_label ?? "—"}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">{c.gp_label ?? "Manager not on file"}</span>
                        </span>
                        <span className="figure shrink-0 text-[13px]">{c.amount != null && c.currency ? formatMoney(c.amount, c.currency) : ""}</span>
                      </Link>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </Chapter>,
      );
    }
  }

  if (contacts.length) {
    n += 1;
    chapters.push({ id: "people", label: "People", count: contacts.length });
    blocks.push(<PeopleChapter key="people" id="people" n={n} contacts={contacts} base={base} name={name} />);
  }
  if (signals.length) {
    n += 1;
    chapters.push({ id: "news", label: "News", count: signals.length });
    blocks.push(<NewsChapter key="news" id="news" n={n} signals={signals} base={base} />);
  }

  return (
    <>
      <ChapterNav chapters={chapters} />
      {blocks.length ? blocks : <NothingYet name={name} kind="LP" />}
    </>
  );
}

function NothingYet({ name, kind }: { name: string; kind: "LP" | "GP" | "SP" | "UN" }) {
  return (
    <div className="story-card mt-10 p-6 text-[14px] text-muted-foreground">
      <p className="text-foreground">Nothing more is on file for {name} yet.</p>
      <p className="mt-1 max-w-[62ch]">
        {kind === "LP"
          ? "An investor's story fills from its own disclosures: the funds it commits to, its managers and how they have done. This one has not published any we hold."
          : kind === "GP"
            ? "A manager's story fills from its Form ADV funds, the LPs that disclose commitments to them, its portfolio and its deals. None are on file for this firm."
            : "Its story fills from the managers that name it on Form ADV, its people and its deals."}
      </p>
    </div>
  );
}

// --- A manager: who backs it, its funds, what it owns, what it does -----------

export async function GpStory({ company, counts, base }: { company: Company; counts: ProfileCounts; base: string }) {
  const [backing, funds, sample, portfolio, deals, providers, contacts, signals] = await Promise.all([
    counts.asGp ? getGpBackers(company.id) : null,
    counts.funds ? getCompanyFunds(company.id) : Promise.resolve([]),
    performanceSample(),
    counts.portcos ? getProfilePortfolio(company.id) : null,
    counts.deals ? profileDeals(company.id) : Promise.resolve([] as Deal[]),
    counts.providers ? profileProviders(company.id) : Promise.resolve([]),
    profileContacts(company.id),
    profileSignals(company.id),
  ]);
  const name = company.name;
  const chapters: ChapterLink[] = [];
  const blocks: React.ReactNode[] = [];
  let n = 0;

  const backers = backing?.backers ?? [];
  if (backers.length) {
    n += 1;
    chapters.push({ id: "backers", label: "Investors", count: backers.length });
    blocks.push(
      <Chapter
        key="backers"
        id="backers"
        n={n}
        eyebrow="Who backs it"
        title={`${plural(backers.length, "investor")} back ${name}.`}
        lead="Limited partners that have disclosed commitments to its funds, most funds first, with what each committed and the net IRR it reports."
        more={backers.length > 9 ? { href: `${base}?view=backers`, label: `All ${num(backers.length)} investors` } : null}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {backers.slice(0, 9).map((b, i) => {
            const body = (
              <>
                <div className="flex items-start gap-3">
                  <CompanyLogo name={b.name} domain={b.domain} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-medium">{b.name}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{b.type ?? "Limited partner"}</span>
                  </span>
                  {b.id ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2">
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Funds</dt>
                    <dd className="figure text-[15px]">{num(b.funds.length || b.commitments)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Since</dt>
                    <dd className="figure text-[15px]">{b.first ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] text-muted-foreground">Net IRR</dt>
                    <dd className="figure text-[15px]">{b.irrs.length ? fmtPct(median(b.irrs)) : "—"}</dd>
                  </div>
                </dl>
                {b.totals.length ? (
                  <div className="mt-3 text-[12.5px]">
                    <Totals totals={b.totals} /> <span className="text-muted-foreground">committed</span>
                  </div>
                ) : null}
                {b.funds.length ? <div className="mt-2 truncate text-[11.5px] text-muted-foreground">{b.funds.slice(0, 2).join(" · ")}</div> : null}
              </>
            );
            return b.id ? (
              <Link key={b.id} href={`/companies/${b.id}`} className={`story-card p-4 ${i === 0 ? "story-card-hero" : ""}`}>
                {body}
              </Link>
            ) : (
              <div key={b.name} className="story-card p-4">
                {body}
              </div>
            );
          })}
        </div>
      </Chapter>,
    );
  }

  if (funds.length) {
    n += 1;
    chapters.push({ id: "funds", label: "Funds", count: funds.length });
    const perf = new Map(sample.rows.map((r) => [r.fund_id, r]));
    const lps = backing?.lpsByFund ?? new Map<string, number>();
    const ranked = [...funds].sort((a, b) => (lps.get(b.id) ?? 0) - (lps.get(a.id) ?? 0) || (perf.get(b.id)?.lps ?? 0) - (perf.get(a.id)?.lps ?? 0) || (b.vintage_year ?? 0) - (a.vintage_year ?? 0) || a.name.localeCompare(b.name));
    blocks.push(
      <Chapter
        key="funds"
        id="funds"
        n={n}
        eyebrow="Funds"
        title={`${plural(funds.length, "fund")} on file.`}
        lead="The ones investors report on first. Each opens the fund: who is in it and how it has done."
        more={funds.length > 6 ? { href: `${base}?view=funds`, label: `All ${num(funds.length)} funds` } : null}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ranked.slice(0, 6).map((f) => {
            const p = perf.get(f.id);
            const cls = fundClass(f.name_filed ?? f.name, company.sub_type)?.key ?? null;
            const lpCount = Math.max(lps.get(f.id) ?? 0, p?.lps ?? 0);
            return (
              <Link key={f.id} href={`/funds/${f.id}`} className="story-card flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <ClassIcon cls={cls} />
                  <ArrowUpRight className="story-card-arrow h-4 w-4" />
                </div>
                <div className="mt-3 line-clamp-2 text-[15px] font-medium leading-snug">{f.name}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">{[f.vintage_year ? `Vintage ${f.vintage_year}` : null, f.vehicle_kind, f.domicile].filter(Boolean).join(" · ") || "Form ADV"}</div>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                  {lpCount ? <Chip strong>{plural(lpCount, "LP")}</Chip> : null}
                  {p?.net_irr_median != null ? <Chip>{fmtPct(p.net_irr_median)} net IRR</Chip> : null}
                  {p?.multiple_median != null ? <Chip>{fmtMult(p.multiple_median)}</Chip> : null}
                  {f.fund_size_usd ? <Chip>{formatUsd(f.fund_size_usd)}</Chip> : null}
                </div>
              </Link>
            );
          })}
        </div>
      </Chapter>,
    );
  }

  const holdings = portfolio?.rows ?? [];
  if (holdings.length) {
    n += 1;
    chapters.push({ id: "portfolio", label: "Portfolio", count: holdings.length });
    const recent = [...holdings].sort((a, b) => (b.invested_year ?? 0) - (a.invested_year ?? 0) || Number(b.deal_value ?? 0) - Number(a.deal_value ?? 0)).slice(0, 12);
    const current = holdings.filter((h) => (h.status ?? "").toLowerCase().startsWith("current")).length;
    blocks.push(
      <Chapter
        key="portfolio"
        id="portfolio"
        n={n}
        eyebrow="Portfolio"
        title={`${plural(holdings.length, "company", "companies")} in its portfolio.`}
        lead={`${current ? `${num(current)} held now. ` : ""}The most recent investments first, with what was paid when a page states it.`}
        more={holdings.length > 12 ? { href: `${base}?view=portfolio`, label: `All ${num(holdings.length)} companies` } : null}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {recent.map((p) => {
            const href = p.intel_key ? portcoHref(p.intel_key) : null;
            const status = (p.status ?? "").toLowerCase();
            const body = (
              <>
                <div className="flex items-center gap-3">
                  <CompanyLogo name={p.name} domain={p.domain} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium">{p.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{p.sector ?? p.hq ?? "—"}</span>
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.invested_year ? <Chip>{p.invested_year}</Chip> : null}
                  {status ? <Chip strong={status.startsWith("current")}>{status.startsWith("current") ? "Held" : status.startsWith("realized") || status.startsWith("exit") ? "Exited" : p.status}</Chip> : null}
                  {p.deal_value != null ? <Chip title={p.deal_value_basis ?? undefined}>{formatMoney(p.deal_value, p.deal_currency)}</Chip> : null}
                </div>
              </>
            );
            return href ? (
              <Link key={p.id} href={href} className="story-card p-3.5">
                {body}
              </Link>
            ) : (
              <div key={p.id} className="story-card p-3.5">
                {body}
              </div>
            );
          })}
        </div>
      </Chapter>,
    );
  }

  if (deals.length) {
    n += 1;
    chapters.push({ id: "deals", label: "Deals", count: dealCount(deals.length) });
    blocks.push(<DealsChapter key="deals" id="deals" n={n} deals={deals} base={base} title={`What ${name} has been doing.`} />);
  }

  if (providers.length) {
    n += 1;
    chapters.push({ id: "providers", label: "Providers", count: providers.length });
    // One group per role, however the filing spelled it; a brand that is no
    // name at all ("None", "N/A") is a blank in the filing, not a provider.
    const byRole = new Map<string, { brand: string; id: string | null; funds: number }[]>();
    for (const p of providers) {
      const brand = (p.provider_brand ?? p.provider_key ?? "").trim();
      if (!brand || /^(none|n\/?a|not applicable|-)$/i.test(brand)) continue;
      const raw = (p.role ?? "other").toLowerCase().replace(/[\s-]+/g, "_").replace(/s$/, "");
      const role = raw in ROLE_PLURAL ? raw : "other";
      const list = byRole.get(role) ?? [];
      const seen = list.find((x) => x.brand.toLowerCase() === brand.toLowerCase());
      if (seen) seen.funds += p.fund_count ?? 0;
      else list.push({ brand, id: p.provider_company_id, funds: p.fund_count ?? 0 });
      byRole.set(role, list);
    }
    blocks.push(
      <Chapter key="providers" id="providers" n={n} eyebrow="Service providers" title="Who services its funds." lead="As its Form ADV names them, with the number of its funds each serves." more={{ href: `${base}?view=providers`, label: "Every filing" }}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...byRole.entries()].map(([role, list]) => (
            <div key={role} className="story-card p-4">
              <div className="text-[12px] text-muted-foreground">{ROLE_PLURAL[role as ProviderRole] ?? role}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {list
                  .sort((a, b) => b.funds - a.funds)
                  .slice(0, 6)
                  .map((p) =>
                    p.id ? (
                      <Link key={p.brand} href={`/companies/${p.id}`} className="story-chip story-chip-strong hover:border-[var(--primary)]">
                        {p.brand} <span className="figure text-muted-foreground">{p.funds || ""}</span>
                      </Link>
                    ) : (
                      <Chip key={p.brand}>
                        {p.brand} <span className="figure">{p.funds || ""}</span>
                      </Chip>
                    ),
                  )}
              </div>
            </div>
          ))}
        </div>
      </Chapter>,
    );
  }

  if (contacts.length) {
    n += 1;
    chapters.push({ id: "people", label: "People", count: contacts.length });
    blocks.push(<PeopleChapter key="people" id="people" n={n} contacts={contacts} base={base} name={name} />);
  }
  if (signals.length) {
    n += 1;
    chapters.push({ id: "news", label: "News", count: signals.length });
    blocks.push(<NewsChapter key="news" id="news" n={n} signals={signals} base={base} />);
  }

  return (
    <>
      <ChapterNav chapters={chapters} />
      {blocks.length ? blocks : <NothingYet name={name} kind="GP" />}
    </>
  );
}

// --- A provider, or a firm not yet placed ------------------------------------

export async function OtherStory({ company, counts, base }: { company: Company; counts: ProfileCounts; base: string }) {
  const [clients, deals, contacts, signals] = await Promise.all([
    company.category === "SP" && counts.clients ? getProviderClients(company.id) : Promise.resolve([]),
    counts.deals ? profileDeals(company.id) : Promise.resolve([] as Deal[]),
    profileContacts(company.id),
    profileSignals(company.id),
  ]);
  const name = company.name;
  const chapters: ChapterLink[] = [];
  const blocks: React.ReactNode[] = [];
  let n = 0;

  if (company.category === "UN") {
    blocks.push(
      <div key="classify" className="story-card mt-8 p-4" data-no-print>
        <p className="mb-3 text-[14px]">This firm is not placed in a book yet. Say what it is and it joins the right lists.</p>
        <ClassifyControl companyId={company.id} />
      </div>,
    );
  }

  if (clients.length) {
    const by = new Map<string, { id: string; name: string; domain: string | null; type: string | null; place: string | null; roles: Set<string>; funds: number }>();
    for (const c of clients) {
      const cl = c.client;
      if (!cl) continue;
      const e = by.get(cl.id) ?? { id: cl.id, name: cl.name, domain: cl.domain, type: cl.sub_type, place: [cl.city, cl.country].filter(Boolean).join(", ") || null, roles: new Set<string>(), funds: 0 };
      if (c.role) e.roles.add(c.role);
      e.funds += c.fund_count ?? 0;
      by.set(cl.id, e);
    }
    const list = [...by.values()].sort((a, b) => b.funds - a.funds || a.name.localeCompare(b.name));
    n += 1;
    chapters.push({ id: "clients", label: "Clients", count: list.length });
    blocks.push(
      <Chapter
        key="clients"
        id="clients"
        n={n}
        eyebrow="Clients"
        title={`${plural(list.length, "manager")} name ${name} on Form ADV.`}
        lead="The fund managers whose filings list it as a provider, by the number of their funds it serves."
        more={list.length > 9 ? { href: `${base}?view=clients`, label: `All ${num(list.length)} clients` } : null}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.slice(0, 9).map((c) => (
            <Link key={c.id} href={`/companies/${c.id}`} className="story-card p-3.5">
              <div className="flex items-center gap-3">
                <CompanyLogo name={c.name} domain={c.domain} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{c.name}</span>
                  <span className="block truncate text-[12px] text-muted-foreground">{[c.type, c.place].filter(Boolean).join(" · ") || "Manager"}</span>
                </span>
                <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[...c.roles].map((r) => (
                  <Chip key={r}>{(ROLE_PLURAL[r as ProviderRole] ?? r).replace(/s$/, "")}</Chip>
                ))}
                {c.funds ? <Chip strong>{plural(c.funds, "fund")}</Chip> : null}
              </div>
            </Link>
          ))}
        </div>
      </Chapter>,
    );
  }
  if (deals.length) {
    n += 1;
    chapters.push({ id: "deals", label: "Deals", count: dealCount(deals.length) });
    blocks.push(<DealsChapter key="deals" id="deals" n={n} deals={deals} base={base} title={`Deals naming ${name}.`} />);
  }
  if (contacts.length) {
    n += 1;
    chapters.push({ id: "people", label: "People", count: contacts.length });
    blocks.push(<PeopleChapter key="people" id="people" n={n} contacts={contacts} base={base} name={name} />);
  }
  if (signals.length) {
    n += 1;
    chapters.push({ id: "news", label: "News", count: signals.length });
    blocks.push(<NewsChapter key="news" id="news" n={n} signals={signals} base={base} />);
  }

  return (
    <>
      <ChapterNav chapters={chapters} />
      {blocks.length > (company.category === "UN" ? 1 : 0) ? blocks : [...blocks, <NothingYet key="none" name={name} kind={company.category === "SP" ? "SP" : "UN"} />]}
    </>
  );
}
