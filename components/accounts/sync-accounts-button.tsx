"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { syncAccountsNow } from "@/lib/account-sync-actions";
import type { AccountSyncResult } from "@/lib/account-sync";
import { Button } from "@/components/ui/button";

/**
 * Pull the tracker's deals into Accounts now. The same sync runs by itself
 * every morning and after any deal recorded from here; this is for the person
 * who just entered a deal in the ops panel and wants to see the account.
 */
export function SyncAccountsButton({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<AccountSyncResult | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending || !configured}
        title={configured ? "Create or update an account for every company with a deal in the ops panel" : "Connect the ops panel in Settings first"}
        onClick={() =>
          start(async () => {
            const r = await syncAccountsNow();
            setResult(r);
            if (r.ok) router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Sync from ops panel
      </Button>
      {result ? (
        <span className={`text-xs ${result.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {result.ok
            ? `${result.deals} deals across ${result.companies} companies: ${result.created} account${result.created === 1 ? "" : "s"} created, ${result.updated} updated, ${result.linked} deal${result.linked === 1 ? "" : "s"} newly linked${result.unmatched.length ? `; ${result.unmatched.length} with only cancelled deals left alone` : ""}.`
            : result.error}
        </span>
      ) : null}
    </div>
  );
}
