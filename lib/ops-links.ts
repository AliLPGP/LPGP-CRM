import { getReadClient } from "./supabase/server";
import type { OpsDeal, OpsLeadSummary } from "./ops-types";
import type { OpsLink, OpsLinkEntity } from "./types";

/**
 * Stored links from CRM records to ops-panel deals.
 *
 * Reads come from Supabase, not the bridge — the snapshot in each row means a
 * sponsor's event allocations still render when the ops panel is unreachable.
 */

export async function listOpsLinks(
  entityType: OpsLinkEntity,
  entityId: string,
): Promise<OpsLink[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("ops_links")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("ops_deal_id");
  return (data as OpsLink[]) ?? [];
}

/** Pull the snapshotted deals out of a set of links, newest allocation first. */
export function dealsFromLinks(links: OpsLink[]): OpsDeal[] {
  return links
    .map((l) => (l.snapshot as { deal?: OpsDeal } | null)?.deal)
    .filter((d): d is OpsDeal => Boolean(d));
}

/** Which entities of a type have an ops link — for "linked" badges in lists. */
export async function opsLinkedEntityIds(entityType: OpsLinkEntity): Promise<Set<string>> {
  const supabase = getReadClient();
  if (!supabase) return new Set();
  const { data } = await supabase
    .from("ops_links")
    .select("entity_id")
    .eq("entity_type", entityType);
  return new Set((data ?? []).map((r) => r.entity_id as string));
}

/**
 * Ops context for every linked record of a type, keyed by entity id.
 *
 * Built from the stored snapshots in one query — the call queue and lead
 * lists can badge "sponsoring Berlin + CFO Miami" without touching the bridge.
 */
export async function opsSummaries(
  entityType: OpsLinkEntity,
): Promise<Record<string, OpsLeadSummary>> {
  const supabase = getReadClient();
  if (!supabase) return {};
  const { data } = await supabase
    .from("ops_links")
    .select("entity_id, ops_company, snapshot")
    .eq("entity_type", entityType);
  if (!data?.length) return {};

  const out: Record<string, OpsLeadSummary> = {};
  for (const row of data) {
    const id = row.entity_id as string;
    const deal = (row.snapshot as { deal?: OpsDeal } | null)?.deal;
    if (!deal || deal.cancelled) continue;

    const entry = (out[id] ??= {
      company: (row.ops_company as string | null) ?? deal.company,
      events: [],
      paid: false,
    });
    if ((deal.paid_inc_vat ?? 0) > 0) entry.paid = true;

    for (const ev of deal.events) {
      const held = entry.events.find((e) => e.event_id === ev.event_id);
      if (held) held.allocated += ev.allocated_amount;
      else
        entry.events.push({
          event_id: ev.event_id,
          event_name: ev.event_name,
          allocated: ev.allocated_amount,
          currency: deal.currency,
        });
    }
  }
  return out;
}

/** Total allocated per event across every stored link, grouped by currency. */
export function aggregateAllocations(deals: OpsDeal[]) {
  const byEvent = new Map<
    number,
    {
      event_id: number;
      event_name: string;
      event_date: string | null;
      date_tbc: string;
      allocated: number;
      currency: string;
      packages: string[];
    }
  >();
  for (const deal of deals) {
    if (deal.cancelled) continue;
    for (const ev of deal.events) {
      const row = byEvent.get(ev.event_id);
      if (row) {
        row.allocated += ev.allocated_amount;
        if (ev.package_label && !row.packages.includes(ev.package_label)) {
          row.packages.push(ev.package_label);
        }
      } else {
        byEvent.set(ev.event_id, {
          event_id: ev.event_id,
          event_name: ev.event_name,
          event_date: ev.event_date,
          // Older snapshots predate the programme fields; read them as confirmed.
          date_tbc: ev.date_tbc ?? "",
          allocated: ev.allocated_amount,
          currency: deal.currency,
          packages: ev.package_label ? [ev.package_label] : [],
        });
      }
    }
  }
  return [...byEvent.values()].sort((a, b) => {
    if (a.event_date && b.event_date) return a.event_date < b.event_date ? 1 : -1;
    return a.event_name.localeCompare(b.event_name);
  });
}
