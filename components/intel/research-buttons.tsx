"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

// The buttons that run the in-app research jobs. Each posts to a route that
// searches the web on the server with the app's own Anthropic key and saves
// what it finds with sources; the page refreshes when it returns.

async function post(url: string, body: unknown): Promise<{ ok: boolean; message: string; json: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: String(json.error ?? `Failed (${res.status})`), json };
    return { ok: true, message: "", json };
  } catch {
    return { ok: false, message: "Network error", json: {} };
  }
}

/** One club, from its profile. */
export function ResearchClubButton({ teamId, researched, aiReady }: { teamId: string; researched: boolean; aiReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!aiReady) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage("Searching the web for ownership, revenue, valuation and following — one to two minutes…");
            const r = await post("/api/directory/sports/research", { teamIds: [teamId], verify: true });
            if (!r.ok) {
              setMessage(r.message);
              return;
            }
            const first = (r.json.results as { ok: boolean; error?: string; deals?: number }[] | undefined)?.[0];
            setMessage(first?.ok ? `Done — ${first.deals ?? 0} deals recorded.` : (first?.error ?? "No result"));
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {researched ? "Re-research with sources" : "Research this club"}
      </Button>
    </span>
  );
}

/** Admin: every club without figures, two at a time, until done or stopped. */
export function ResearchClubsRunner({ teamIds, aiReady }: { teamIds: string[]; aiReady: boolean }) {
  const router = useRouter();
  const stop = useRef(false);
  const [state, setState] = useState<{ done: number; ok: number; errors: string[]; running: boolean } | null>(null);
  if (!aiReady || !teamIds.length) return null;
  async function run() {
    stop.current = false;
    let s = { done: 0, ok: 0, errors: [] as string[], running: true };
    setState(s);
    for (let i = 0; i < teamIds.length; i += 2) {
      if (stop.current) break;
      const r = await post("/api/directory/sports/research", { teamIds: teamIds.slice(i, i + 2), verify: false });
      const results = (r.json.results as { name: string; ok: boolean; error?: string }[] | undefined) ?? [];
      s = {
        ...s,
        done: Math.min(teamIds.length, i + 2),
        ok: s.ok + results.filter((x) => x.ok).length,
        errors: [...s.errors, ...(r.ok ? results.filter((x) => !x.ok).map((x) => `${x.name}: ${x.error}`) : [r.message])],
      };
      setState(s);
      if (!r.ok && s.errors.length >= 3) break;
    }
    setState({ ...s, running: false });
    router.refresh();
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => void run()} disabled={state?.running}>
        {state?.running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        Research {teamIds.length} clubs without figures
      </Button>
      {state?.running ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            stop.current = true;
          }}
        >
          <Square className="h-3 w-3" /> Stop
        </Button>
      ) : null}
      {state ? (
        <span className="text-[11px] text-muted-foreground">
          {state.done}/{teamIds.length} · {state.ok} researched{state.errors.length ? ` · ${state.errors.length} failed` : ""}
          {!state.running ? " · done" : ""}
        </span>
      ) : (
        <span className="text-[11px] text-muted-foreground">About a minute per club, on the app&rsquo;s own key; every figure with its page.</span>
      )}
    </div>
  );
}

/** Admin: LP commitments from what the disclosing LPs publish, a few LPs per run. */
export function ResearchCommitmentsButton({ aiReady, limit = 4 }: { aiReady: boolean; limit?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!aiReady) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(`Reading board minutes and reports of the ${limit} largest disclosing LPs — a few minutes…`);
            const r = await post("/api/directory/commitments/research", { limit });
            if (!r.ok) {
              setMessage(r.message);
              return;
            }
            const errors = (r.json.errors as string[] | undefined) ?? [];
            setMessage(`${r.json.added ?? 0} commitments recorded from ${((r.json.researched as string[] | undefined) ?? []).join(", ")}.${errors.length ? ` ${errors.join("; ")}` : ""}`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        Research LP commitments
      </Button>
    </span>
  );
}

/** Admin: deals or benchmarks for one asset class. */
export function ResearchClassButton({ assetClass, kind, aiReady }: { assetClass: string; kind: "deals" | "benchmarks"; aiReady: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!aiReady) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(kind === "deals" ? "Searching for fund closes and transactions — two to three minutes…" : "Searching for published benchmarks — a minute or two…");
            const r = await post(`/api/directory/${kind}/research`, { assetClass });
            if (!r.ok) {
              setMessage(r.message);
              return;
            }
            const errors = (r.json.errors as string[] | undefined) ?? [];
            setMessage(`${r.json.added ?? 0} ${kind === "deals" ? "deals" : "figures"} recorded.${errors.length ? ` ${errors.join("; ")}` : ""}`);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {kind === "deals" ? "Research deals" : "Refresh benchmarks"}
      </Button>
    </span>
  );
}

/** Admin: Companies House accounts and officers, and executive previews, for portfolio companies and borrowers. */
export function EnrichPortcosButton({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (!ready) return null;
  return (
    <span className="inline-flex items-center gap-2">
      {message ? <span className="text-[11px] text-muted-foreground">{message}</span> : null}
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage("Reading the register and the latest filed accounts of UK portfolio companies and borrowers — up to five minutes…");
            const r = await post("/api/directory/portcos/enrich", { onlyUk: true });
            if (!r.ok) {
              setMessage(r.message);
              return;
            }
            const errors = (r.json.errors as string[] | undefined) ?? [];
            setMessage(
              `${r.json.considered ?? 0} looked up: ${r.json.matched ?? 0} on the register, ${r.json.accounts ?? 0} with filed figures, ${r.json.executives ?? 0} with executives named.${r.json.outOfTime ? " More remain; run again." : ""}${errors.length ? ` ${errors.slice(0, 3).join("; ")}` : ""}`,
            );
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        Enrich from Companies House
      </Button>
    </span>
  );
}
