import { after } from "next/server";
import { listAccounts } from "@/lib/accounts";
import { syncAccountsIfDue } from "@/lib/account-sync-auto";
import { sponsorshipsByAccount, totalsByYear } from "@/lib/account-sponsorships";
import { formatOpsMoney } from "@/lib/ops-types";
import { opsSummaries } from "@/lib/ops-links";
import { isOpsConfigured } from "@/lib/ops";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { AccountsBrowser } from "@/components/accounts/accounts-browser";
import { NewAccountDialog } from "@/components/accounts/new-account-dialog";
import { SyncAccountsButton } from "@/components/accounts/sync-accounts-button";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { StatCard, StatRow } from "@/components/stat-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts — LPGP Intelligence" };

export default async function AccountsPage() {
  let [accounts, ops] = await Promise.all([listAccounts(), opsSummaries("account")]);

  // A book with next to no accounts has never been synced: do it now, so the
  // first visit already shows every sponsor. Otherwise it runs after the page
  // is sent and the next visit has any new ones.
  if (accounts.length < 3) {
    const synced = await Promise.race([syncAccountsIfDue({ force: true }), new Promise<null>((r) => setTimeout(() => r(null), 25_000))]);
    if (synced && (synced.created || synced.updated || synced.linked)) {
      [accounts, ops] = await Promise.all([listAccounts(), opsSummaries("account")]);
    }
  } else {
    after(() => syncAccountsIfDue());
  }

  const sponsorships = await sponsorshipsByAccount();
  const yearTotals = totalsByYear(sponsorships);
  const active = accounts.filter((a) => a.status === "Active").length;
  const renewalDue = accounts.filter((a) => a.status === "Renewal due").length;
  const contacts = accounts.reduce((n, a) => n + a.contact_count, 0);
  const withContact = accounts.filter((a) => a.contact_count > 0).length;
  const linked = accounts.filter((a) => ops[a.id]).length;
  // The latest year on the sponsor lists, one figure per currency — never
  // added across currencies, so each currency becomes its own card.
  const latestYear = yearTotals.length ? Math.max(...yearTotals.map((t) => t.year)) : null;
  const latest = yearTotals.filter((t) => t.year === latestYear);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Accounts"
        description="Sponsors you've won. Every company with a deal in the ops panel gets an account here automatically; points of contact, activity history and event allocations hang off it."
        actions={
          <>
            <SyncAccountsButton configured={isOpsConfigured()} />
            <NewAccountDialog />
          </>
        }
      />

      {!isSupabaseConfigured() ? <SetupNotice /> : null}

      <StatRow>
        <StatCard label="Accounts" value={accounts.length} basis={`${active} active · ${renewalDue} renewal due`} />
        <StatCard label="Points of contact" value={contacts} basis={`${withContact} of ${accounts.length} accounts have one`} />
        <StatCard label="Linked to ops panel" value={linked} basis={linked ? "Event allocations in sync" : isOpsConfigured() ? "None matched to a tracker deal yet" : "Ops panel not connected"} />
        {latest.map((t) => (
          <StatCard
            key={`${t.year}-${t.currency}`}
            label={`${t.year} sponsorship (${t.currency})`}
            value={formatOpsMoney(t.amount, t.currency)}
            basis={`${t.accounts} sponsors on the ${t.year} list, ${t.currency} only`}
          />
        ))}
      </StatRow>

      <AccountsBrowser accounts={accounts} opsByAccount={ops} sponsorships={sponsorships} />
    </div>
  );
}
