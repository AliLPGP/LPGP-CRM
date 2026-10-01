"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { LeadWithRefs } from "@/lib/types";
import { LEAD_STAGES, STAGE_META, MARKET_LABELS } from "@/lib/pipeline";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { EventChips } from "@/components/pipeline/event-chips";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { formatUsd } from "@/lib/utils";
import { initials } from "@/lib/utils";
import { cn } from "@/lib/utils";

type ProfileLite = { id: string; full_name: string | null };

function StageBadge({ stage }: { stage: string }) {
  const meta = STAGE_META[stage as keyof typeof STAGE_META];
  const kind = meta?.kind ?? "open";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        "bg-secondary text-foreground/80",
      )}
    >
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
  const [market, setMarket] = useState("ALL");
  const [owner, setOwner] = useState("ALL");
  const [stage, setStage] = useState("ALL");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads.filter((l) => {
      if (market !== "ALL" && (l.market ?? "") !== market) return false;
      if (stage !== "ALL" && l.stage !== stage) return false;
      if (owner === "ME" && l.owner_id !== currentUserId) return false;
      if (owner !== "ALL" && owner !== "ME" && l.owner_id !== owner) return false;
      if (!needle) return true;
      return (
        (l.company_name ?? "").toLowerCase().includes(needle) ||
        (l.contact_name ?? "").toLowerCase().includes(needle) ||
        (l.owner?.full_name ?? "").toLowerCase().includes(needle)
      );
    });
  }, [leads, market, owner, stage, q, currentUserId]);

  return (
    <div className="space-y-4">
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
          <NativeSelect className="w-40" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="ALL">All stages</option>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
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
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" />
          </div>
        </div>
        <NewLeadDialog profiles={profiles} isAdmin={isAdmin} />
      </div>

      <div className="sheen rounded-2xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-5 py-2.5">Company</th>
                <th className="text-left font-medium px-3 py-2.5">Contact</th>
                <th className="text-left font-medium px-3 py-2.5">Stage</th>
                <th className="text-left font-medium px-3 py-2.5">Market</th>
                <th className="text-left font-medium px-3 py-2.5">Owner</th>
                <th className="text-right font-medium px-3 py-2.5">Value</th>
                <th className="text-left font-medium px-5 py-2.5">Next step</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    No leads match. Create one with “New lead”.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => (
                  <tr key={l.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/leads/${l.id}`} className="font-medium hover:text-primary">
                        {l.company_name ?? l.company?.name ?? "Untitled"}
                      </Link>
                      {l.target_events?.length ? (
                        <div className="mt-1">
                          <EventChips events={l.target_events} />
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground whitespace-nowrap">
                      {l.contact_name ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <StageBadge stage={l.stage} />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{l.market ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-semibold">
                          {initials(l.owner?.full_name ?? "?")}
                        </span>
                        <span className="text-muted-foreground truncate max-w-[110px]">
                          {l.owner?.full_name ?? "Unassigned"}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular whitespace-nowrap">
                      {l.value_usd != null ? formatUsd(l.value_usd) : "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground max-w-[220px] truncate">
                      {l.next_step ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {leads.length} leads
      </p>
    </div>
  );
}
