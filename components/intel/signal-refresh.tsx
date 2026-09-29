"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Admin: run the signals job now instead of waiting for the daily cron. */
export function SignalRefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      {message ? <span className="text-[11.5px] text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage("Reading the last few days of news for every asset class…");
            try {
              const res = await fetch("/api/directory/signals/refresh", { method: "POST" });
              const j = (await res.json().catch(() => ({}))) as { error?: string; added?: number; classes?: number };
              if (!res.ok) {
                setMessage(j.error ?? `Failed (${res.status})`);
                return;
              }
              setMessage(`${j.added ?? 0} new signals across ${j.classes ?? 0} classes.`);
              router.refresh();
            } catch {
              setMessage("Network error");
            }
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Refresh now
      </Button>
    </div>
  );
}
