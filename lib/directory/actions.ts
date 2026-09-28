"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "../auth";
import { isCategory } from "../categories";
import { marketFromCountry } from "../pipeline";
import { getAdminClient } from "../supabase/admin";
import { chunk } from "../supabase/paged";
import { DIRECTORY_TAG } from "./index-server";
import { normName } from "./normalize";

// Discover's writes: team lists, saved searches, bulk "add to pipeline" and
// classifying a firm the workbook left unclassified. Everything here needs a
// signed-in user; nothing is writable through the anon key.

export type DirectoryActionResult = { ok: boolean; error?: string; id?: string };

type Admin = NonNullable<ReturnType<typeof getAdminClient>>;

async function actor(): Promise<
  { ok: true; supabase: Admin; userId: string; isAdmin: boolean } | { ok: false; error: string }
> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };
  return { ok: true, supabase, userId: user.id, isAdmin: user.role === "admin" };
}

function clean(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

function ids(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const uuid = /^[0-9a-f-]{36}$/i;
  return [...new Set(v.filter((x): x is string => typeof x === "string" && uuid.test(x)))].slice(0, 5000);
}

function touchLists(listId?: string | null) {
  revalidatePath("/database/lists");
  if (listId) revalidatePath(`/database/lists/${listId}`);
}

// --- Lists --------------------------------------------------------------------

export async function createList(name: string, description?: string): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const n = clean(name, 120);
  if (!n) return { ok: false, error: "Give the list a name." };
  const { data, error } = await a.supabase
    .from("directory_lists")
    .insert({ name: n, description: clean(description, 1000), owner_id: a.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the list." };
  touchLists(data.id);
  return { ok: true, id: data.id };
}

export async function updateList(
  id: string,
  patch: { name?: string; description?: string },
): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const update: Record<string, string | null> = {};
  if ("name" in patch) {
    const n = clean(patch.name, 120);
    if (!n) return { ok: false, error: "A list needs a name." };
    update.name = n;
  }
  if ("description" in patch) update.description = clean(patch.description, 1000);
  const { error } = await a.supabase.from("directory_lists").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  touchLists(id);
  return { ok: true, id };
}

export async function deleteList(id: string): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const { data: list } = await a.supabase.from("directory_lists").select("owner_id").eq("id", id).single();
  if (!list) return { ok: false, error: "List not found." };
  if (!a.isAdmin && list.owner_id && list.owner_id !== a.userId) {
    return { ok: false, error: "Only the list's owner or an admin can delete it." };
  }
  const { error } = await a.supabase.from("directory_lists").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  touchLists();
  return { ok: true };
}

/** Add firms to a list, creating it first when `newListName` is given. */
export async function addToList(input: {
  listId?: string | null;
  newListName?: string | null;
  companyIds: string[];
}): Promise<DirectoryActionResult & { added?: number }> {
  const a = await actor();
  if (!a.ok) return a;
  const companyIds = ids(input.companyIds);
  if (!companyIds.length) return { ok: false, error: "Select at least one firm." };

  let listId = clean(input.listId, 40);
  if (!listId) {
    const name = clean(input.newListName, 120);
    if (!name) return { ok: false, error: "Pick a list or name a new one." };
    const { data, error } = await a.supabase
      .from("directory_lists")
      .insert({ name, owner_id: a.userId })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the list." };
    listId = data.id as string;
  }

  let added = 0;
  for (const batch of chunk(companyIds, 500)) {
    const { data, error } = await a.supabase
      .from("directory_list_items")
      .upsert(
        batch.map((company_id) => ({ list_id: listId, company_id, added_by: a.userId })),
        { onConflict: "list_id,company_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) return { ok: false, error: error.message, id: listId ?? undefined, added };
    added += data?.length ?? 0;
  }
  await a.supabase.from("directory_lists").update({ updated_at: new Date().toISOString() }).eq("id", listId);
  touchLists(listId);
  return { ok: true, id: listId ?? undefined, added };
}

export async function removeFromList(listId: string, companyIds: string[]): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const targets = ids(companyIds);
  for (const batch of chunk(targets, 200)) {
    const { error } = await a.supabase
      .from("directory_list_items")
      .delete()
      .eq("list_id", listId)
      .in("company_id", batch);
    if (error) return { ok: false, error: error.message };
  }
  touchLists(listId);
  return { ok: true };
}

export async function setListItemNote(
  listId: string,
  companyId: string,
  note: string,
): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const { error } = await a.supabase
    .from("directory_list_items")
    .update({ note: clean(note, 2000) })
    .eq("list_id", listId)
    .eq("company_id", companyId);
  if (error) return { ok: false, error: error.message };
  touchLists(listId);
  return { ok: true };
}

