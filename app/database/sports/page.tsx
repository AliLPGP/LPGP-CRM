import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import { ClubTable } from "@/components/intel/club-table";
import { ResearchClubsRunner } from "@/components/intel/research-buttons";
import { IntelShell } from "@/components/intel/shell";
import { DealTable, SignalList } from "@/components/intel/tables";
import { Box, Empty, Stat, StatStrip, SubTabs, Tag } from "@/components/intel/ui";
import { INVESTOR_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { getAllDeals, getSignals, getTeamOwners, listSportsInvestors, listSportsTeams } from "@/lib/directory/intelligence-queries";
import { CLUB_ROW_FIELDS, formatMoney, SPORT_LABEL, type ClubRow } from "@/lib/directory/intelligence-types";
import { getDirectorySetup } from "@/lib/directory/setup";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sports — LPGP Connect" };

const TABS = ["clubs", "investors", "deals", "leagues", "signals"] as const;
type Tab = (typeof TABS)[number];

export default async function SportsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "clubs";
  const [teams, investors, deals, signals, setup, user] = await Promise.all([
    listSportsTeams(),
    listSportsInvestors(),
    getAllDeals("sports"),
    getSignals({ assetClass: "sports", limit: 100 }),
    getDirectorySetup(),
    getSessionUser(),
  ]);
  const owners = await getTeamOwners(teams.map((t) => t.id));
  const byTeam = new Map<string, typeof owners>();
  for (const o of owners) byTeam.set(o.team_id, [...(byTeam.get(o.team_id) ?? []), o]);
  // Only the columns the table shows go to the browser.
  const clubs: ClubRow[] = teams.map((t) => {
    const inst = (byTeam.get(t.id) ?? []).filter((o) => o.institutional).sort((a, b) => (b.stake_pct ?? -1) - (a.stake_pct ?? -1));
    const top = inst[0];
    const row = Object.fromEntries(CLUB_ROW_FIELDS.map((k) => [k, t[k]])) as Pick<typeof t, (typeof CLUB_ROW_FIELDS)[number]>;
    return {
      ...row,
      institutional: inst.length,
      topInvestor: top ? { name: top.name, stake: top.stake_pct, companyId: top.company_id, investorId: top.investor_id } : null,
    };
  });
  // Deals per league, counted once over the ledger.
  const leagueOfTeam = new Map(clubs.map((c) => [c.id, c.league ?? "Other"]));
  const dealsByLeague = new Map<string, number>();
  for (const d of deals) {
    const league = d.target_kind === "league" ? [...leagueOfTeam.values()].find((l) => d.target.toLowerCase().includes(l.toLowerCase())) : d.target_team_id ? leagueOfTeam.get(d.target_team_id) : undefined;
    if (league) dealsByLeague.set(league, (dealsByLeague.get(league) ?? 0) + 1);
  }
  const leagues = new Map<string, { clubs: number; backed: number; countries: Set<string>; sport: string }>();
  for (const c of clubs) {
    const key = c.league ?? "Other";
    const e = leagues.get(key) ?? { clubs: 0, backed: 0, countries: new Set<string>(), sport: c.sport };
    e.clubs += 1;
    if (c.institutional) e.backed += 1;
    if (c.country) e.countries.add(c.country);
    leagues.set(key, e);
  }
  const backed = clubs.filter((c) => c.institutional > 0).length;
  const researched = clubs.filter((c) => c.revenue != null || c.valuation != null || c.institutional > 0 || c.ownership_summary).length;
  const unresearched = clubs.filter((c) => c.revenue == null && c.valuation == null && !c.ownership_summary).map((c) => c.id);
  const linked = investors.filter((i) => i.company_id).length;
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
          {user?.role === "admin" ? (
            <Link href="/import/directory" className="mt-3 inline-block rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
              Open the import page
            </Link>
          ) : null}
        </Box>
      </IntelShell>
    );
  }

  return (
    <IntelShell
      crumbs={[{ href: "/database/asset-classes", label: "Asset classes" }, { label: "Sports" }]}
      kicker="Asset class"
      title="Sports"
      description="Clubs and teams as investable assets: who owns them, what they earn, what they are worth, how many people follow them, and which funds have bought in — every figure with the page that states it."
      actions={user?.role === "admin" ? <ResearchClubsRunner teamIds={unresearched} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} /> : null}
      tabs={
        <SubTabs
          items={[
            { href: base, label: "Clubs", count: clubs.length, active: tab === "clubs" },
            { href: `${base}?tab=investors`, label: "Investors in sport", count: investors.length, active: tab === "investors" },
            { href: `${base}?tab=deals`, label: "Deals", count: deals.length, active: tab === "deals" },
            { href: `${base}?tab=leagues`, label: "Leagues", count: leagues.size, active: tab === "leagues" },
            { href: `${base}?tab=signals`, label: "Signals", count: signals.length, active: tab === "signals" },
          ]}
        />
      }
    >
      <StatStrip>
        <Stat label="Clubs" value={clubs.length} basis={`${leagues.size} leagues · ${researched} researched with sources`} />
        <Stat label="With institutional money" value={backed} basis="private equity, sovereign or corporate investors" defn="Clubs where a fund, sovereign investor or corporate holds a stake, as reported by a source on file." />
        <Stat label="Investors in sport" value={investors.length} basis={`${linked} are firms in the directory`} href={`${base}?tab=investors`} />
        <Stat label="Deals" value={deals.length} basis="sourced transactions" href={`${base}?tab=deals`} />
        <Stat label="Signals" value={signals.length} basis="dated news items" href={`${base}?tab=signals`} />
      </StatStrip>

      {tab === "clubs" ? <ClubTable clubs={clubs} /> : null}

      {tab === "investors" ? (
        <Box title="Investors in sport" count={investors.length} flush defn="Funds, sovereign investors, family offices and groups that hold stakes in clubs, teams or leagues. Where the investor is a firm in the directory, the row links to its profile.">
          {investors.length ? (
            <div className="desk-scroll">
              <table className="desk-table">
                <thead>
                  <tr>
                    <th>Investor</th>
                    <th>Type</th>
                    <th>HQ</th>
                    <th className="num">Fund size / AUM</th>
                    <th>Holdings on record</th>
                    <th>Directory</th>
                  </tr>
                </thead>
                <tbody>
                  {[...investors]
                    .sort((a, b) => b.holdings.length - a.holdings.length || a.name.localeCompare(b.name))
                    .map((i) => (
                      <tr key={i.id} className="linked">
                        <td className="min-w-[200px] max-w-[300px]">
                          <span className="flex items-center gap-2 font-medium">
                            <CompanyLogo name={i.name} domain={i.domain} size={22} />
                            <Link href={`${base}/investors/${i.id}`} className="cover truncate" title={i.name}>
                              {i.name}
                            </Link>
                          </span>
                        </td>
                        <td>
                          <Tag>{INVESTOR_TYPE_LABEL[i.investor_type ?? "other"] ?? i.investor_type}</Tag>
                        </td>
                        <td className="whitespace-nowrap text-muted-foreground">{i.hq ?? "—"}</td>
                        <td className="num" title={i.aum_as_of ?? undefined}>
                          {formatMoney(i.aum, i.aum_currency)}
                        </td>
                        <td className="max-w-[420px] truncate text-[11.5px]" title={i.holdings.map((h) => h.target).join(", ")}>
                          {i.holdings
                            .slice(0, 6)
                            .map((h) => `${h.target}${h.stake_pct != null ? ` ${h.stake_pct}%` : ""}`)
                            .join(" · ")}
                          {i.holdings.length > 6 ? <span className="text-muted-foreground"> +{i.holdings.length - 6}</span> : null}
                        </td>
                        <td>
                          {i.company_id ? (
                            <Link href={`/companies/${i.company_id}`} className="tag tag-strong hover:text-foreground">
                              Firm profile
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>No investors in sport on file yet. They arrive with the intelligence dataset and as clubs are researched — each stake with the page that states it.</Empty>
          )}
        </Box>
      ) : null}

      {tab === "deals" ? (
        <Box title="Sports deals" count={deals.length} flush>
          <DealTable deals={deals} showClass={false} />
        </Box>
      ) : null}

      {tab === "leagues" ? (
        <Box title="Leagues" count={leagues.size} flush>
          <div className="desk-scroll">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>League</th>
                  <th>Sport</th>
                  <th>Countries</th>
                  <th className="num">Clubs on file</th>
                  <th className="num">With institutional money</th>
                  <th className="num">Deals</th>
                </tr>
              </thead>
              <tbody>
                {[...leagues.entries()]
                  .sort((a, b) => b[1].clubs - a[1].clubs)
                  .map(([name, l]) => (
                    <tr key={name}>
                      <td className="font-medium">{name}</td>
                      <td className="text-muted-foreground">{SPORT_LABEL[l.sport] ?? l.sport}</td>
                      <td className="text-muted-foreground">{[...l.countries].join(", ")}</td>
                      <td className="num">{l.clubs}</td>
                      <td className="num">{l.backed}</td>
                      <td className="num">{dealsByLeague.get(name) ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Box>
      ) : null}

      {tab === "signals" ? (
        <Box title="Sports signals" count={signals.length} flush>
          <SignalList signals={signals} showClass={false} />
        </Box>
      ) : null}
    </IntelShell>
  );
}
