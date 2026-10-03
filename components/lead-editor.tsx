"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import type { LeadEvent, LeadWithRefs } from "@/lib/types";
import { listKnownEvents } from "@/lib/pipeline-conflict-actions";
import type { KnownEvent } from "@/lib/pipeline-conflicts";
import { EventPicker } from "@/components/pipeline/event-picker";
import { LEAD_STAGES, MARKETS, MARKET_LABELS } from "@/lib/pipeline";
import { updateLead, assignLead, deleteLead } from "@/lib/crm-actions";
import { ConfirmModal } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type ProfileLite = { id: string; full_name: string | null };

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-60 disabled:cursor-not-allowed";

export function LeadEditor({
  lead,
  canEdit,
  isAdmin,
  profiles,
}: {
  lead: LeadWithRefs;
  canEdit: boolean;
  isAdmin: boolean;
  profiles: ProfileLite[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [f, setF] = useState({
    company_name: lead.company_name ?? "",
    contact_name: lead.contact_name ?? "",
    contact_title: lead.contact_title ?? "",
    contact_email: lead.contact_email ?? "",
    contact_phone: lead.contact_phone ?? "",
    linkedin_url: lead.linkedin_url ?? "",
    market: lead.market ?? "",
    stage: lead.stage as string,
    value_usd: lead.value_usd != null ? String(lead.value_usd) : "",
    source: lead.source ?? "",
    next_step: lead.next_step ?? "",
    next_step_date: lead.next_step_date ?? "",
  });
  const [ownerId, setOwnerId] = useState(lead.owner_id ?? "");
  const [targetEvents, setTargetEvents] = useState<LeadEvent[]>(lead.target_events ?? []);
  const [knownEvents, setKnownEvents] = useState<KnownEvent[] | null>(null);

  useEffect(() => {
    let live = true;
    listKnownEvents().then((rows) => {
      if (live) setKnownEvents(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
    setSaved(false);
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await updateLead(lead.id, { ...f, target_events: targetEvents });
      if (!res.ok) {
        setError(res.error ?? "Could not save");
        return;
      }
      if (isAdmin && ownerId !== (lead.owner_id ?? "")) {
        const a = await assignLead(lead.id, ownerId);
        if (!a.ok) {
          setError(a.error ?? "Saved, but could not reassign");
          return;
        }
      }
      setSaved(true);
      router.refresh();
    });
  }

  function onDelete() {
    start(async () => {
      const res = await deleteLead(lead.id);
      if (res.ok) {
        router.push("/crm");
        router.refresh();
      } else {
        setError(res.error ?? "Could not delete");
      }
    });
  }

  const markets = MARKETS.includes(f.market as (typeof MARKETS)[number]) || !f.market ? MARKETS : [f.market, ...MARKETS];

  return (
    <div className="space-y-5">
      {!canEdit ? (
        <p className="rounded-lg border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          This lead belongs to <strong className="text-foreground">{lead.owner?.full_name ?? "someone else"}</strong>. You can view it, but only its owner or an admin can edit.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="mb-1.5">Company</Label>
          <input className={inputCls} value={f.company_name} onChange={(e) => set("company_name", e.target.value)} disabled={!canEdit} />
        </div>
        <div className="sm:col-span-2">
          <Label className="mb-1.5">For which events?</Label>
          <EventPicker
            events={knownEvents}
            value={targetEvents}
            onChange={(next) => {
              setTargetEvents(next);
              setSaved(false);
            }}
            disabled={!canEdit}
          />
        </div>
        <div>
          <Label className="mb-1.5">Stage</Label>
          <NativeSelect className="w-full" value={f.stage} onChange={(e) => set("stage", e.target.value)} disabled={!canEdit}>
            {LEAD_STAGES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1.5">Market</Label>
          <NativeSelect className="w-full" value={f.market} onChange={(e) => set("market", e.target.value)} disabled={!canEdit}>
            <option value="">—</option>
            {markets.map((m) => (
              <option key={m} value={m}>{MARKET_LABELS[m] ?? m}</option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <Label className="mb-1.5">Contact name</Label>
          <input className={inputCls} value={f.contact_name} onChange={(e) => set("contact_name", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Title</Label>
          <input className={inputCls} value={f.contact_title} onChange={(e) => set("contact_title", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Email</Label>
          <input className={inputCls} value={f.contact_email} onChange={(e) => set("contact_email", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Phone</Label>
          <input className={inputCls} value={f.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">LinkedIn</Label>
          <input className={inputCls} value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Deal value (USD)</Label>
          <input className={inputCls} value={f.value_usd} onChange={(e) => set("value_usd", e.target.value)} inputMode="numeric" disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Source</Label>
          <input className={inputCls} value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="e.g. Referral, Lusha, Event" disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Next step</Label>
          <input className={inputCls} value={f.next_step} onChange={(e) => set("next_step", e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <Label className="mb-1.5">Next step date</Label>
          <input className={inputCls} type="date" value={f.next_step_date} onChange={(e) => set("next_step_date", e.target.value)} disabled={!canEdit} />
        </div>
        {isAdmin ? (
          <div>
            <Label className="mb-1.5">Owner (admin)</Label>
            <NativeSelect className="w-full" value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setSaved(false); }}>
              <option value="">Unassigned</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name ?? "Unnamed"}</option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save changes
          </Button>
          {saved ? <span className="text-sm text-muted-foreground">Saved</span> : null}
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" /> Delete lead
            </Button>
            <ConfirmModal
              open={confirmDelete}
              onClose={() => setConfirmDelete(false)}
              onConfirm={onDelete}
              pending={pending}
              title="Delete this lead?"
              description={`"${lead.company_name ?? "This lead"}" and its notes will be permanently removed. This can't be undone.`}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
