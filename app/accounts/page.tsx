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
import { StatCard } from "@/components/stat-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts — LPGP Connect" };

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
  const contacts = accounts.reduce((n, a) => n + a.contact_count, 0);
  const linked = accounts.filter((a) => ops[a.id]).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Accounts"
        description="Sponsors you've won. Every company with a deal in the ops panel gets an account here automatically, and each new deal updates it; points of contact, activity history and event allocations hang off it."
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <SyncAccountsButton configured={isOpsConfigured()} />
            <NewAccountDialog />
          </div>
        }
      />

      {!isSupabaseConfigured() ? <SetupNotice /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={accounts.length} accent="bg-primary" />
        <StatCard label="Active" value={active} dot="bg-emerald-500" />
        <StatCard label="Points of contact" value={contacts} />
        <StatCard
          label="Linked to ops panel"
          value={linked}
          sublabel={linked ? "Event allocations in sync" : "None linked yet"}
          dot="bg-amber-500"
        />
      </div>

      {yearTotals.length ? (
        <p className="text-xs text-muted-foreground">
          From the sponsor lists:{" "}
          {yearTotals.map((t, i) => (
            <span key={`${t.year}-${t.currency}`}>
              {i ? " · " : ""}
              <span className="font-medium text-foreground">{t.year}</span> {formatOpsMoney(t.amount, t.currency)} across {t.accounts} sponsors
            </span>
          ))}
          . Each currency is totalled on its own; the ops panel stays the source of truth for money.
        </p>
      ) : null}
      <AccountsBrowser accounts={accounts} opsByAccount={ops} sponsorships={sponsorships} />
    </div>
  );
}
