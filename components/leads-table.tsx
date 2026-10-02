"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { LeadWithRefs } from "@/lib/types";
import { LEAD_STAGES, STAGE_META, MARKET_LABELS } from "@/lib/pipeline";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { EventChips } from "@/components/pipeline/event-chips";
import { FacetChips, FacetMenu } from "@/components/intel/facet-menu";
import { ListToolbar, ShowMore, SortSelect, facetOptions } from "@/components/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { formatUsd } from "@/lib/utils";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ProfileLite = { id: string; full_name: string | null };

const PAGE = 100;
type Sort = "activity" | "company" | "value" | "stage";
const SORTS: { value: Sort; label: string }[] = [
  { value: "activity", label: "Recent activity" },
  { value: "company", label: "Company" },
  { value: "value", label: "Value" },
  { value: "stage", label: "Stage" },
];

export function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage as keyof typeof STAGE_META];
  const kind = meta?.kind ?? "open";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-foreground/80">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          kind === "won" ? "bg-foreground" : kind === "lost" ? "bg-foreground/30" : "bg-foreground/60",
        )}
      />
      {stage}
    </span>
  );
}

/** Owner facet: "My leads" on its own, then the team, then the unassigned. */
export function ownerGroups(leads: LeadWithRefs[], profiles: ProfileLite[], currentUserId: string | null) {
  const count = (pred: (l: LeadWithRefs) => boolean) => leads.filter(pred).length;
  const me = currentUserId ? [{ key: "me", label: "My leads", count: count((l) => l.owner_id === currentUserId) }] : [];
  const team = profiles
    .filter((p) => p.id !== currentUserId)
    .map((p) => ({ key: p.id, label: p.full_name ?? "Unnamed", count: count((l) => l.owner_id === p.id) }))
    .filter((o) => o.count > 0)
    .sort((a, b) => b.count - a.count);
  const none = count((l) => !l.owner_id);
  return [
    { label: "", options: me },
    { label: "Team", options: none ? [...team, { key: "none", label: "Unassigned", count: none }] : team },
  ].filter((g) => g.options.length);
}

export function ownerMatches(l: LeadWithRefs, owners: string[], currentUserId: string | null) {
  if (!owners.length) return true;
  return owners.some((k) => (k === "me" ? l.owner_id === currentUserId : k === "none" ? !l.owner_id : l.owner_id === k));
}

export function ownerLabel(k: string, profiles: ProfileLite[]) {
  if (k === "me") return "My leads";
  if (k === "none") return "Unassigned";
  return profiles.find((p) => p.id === k)?.full_name ?? "Unnamed";
}

