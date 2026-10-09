import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Chapter, Chip, ClassIcon, Meter } from "@/components/story/story";
import { Src } from "@/components/intel/ui";
import { dateLabel } from "@/components/intel/tables";
import { ASSET_CLASS_BY_KEY, isAssetClassKey } from "@/lib/directory/asset-classes";
import { formatMoney } from "@/lib/directory/intelligence-types";
import { profileSource, type InvestorPlan, type InvestorProfile } from "@/lib/directory/investor-queries";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { FOCUS_BY_CODE, INDUSTRY_BY_CODE, INVESTOR_PRACTICES, PLAN_STATUS_LABEL, REGION_BY_CODE } from "@/lib/directory/taxonomy";

// An LP's researched profile told as chapters of its story: what it holds in
// each private asset class as its own documents state it, what it says it
// will commit next, and what it says it favours. Every value carries the page
// that states it; a class with no stated figure is not drawn.

const classLabel = (key: string) => (isAssetClassKey(key) ? ASSET_CLASS_BY_KEY[key].name : key);

function ticketLabel(min: number | null, max: number | null): string | null {
  if (min != null && max != null) return `${formatMoney(min, "USD")}–${formatMoney(max, "USD")}`;
  if (min != null) return `from ${formatMoney(min, "USD")}`;
  if (max != null) return `up to ${formatMoney(max, "USD")}`;
  return null;
}

/** The stated allocations worth a card: a class with at least one figure. */
export function statedAllocations(profile: InvestorProfile | null) {
  return (profile?.allocations ?? []).filter((a) => a.class && (a.current_pct != null || a.target_pct != null || a.current_usd != null));
}

export function AllocationChapter({ id, n, profile, base, name }: { id: string; n: number; profile: InvestorProfile; base: string; name: string }) {
  const rows = statedAllocations(profile).sort((a, b) => (b.current_pct ?? b.target_pct ?? -1) - (a.current_pct ?? a.target_pct ?? -1) || (b.current_usd ?? 0) - (a.current_usd ?? 0));
  const src = profileSource(profile, "allocations");
  return (
    <Chapter
      id={id}
      n={n}
      eyebrow="Allocation"
      title={`Where ${name} invests in private markets.`}
      lead={profile.overview ?? "As its own reports state it, class by class: the share of the whole fund it holds now, its target, and the amount."}
      more={{ href: `${base}?view=profile`, label: "Investor profile" }}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((a, i) => {
          const pct = a.current_pct ?? a.target_pct;
          const href = isAssetClassKey(a.class) ? `/database/asset-classes/${ASSET_CLASS_BY_KEY[a.class].slug}` : null;
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <ClassIcon cls={a.class} />
                {href ? <ArrowUpRight className="story-card-arrow h-4 w-4" /> : null}
              </div>
              <div className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">{classLabel(a.class)}</div>
              {pct != null ? (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="figure text-[28px] leading-none">{pct}%</span>
                  <span className="text-[12px] text-muted-foreground">{a.current_pct != null ? "of the total fund" : "target"}</span>
                </div>
              ) : (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="figure text-[28px] leading-none">{formatMoney(a.current_usd ?? 0, "USD")}</span>
                  <span className="text-[12px] text-muted-foreground">held</span>
                </div>
              )}
              {pct != null ? <Meter pct={pct} className="mt-3" /> : null}
              <dl className="mt-4 grid grid-cols-3 gap-2">
                <div>
                  <dt className="text-[11px] text-muted-foreground">Target</dt>
                  <dd className="figure text-[15px]">{a.target_pct != null ? `${a.target_pct}%` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">Held (USD)</dt>
                  <dd className="figure text-[15px]">{a.current_usd != null ? formatMoney(a.current_usd, "USD") : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-muted-foreground">As of</dt>
                  <dd className="figure text-[15px]">{a.as_of ? a.as_of.slice(0, 7) : "—"}</dd>
                </div>
              </dl>
            </>
          );
          return href ? (
            <Link key={`${a.class}-${i}`} href={href} className={`story-card flex flex-col p-4 ${i === 0 ? "story-card-hero" : ""}`}>
              {body}
            </Link>
          ) : (
            <div key={`${a.class}-${i}`} className="story-card flex flex-col p-4">
              {body}
            </div>
          );
        })}
      </div>
      {src ? (
        <p className="mt-3 text-[12px] text-muted-foreground">
          Source: <Src url={src.url} name={src.name ?? "Source"} asOf={src.as_of} />
        </p>
      ) : null}
    </Chapter>
  );
}

