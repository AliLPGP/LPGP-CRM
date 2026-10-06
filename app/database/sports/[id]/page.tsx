import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Globe } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { clubFileRows } from "@/components/intel/club-file";
import { ResearchClubButton } from "@/components/intel/research-buttons";
import { Src } from "@/components/intel/ui";
import { ChapterNav, type ChapterLink } from "@/components/story/chapter-nav";
import { DealRows } from "@/components/story/sports-cards";
import { BackLink, Chapter, Chip, Figure, Figures, StoryPage } from "@/components/story/story";
import { INVESTOR_TYPE_LABEL, OWNERSHIP_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { getDeals, getSportsTeam, getTeamOwners, leaguePeers } from "@/lib/directory/intelligence-queries";
import { formatCount, formatMoney, SPORT_LABEL, type TeamOwner } from "@/lib/directory/intelligence-types";

// A club, read as a story like a firm or a fund: who it is in a sentence,
// its headline figures each with its page, then who owns it (institutional
// money first, each investor leading to its own page), the rest of its file,
// its deals, its following, the fact check, and the clubs beside it in its
// league. A chapter with nothing on file is not drawn.

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getSportsTeam(id);
  return { title: team ? `${team.short_name ?? team.name} — LPGP Intelligence` : "Club — LPGP Intelligence" };
}

const VERDICT: Record<string, string> = { confirmed: "Confirmed", refuted: "Refuted", unverifiable: "Unverified" };

function ownerHref(o: TeamOwner): string | null {
  return o.company_id ? `/companies/${o.company_id}` : o.investor_id ? `/database/sports/investors/${o.investor_id}` : null;
}

