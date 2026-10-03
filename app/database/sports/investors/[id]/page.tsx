import Link from "next/link";
import { notFound } from "next/navigation";
import { Globe } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { IntelShell } from "@/components/intel/shell";
import { DealTable } from "@/components/intel/tables";
import { Box, Empty, Src, Stat, StatStrip, Tag } from "@/components/intel/ui";
import { INVESTOR_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { getDeals, getSportsInvestor, teamsHeldBy } from "@/lib/directory/intelligence-queries";
import { formatMoney, SPORT_LABEL } from "@/lib/directory/intelligence-types";

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

  return (
    <IntelShell
      crumbs={[{ href: "/database/sports", label: "Sports" }, { href: "/database/sports?tab=investors", label: "Investors" }, { label: inv.name }]}
      kicker={INVESTOR_TYPE_LABEL[inv.investor_type ?? "other"] ?? "Investor"}
      title={
        <span className="flex items-center gap-3">
          <CompanyLogo name={inv.name} domain={inv.domain} size={40} />
          <span>{inv.name}</span>
        </span>
      }
      description={inv.summary}
      actions={
        <>
          {inv.company_id ? (
            <Link href={`/companies/${inv.company_id}`} className="rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] font-medium hover:bg-accent">
              Firm profile in the directory
            </Link>
          ) : null}
          {inv.domain ? (
            <a href={`https://${inv.domain}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-[4px] border bg-card px-2.5 py-1.5 text-[12px] hover:bg-accent">
              <Globe className="h-3.5 w-3.5" /> {inv.domain}
            </a>
          ) : null}
        </>
      }
    >
      <StatStrip>
        <Stat label="Fund size / AUM" value={formatMoney(inv.aum, inv.aum_currency)} basis={<Src url={inv.aum_source_url} asOf={inv.aum_as_of} />} />
        <Stat label="HQ" value={<span className="text-[15px]">{inv.hq ?? "—"}</span>} />
        <Stat label="Holdings on record" value={holdings.length} basis={`${held.length} linked to club profiles`} />
        <Stat label="Deals" value={deals.length} />
      </StatStrip>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Box title="Holdings" count={holdings.length} flush>
            {holdings.length ? (
              <div className="overflow-x-auto">
                <table className="desk-table">
                  <thead>
                    <tr>
                      <th>Team / asset</th>
                      <th>Sport</th>
                      <th className="num">Stake</th>
                      <th className="num">Since</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h, i) => {
                      const link = held.find((x) => x.team.name.toLowerCase() === h.target.toLowerCase() || (x.team.short_name ?? "").toLowerCase() === h.target.toLowerCase());
                      return (
                        <tr key={`${h.target}-${i}`}>
                          <td className="font-medium">{link ? <Link href={`/database/sports/${link.team.id}`}>{h.target}</Link> : h.target}</td>
                          <td className="text-muted-foreground">{h.sport ? (SPORT_LABEL[h.sport] ?? h.sport) : "—"}</td>
                          <td className="num">{h.stake_pct != null ? `${h.stake_pct}%` : "—"}</td>
                          <td className="num">{h.since_year ?? "—"}</td>
                          <td>
                            <Src url={h.source_url} name="source" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>No holdings on record.</Empty>
            )}
          </Box>
          <Box title="Deals" count={deals.length} flush>
            <DealTable deals={deals} showClass={false} compact />
          </Box>
        </div>
        <div className="space-y-4">
          <Box title="Clubs on file with this investor" count={held.length} flush>
            {held.length ? (
              <ul className="divide-y">
                {held.map((h) => (
                  <li key={h.id}>
                    <Link href={`/database/sports/${h.team.id}`} className="flex items-center gap-2 px-3 py-1.5 text-[12px] hover:bg-accent/40">
                      <CompanyLogo name={h.team.short_name ?? h.team.name} domain={h.team.domain} size={18} />
                      <span className="min-w-0 flex-1 truncate">{h.team.short_name ?? h.team.name}</span>
                      <Tag>{h.team.league}</Tag>
                      <span className="figure text-[11px] text-muted-foreground">{h.stake_pct != null ? `${h.stake_pct}%` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No club profile names this investor yet.</Empty>
            )}
          </Box>
          {inv.source_url ? (
            <Box title="Source">
              <Src url={inv.source_url} name={inv.source_url.replace(/^https?:\/\//, "").slice(0, 60)} />
            </Box>
          ) : null}
        </div>
      </div>
    </IntelShell>
  );
}
