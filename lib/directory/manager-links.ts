import "server-only";
import { cache } from "react";
import { getReadClient } from "../supabase/server";

// The managers an investor works with beyond a disclosed fund commitment
// (migration 0050): mandates, joint ventures, co-lending, a secondary it led.
// Read from both ends, so an LP's page names its managers and a manager's
// page names the investors, from the same rows.

export type ManagerLink = {
  id: string;
  lp_company_id: string;
  manager_company_id: string | null;
  manager_name: string;
  relationship: string | null;
  asset_class: string | null;
  confidence: "confirmed" | "reported";
  source_url: string;
  source_name: string | null;
  evidence: string | null;
  as_of: string | null;
  /** The other side's name as the directory spells it, when linked. */
  counterparty: string | null;
};

const COLUMNS = "id, lp_company_id, manager_company_id, manager_name, relationship, asset_class, confidence, source_url, source_name, evidence, as_of";

type Row = Omit<ManagerLink, "counterparty">;

async function read(column: "lp_company_id" | "manager_company_id", id: string, other: "lp_company_id" | "manager_company_id"): Promise<ManagerLink[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("lp_manager_links").select(COLUMNS).eq(column, id).limit(500);
  // Before migration 0050 the table is missing: the page goes on without the chapter.
  if (error || !data) return [];
  const rows = data as Row[];
  const ids = [...new Set(rows.map((r) => r[other]).filter((v): v is string => Boolean(v)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: firms } = await supabase.from("companies").select("id, name").in("id", ids.slice(0, 300));
    for (const f of (firms ?? []) as { id: string; name: string }[]) names.set(f.id, f.name);
  }
  return rows
    .map((r) => ({ ...r, counterparty: r[other] ? (names.get(r[other]!) ?? null) : null }))
    .sort((a, b) => Number(b.confidence === "confirmed") - Number(a.confidence === "confirmed") || a.manager_name.localeCompare(b.manager_name));
}

/** The managers an LP works with. */
export const getLpManagerLinks = cache((lpId: string) => read("lp_company_id", lpId, "manager_company_id"));

/** The investors a manager works with. */
export const getManagerLpLinks = cache((managerId: string) => read("manager_company_id", managerId, "lp_company_id"));
