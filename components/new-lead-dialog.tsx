"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2, Sparkles } from "lucide-react";
import { createLead } from "@/lib/crm-actions";
import { linkOpsCompany } from "@/lib/ops-actions";
import { listKnownEvents } from "@/lib/pipeline-conflict-actions";
import type { KnownEvent } from "@/lib/pipeline-conflicts";
import { OPS_SIGNED_CONFIDENCE } from "@/lib/ops-types";
import { LEAD_STAGES, MARKETS, MARKET_LABELS } from "@/lib/pipeline";
import type { LeadEvent, PipelineConflicts } from "@/lib/types";
import { HeadsUpPanel } from "@/components/pipeline/heads-up-panel";
import { EventPicker } from "@/components/pipeline/event-picker";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompanyOptions } from "@/components/use-company-options";
import { cn } from "@/lib/utils";

type ProfileLite = { id: string; full_name: string | null };

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Add a company to the pipeline.
 *
 * As the name is typed, the heads-up checks whether a teammate already has it
 * (and for which events) or whether it's already signed per the ops panel.
 * That check is informational: it fills nothing in and blocks nothing. The
 * only thing it can do to the record is link it to the ops-panel deal, and
 * only when the person leaves that box ticked.
 */
export function NewLeadDialog({
  profiles,
  isAdmin,
  defaultStage,
}: {
  profiles: ProfileLite[];
  isAdmin: boolean;
  defaultStage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [market, setMarket] = useState<string>("US");
  const [stage, setStage] = useState<string>(defaultStage ?? "New");
  const [value, setValue] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [targetEvents, setTargetEvents] = useState<LeadEvent[]>([]);

  // Events come from the ops panel; fetched once the dialog opens.
  const [knownEvents, setKnownEvents] = useState<KnownEvent[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    listKnownEvents().then((rows) => {
      if (live) setKnownEvents(rows);
    });
    return () => {
      live = false;
    };
  }, [open]);

  // The latest heads-up report, held for submit. linkOptIn null = the person
  // hasn't overridden the default (link when the match is confident).
  const [conflicts, setConflicts] = useState<PipelineConflicts | null>(null);
  const [linkOptIn, setLinkOptIn] = useState<boolean | null>(null);

  const companies = useCompanyOptions(companyName, open);
  const linkedCompany = companies.find(
    (c) => c.name.toLowerCase() === companyName.trim().toLowerCase(),
  );

  function reset() {
    setCompanyName("");
    setContactName("");
    setContactTitle("");
    setContactEmail("");
    setMarket("US");
    setStage(defaultStage ?? "New");
    setValue("");
    setNextStep("");
    setOwnerId("");
    setTargetEvents([]);
    setConflicts(null);
    setLinkOptIn(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await createLead({
        company_name: companyName,
        company_id: linkedCompany?.id ?? null,
        category: linkedCompany?.category ?? null,
        contact_name: contactName,
        contact_title: contactTitle,
        contact_email: contactEmail,
        market,
        stage,
        value_usd: value,
        next_step: nextStep,
        target_events: targetEvents,
        owner_id: isAdmin ? ownerId : undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Could not create lead");
        return;
      }
      // Link only when the report is for the name actually saved, the match is
      // confident (or the person ticked it anyway), and they didn't untick it.
      const ops = conflicts?.ops ?? null;
      const reportIsCurrent = conflicts?.company === companyName.trim();
      const shouldLink =
        Boolean(res.id && ops && reportIsCurrent) &&
        (linkOptIn ?? Boolean(ops && ops.confidence >= OPS_SIGNED_CONFIDENCE));
      if (shouldLink && res.id && ops) await linkOpsCompany("lead", res.id, ops);

      setOpen(false);
      reset();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New lead
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} size="md">
        <ModalHeader
          icon={<Sparkles className="h-4.5 w-4.5" />}
          title="New lead"
          description="Add a company to the pipeline — you'll own it unless you assign someone."
          onClose={() => setOpen(false)}
        />
        <form onSubmit={submit} className="contents">
          <ModalBody className="space-y-6">
            {/* Company */}
            <div className="space-y-3">
              <SectionLabel>Company</SectionLabel>
              <div>
                <Label className="mb-1.5">Company name</Label>
                <Input
                  list="company-options"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Start typing — pick a database firm to link it"
                  required
                  autoFocus
                />
                <datalist id="company-options">
                  {companies.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <p
                  className={cn(
                    "mt-1.5 text-xs transition-colors",
                    linkedCompany ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {linkedCompany
                    ? `Linked to ${linkedCompany.name} (${linkedCompany.category}) in the database`
                    : "Not in the database yet — that's fine, it'll be a standalone lead."}
                </p>
              </div>

              <div>
                <Label className="mb-1.5">For which events?</Label>
                <EventPicker events={knownEvents} value={targetEvents} onChange={setTargetEvents} />
              </div>

              <HeadsUpPanel
                company={companyName}
                events={targetEvents}
                linkOptIn={linkOptIn}
                onLinkOptIn={setLinkOptIn}
                onResult={setConflicts}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">Market</Label>
                  <div className="inline-flex w-full rounded-lg border bg-muted/60 p-0.5">
                    {MARKETS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMarket(m)}
                        className={cn(
                          "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                          market === m
                            ? "bg-card text-foreground shadow-sm border"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {MARKET_LABELS[m] ?? m}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="mb-1.5">Stage</Label>
                  <NativeSelect className="w-full" value={stage} onChange={(e) => setStage(e.target.value)}>
                    {LEAD_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <SectionLabel>Contact</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">Name</Label>
                  <Input
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Title</Label>
                  <Input
                    value={contactTitle}
                    onChange={(e) => setContactTitle(e.target.value)}
                    placeholder="Managing Director"
                  />
                </div>
              </div>
              <div>
                <Label className="mb-1.5">Email</Label>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="jane@firm.com"
                />
              </div>
            </div>

            {/* Deal */}
            <div className="space-y-3">
              <SectionLabel>Deal</SectionLabel>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="mb-1.5">Value (USD)</Label>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="250,000"
                    inputMode="numeric"
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Next step</Label>
                  <Input
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                    placeholder="Send intro email"
                  />
                </div>
              </div>
              {isAdmin ? (
                <div>
                  <Label className="mb-1.5">Owner</Label>
                  <NativeSelect className="w-full" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                    <option value="">Me</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name ?? "Unnamed"}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : null}
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {conflicts?.hasConflict && conflicts.company === companyName.trim()
                ? "Add anyway"
                : "Create lead"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </>
  );
}
