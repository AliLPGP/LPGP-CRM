import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getReadClient } from "@/lib/supabase/server";

// The sales side of a firm's page: where the team stands with this firm
// (its leads, its account, the last touch), beside the research. A firm with
// none of those says so and leaves the actions above to start one.

type LeadRow = {
  id: string;
  stage: string;
  owner_id: string | null;
  callback_at: string | null;
  next_step: string | null;
  last_activity_at: string | null;
};
type AccountRow = { id: string; name: string; status: string | null; tier: string | null };

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

export async function SalesPanel({ companyId }: { companyId: string }) {
  const supabase = getReadClient();
  if (!supabase) return null;
  const [leadsRes, accountRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, stage, owner_id, callback_at, next_step, last_activity_at")
      .eq("company_id", companyId)
      .order("updated_at", { ascending: false })
      .limit(5),
    supabase.from("accounts").select("id, name, status, tier").eq("company_id", companyId).limit(1),
  ]);
  const leads = (leadsRes.data ?? []) as LeadRow[];
  const account = ((accountRes.data ?? []) as AccountRow[])[0] ?? null;
  const ownerIds = [...new Set(leads.map((l) => l.owner_id).filter(Boolean))] as string[];
  const owners = new Map<string, string>();
  if (ownerIds.length) {
    const { data } = await supabase.from("profiles").select("id, full_name, email").in("id", ownerIds);
    for (const p of (data ?? []) as { id: string; full_name: string | null; email: string | null }[]) owners.set(p.id, p.full_name ?? p.email ?? "Teammate");
  }
  const lead = leads[0] ?? null;
  const lastTouch = leads.map((l) => l.last_activity_at).filter(Boolean).sort().at(-1) ?? null;

  return (
    <section className="sales-panel" aria-label="Sales">
      <p className="wordmark text-[10.5px] text-[var(--brass)]">Sales</p>
      {lead || account ? (
        <div className="mt-3 space-y-2.5">
          {lead ? (
            <>
              <div className="sales-kv">
                <span>Stage</span>
                <span className="font-medium">{lead.stage}</span>
              </div>
              <div className="sales-kv">
                <span>Owner</span>
                <span>{lead.owner_id ? (owners.get(lead.owner_id) ?? "Teammate") : "Unassigned"}</span>
              </div>
              {lead.callback_at ? (
                <div className="sales-kv">
                  <span>Call-back</span>
                  <span>{day(lead.callback_at)}</span>
                </div>
              ) : null}
              {lead.next_step ? (
                <div className="sales-kv">
                  <span>Next step</span>
                  <span className="truncate text-right">{lead.next_step}</span>
                </div>
              ) : null}
              <div className="sales-kv">
                <span>Last touch</span>
                <span>{day(lastTouch) ?? "None logged"}</span>
              </div>
            </>
          ) : null}
          {account ? (
            <div className="sales-kv">
              <span>Account</span>
              <Link href={`/accounts/${account.id}`} className="inline-flex items-center gap-1 font-medium hover:text-[var(--brass)]">
                {account.status ?? "Active"}
                {account.tier ? ` · ${account.tier}` : ""}
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          ) : null}
          {lead ? (
            <div className="flex flex-wrap gap-2 pt-1.5">
              <Link href={`/leads/${lead.id}`} className="chapter-more">
                Open lead
              </Link>
              {leads.length > 1 ? (
                <Link href="/leads" className="chapter-more">
                  {leads.length} leads on this firm
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">Nobody is working this firm yet. Add it to the pipeline to start.</p>
      )}
    </section>
  );
}