function OwnerCard({ o, hero }: { o: TeamOwner; hero?: boolean }) {
  const href = ownerHref(o);
  const terms: { label: string; value: string }[] = [];
  if (o.stake_pct != null) terms.push({ label: "Stake", value: `${o.stake_pct}%` });
  if (o.since_year != null) terms.push({ label: "Since", value: String(o.since_year) });
  if (o.amount != null) terms.push({ label: "Invested", value: formatMoney(o.amount, o.currency) });
  if (o.valuation_at_entry != null && terms.length < 3) terms.push({ label: "Valuation at entry", value: formatMoney(o.valuation_at_entry, o.currency) });
  const body = (
    <>
      <div className="flex items-start gap-3">
        <CompanyLogo name={o.name} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{o.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{o.institutional ? (INVESTOR_TYPE_LABEL[o.investor_type ?? "other"] ?? o.investor_type ?? "Investor") : (o.kind ?? "Owner")}</span>
        </span>
        {href ? <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" /> : null}
      </div>
      {terms.length ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {terms.slice(0, 3).map((t) => (
            <div key={t.label}>
              <dt className="text-[11px] text-muted-foreground">{t.label}</dt>
              <dd className="figure truncate text-[14.5px]">{t.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px]">
        {o.company_id ? <Chip strong>In the directory</Chip> : null}
        <Src url={o.source_url} name="source" />
      </div>
    </>
  );
  return href ? (
    <Link href={href} className={`story-card flex flex-col p-4 ${hero ? "story-card-hero" : ""}`}>
      {body}
    </Link>
  ) : (
    <div className="story-card flex flex-col p-4">{body}</div>
  );
}

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getSportsTeam(id);
  if (!team) notFound();
  const [owners, deals, others] = await Promise.all([getTeamOwners([id]), getDeals({ teamId: id, limit: 200 }), leaguePeers(team.league, id, 8)]);
  const institutional = owners.filter((o) => o.institutional).sort((a, b) => (b.stake_pct ?? -1) - (a.stake_pct ?? -1));
  const founders = owners.filter((o) => !o.institutional);
  const file = clubFileRows(team.facts);
  const verification = Array.isArray(team.verification) ? team.verification : [];
  const platforms = Array.isArray(team.social_platforms) ? team.social_platforms : [];
  const sources = Array.isArray(team.sources) ? team.sources : [];
  const peers = [...others].sort((a, b) => {
    if (a.revenue == null || b.revenue == null) return a.revenue == null ? (b.revenue == null ? a.name.localeCompare(b.name) : 1) : -1;
    return (a.revenue_currency ?? "").localeCompare(b.revenue_currency ?? "") || b.revenue - a.revenue;
  });
  const researched = team.revenue != null || team.valuation != null || owners.length > 0;
  const top = institutional[0] ?? null;
  const name = team.short_name ?? team.name;

  const chapters: ChapterLink[] = [];
  let n = 0;
  const next = (cid: string, label: string, count?: number | null) => {
    n += 1;
    chapters.push({ id: cid, label, count });
    return n;
  };
  const nOwners = owners.length ? next("owners", "Owners", owners.length) : 0;
  const nFile = file.length ? next("file", "Club file", file.length) : 0;
  const nDeals = deals.length ? next("deals", "Deals", deals.length) : 0;
  const nFollowing = platforms.length ? next("following", "Following", null) : 0;
  const nCheck = verification.length ? next("check", "Fact check", verification.length) : 0;
  const nPeers = peers.length ? next("league", "League", peers.length) : 0;
  const leagueHref = team.league ? `/database/sports?league=${encodeURIComponent(team.league)}#clubs` : "/database/sports";

  return (
    <StoryPage accent="sports">
      <BackLink href={leagueHref} label={team.league ?? "Sports"} />
      <header className="mt-5 flex flex-wrap items-start gap-x-6 gap-y-4">
        <span className="story-logo shrink-0" style={{ borderRadius: 18 }}>
          <CompanyLogo name={name} domain={team.domain} size={72} />
        </span>
        <div className="min-w-0 flex-1 basis-[420px]">
          <div className="wordmark text-[10.5px] text-[var(--brass)]">{[SPORT_LABEL[team.sport] ?? team.sport, team.league, team.country].filter(Boolean).join(" · ")}</div>
          <h1 className="story-name mt-2">{team.name}</h1>
          <p className="story-lede mt-3">
            {team.ownership_summary ? (
              <strong>{team.ownership_summary}</strong>
            ) : (
              <>
                <strong>
                  A {(SPORT_LABEL[team.sport] ?? team.sport).toLowerCase()} club{team.city ? ` from ${team.city}` : ""}{team.league ? ` in ${team.league}` : ""}{team.founded_year ? `, founded in ${team.founded_year}` : ""}.
                </strong>{" "}
                {researched ? "No page on file states who owns it." : "Not researched yet: research fills ownership, revenue, valuation, following and deals, every figure with its page."}
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {team.ownership_type && team.ownership_type !== "unknown" ? <Chip strong>{OWNERSHIP_TYPE_LABEL[team.ownership_type]}</Chip> : null}
            {team.city ? <Chip>{team.city}</Chip> : null}
            {team.founded_year ? <Chip>Founded {team.founded_year}</Chip> : null}
            {team.stadium ? <Chip>{team.stadium}</Chip> : null}
            {team.domain ? (
              <a href={`https://${team.domain}`} target="_blank" rel="noreferrer" className="story-chip inline-flex items-center gap-1 hover:text-foreground">
                <Globe className="h-3 w-3" /> {team.domain}
              </a>
            ) : null}
          </div>
          <div className="mt-4">
            <ResearchClubButton teamId={team.id} researched={researched} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
          </div>
        </div>
        {top ? (
          (() => {
            const href = ownerHref(top);
            const inner = (
              <>
                <CompanyLogo name={top.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] text-muted-foreground">Institutional investor</span>
                  <span className="block truncate text-[14px] font-medium">{top.name}</span>
                  {top.stake_pct != null ? <span className="block text-[11.5px] text-muted-foreground">{top.stake_pct}% stake</span> : null}
                </span>
                {href ? <ArrowUpRight className="story-card-arrow h-4 w-4" /> : null}
              </>
            );
            return href ? (
              <Link href={href} className="story-card flex w-full items-center gap-3 p-3 md:w-[280px]">
                {inner}
              </Link>
            ) : (
              <div className="story-card flex w-full items-center gap-3 p-3 md:w-[280px]">{inner}</div>
            );
          })()
        ) : null}
      </header>

      <Figures>
        {team.valuation != null ? <Figure label="Valuation" value={formatMoney(team.valuation, team.valuation_currency)} basis={<Src url={team.valuation_source_url} name={team.valuation_source_name} asOf={team.valuation_year ? String(team.valuation_year) : null} />} /> : null}
        {team.revenue != null ? <Figure label="Revenue" value={formatMoney(team.revenue, team.revenue_currency)} basis={<Src url={team.revenue_source_url} name={team.revenue_source_name} asOf={team.revenue_season} />} /> : null}
        {team.social_followers != null ? <Figure label="Following" value={formatCount(team.social_followers)} basis={<Src url={team.social_source_url} name="all platforms" asOf={team.social_as_of} />} href={nFollowing ? "#following" : undefined} /> : null}
        {team.stadium_capacity != null ? <Figure label="Stadium" value={team.stadium_capacity.toLocaleString("en-US")} basis={<Src url={team.stadium_capacity_source_url} name={team.stadium} />} /> : null}
        {institutional.length ? <Figure label="Institutional investors" value={institutional.length} href="#owners" /> : null}
      </Figures>

      <ChapterNav chapters={chapters} />

      {nOwners ? (
        <Chapter id="owners" n={nOwners} eyebrow="Ownership" title={institutional.length ? `${institutional.length} institutional investor${institutional.length === 1 ? "" : "s"} in ${name}.` : `Who owns ${name}.`} lead="Funds, sovereign investors, family offices and corporates first, with the terms a page states; then the other owners on record.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {institutional.map((o, i) => (
              <OwnerCard key={o.id} o={o} hero={i === 0} />
            ))}
            {founders.map((o) => (
              <OwnerCard key={o.id} o={o} />
            ))}
          </div>
        </Chapter>
      ) : null}

      {nFile ? (
        <Chapter id="file" n={nFile} eyebrow="Club file" title={`What else is on file for ${name}.`} lead="From the club's accounts, its own site and the press, each with the page that states it.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {file.map((r) => (
              <div key={r.label} className="story-card p-3.5" title={r.src.evidence ? `“${r.src.evidence}”` : undefined}>
                <div className="text-[11.5px] text-muted-foreground">{r.label}</div>
                <div className="mt-1 text-[14px] font-medium leading-snug">{r.value}</div>
                <div className="mt-2 text-[11.5px]">
                  <Src url={r.src.source_url} name={r.src.source_name ?? "source"} />
                </div>
              </div>
            ))}
          </div>
        </Chapter>
      ) : null}

      {nDeals ? (
        <Chapter id="deals" n={nDeals} eyebrow="Deals" title={`${deals.length} deal${deals.length === 1 ? "" : "s"} around ${name}.`}>
          <DealRows deals={deals} limit={12} />
        </Chapter>
      ) : null}

      {nFollowing ? (
        <Chapter id="following" n={nFollowing} eyebrow="Following" title={team.social_followers != null ? `${formatCount(team.social_followers)} followers across platforms.` : "Its following."}>
          <Figures>
            {platforms.map((p) => (
              <Figure key={p.platform} label={p.platform} value={formatCount(p.followers)} basis={<Src url={p.source_url} asOf={p.as_of} />} />
            ))}
          </Figures>
        </Chapter>
      ) : null}

      {nCheck ? (
        <Chapter id="check" n={nCheck} eyebrow="Fact check" title="Its key figures, re-checked." lead="A second pass searched the record's figures with different queries. A refuted figure is not shown on this page; its verdict stays here.">
          <div className="story-card story-rows overflow-hidden">
            {verification.map((v, i) => (
              <div key={i} className="story-row">
                <Chip strong={v.verdict === "confirmed"} className={v.verdict === "refuted" ? "text-destructive" : undefined}>
                  {VERDICT[v.verdict] ?? v.verdict}
                </Chip>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium capitalize">{v.field.replace("_", " ")}</span>
                  <span className="block text-[12px] text-muted-foreground">{v.note}</span>
                </span>
                <Src url={v.source_url} />
              </div>
            ))}
          </div>
        </Chapter>
      ) : null}

      {nPeers ? (
        <Chapter id="league" n={nPeers} eyebrow="The league" title={`Others in ${team.league ?? "the league"}.`} more={team.league ? { href: leagueHref, label: `All of ${team.league}` } : null}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {peers.map((p) => (
              <Link key={p.id} href={`/database/sports/${p.id}`} className="story-card flex items-center gap-3 p-3.5">
                <CompanyLogo name={p.short_name ?? p.name} domain={p.domain} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">{p.short_name ?? p.name}</span>
                  {p.revenue != null ? <span className="block text-[12px] text-muted-foreground">{formatMoney(p.revenue, p.revenue_currency)} revenue</span> : null}
                </span>
                <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
              </Link>
            ))}
          </div>
        </Chapter>
      ) : null}

      {sources.length || team.notes ? (
        <section className="chapter" aria-label="Sources">
          <div className="chapter-eyebrow">Sources</div>
          {team.notes ? <p className="chapter-lead mt-2">{team.notes}</p> : null}
          {sources.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.slice(0, 30).map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="story-chip max-w-[320px] truncate hover:text-foreground" title={u}>
                  {u.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                </a>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </StoryPage>
  );
}
