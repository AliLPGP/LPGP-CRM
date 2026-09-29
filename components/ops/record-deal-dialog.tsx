"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  FileUp,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  listAllocatableEvents,
  recordOpsDeal,
  type EventOption,
} from "@/lib/ops-deal-actions";
import { checkForExistingDeal, claimOpsDeal } from "@/lib/my-deal-actions";
import type { DuplicateReport } from "@/lib/deal-duplicates";
import { DuplicatePrompt } from "@/components/deals/duplicate-prompt";
import { formatOpsMoney } from "@/lib/ops-types";
import { formatEventDate } from "@/lib/event-date";
import type { OpsLinkEntity } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

const STAGES = ["Prospect", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
const CURRENCIES = ["GBP", "USD", "EUR", "CHF"];
const MAX_INVOICE_BYTES = 8 * 1024 * 1024;

type Allocation = { key: string; eventId: string; amount: string; label: string };

function blankAllocation(): Allocation {
  return { key: crypto.randomUUID(), eventId: "", amount: "", label: "" };
}

/**
 * Record a deal in the ops panel from the sales CRM.
 *
 * The tracker stays the system of record — this writes into it rather than
 * keeping a second copy of the money. Allocations are explicit per event,
 * because that split is what drives event revenue on both sides.
 */
export function RecordDealDialog({
  defaultCompany,
  link,
  trigger,
  presetEventId,
}: {
  defaultCompany?: string;
  link?: { entityType: OpsLinkEntity; entityId: string };
  trigger?: "button" | "inline";
  presetEventId?: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {trigger === "inline" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-[var(--brand)]/50 hover:bg-accent"
        >
          <Receipt className="h-3.5 w-3.5" /> Record deal
        </button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Receipt className="h-3.5 w-3.5" /> Record deal
        </Button>
      )}

      {open ? (
        <RecordDealForm
          defaultCompany={defaultCompany}
          link={link}
          presetEventId={presetEventId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function RecordDealForm({
  defaultCompany,
  link,
  presetEventId,
  onClose,
}: {
  defaultCompany?: string;
  link?: { entityType: OpsLinkEntity; entityId: string };
  presetEventId?: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [events, setEvents] = useState<EventOption[] | null>(null);

  const [company, setCompany] = useState(defaultCompany ?? "");
  const [contact, setContact] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("GBP");
  const [stage, setStage] = useState("Won");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [paidIncVat, setPaidIncVat] = useState("");
  const [taxVat, setTaxVat] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([
    presetEventId ? { ...blankAllocation(), eventId: String(presetEventId) } : blankAllocation(),
  ]);
  const [invoiceFile, setInvoiceFile] = useState<{ name: string; data: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: number; company: string; adopted: boolean } | null>(null);
  // When the tracker already holds something like this, the form steps aside
  // and asks before creating a second record.
  const [duplicates, setDuplicates] = useState<DuplicateReport | null>(null);

  useEffect(() => {
    let live = true;
    listAllocatableEvents().then((rows) => {
      if (live) setEvents(rows);
    });
    return () => {
      live = false;
    };
  }, []);

  const allocated = allocations.reduce((n, a) => n + (Number(a.amount) || 0), 0);
  const dealAmount = Number(amount) || 0;
  // A split that doesn't add up to the deal is almost always a typo, and it
  // would quietly skew every event's revenue. Warn, don't block — a genuine
  // part-allocation is legitimate.
  const mismatch = dealAmount > 0 && allocated > 0 && Math.abs(allocated - dealAmount) > 0.5;

  async function onInvoicePicked(file: File) {
    setError(null);
    if (file.size > MAX_INVOICE_BYTES) {
      setError(`That invoice is ${(file.size / 1024 / 1024).toFixed(1)}MB — the limit is 8MB.`);
      return;
    }
    const buffer = await file.arrayBuffer();
    // Chunked so a large file doesn't blow the argument limit of String.fromCharCode.
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    setInvoiceFile({ name: file.name, data: btoa(binary) });
  }

  function buildPackages() {
    return allocations
      .filter((a) => a.eventId && Number(a.amount) > 0)
      .map((a) => ({
        event_id: Number(a.eventId),
        amount: Number(a.amount),
        package_label: a.label.trim(),
      }));
  }

  /**
   * Check the tracker before writing. A hit steps aside to ask; anything else
   * — including the ops panel being unreachable — creates as normal, because
   * a failed lookup must not stop someone recording a deal.
   */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const report = await checkForExistingDeal({
      company: company.trim(),
      eventIds: buildPackages().map((p) => p.event_id),
      amount: dealAmount || null,
      currency,
    });
    setBusy(false);

    if (report?.candidates.length) {
      setDuplicates(report);
      return;
    }
    await create();
  }

  /** Adopt the deal the tracker already has instead of making a second one. */
  async function adopt(dealId: number) {
    setBusy(true);
    setError(null);
    const res = await claimOpsDeal(dealId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not add that deal");
      return;
    }
    setDuplicates(null);
    setDone({ id: dealId, company: company.trim(), adopted: true });
    router.refresh();
  }

  async function create() {
    setBusy(true);
    setError(null);

    const packages = buildPackages();

    const res = await recordOpsDeal({
      input: {
        company: company.trim(),
        contact_name: contact.trim(),
        amount: dealAmount,
        currency,
        stage,
        notes: notes.trim(),
        invoice_number: invoiceNumber.trim(),
        invoice_date: invoiceDate || null,
        paid_date: paidDate || null,
        paid_inc_vat: paidIncVat === "" ? null : Number(paidIncVat),
        tax_vat: taxVat === "" ? null : Number(taxVat),
        fiscal_year: invoiceDate ? Number(invoiceDate.slice(0, 4)) : null,
        event_packages: packages,
      },
      link: link ?? null,
      invoice: invoiceFile,
    });

    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setDuplicates(null);
      return;
    }
    // A deal recorded from here is one of mine, so claim it in the same breath.
    await claimOpsDeal(res.deal.id);
    setDuplicates(null);
    setDone({ id: res.deal.id, company: res.deal.company, adopted: false });
    router.refresh();
  }

  if (done) {
    return (
      <Modal open onClose={onClose} size="sm">
        <div className="p-6 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--success-soft)] text-[var(--success)]">
            <BadgeCheck className="h-6 w-6" />
          </span>
          <h2 className="mt-3 font-semibold">
            {done.adopted ? "Added to your deals" : "Recorded in the ops panel"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {done.adopted
              ? `Deal #${done.id} was already in the tracker — it's in your deals now, and nothing was duplicated.`
              : `${done.company} is now deal #${done.id} in the tracker, with its event allocations.`}
          </p>
          <Button className="mt-5" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  if (duplicates) {
    return (
      <Modal open onClose={onClose} size="lg">
        <ModalHeader
          icon={<Receipt className="h-4.5 w-4.5" />}
          title="This might already exist"
          description="Checked against the ops panel before creating anything."
          onClose={onClose}
        />
        <ModalBody>
          <DuplicatePrompt
            report={duplicates}
            busy={busy}
            onAdopt={adopt}
            onCreateAnyway={create}
            onBack={() => setDuplicates(null)}
          />
          {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
        </ModalBody>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="lg">
      <ModalHeader
        icon={<Receipt className="h-4.5 w-4.5" />}
        title="Record a deal"
        description="Writes straight into the ops panel — the tracker stays the source of truth for money."
        onClose={onClose}
      />
      <form onSubmit={submit} className="contents">
        <ModalBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Company</Label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Barings"
                required
                autoFocus={!defaultCompany}
              />
            </div>
            <div>
              <Label className="mb-1.5">Contact</Label>
              <Input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Jane Doe"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
            <div>
              <Label className="mb-1.5">Deal amount</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="9000"
                inputMode="decimal"
                required
              />
            </div>
            <div>
              <Label className="mb-1.5">Currency</Label>
              <NativeSelect
                className="w-[92px]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <Label className="mb-1.5">Stage</Label>
              <NativeSelect
                className="w-full"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {/* Allocations */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <Label>Allocate across events</Label>
              <span
                className={cn(
                  "tabular text-xs",
                  mismatch ? "text-[var(--ops)]" : "text-muted-foreground",
                )}
              >
                {formatOpsMoney(allocated, currency)} of {formatOpsMoney(dealAmount, currency)}
              </span>
            </div>

            <div className="mt-2 space-y-2">
              {allocations.map((a) => (
                <div key={a.key} className="flex gap-2">
                  <NativeSelect
                    className="min-w-0 flex-1"
                    value={a.eventId}
                    onChange={(e) =>
                      setAllocations((rows) =>
                        rows.map((r) => (r.key === a.key ? { ...r, eventId: e.target.value } : r)),
                      )
                    }
                  >
                    <option value="">
                      {events === null ? "Loading events…" : "Choose an event"}
                    </option>
                    {(events ?? []).map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                        {ev.location ? ` — ${ev.location}` : ""}
                        {` · ${formatEventDate({ event_date: ev.date, date_tbc: ev.dateTbc })}`}
                      </option>
                    ))}
                  </NativeSelect>
                  <Input
                    className="w-28"
                    value={a.amount}
                    onChange={(e) =>
                      setAllocations((rows) =>
                        rows.map((r) => (r.key === a.key ? { ...r, amount: e.target.value } : r)),
                      )
                    }
                    placeholder="Amount"
                    inputMode="decimal"
                  />
                  <Input
                    className="w-28"
                    value={a.label}
                    onChange={(e) =>
                      setAllocations((rows) =>
                        rows.map((r) => (r.key === a.key ? { ...r, label: e.target.value } : r)),
                      )
                    }
                    placeholder="Package"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAllocations((rows) =>
                        rows.length === 1
                          ? [blankAllocation()]
                          : rows.filter((r) => r.key !== a.key),
                      )
                    }
                    className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove allocation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAllocations((rows) => [...rows, blankAllocation()])}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--brand)] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Add another event
            </button>

            {mismatch ? (
              <p className="mt-2 flex items-start gap-2 rounded-lg bg-[var(--ops-soft)] px-3 py-2 text-xs text-[var(--ops)]">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The allocation doesn&apos;t add up to the deal amount. That&apos;s allowed — a
                part-allocation is fine — but check it, because this split is what drives each
                event&apos;s revenue.
              </p>
            ) : null}
          </div>

          {/* Invoice & payment */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Invoice number</Label>
              <Input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="INV-1042"
              />
            </div>
            <div>
              <Label className="mb-1.5">Invoice date</Label>
              <Input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-1.5">Paid (inc VAT)</Label>
              <Input
                value={paidIncVat}
                onChange={(e) => setPaidIncVat(e.target.value)}
                placeholder="10800"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label className="mb-1.5">VAT</Label>
              <Input
                value={taxVat}
                onChange={(e) => setTaxVat(e.target.value)}
                placeholder="1800"
                inputMode="decimal"
              />
            </div>
            <div>
              <Label className="mb-1.5">Paid date</Label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">Invoice file</Label>
              {invoiceFile ? (
                <div className="flex h-9 items-center gap-2 rounded-lg border bg-muted/40 px-3">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm">{invoiceFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setInvoiceFile(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label="Remove invoice"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground transition-colors hover:border-[var(--brand)]/50 hover:text-foreground">
                  <FileUp className="h-3.5 w-3.5" />
                  Attach a file
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.docx,.doc,.png,.jpg,.jpeg"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onInvoicePicked(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </div>

          {link ? (
            <Badge variant="outline" className="text-[11px]">
              Will be linked to this {link.entityType}
            </Badge>
          ) : null}

          {error ? (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </p>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Receipt className="h-4 w-4" />}
            {busy ? "Checking the ops panel…" : "Record in ops panel"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
