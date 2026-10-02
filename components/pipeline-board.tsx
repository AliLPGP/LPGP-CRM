"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import type { LeadWithRefs } from "@/lib/types";
import { LEAD_STAGES, STAGE_META, MARKET_LABELS } from "@/lib/pipeline";
import { moveLeadStage } from "@/lib/crm-actions";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { EventChips } from "@/components/pipeline/event-chips";
import { FacetChips, FacetMenu } from "@/components/intel/facet-menu";
import { ListToolbar, facetOptions } from "@/components/list-toolbar";
import { ownerGroups, ownerLabel, ownerMatches } from "@/components/leads-table";
import { formatUsd } from "@/lib/utils";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ProfileLite = { id: string; full_name: string | null };

export function PipelineBoard({
  leads: initialLeads,
  currentUserId,
  isAdmin,
  profiles,
}: {
  leads: LeadWithRefs[];
  currentUserId: string | null;
  isAdmin: boolean;
  profiles: ProfileLite[];
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [markets, setMarkets] = useState<string[]>([]);
  const [owners, setOwners] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (markets.length && !markets.includes(l.market ?? "")) return false;
      if (!ownerMatches(l, owners, currentUserId)) return false;
      if (!needle) return true;
      return (
        (l.company_name ?? "").toLowerCase().includes(needle) ||
        (l.contact_name ?? "").toLowerCase().includes(needle) ||
        (l.owner?.full_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, markets, owners, q, currentUserId]);

  const byStage = useMemo(() => {
    const map = new Map<string, LeadWithRefs[]>();
    for (const s of LEAD_STAGES) map.set(s, []);
    for (const l of filtered) map.get(l.stage)?.push(l);
    return map;
  }, [filtered]);

  function canMove(lead: LeadWithRefs) {
    return isAdmin || lead.owner_id === currentUserId;
  }

  function onDrop(stage: string) {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.stage === stage) return;
    if (!canMove(lead)) {
      setError("That lead belongs to someone else — only its owner or an admin can move it.");
      return;
    }
    setError(null);
    const prev = lead.stage;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: stage as LeadWithRefs["stage"] } : l)));
    start(async () => {
      const res = await moveLeadStage(id, stage);
      if (!res.ok) {
        setError(res.error ?? "Could not move lead");
        setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, stage: prev } : l)));
      }
    });
  }

  const marketOptions = facetOptions(leads, (l) => l.market, { label: (k) => MARKET_LABELS[k] ?? k });
  const owner = ownerGroups(leads, profiles, currentUserId);

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search company, contact or owner" }}
        facets={
          <>
            <FacetMenu label="Market" groups={[{ label: "", options: marketOptions }]} selected={markets} onChange={setMarkets} searchable={false} width={200} />
            <FacetMenu label="Owner" groups={owner} selected={owners} onChange={setOwners} width={240} />
          </>
        }
        shown={filtered.length}
        total={leads.length}
        noun="leads"
        actions={<NewLeadDialog profiles={profiles} isAdmin={isAdmin} />}
        chips={
          <FacetChips
            chips={[
              ...markets.map((k) => ({ key: `m:${k}`, label: MARKET_LABELS[k] ?? k, remove: () => setMarkets(markets.filter((x) => x !== k)) })),
              ...owners.map((k) => ({ key: `o:${k}`, label: ownerLabel(k, profiles), remove: () => setOwners(owners.filter((x) => x !== k)) })),
            ]}
            onClearAll={() => {
              setMarkets([]);
              setOwners([]);
            }}
          />
        }
      />

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Board */}
      <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 overflow-x-auto pb-2">
        {LEAD_STAGES.map((stage) => {
          const items = byStage.get(stage) ?? [];
          const total = items.reduce((s, l) => s + (l.value_usd ?? 0), 0);
          const meta = STAGE_META[stage];
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => onDrop(stage)}
              className={cn(
                "flex min-h-[60vh] flex-col rounded-xl border bg-muted/30 transition-colors duration-[120ms]",
                overStage === stage ? "border-primary bg-accent/40" : "",
              )}
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      meta.kind === "won" ? "bg-foreground" : meta.kind === "lost" ? "bg-foreground/30" : "bg-foreground/60",
                    )}
                  />
                  <span className="text-sm font-semibold">{stage}</span>
                  <span className="tabular text-xs text-muted-foreground">{items.length}</span>
                </div>
                {total > 0 ? <span className="tabular text-xs text-muted-foreground">{formatUsd(total)}</span> : null}
              </div>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {items.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    {filtered.length === leads.length ? `No leads at ${stage} — drag one here to move it` : "None at this stage match the filters"}
                  </p>
                ) : (
                  items.map((l) => (
                    <div
                      key={l.id}
                      draggable={canMove(l)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", l.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(l.id);
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={cn(
                        "rounded-lg border bg-card p-3 transition-colors duration-[120ms] hover:border-primary/40",
                        canMove(l) ? "cursor-grab active:cursor-grabbing" : "",
                        dragId === l.id ? "opacity-50" : "",
                      )}
                    >
                      <Link href={`/leads/${l.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium leading-tight hover:underline">
                            {l.company_name ?? l.company?.name ?? "Untitled lead"}
                          </span>
                          {l.market ? (
                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {l.market}
                            </span>
                          ) : null}
                        </div>
                        {l.contact_name ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {[l.contact_name, l.contact_title].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {l.target_events?.length ? (
                          <div className="mt-1.5">
                            <EventChips events={l.target_events} />
                          </div>
                        ) : null}
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground">
                              {initials(l.owner?.full_name ?? "?")}
                            </span>
                            <span className="max-w-[90px] truncate">{l.owner?.full_name ?? "Unassigned"}</span>
                          </span>
                          {l.value_usd != null ? (
                            <span className="tabular text-xs font-medium">{formatUsd(l.value_usd)}</span>
                          ) : null}
                        </div>
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
