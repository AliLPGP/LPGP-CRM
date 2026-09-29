"use server";

import { revalidatePath } from "next/cache";
import { getAdminClient } from "./supabase/admin";
import { getSessionUser } from "./auth";
import {
  attachOpsInvoice,
  clearOpsMatchCache,
  createOpsDeal,
  isOpsWriteEnabled,
  listOpsEvents,
  updateOpsDeal,
  type OpsDealInput,
} from "./ops";
import { loadProfileDirectory } from "./initials";
import type { DateTbc, OpsDeal, OpsEvent } from "./ops-types";
import type { OpsLinkEntity } from "./types";

export type RecordDealResult =
  | { ok: true; deal: OpsDeal }
  | { ok: false; error: string };

export type EventOption = {
  id: number;
  name: string;
  date: string | null;
  location: string;
  producer: string;
  dateTbc: DateTbc;
};

/** Events available to allocate against, straight from the tracker. */
export async function listAllocatableEvents(): Promise<EventOption[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const res = await listOpsEvents();
  if (!res.ok) return [];
  return res.data.map((e: OpsEvent) => ({
    id: e.id,
    name: e.name,
    date: e.event_date,
    location: e.location,
    producer: e.producer,
    dateTbc: e.date_tbc,
  }));
}

type RecordDealArgs = {
  input: OpsDealInput;
  /** Attach the deal to a CRM record once the tracker has accepted it. */
  link?: { entityType: OpsLinkEntity; entityId: string } | null;
  invoice?: { name: string; data: string } | null;
};

/**
 * Record a deal in the ops panel from here.
 *
 * The tracker remains the single source of truth for money — this writes to it
 * rather than keeping a second copy. On success the deal is linked back to the
 * CRM record that prompted it, so its allocations show up immediately.
 */
export async function recordOpsDeal({
  input,
  link,
  invoice,
}: RecordDealArgs): Promise<RecordDealResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!isOpsWriteEnabled()) {
    return {
      ok: false,
      error: "Recording deals is off. Set OPS_BRIDGE_WRITE_KEY here and on the tracker.",
    };
  }
  if (!input.company?.trim()) return { ok: false, error: "A company name is required." };

  // The tracker attributes every deal to a salesperson by initials. Stamp the
  // recorder's unless the form set them explicitly, so "who signed this?" is
  // answerable from either system.
  const stamped: OpsDealInput = { ...input };
  if (!stamped.initials?.trim()) {
    const directory = await loadProfileDirectory(getAdminClient());
    stamped.initials = directory.initialsFor(user.id) ?? "";
  }

  const created = await createOpsDeal(stamped);
  if (!created.ok) return { ok: false, error: created.error };
  const deal = created.data;

  // The deal exists in the tracker from here on. Anything below is a bonus —
  // report it, but never present the deal itself as having failed.
  const warnings: string[] = [];

  if (invoice?.name && invoice.data) {
    const attached = await attachOpsInvoice(deal.id, 1, invoice);
    if (!attached.ok) warnings.push(`the invoice didn't attach (${attached.error})`);
  }

  if (link) {
    const supabase = getAdminClient();
    if (supabase) {
      const { error } = await supabase.from("ops_links").upsert(
        {
          entity_type: link.entityType,
          entity_id: link.entityId,
          ops_deal_id: deal.id,
          ops_company: deal.company,
          confidence: 1,
          snapshot: { deal },
          linked_by: user.id,
        },
        { onConflict: "entity_type,entity_id,ops_deal_id" },
      );
      if (error) warnings.push("it couldn't be linked to this record");
      else if (link.entityType === "account") {
        await supabase
          .from("accounts")
          .update({ ops_company: deal.company })
          .eq("id", link.entityId);
      } else if (link.entityType === "lead") {
        await supabase
          .from("leads")
          .update({ ops_deal_id: deal.id, ops_checked_at: new Date().toISOString() })
          .eq("id", link.entityId);
      }
    }
  }

  clearOpsMatchCache();
  revalidatePath("/events");
  revalidatePath("/accounts");
  revalidatePath("/");
  if (link?.entityType === "account") revalidatePath(`/accounts/${link.entityId}`);
  if (link?.entityType === "lead") revalidatePath(`/leads/${link.entityId}`);

  if (warnings.length) {
    return {
      ok: false,
      error: `Deal #${deal.id} was recorded in the ops panel, but ${warnings.join(" and ")}.`,
    };
  }
  return { ok: true, deal };
}

/** Update a deal already in the tracker — typically to record a payment. */
export async function updateRecordedDeal(
  dealId: number,
  input: OpsDealInput,
): Promise<RecordDealResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  if (!isOpsWriteEnabled()) {
    return { ok: false, error: "Recording deals is off on this CRM." };
  }

  const res = await updateOpsDeal(dealId, input);
  if (!res.ok) return { ok: false, error: res.error };

  // Refresh any stored snapshot so the CRM stops showing the old figures.
  const supabase = getAdminClient();
  if (supabase) {
    const { data: links } = await supabase
      .from("ops_links")
      .select("id, snapshot")
      .eq("ops_deal_id", dealId);
    for (const l of links ?? []) {
      await supabase
        .from("ops_links")
        .update({
          snapshot: { ...((l.snapshot ?? {}) as Record<string, unknown>), deal: res.data },
          synced_at: new Date().toISOString(),
        })
        .eq("id", l.id as string);
    }
  }

  clearOpsMatchCache();
  revalidatePath("/events");
  revalidatePath("/accounts");
  return { ok: true, deal: res.data };
}