// --- Saved searches -----------------------------------------------------------------

export async function saveSearch(name: string, query: string, params: string): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const n = clean(name, 120);
  if (!n) return { ok: false, error: "Name the search." };
  const filters = Object.fromEntries(new URLSearchParams(params.slice(0, 4000)));
  const { data, error } = await a.supabase
    .from("saved_searches")
    .insert({ name: n, query: clean(query, 1000), filters, owner_id: a.userId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't save the search." };
  revalidatePath("/database");
  return { ok: true, id: data.id };
}

export async function deleteSavedSearch(id: string): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  const { data: row } = await a.supabase.from("saved_searches").select("owner_id").eq("id", id).single();
  if (!row) return { ok: false, error: "Search not found." };
  if (!a.isAdmin && row.owner_id && row.owner_id !== a.userId) {
    return { ok: false, error: "Only its owner or an admin can delete a saved search." };
  }
  const { error } = await a.supabase.from("saved_searches").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/database");
  return { ok: true };
}

// --- Pipeline --------------------------------------------------------------------------

export type BulkPipelineResult = {
  ok: boolean;
  error?: string;
  created: number;
  /** Firms left out, and why — so nobody steps on a teammate unawares. */
  skipped: { name: string; reason: string }[];
};

/**
 * One "New" lead per firm, owned by whoever clicked. A firm someone on the
 * team already has an open lead for is skipped and named in the result: the
 * single-firm add shows the full heads-up; a bulk add just stays out of the way.
 */
export async function addCompaniesToPipeline(companyIds: string[]): Promise<BulkPipelineResult> {
  const a = await actor();
  if (!a.ok) return { ok: false, error: a.error, created: 0, skipped: [] };
  const targets = ids(companyIds).slice(0, 500);
  if (!targets.length) return { ok: false, error: "Select at least one firm.", created: 0, skipped: [] };

  const companies: { id: string; name: string; category: string; country: string | null; website: string | null }[] = [];
  for (const batch of chunk(targets, 150)) {
    const { data } = await a.supabase
      .from("companies")
      .select("id, name, category, country, website")
      .in("id", batch);
    companies.push(...(data ?? []));
  }

  const { data: open } = await a.supabase
    .from("leads")
    .select("company_id, company_name, owner_id, stage")
    .not("stage", "in", '("Confirmed","Blown Out")')
    .limit(20000);
  const taken = new Map<string, string | null>();
  for (const l of open ?? []) {
    if (l.company_id) taken.set(`id:${l.company_id}`, l.owner_id);
    if (l.company_name) taken.set(`name:${normName(l.company_name)}`, l.owner_id);
  }

  const skipped: { name: string; reason: string }[] = [];
  const rows = [];
  for (const c of companies) {
    const owner = taken.get(`id:${c.id}`) ?? taken.get(`name:${normName(c.name)}`);
    if (owner !== undefined) {
      skipped.push({ name: c.name, reason: owner === a.userId ? "already in your pipeline" : "a teammate has an open lead" });
      continue;
    }
    rows.push({
      owner_id: a.userId,
      company_id: c.id,
      company_name: c.name,
      category: c.category,
      market: marketFromCountry(c.country),
      website: c.website,
      country: c.country,
      stage: "New",
      source: "Discover",
    });
  }

  let created = 0;
  for (const batch of chunk(rows, 200)) {
    const { error } = await a.supabase.from("leads").insert(batch);
    if (error) return { ok: false, error: error.message, created, skipped };
    created += batch.length;
  }
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/pipeline");
  return { ok: true, created, skipped };
}

// --- Classification ---------------------------------------------------------------------

/** Move a firm into a book — how an unclassified directory row gets placed. */
export async function classifyCompany(id: string, category: string): Promise<DirectoryActionResult> {
  const a = await actor();
  if (!a.ok) return a;
  if (!isCategory(category)) return { ok: false, error: "Unknown book." };
  const { error } = await a.supabase.from("companies").update({ category }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag(DIRECTORY_TAG);
  revalidatePath(`/companies/${id}`);
  revalidatePath("/database");
  return { ok: true, id };
}
