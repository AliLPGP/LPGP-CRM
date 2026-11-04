"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Crown,
  Link2,
  Loader2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Smartphone,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  createAccountContact,
  deleteAccountContact,
  updateAccountContact,
} from "@/lib/account-actions";
import { logActivity } from "@/lib/activity-actions";
import { CONTACT_ROLES } from "@/lib/accounts";
import { telHref } from "@/lib/sales";
import type { AccountContact } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmModal, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/empty-state";
import { cn, initials } from "@/lib/utils";

type Draft = {
  full_name: string;
  job_title: string;
  role: string;
  email: string;
  phone: string;
  mobile: string;
  linkedin_url: string;
  notes: string;
  is_primary: boolean;
};

const BLANK: Draft = {
  full_name: "",
  job_title: "",
  role: "Primary",
  email: "",
  phone: "",
  mobile: "",
  linkedin_url: "",
  notes: "",
  is_primary: false,
};

function toDraft(c: AccountContact): Draft {
  return {
    full_name: c.full_name,
    job_title: c.job_title ?? "",
    role: c.role ?? "",
    email: c.email ?? "",
    phone: c.phone ?? "",
    mobile: c.mobile ?? "",
    linkedin_url: c.linkedin_url ?? "",
    notes: c.notes ?? "",
    is_primary: c.is_primary,
  };
}

/**
 * The points-of-contact tab for a sponsor: who we speak to, in what capacity,
 * and how to reach them. Calling or emailing from here logs an activity so the
 * account timeline stays honest.
 */
export function PointsOfContact({
  accountId,
  accountName,
  contacts,
}: {
  accountId: string;
  accountName: string;
  contacts: AccountContact[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AccountContact | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<AccountContact | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    const res = await deleteAccountContact(removing.id, accountId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not remove");
      return;
    }
    setRemoving(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            {contacts.length} point{contacts.length === 1 ? "" : "s"} of contact
          </p>
          <p className="text-xs text-muted-foreground">
            Who we speak to at {accountName}, and what each of them covers.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} size="sm">
          <UserPlus className="h-4 w-4" /> Add contact
        </Button>
      </div>

      {contacts.length === 0 ? (
        <EmptyState
          icon={<Users className="mx-auto h-8 w-8" />}
          title="No contacts yet"
          description="Add the people you deal with at this sponsor — the main contact, whoever signs off invoices, and the marketing lead."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Add the first contact
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {contacts.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              accountId={accountId}
              onEdit={() => setEditing(c)}
              onRemove={() => setRemoving(c)}
            />
          ))}
        </ul>
      )}

      <ContactDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Add point of contact"
        initial={{ ...BLANK, is_primary: contacts.length === 0 }}
        onSubmit={async (draft) => {
          const res = await createAccountContact(accountId, draft);
          if (res.ok) {
            setCreating(false);
            router.refresh();
          }
          return res.error ?? null;
        }}
      />

      <ContactDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit point of contact"
        initial={editing ? toDraft(editing) : BLANK}
        onSubmit={async (draft) => {
          if (!editing) return null;
          const res = await updateAccountContact(editing.id, accountId, draft);
          if (res.ok) {
            setEditing(null);
            router.refresh();
          }
          return res.error ?? null;
        }}
      />

      <ConfirmModal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
        title={`Remove ${removing?.full_name ?? "contact"}?`}
        description="This only removes them from this account. Any logged activity stays on the timeline."
        confirmLabel="Remove"
        pending={busy}
        error={error}
      />
    </div>
  );
}

