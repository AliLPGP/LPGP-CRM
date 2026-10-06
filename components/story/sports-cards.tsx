import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { Chip } from "@/components/story/story";
import { DEAL_KIND_LABEL, INVESTOR_TYPE_LABEL } from "@/lib/directory/asset-classes";
import { formatCount, formatMoney, type ClubRow, type Deal, type SportsInvestor } from "@/lib/directory/intelligence-types";

// The sports desk's cards, in the story register every other record wears:
// a club, an investor in sport, a deal. A card shows only what is on file and
// opens the record behind it.

/** A club: its crest, league, the two figures a reader asks first, and the institutional money in it. */
export function ClubCard({ c }: { c: ClubRow }) {
  const metrics: { label: string; value: string }[] = [];
  if (c.valuation != null) metrics.push({ label: "Valuation", value: formatMoney(c.valuation, c.valuation_currency) });
  if (c.revenue != null) metrics.push({ label: "Revenue", value: formatMoney(c.revenue, c.revenue_currency) });
  if (c.social_followers != null && metrics.length < 3) metrics.push({ label: "Following", value: formatCount(c.social_followers) });
  if (c.stadium_capacity != null && metrics.length < 3) metrics.push({ label: "Stadium", value: c.stadium_capacity.toLocaleString("en-US") });
  return (
    <Link href={`/database/sports/${c.id}`} className="story-card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <CompanyLogo name={c.short_name ?? c.name} domain={c.domain} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{c.short_name ?? c.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{[c.league, c.city ?? c.country].filter(Boolean).join(" · ")}</span>
        </span>
        <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
      </div>
      {metrics.length ? (
        <dl className="mt-4 grid grid-cols-3 gap-2">
          {metrics.slice(0, 3).map((m) => (
            <div key={m.label}>
              <dt className="text-[11px] text-muted-foreground">{m.label}</dt>
              <dd className="figure truncate text-[14.5px]">{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {c.topInvestor ? (
        <div className="mt-auto flex min-w-0 items-center gap-1.5 pt-4">
          <Chip strong className="min-w-0 max-w-full truncate" title={c.topInvestor.name}>
            {c.topInvestor.name}
          </Chip>
          {c.topInvestor.stake != null ? <span className="figure shrink-0 text-[11.5px] text-muted-foreground">{c.topInvestor.stake}%</span> : null}
          {c.institutional > 1 ? <span className="shrink-0 whitespace-nowrap text-[11.5px] text-muted-foreground">+{c.institutional - 1} more</span> : null}
        </div>
      ) : null}
    </Link>
  );
}

/** An investor in sport: who it is, what it manages, and the clubs it holds. */
export function SportsInvestorCard({ i, clubs }: { i: SportsInvestor; clubs?: number }) {
  const holdings = Array.isArray(i.holdings) ? i.holdings : [];
  return (
    <Link href={`/database/sports/investors/${i.id}`} className="story-card flex flex-col p-4">
      <div className="flex items-start gap-3">
        <CompanyLogo name={i.name} domain={i.domain} size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14.5px] font-medium">{i.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{[INVESTOR_TYPE_LABEL[i.investor_type ?? "other"] ?? i.investor_type, i.hq].filter(Boolean).join(" · ")}</span>
        </span>
        <ArrowUpRight className="story-card-arrow h-4 w-4 shrink-0" />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2">
        <div>
          <dt className="text-[11px] text-muted-foreground">Holdings</dt>
          <dd className="figure text-[14.5px]">{holdings.length}</dd>
        </div>
        {clubs ? (
          <div>
            <dt className="text-[11px] text-muted-foreground">Clubs here</dt>
            <dd className="figure text-[14.5px]">{clubs}</dd>
          </div>
        ) : null}
        {i.aum != null ? (
          <div>
            <dt className="text-[11px] text-muted-foreground">AUM</dt>
            <dd className="figure truncate text-[14.5px]">{formatMoney(i.aum, i.aum_currency)}</dd>
          </div>
        ) : null}
      </dl>
      {holdings.length ? <div className="mt-auto truncate pt-3 text-[11.5px] text-muted-foreground">{holdings.slice(0, 3).map((h) => `${h.target}${h.stake_pct != null ? ` ${h.stake_pct}%` : ""}`).join(" · ")}</div> : null}
    </Link>
  );
}

/** Deals as story rows: date, headline, kind and parties, the stated figure. */
export function DealRows({ deals, limit = 10 }: { deals: Deal[]; limit?: number }) {
  return (
    <div className="story-card story-rows overflow-hidden">
      {deals.slice(0, limit).map((d) => (
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
  );
}
