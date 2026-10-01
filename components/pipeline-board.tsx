"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LeadWithRefs } from "@/lib/types";
import { LEAD_STAGES, STAGE_META, MARKET_LABELS } from "@/lib/pipeline";
import { moveLeadStage } from "@/lib/crm-actions";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { EventChips } from "@/components/pipeline/event-chips";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
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
  const [market, setMarket] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (market !== "ALL" && (l.market ?? "") !== market) return false;
      if (owner === "ME" && l.owner_id !== currentUserId) return false;
      if (owner !== "ALL" && owner !== "ME" && l.owner_id !== owner) return false;
      if (!needle) return true;
      return (
        (l.company_name ?? "").toLowerCase().includes(needle) ||
        (l.contact_name ?? "").toLowerCase().includes(needle) ||
        (l.owner?.full_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, market, owner, q, currentUserId]);

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

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect className="w-36" value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="ALL">All markets</option>
            {Object.keys(MARKET_LABELS).map((m) => (
              <option key={m} value={m}>
                {MARKET_LABELS[m]}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect className="w-40" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="ALL">All owners</option>
            <option value="ME">My leads</option>
            {profiles
              .filter((p) => p.id !== currentUserId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? "Unnamed"}
                </option>
              ))}
          </NativeSelect>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads…" className="pl-9" />
          </div>
        </div>
        <NewLeadDialog profiles={profiles} isAdmin={isAdmin} />
      </div>

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
                "rounded-xl border bg-muted/30 flex flex-col min-h-[60vh] transition-colors",
                overStage === stage ? "border-primary bg-accent/40" : "",
              )}
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      meta.kind === "won"
                        ? "bg-foreground"
                        : meta.kind === "lost"
                          ? "bg-foreground/30"
                          : "bg-foreground/60",
                    )}
                  />
                  <span className="text-sm font-semibold">{stage}</span>
                  <span className="text-xs text-muted-foreground tabular">{items.length}</span>
                </div>
                {total > 0 ? <span className="text-xs text-muted-foreground tabular">{formatUsd(total)}</span> : null}
              </div>

              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Drop leads here</p>
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
                        "rounded-lg border bg-card p-3 shadow-sm hover:border-primary/40 transition-colors",
                        canMove(l) ? "cursor-grab active:cursor-grabbing" : "",
                        dragId === l.id ? "opacity-50" : "",
                      )}
                    >
                      <Link href={`/leads/${l.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm leading-tight hover:text-primary">
                            {l.company_name ?? l.company?.name ?? "Untitled lead"}
                          </span>
                          {l.market ? (
                            <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {l.market}
                            </span>
                          ) : null}
                        </div>
                        {l.contact_name ? (
                          <p className="mt-0.5 text-xs text-muted-foreground truncate">
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
                            <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-semibold">
                              {initials(l.owner?.full_name ?? "?")}
                            </span>
                            <span className="truncate max-w-[90px]">{l.owner?.full_name ?? "Unassigned"}</span>
                          </span>
                          {l.value_usd != null ? (
                            <span className="text-xs font-medium tabular">{formatUsd(l.value_usd)}</span>
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
