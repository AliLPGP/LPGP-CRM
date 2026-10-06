import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ClubTable } from "@/components/intel/club-table";
import { ResearchClubsRunner } from "@/components/intel/research-buttons";
import { IntelShell } from "@/components/intel/shell";
import { Box } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { ClubCard, DealRows, SportsInvestorCard } from "@/components/story/sports-cards";
import { Chapter, ClassIcon, Figure, Figures, MoreLink, StoryPage } from "@/components/story/story";
import { dateLabel } from "@/components/intel/tables";
import { getDeals, getSignals, getTeamOwners, listSportsInvestors, listSportsTeams } from "@/lib/directory/intelligence-queries";
import { CLUB_ROW_FIELDS, SPORT_LABEL, type ClubRow } from "@/lib/directory/intelligence-types";
import { getDirectorySetup } from "@/lib/directory/setup";
import { getSessionUser } from "@/lib/auth";

// Sports as an asset class, read the way every other record reads: a header
// that says what is on file, the headline figures, then sport tabs and
// league cards that narrow everything below them, the clubs as cards, the
// investors in sport, the deals and the news. Every card opens its record.
// The dense table stays one click away (?view=table).

export const dynamic = "force-dynamic";
export const metadata = { title: "Sports — LPGP Intelligence" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const CLUBS_SHOWN = 24;

type Params = { sport?: string | string[]; league?: string | string[]; view?: string | string[]; all?: string | string[] };

export default async function SportsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const [teams, investors, deals, signals, setup, user] = await Promise.all([
    listSportsTeams(),
    listSportsInvestors(),
    getDeals({ assetClass: "sports", limit: 500 }),
    getSignals({ assetClass: "sports", limit: 100 }),
    getDirectorySetup(),
    getSessionUser(),
  ]);
  const owners = await getTeamOwners(teams.map((t) => t.id));
  const byTeam = new Map<string, typeof owners>();
  for (const o of owners) byTeam.set(o.team_id, [...(byTeam.get(o.team_id) ?? []), o]);
  const clubs: ClubRow[] = teams.map((t) => {
    const inst = (byTeam.get(t.id) ?? []).filter((o) => o.institutional).sort((a, b) => (b.stake_pct ?? -1) - (a.stake_pct ?? -1));
    const top = inst[0];
    const row = Object.fromEntries(CLUB_ROW_FIELDS.map((k) => [k, t[k]])) as Pick<typeof t, (typeof CLUB_ROW_FIELDS)[number]>;
    return { ...row, institutional: inst.length, topInvestor: top ? { name: top.name, stake: top.stake_pct, companyId: top.company_id, investorId: top.investor_id } : null };
  });
  const base = "/database/sports";

  if (!teams.length) {
    return (
      <IntelShell crumbs={[{ label: "Sports" }]} kicker="Asset class" title="Sports">
        <Box title="Nothing loaded yet">
          <p className="text-[12.5px] text-muted-foreground">
            {!setup.intelligence
              ? "The sports tables aren't in the database yet. Discover shows an admin the SQL to run."
              : user?.role === "admin"
                ? "The shipped dataset hasn't been loaded. Go to Import → Master directory and press “Load the intelligence dataset”."
                : "An admin needs to load the intelligence dataset from Import → Master directory."}
          </p>
        </Box>
      </IntelShell>
    );
  }

  // The dense table, for a reader who wants every club in one sheet.
  if (one(sp.view) === "table") {
    return (
      <IntelShell crumbs={[{ href: base, label: "Sports" }, { label: "Every club" }]} kicker="Sports" title="Every club, as a table">
        <ClubTable clubs={clubs} />
      </IntelShell>
    );
  }

  // Sport tabs, then league cards: each narrows the chapters below.
  const sports = new Map<string, number>();
  for (const c of clubs) sports.set(c.sport, (sports.get(c.sport) ?? 0) + 1);
  const sportTabs = [...sports.entries()].sort((a, b) => b[1] - a[1]);
  const sportParam = one(sp.sport);
  const sport = sportParam && sports.has(sportParam) ? sportParam : null;
  const inSport = sport ? clubs.filter((c) => c.sport === sport) : clubs;
  const leagues = new Map<string, { clubs: number; backed: number; sport: string; countries: Set<string> }>();
  for (const c of inSport) {
    const key = c.league ?? "Other";
    const e = leagues.get(key) ?? { clubs: 0, backed: 0, sport: c.sport, countries: new Set<string>() };
    e.clubs += 1;
    if (c.institutional) e.backed += 1;
    if (c.country) e.countries.add(c.country);
    leagues.set(key, e);
  }
  const leagueParam = one(sp.league);
  const league = leagueParam && leagues.has(leagueParam) ? leagueParam : null;
  const shown = league ? inSport.filter((c) => (c.league ?? "Other") === league) : inSport;
  const shownIds = new Set(shown.map((c) => c.id));
  const narrowed = Boolean(sport || league);
  const q = (over: { sport?: string | null; league?: string | null; all?: boolean }) => {
    const s = over.sport !== undefined ? over.sport : sport;
    const l = over.league !== undefined ? over.league : league;
    const p = new URLSearchParams();
    if (s) p.set("sport", s);
    if (l) p.set("league", l);
    if (over.all) p.set("all", "1");
    const qs = p.toString();
    return qs ? `${base}?${qs}` : base;
  };

  // The clubs with something on file first: institutional money, then a valuation, then revenue.
  const ranked = [...shown].sort((a, b) => b.institutional - a.institutional || Number(b.valuation != null) - Number(a.valuation != null) || Number(b.revenue != null) - Number(a.revenue != null) || a.name.localeCompare(b.name));
  const showAll = one(sp.all) === "1";
  const backed = shown.filter((c) => c.institutional > 0).length;
  const investorIds = new Set(owners.filter((o) => o.investor_id && shownIds.has(o.team_id) && o.institutional).map((o) => o.investor_id as string));
  const clubsPerInvestor = new Map<string, number>();
  for (const o of owners) if (o.investor_id && shownIds.has(o.team_id)) clubsPerInvestor.set(o.investor_id, (clubsPerInvestor.get(o.investor_id) ?? 0) + 1);
  const shownInvestors = (narrowed ? investors.filter((i) => investorIds.has(i.id)) : investors).sort(
    (a, b) => (clubsPerInvestor.get(b.id) ?? 0) - (clubsPerInvestor.get(a.id) ?? 0) || (b.holdings?.length ?? 0) - (a.holdings?.length ?? 0) || a.name.localeCompare(b.name),
  );
  const leagueNames = new Set([...leagues.keys()].map((l) => l.toLowerCase()));
  const shownDeals = narrowed ? deals.filter((d) => (d.target_team_id && shownIds.has(d.target_team_id)) || (d.target_kind === "league" && [...leagueNames].some((l) => d.target.toLowerCase().includes(l)) && (!league || d.target.toLowerCase().includes(league.toLowerCase())))) : deals;
  const shownNames = shown.map((c) => (c.short_name ?? c.name).toLowerCase());
  const shownSignals = narrowed ? signals.filter((s) => shownNames.some((n) => n.length > 3 && `${s.headline} ${s.summary ?? ""}`.toLowerCase().includes(n))) : signals;
  const unresearched = clubs.filter((c) => c.revenue == null && c.valuation == null && !c.ownership_summary).map((c) => c.id);
  const scope = league ?? (sport ? (SPORT_LABEL[sport] ?? sport) : null);

  const chapters: ChapterLink[] = [];
  let n = 0;
  const next = (id: string, label: string, count?: number | string | null) => {
    n += 1;
    chapters.push({ id, label, count });
    return n;
  };
  const nLeagues = leagues.size > 1 && !league ? next("leagues", "Leagues", leagues.size) : 0;
  const nClubs = shown.length ? next("clubs", "Clubs", shown.length) : 0;
  const nInvestors = shownInvestors.length ? next("investors", "Investors", shownInvestors.length) : 0;
  const nDeals = shownDeals.length ? next("deals", "Deals", shownDeals.length >= 500 ? "500+" : shownDeals.length) : 0;
  const nNews = shownSignals.length ? next("news", "News", shownSignals.length) : 0;

  return (
    <StoryPage accent="sports">
      <header className="mt-2 flex flex-wrap items-start gap-x-6 gap-y-4">
        <ClassIcon cls="sports" className="h-[72px] w-[72px] rounded-[18px]" />
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">Asset class{scope ? ` · ${scope}` : ""}</div>
          <h1 className="story-name mt-2">{league ?? (sport ? (SPORT_LABEL[sport] ?? sport) : "Sports")}</h1>
          <p className="story-lede mt-3">
            <strong>
              {shown.length.toLocaleString("en-US")} clubs{league ? "" : ` across ${leagues.size} league${leagues.size === 1 ? "" : "s"}`}, {backed.toLocaleString("en-US")} with institutional money on record.
            </strong>{" "}
            Who owns them, what they earn and are worth, and which funds have bought in, each figure with the page that states it.
          </p>
        </div>
        {user?.role === "admin" ? (
          <div className="w-full md:w-auto">
            <ResearchClubsRunner teamIds={unresearched} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
          </div>
        ) : null}
      </header>

      <Figures>
        <Figure label="Clubs" value={shown.length} basis={league ? undefined : `${leagues.size} league${leagues.size === 1 ? "" : "s"}`} href="#clubs" />
        <Figure label="With institutional money" value={backed} basis="funds, sovereign or corporate" href="#clubs" />
        {shownInvestors.length ? <Figure label="Investors in sport" value={shownInvestors.length} href="#investors" /> : null}
        {shownDeals.length ? <Figure label="Deals" value={shownDeals.length >= 500 ? "500+" : shownDeals.length} basis="sourced transactions" href="#deals" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />
      {sportTabs.length > 1 ? (
        <nav className="chapter-nav-row mt-3" aria-label="Sports">
          <Link href={q({ sport: null, league: null })} scroll={false} className="chapter-pill" aria-current={sport ? undefined : "true"}>
            All sports
          </Link>
          {sportTabs.map(([k, count]) => (
            <Link key={k} href={q({ sport: k, league: null })} scroll={false} className="chapter-pill" aria-current={sport === k ? "true" : undefined}>
              {SPORT_LABEL[k] ?? k} <span className="chapter-pill-count">{count}</span>
            </Link>
          ))}
        </nav>
      ) : null}

      {nLeagues ? (
        <Chapter id="leagues" n={nLeagues} eyebrow="Leagues" title={`${leagues.size} leagues${sport ? ` in ${(SPORT_LABEL[sport] ?? sport).toLowerCase()}` : ""}.`} lead="Pick one to see only its clubs, their investors and their deals.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[...leagues.entries()]
              .sort((a, b) => b[1].backed - a[1].backed || b[1].clubs - a[1].clubs)
              .map(([name, l]) => (
                <Link key={name} href={`${q({ league: name })}#clubs`} scroll={false} className="story-card flex flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[14.5px] font-medium leading-snug">{name}</span>
                    <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
                  </div>
                  <span className="mt-0.5 text-[12px] text-muted-foreground">{[SPORT_LABEL[l.sport] ?? l.sport, [...l.countries].slice(0, 2).join(", ")].filter(Boolean).join(" · ")}</span>
                  <dl className="mt-auto grid grid-cols-2 gap-2 pt-4">
                    <div>
                      <dt className="text-[11px] text-muted-foreground">Clubs</dt>
                      <dd className="figure text-[15px]">{l.clubs}</dd>
                    </div>
                    {l.backed ? (
                      <div>
                        <dt className="text-[11px] text-muted-foreground">With investors</dt>
                        <dd className="figure text-[15px]">{l.backed}</dd>
                      </div>
                    ) : null}
                  </dl>
                </Link>
              ))}
          </div>
        </Chapter>
      ) : null}

      {nClubs ? (
        <Chapter
          id="clubs"
          n={nClubs}
          eyebrow="Clubs"
          title={league ? `The ${shown.length} clubs of ${league}.` : `${shown.length.toLocaleString("en-US")} clubs on file.`}
          lead="The ones with institutional money first, then those with a valuation or revenue on file. Each opens the club's file."
          more={{ href: `${base}?view=table`, label: "Every club as a table" }}
        >
          {league ? (
            <Link href={`${q({ league: null })}#leagues`} scroll={false} className="-mt-2 mb-4 inline-block text-[12.5px] text-muted-foreground hover:text-foreground">
              ← Every league{sport ? ` in ${(SPORT_LABEL[sport] ?? sport).toLowerCase()}` : ""}
            </Link>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(showAll ? ranked : ranked.slice(0, CLUBS_SHOWN)).map((c) => (
              <ClubCard key={c.id} c={c} />
            ))}
          </div>
          {!showAll && ranked.length > CLUBS_SHOWN ? (
            <div className="mt-4 flex justify-center">
              <MoreLink href={`${q({ all: true })}#clubs`}>Show all {ranked.length.toLocaleString("en-US")} clubs</MoreLink>
            </div>
          ) : null}
        </Chapter>
      ) : null}

      {nInvestors ? (
        <Chapter id="investors" n={nInvestors} eyebrow="Investors in sport" title={`${shownInvestors.length} investors${scope ? ` in ${scope}` : " in sport"}.`} lead="Funds, sovereign investors, family offices and groups holding stakes in clubs, teams and leagues, each with the page that states the stake.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownInvestors.slice(0, 12).map((i) => (
              <SportsInvestorCard key={i.id} i={i} clubs={clubsPerInvestor.get(i.id)} />
            ))}
          </div>
          {shownInvestors.length > 12 ? <p className="mt-3 text-[12.5px] text-muted-foreground">And {shownInvestors.length - 12} more, each reachable from the clubs they hold.</p> : null}
        </Chapter>
      ) : null}

      {nDeals ? (
        <Chapter id="deals" n={nDeals} eyebrow="Deals" title={`${shownDeals.length >= 500 ? "500+" : shownDeals.length} deals${scope ? ` in ${scope}` : " in sport"}.`} more={{ href: "/database/deals?class=sports", label: "Every sports deal" }}>
          <DealRows deals={shownDeals} limit={10} />
        </Chapter>
      ) : null}

      {nNews ? (
        <Chapter id="news" n={nNews} eyebrow="In the news" title="What has been said lately.">
          <div className="grid gap-3 md:grid-cols-2">
            {shownSignals.slice(0, 6).map((s) => (
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
    </StoryPage>
  );
}