export function PlansChapter({ id, n, plans, base, name }: { id: string; n: number; plans: InvestorPlan[]; base: string; name: string }) {
  const investing = plans.filter((p) => p.status === "investing").length;
  return (
    <Chapter
      id={id}
      n={n}
      eyebrow="Next twelve months"
      title={investing ? `What ${name} says it will commit next.` : `What ${name} says about its next commitments.`}
      lead="From its own board papers, pacing plans and RFPs, or its officers in the press, with the page that says it."
      more={plans.length > 6 ? { href: `${base}?view=profile`, label: `All ${plans.length} plans` } : null}
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {plans.slice(0, 6).map((p) => {
          const ticket = ticketLabel(p.ticket_min_usd, p.ticket_max_usd);
          return (
            <div key={p.id} className="story-card flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <ClassIcon cls={p.asset_class} />
                <Chip strong={p.status === "investing"}>{PLAN_STATUS_LABEL[p.status] ?? p.status}</Chip>
              </div>
              <div className="mt-4 text-[17px] font-semibold tracking-[-0.01em]">{classLabel(p.asset_class)}</div>
              {p.note ? <p className="mt-1 text-[13px] leading-snug">{p.note}</p> : null}
              {p.strategies?.length || p.regions?.length ? (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(p.strategies ?? []).map((k) => (
                    <Chip key={k}>{STRATEGY_BY_KEY[k]?.name ?? k}</Chip>
                  ))}
                  {(p.regions ?? []).map((k) => (
                    <Chip key={k}>{REGION_BY_CODE[k]?.name ?? k}</Chip>
                  ))}
                </div>
              ) : null}
              {ticket || p.funds_planned != null ? (
                <div className="mt-3 text-[12.5px]">
                  {ticket ? <span className="figure">{ticket}</span> : null}
                  {ticket && p.funds_planned != null ? " · " : null}
                  {p.funds_planned != null ? <span>{p.funds_planned} fund{p.funds_planned === 1 ? "" : "s"} planned</span> : null}
                </div>
              ) : null}
              <div className="mt-auto truncate border-t pt-3 text-[11.5px] text-muted-foreground" style={{ marginTop: 16 }}>
                <Src url={p.source_url} name={p.source_name ?? "Source"} asOf={p.as_of ? dateLabel(p.as_of) : null} />
              </div>
            </div>
          );
        })}
      </div>
    </Chapter>
  );
}

/** What the investor says it favours, as chips; null when it states nothing. */
export function preferenceGroups(profile: InvestorProfile | null) {
  if (!profile) return [];
  const groups: { field: string; label: string; items: string[] }[] = [
    { field: "strategy_prefs", label: "Strategies", items: (profile.strategy_prefs ?? []).map((k) => STRATEGY_BY_KEY[k]?.name ?? k) },
    { field: "region_prefs", label: "Regions", items: (profile.region_prefs ?? []).map((k) => REGION_BY_CODE[k]?.name ?? k) },
    { field: "industry_prefs", label: "Industries", items: (profile.industry_prefs ?? []).map((k) => INDUSTRY_BY_CODE[k]?.name ?? FOCUS_BY_CODE[k]?.focus.name ?? k) },
    { field: "practices", label: "How it invests", items: (profile.practices ?? []).map((k) => INVESTOR_PRACTICES[k as keyof typeof INVESTOR_PRACTICES] ?? k) },
  ];
  const ticket = ticketLabel(profile.ticket_min_usd, profile.ticket_max_usd);
  if (ticket) groups.push({ field: "ticket_min_usd", label: "Ticket per fund (USD)", items: [ticket] });
  return groups.filter((g) => g.items.length);
}

export function PreferencesChapter({ id, n, profile, name }: { id: string; n: number; profile: InvestorProfile; name: string }) {
  const groups = preferenceGroups(profile);
  return (
    <Chapter id={id} n={n} eyebrow="Preferences" title={`What ${name} says it looks for.`} lead="In its own investment policy, reports or programme description.">
      <div className="story-card divide-y p-0">
        {groups.map((g) => {
          const s = profileSource(profile, g.field);
          return (
            <div key={g.field} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
              <div className="w-44 shrink-0 text-[12px] text-muted-foreground">{g.label}</div>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                {g.items.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
                {s ? <Src url={s.url} name={s.name ?? "Source"} asOf={s.as_of} className="ml-1" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Chapter>
  );
}