export function LeadsTable({
  leads,
  currentUserId,
  isAdmin,
  profiles,
}: {
  leads: LeadWithRefs[];
  currentUserId: string | null;
  isAdmin: boolean;
  profiles: ProfileLite[];
}) {
  const [q, setQ] = useState("");
  const [stages, setStages] = useState<string[]>([]);
  const [markets, setMarkets] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("activity");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = leads.filter((l) => {
      if (stages.length && !stages.includes(l.stage)) return false;
      if (markets.length && !markets.includes(l.market ?? "")) return false;
      if (!ownerMatches(l, owners, currentUserId)) return false;
      if (!needle) return true;
      return (
        (l.company_name ?? "").toLowerCase().includes(needle) ||
        (l.contact_name ?? "").toLowerCase().includes(needle) ||
        (l.owner?.full_name ?? "").toLowerCase().includes(needle)
      );
    });
    const at = (l: LeadWithRefs) => new Date(l.last_activity_at ?? l.updated_at ?? l.created_at).getTime();
    const stageIx = (l: LeadWithRefs) => (LEAD_STAGES as readonly string[]).indexOf(l.stage);
    return rows.sort((a, b) => {
      switch (sort) {
        case "company":
          return (a.company_name ?? "").localeCompare(b.company_name ?? "");
        case "value":
          return (b.value_usd ?? -1) - (a.value_usd ?? -1);
        case "stage":
          return stageIx(a) - stageIx(b) || at(b) - at(a);
        default:
          return at(b) - at(a);
      }
    });
  }, [leads, stages, markets, owners, q, sort, currentUserId]);

  const stageOptions = facetOptions(leads, (l) => l.stage, { order: LEAD_STAGES });
  const marketOptions = facetOptions(leads, (l) => l.market, { label: (k) => MARKET_LABELS[k] ?? k });
  const owner = ownerGroups(leads, profiles, currentUserId);
  const anyFilter = Boolean(q || stages.length || markets.length || owners.length);
  const clearAll = () => {
    setQ("");
    setStages([]);
    setMarkets([]);
    setOwners([]);
  };
  const visible = filtered.slice(0, shown);

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search company, contact or owner" }}
        facets={
          <>
            <FacetMenu label="Stage" groups={[{ label: "", options: stageOptions }]} selected={stages} onChange={setStages} searchable={false} width={220} />
            <FacetMenu label="Market" groups={[{ label: "", options: marketOptions }]} selected={markets} onChange={setMarkets} searchable={false} width={200} />
            <FacetMenu label="Owner" groups={owner} selected={owners} onChange={setOwners} width={240} />
          </>
        }
        sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}
        shown={filtered.length}
        total={leads.length}
        noun="leads"
        actions={<NewLeadDialog profiles={profiles} isAdmin={isAdmin} />}
        chips={
          <FacetChips
            chips={[
              ...stages.map((k) => ({ key: `s:${k}`, label: k, remove: () => setStages(stages.filter((x) => x !== k)) })),
              ...markets.map((k) => ({ key: `m:${k}`, label: MARKET_LABELS[k] ?? k, remove: () => setMarkets(markets.filter((x) => x !== k)) })),
              ...owners.map((k) => ({ key: `o:${k}`, label: ownerLabel(k, profiles), remove: () => setOwners(owners.filter((x) => x !== k)) })),
            ]}
            onClearAll={clearAll}
          />
        }
      />

      {filtered.length === 0 ? (
        leads.length === 0 ? (
          <EmptyState
            title="No leads in the book yet"
            description="A lead is a company and the person you are pitching an event to. Add one, or import a list from a conference or a data provider."
            action={<NewLeadDialog profiles={profiles} isAdmin={isAdmin} />}
          />
        ) : (
          <EmptyState
            title="No leads match these filters"
            description={`${leads.length} leads are in the book; none carry every filter you have set.`}
            action={
              anyFilter ? (
                <button type="button" onClick={clearAll} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
                  Clear filters
                </button>
              ) : null
            }
          />
        )
      ) : (
        <div className="sheen overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <Th className="pl-5">Company</Th>
                  <Th>Contact</Th>
                  <Th>Stage</Th>
                  <Th>Market</Th>
                  <Th>Owner</Th>
                  <Th className="text-right">Value</Th>
                  <Th className="pr-5">Next step</Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => {
                  const name = l.company_name ?? l.company?.name ?? "Untitled";
                  return (
                    <tr key={l.id} className="border-t transition-colors duration-[120ms] hover:bg-muted/30">
                      <td className="max-w-[280px] py-2.5 pl-5 pr-3">
                        <Link href={`/leads/${l.id}`} className="block truncate font-medium hover:underline" title={name}>
                          {name}
                        </Link>
                        {l.target_events?.length ? (
                          <div className="mt-1">
                            <EventChips events={l.target_events} />
                          </div>
                        ) : null}
                      </td>
                      <td className="max-w-[200px] truncate whitespace-nowrap px-3 py-2.5 text-muted-foreground" title={l.contact_name ?? undefined}>
                        {l.contact_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <StageBadge stage={l.stage} />
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{l.market ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground">
                            {initials(l.owner?.full_name ?? "?")}
                          </span>
                          <span className="max-w-[110px] truncate text-muted-foreground">{l.owner?.full_name ?? "Unassigned"}</span>
                        </span>
                      </td>
                      <td className="tabular whitespace-nowrap px-3 py-2.5 text-right">
                        {l.value_usd != null ? formatUsd(l.value_usd) : "—"}
                      </td>
                      <td className="max-w-[220px] truncate py-2.5 pl-3 pr-5 text-muted-foreground" title={l.next_step ?? undefined}>
                        {l.next_step ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ShowMore remaining={filtered.length - shown} step={PAGE} onClick={() => setShown(shown + PAGE)} className="border-t px-5 py-2.5" />
        </div>
      )}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn("sticky top-0 z-[1] whitespace-nowrap bg-card px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground", className)}>
      {children}
    </th>
  );
}
