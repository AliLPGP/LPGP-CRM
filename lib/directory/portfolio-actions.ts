"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getSessionUser } from "../auth";
import { getAdminClient } from "../supabase/admin";
import { DIRECTORY_TAG } from "./index-server";
import { portfolioDomain, portfolioKey } from "./portfolio";

type Result = { ok: boolean; error?: string };

/** Add a portfolio company by hand — someone on the team knows it. */
export async function addPortfolioCompany(
  gpId: string,
  input: { name: string; website?: string; status?: string; investedYear?: string; sourceUrl?: string },
): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };
  const name = input.name.trim().slice(0, 200);
  if (!name) return { ok: false, error: "Give the company a name." };
  const year = Number(input.investedYear);
  const { error } = await supabase.from("portfolio_companies").upsert(
    {
      external_key: portfolioKey(gpId, name),
      gp_company_id: gpId,
      name,
      domain: portfolioDomain(input.website),
      status: input.status === "current" || input.status === "realized" ? input.status : null,
      invested_year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
      source: "manual",
      source_url: input.sourceUrl && /^https?:\/\//.test(input.sourceUrl) ? input.sourceUrl.slice(0, 600) : null,
      added_by: user.id,
    },
    { onConflict: "external_key" },
  );
  if (error) return { ok: false, error: error.message };
  updateTag(DIRECTORY_TAG);
  revalidatePath(`/companies/${gpId}`);
  return { ok: true };
}

export async function removePortfolioCompany(id: string, gpId: string): Promise<Result> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in" };
  const supabase = getAdminClient();
  if (!supabase) return { ok: false, error: "Supabase service role not configured" };
  const { error } = await supabase.from("portfolio_companies").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  updateTag(DIRECTORY_TAG);
  revalidatePath(`/companies/${gpId}`);
  return { ok: true };
}