function ContactCard({
  contact,
  accountId,
  onEdit,
  onRemove,
}: {
  contact: AccountContact;
  accountId: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const router = useRouter();
  const tel = telHref(contact.phone ?? contact.mobile);

  // Reaching out from here should show up on the account's timeline — otherwise
  // the history quietly lies about how often this sponsor has been contacted.
  async function logTouch(type: "call" | "email") {
    await logActivity({
      accountId,
      accountContactId: contact.id,
      type,
      subject: `${type === "call" ? "Called" : "Emailed"} ${contact.full_name}`,
      body: null,
      outcome: null,
    });
    router.refresh();
  }

  return (
    <li className="lift rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-bold",
            contact.is_primary
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {initials(contact.full_name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-semibold leading-tight">{contact.full_name}</p>
            {contact.is_primary ? (
              <Badge className="border-transparent bg-primary/15 text-[10px] text-primary">
                <Crown className="h-3 w-3" /> Primary
              </Badge>
            ) : null}
            {contact.role && contact.role !== "Primary" ? (
              <Badge variant="outline" className="text-[10px]">
                {contact.role}
              </Badge>
            ) : null}
          </div>
          {contact.job_title ? (
            <p className="truncate text-[13px] text-muted-foreground">{contact.job_title}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Edit ${contact.full_name}`}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove ${contact.full_name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {contact.email ? (
          <a
            href={`mailto:${contact.email}`}
            onClick={() => void logTouch("email")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{contact.email}</span>
          </a>
        ) : null}
        {contact.phone ? (
          <a
            href={telHref(contact.phone) ?? "#"}
            onClick={() => void logTouch("call")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{contact.phone}</span>
          </a>
        ) : null}
        {contact.mobile ? (
          <a
            href={telHref(contact.mobile) ?? "#"}
            onClick={() => void logTouch("call")}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">{contact.mobile}</span>
          </a>
        ) : null}
        {contact.linkedin_url ? (
          <a
            href={contact.linkedin_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent"
          >
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate">LinkedIn</span>
          </a>
        ) : null}
        {!contact.email && !contact.phone && !contact.mobile ? (
          <p className="px-2 text-[13px] text-muted-foreground">No contact details yet</p>
        ) : null}
      </div>

      {contact.notes ? (
        <p className="mt-2.5 whitespace-pre-wrap rounded-lg bg-muted/50 px-2.5 py-2 text-[12px] text-muted-foreground">
          {contact.notes}
        </p>
      ) : null}

      {!tel && !contact.email ? null : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Calling or emailing from here is logged to the timeline.
        </p>
      )}
    </li>
  );
}

function ContactDialog({
  open,
  onClose,
  title,
  initial,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: Draft;
  onSubmit: (draft: Draft) => Promise<string | null>;
}) {
  // Remounting on open resets the form to `initial` without a sync effect.
  return open ? (
    <ContactDialogForm key={initial.full_name + title} {...{ onClose, title, initial, onSubmit }} />
  ) : null;
}

function ContactDialogForm({
  onClose,
  title,
  initial,
  onSubmit,
}: {
  onClose: () => void;
  title: string;
  initial: Draft;
  onSubmit: (draft: Draft) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const err = await onSubmit(draft);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <Modal open onClose={onClose} size="md">
      <ModalHeader
        icon={<UserPlus className="h-4.5 w-4.5" />}
        title={title}
        description="Anyone you deal with at this sponsor — they don't need to be in the intelligence database."
        onClose={onClose}
      />
      <form onSubmit={submit} className="contents">
        <ModalBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Full name</Label>
              <Input
                value={draft.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Jane Doe"
                required
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5">Job title</Label>
              <Input
                value={draft.job_title}
                onChange={(e) => set("job_title", e.target.value)}
                placeholder="Head of Marketing"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Covers</Label>
            <NativeSelect
              className="w-full"
              value={draft.role}
              onChange={(e) => set("role", e.target.value)}
            >
              <option value="">—</option>
              {CONTACT_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">Email</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@barings.com"
              />
            </div>
            <div>
              <Label className="mb-1.5">Phone</Label>
              <Input
                value={draft.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+1 212 555 0100"
              />
            </div>
            <div>
              <Label className="mb-1.5">Mobile</Label>
              <Input value={draft.mobile} onChange={(e) => set("mobile", e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">LinkedIn</Label>
              <Input
                value={draft.linkedin_url}
                onChange={(e) => set("linkedin_url", e.target.value)}
                placeholder="https://linkedin.com/in/…"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Notes</Label>
            <textarea
              value={draft.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={3}
              placeholder="Best reached mornings; handles the Berlin booth sign-off."
              className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            />
          </div>

          <label className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            <input
              type="checkbox"
              checked={draft.is_primary}
              onChange={(e) => set("is_primary", e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-sm">
              <Star className="mr-1 inline h-3.5 w-3.5 text-primary" />
              Primary contact
              <span className="ml-1 text-muted-foreground">
                — replaces whoever currently holds it
              </span>
            </span>
          </label>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save contact
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
