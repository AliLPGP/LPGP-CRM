import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Globe } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Src } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { DealRows } from "@/components/story/sports-cards";
import { BackLink, Chapter, Chip, Figure, Figures, StoryPage } from "@/components/story/story";
import { INVESTOR_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { getDeals, getSportsInvestor, teamsHeldBy } from "@/lib/directory/intelligence-queries";
import { formatMoney, SPORT_LABEL } from "@/lib/directory/intelligence-types";

// An investor in sport, read as a story: who it is, what it manages, then
// the clubs and teams it holds as cards (each opening the club where we have
// its file) and its deals. When it is also a firm in the directory, the card
// on the right leads to its full profile.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getSportsInvestor(id);
  return { title: inv ? `${inv.name} — sports investor — LPGP Intelligence` : "Investor — LPGP Intelligence" };
}

export default async function SportsInvestorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await getSportsInvestor(id);
  if (!inv) notFound();
  const [held, deals] = await Promise.all([teamsHeldBy({ investorId: id }), getDeals({ investorId: id, limit: 200 })]);
  const holdings = Array.isArray(inv.holdings) ? inv.holdings : [];
  const type = INVESTOR_TYPE_LABEL[inv.investor_type ?? "other"] ?? inv.investor_type ?? "Investor";
  const clubOf = (target: string) => held.find((x) => x.team.name.toLowerCase() === target.toLowerCase() || (x.team.short_name ?? "").toLowerCase() === target.toLowerCase());

  const chapters: ChapterLink[] = [];
  let n = 0;
  const next = (cid: string, label: string, count?: number | null) => {
    n += 1;
    chapters.push({ id: cid, label, count });
    return n;
  };
  const nHoldings = holdings.length ? next("holdings", "Holdings", holdings.length) : 0;
  const nDeals = deals.length ? next("deals", "Deals", deals.length) : 0;

  return (
    <StoryPage accent="sports">
      <BackLink href="/database/sports#investors" label="Investors in sport" />
      <header className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <span className="story-logo shrink-0" style={{ borderRadius: 18 }}>
          <CompanyLogo name={inv.name} domain={inv.domain} size={72} />
        </span>
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">Investor in sport · {type}</div>
          <h1 className="story-name mt-2">{inv.name}</h1>
          {inv.summary ? <p className="story-lede mt-3">{inv.summary}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {inv.hq ? <Chip>{inv.hq}</Chip> : null}
            {inv.domain ? (
              <a href={`https://${inv.domain}`} target="_blank" rel="noreferrer" className="story-chip inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3 w-3" /> {inv.domain}
              </a>
            ) : null}
            {inv.source_url ? <Src url={inv.source_url} name="source" /> : null}
          </div>
        </div>
        {inv.company_id ? (
          <Link href={`/companies/${inv.company_id}`} className="story-card flex w-full items-center gap-3 p-3 md:w-[280px]">
            <CompanyLogo name={inv.name} domain={inv.domain} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11.5px] text-muted-foreground">Full profile in the directory</span>
              <span className="block truncate text-[14px] font-medium">{inv.name}</span>
            </span>
            <ArrowUpRight className="story-card-arrow h-4 w-4" />
          </Link>
        ) : null}
      </header>

      <Figures>
        {inv.aum != null ? <Figure label="Fund size / AUM" value={formatMoney(inv.aum, inv.aum_currency)} basis={<Src url={inv.aum_source_url} asOf={inv.aum_as_of} />} /> : null}
        {holdings.length ? <Figure label="Holdings" value={holdings.length} href="#holdings" /> : null}
        {held.length ? <Figure label="Clubs on file" value={held.length} basis="with a club page" href="#holdings" /> : null}
        {deals.length ? <Figure label="Deals" value={deals.length} href="#deals" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />

      {nHoldings ? (
        <Chapter id="holdings" n={nHoldings} eyebrow="Holdings" title={`${holdings.length} stake${holdings.length === 1 ? "" : "s"} on record.`} lead="Each with the page that states it. A club with its own file opens it.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {holdings.map((h, i) => {
              const club = clubOf(h.target);
              const body = (
                <>
                  <div className="flex items-start gap-3">
                    <CompanyLogo name={club?.team.short_name ?? h.target} domain={club?.team.domain} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-medium">{h.target}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">{[club?.team.league, h.sport ? (SPORT_LABEL[h.sport] ?? h.sport) : null].filter(Boolean).join(" · ") || "Team or asset"}</span>
                    </span>
                    {club ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
                  </div>
                  {h.stake_pct != null || h.since_year != null ? (
                    <dl className="mt-4 grid grid-cols-3 gap-2">
                      {h.stake_pct != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Stake</dt>
                          <dd className="figure text-[14.5px]">{h.stake_pct}%</dd>
                        </div>
                      ) : null}
                      {h.since_year != null ? (
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Since</dt>
                          <dd className="figure text-[14.5px]">{h.since_year}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                  <div className="mt-3 text-[11.5px]">
                    <Src url={h.source_url} name="source" />
                  </div>
                </>
              );
              return club ? (
                <Link key={`${h.target}-${i}`} href={`/database/sports/${club.team.id}`} className="story-card flex flex-col p-4">
                  {body}
                </Link>
              ) : (
                <div key={`${h.target}-${i}`} className="story-card flex flex-col p-4">
                  {body}
                </div>
              );
            })}
          </div>
        </Chapter>
      ) : null}

      {nDeals ? (
        <Chapter id="deals" n={nDeals} eyebrow="Deals" title={`${deals.length} deal${deals.length === 1 ? "" : "s"} on record.`}>
          <DealRows deals={deals} limit={12} />
        </Chapter>
      ) : null}

      {!chapters.length ? <div className="story-card mt-10 p-6 text-[14px] text-muted-foreground">No holdings or deals are on record for {inv.name} yet.</div> : null}
    </StoryPage>
  );
}
