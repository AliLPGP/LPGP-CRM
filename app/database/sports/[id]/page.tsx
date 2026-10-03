import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { IntelShell } from "@/components/intel/shell";
import { DealTable } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { INVESTOR_TYPE_LABEL, OWNERSHIP_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { getDeals, getSportsTeam, getTeamOwners, leaguePeers } from "@/lib/directory/intelligence-queries";
import { ResearchClubButton } from "@/components/intel/research-buttons";
import { ClubFile } from "@/components/intel/club-file";
import { formatCount, formatMoney } from "@/lib/directory/intelligence-types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getSportsTeam(id);
  return { title: team ? `${team.short_name ?? team.name} — LPGP Intelligence` : "Club — LPGP Intelligence" };
}

const VERDICT: Record<string, string> = { confirmed: "Confirmed", refuted: "Refuted", unverifiable: "Unverified" };

export default async function ClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team = await getSportsTeam(id);
  if (!team) notFound();
  const [owners, deals, others] = await Promise.all([getTeamOwners([id]), getDeals({ teamId: id, limit: 200 }), leaguePeers(team.league, id, 8)]);
  const founders = owners.filter((o) => !o.institutional);
  const institutional = owners.filter((o) => o.institutional);
  // Ranked within each revenue currency (club accounts in GBP next to a
  // Money League figure in EUR are not one scale); clubs without a figure last.
  const peers = [...others].sort((a, b) => {
    if (a.revenue == null || b.revenue == null) return a.revenue == null ? (b.revenue == null ? a.name.localeCompare(b.name) : 1) : -1;
    return (a.revenue_currency ?? "").localeCompare(b.revenue_currency ?? "") || b.revenue - a.revenue;
  });
  const verification = Array.isArray(team.verification) ? team.verification : [];

  return (
    <IntelShell
      crumbs={[{ href: "/database/sports", label: "Sports" }, { label: team.short_name ?? team.name }]}
      kicker={[team.league, team.country].filter(Boolean).join(" · ")}
      title={
        <span className="flex items-center gap-3">
          <CompanyLogo name={team.short_name ?? team.name} domain={team.domain} size={40} />
          <span>{team.name}</span>
        </span>
      }
      description={team.ownership_summary ?? (team.revenue == null && team.valuation == null && !owners.length ? "Listed from the league roster; not researched yet. “Research this club” fills ownership, revenue, valuation, following and deals from the web, every figure with its page." : null)}
      actions={
        <>
          <ResearchClubButton teamId={team.id} researched={team.revenue != null || team.valuation != null || owners.length > 0} aiReady={Boolean(process.env.ANTHROPIC_API_KEY)} />
          {team.domain ? (
            <a href={`https://${team.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] hover:bg-accent">
              <Globe className="h-3.5 w-3.5" /> {team.domain}
            </a>
          ) : null}
        </>
      }
    >
      <StatStrip>
        <Stat label="Revenue" value={formatMoney(team.revenue, team.revenue_currency)} basis={<Src url={team.revenue_source_url} name={team.revenue_source_name} asOf={team.revenue_season} />} />
        <Stat label="Valuation" value={formatMoney(team.valuation, team.valuation_currency)} basis={<Src url={team.valuation_source_url} name={team.valuation_source_name} asOf={team.valuation_year ? String(team.valuation_year) : null} />} />
        <Stat label="Following" value={formatCount(team.social_followers)} basis={<Src url={team.social_source_url} name="all platforms" asOf={team.social_as_of} />} defn="Followers across social platforms, as one source counted them on the date shown." />
        <Stat label="Stadium" value={team.stadium_capacity != null ? team.stadium_capacity.toLocaleString("en-US") : "—"} basis={<Src url={team.stadium_capacity_source_url} name={team.stadium} />} />
        <Stat label="Founded" value={team.founded_year ?? "—"} basis={team.founded_source_url ? <Src url={team.founded_source_url} name={team.city ?? "source"} /> : team.city ?? undefined} />
        <Stat label="Ownership" value={<span className="text-[15px]">{OWNERSHIP_TYPE_LABEL[team.ownership_type ?? "unknown"]}</span>} basis={<Src url={team.ownership_source_url} name="source" />} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Box title="Institutional investors" count={institutional.length} flush defn="Funds, sovereign investors, family offices and corporates with a stake, with the terms a source states.">
            {institutional.length ? (
              <div className="overflow-x-auto">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Investor</th>
                      <th>Type</th>
                      <th className="num">Stake</th>
                      <th className="num">Since</th>
                      <th className="num">Invested</th>
                      <th className="num">Valuation at entry</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {institutional.map((o) => (
                      <tr key={o.id}>
                        <td className="font-medium">
                          {o.company_id ? (
                            <Link href={`/companies/${o.company_id}`}>{o.name}</Link>
                          ) : o.investor_id ? (
                            <Link href={`/database/sports/investors/${o.investor_id}`}>{o.name}</Link>
                          ) : (
                            o.name
                          )}
                          {o.company_id ? <span className="tag ml-1.5">Directory firm</span> : null}
                        </td>
                        <td>
                          <Tag>{INVESTOR_TYPE_LABEL[o.investor_type ?? "other"] ?? o.investor_type}</Tag>
                        </td>
                        <td className="num">{o.stake_pct != null ? `${o.stake_pct}%` : "—"}</td>
                        <td className="num">{o.since_year ?? "—"}</td>
                        <td className="num">{formatMoney(o.amount, o.currency)}</td>
                        <td className="num">{formatMoney(o.valuation_at_entry, o.currency)}</td>
                        <td>
                          <Src url={o.source_url} name="source" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No fund, sovereign or corporate investor on record.</Empty>
            )}
          </Box>

          <Box title="Deals" count={deals.length} flush>
            <DealTable deals={deals} showClass={false} compact />
          </Box>

          <ClubFile facts={team.facts} />

          <Box title="Owners" count={founders.length} flush>
            {founders.length ? (
              <div className="overflow-x-auto">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Kind</th>
                      <th className="num">Stake</th>
                      <th className="num">Since</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {founders.map((o) => (
                      <tr key={o.id}>
                        <td className="font-medium">{o.name}</td>
                        <td className="text-muted-foreground">{o.kind ?? "—"}</td>
                        <td className="num">{o.stake_pct != null ? `${o.stake_pct}%` : "—"}</td>
                        <td className="num">{o.since_year ?? "—"}</td>
                        <td>
                          <Src url={o.source_url} name="source" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No owner rows on record.</Empty>
            )}
          </Box>
        </div>

        <div className="space-y-4">
          {Array.isArray(team.social_platforms) && team.social_platforms.length ? (
            <Box title="Following by platform" flush>
              <table className="desk-table">
                <tbody>
                  {team.social_platforms.map((p) => (
                    <tr key={p.platform}>
                      <td>{p.platform}</td>
                      <td className="num">{formatCount(p.followers)}</td>
                      <td>
                        <Src url={p.source_url} asOf={p.as_of} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          ) : null}

          <Box title="Fact check" count={verification.length} flush defn="A second researcher re-searched the record's key figures with different queries. Refuted figures are not shown on this page; the verdicts stay here.">
            {verification.length ? (
              <ul className="divide-y">
                {verification.map((v, i) => (
                  <li key={i} className="px-3 py-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <Tag strong={v.verdict === "confirmed"} className={v.verdict === "refuted" ? "text-destructive" : undefined}>
                        {VERDICT[v.verdict] ?? v.verdict}
                      </Tag>
                      <span className="capitalize text-muted-foreground">{v.field.replace("_", " ")}</span>
                      <Src url={v.source_url} className="ml-auto" />
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{v.note}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Not re-checked.</Empty>
            )}
          </Box>

          {team.notes ? (
            <Box title="Notes">
              <p className="text-[12px] leading-relaxed text-muted-foreground">{team.notes}</p>
            </Box>
          ) : null}

          <Box title={`Others in ${team.league ?? "the league"}`} flush>
            <ul className="divide-y">
              {peers.map((p) => (
                <li key={p.id}>
                  <Link href={`/database/sports/${p.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                    <CompanyLogo name={p.short_name ?? p.name} domain={p.domain} size={18} />
                    <span className="min-w-0 flex-1 truncate">{p.short_name ?? p.name}</span>
                    <span className="figure text-[11px] text-muted-foreground">{formatMoney(p.revenue, p.revenue_currency)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Box>

          {Array.isArray(team.sources) && team.sources.length ? (
            <Box title="Sources" count={team.sources.length} flush>
              <ul className="divide-y">
                {team.sources.slice(0, 30).map((u) => (
                  <li key={u} className="px-3 py-1.5">
                    <a href={u} target="_blank" rel="noreferrer" className="block truncate text-[11.5px] text-muted-foreground hover:text-foreground" title={u}>
                      {u.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ))}
              </ul>
            </Box>
          ) : null}
        </div>
      </div>
    </IntelShell>
  );
}
