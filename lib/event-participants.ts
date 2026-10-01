import { getReadClient } from "./supabase/server";

// Who was booked for which event, from the sales team's mastersheet
// (migration 0028). Every read degrades to an empty list: an older database
// without the table must not break a profile page.

export type Participation = {
  id: string;
  event_name: string;
  contact_id: string;
  company_id: string | null;
  segment: string | null;
  role: string | null;
  status: string;
  sponsor_tier: string | null;
  booked_by: string | null;
  invite_status: string | null;
  contact?: { id: string; full_name: string | null; job_title: string | null } | null;
};

const COLS = "id, event_name, contact_id, company_id, segment, role, status, sponsor_tier, booked_by, invite_status";

/** A person's events, newest tab name order irrelevant: grouped by event name. */
export async function getParticipationForContact(contactId: string): Promise<Participation[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from("event_participants").select(COLS).eq("contact_id", contactId).order("event_name");
  if (error || !data) return [];
  return data as Participation[];
}

/** Everyone a firm has had at an event, with the person's name and title. */
export async function getParticipationForCompany(companyId: string): Promise<Participation[]> {
  const supabase = getReadClient();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("event_participants")
    .select(`${COLS}, contact:contacts(id, full_name, job_title)`)
    .eq("company_id", companyId)
    .order("event_name")
    .limit(1000);
  if (error || !data) return [];
  return data as unknown as Participation[];
}

/** Pass, sponsorship or exhibition: what the firm bought, apart from a seat. */
export function isSponsorTier(tier: string | null): boolean {
  return Boolean(tier) && !/pass|complimentary|delegate/i.test(tier ?? "");
}
