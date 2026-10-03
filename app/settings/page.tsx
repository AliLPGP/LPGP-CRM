import { Check, X, Database, Plug, KeyRound, Radar, TriangleAlert } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { lushaConfigured } from "@/lib/lusha";
import { isOpsConfigured, isOpsWriteEnabled, opsPanelUrl, pingOps } from "@/lib/ops";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Settings — LPGP Intelligence" };

function StatusRow({
  label,
  hint,
  ok,
  icon,
}: {
  label: string;
  hint: string;
  ok: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-secondary text-foreground/70 shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="text-sm text-muted-foreground">{hint}</div>
      </div>
      <span
        className={
          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium " +
          (ok
            ? "border-foreground/20 bg-foreground/5 text-foreground"
            : "border-border bg-muted text-muted-foreground")
        }
      >
        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
        {ok ? "Connected" : "Not set"}
      </span>
    </div>
  );
}

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = isSupabaseConfigured();
  const admin = isAdminConfigured();
  const lusha = lushaConfigured();
  // A real handshake, not just "are the env vars set" — a wrong key or a
  // tracker that's down should say so here rather than fail silently later.
  const ops = isOpsConfigured() ? await pingOps() : null;

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-8 space-y-8">
      <PageHeader eyebrow="Sales CRM" title="Settings" description="Appearance, connections and data setup." />

      {/* Appearance */}
      <section className="sheen rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-0.5 mb-3">
          Switch between light and dark. Your choice is remembered on this device.
        </p>
        <ThemeToggle variant="switch" />
      </section>

      {/* Connections */}
      <section className="sheen rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Connections</h2>
        <div className="mt-2 divide-y">
          <StatusRow
            label="Supabase (reads)"
            hint="NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY"
            ok={supabase}
            icon={<Database className="h-4 w-4" />}
          />
          <StatusRow
            label="Supabase service role (writes)"
            hint="SUPABASE_SERVICE_ROLE_KEY — needed for import & editing"
            ok={admin}
            icon={<KeyRound className="h-4 w-4" />}
          />
          <StatusRow
            label="Lusha (optional)"
            hint="LUSHA_API_KEY — pull fresh leads by job title & firm"
            ok={lusha}
            icon={<Plug className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* Ops panel */}
      <section className="sheen rounded-2xl border bg-card p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--ops-soft)] text-[var(--ops)]">
            <Radar className="h-3.5 w-3.5" />
          </span>
          <h2 className="font-semibold">Ops panel (TrackerLPGP)</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          When connected, adding a company to the pipeline checks the tracker and shows any deal it
          already has there, including which events its money is allocated to.
        </p>

        <div className="mt-3 divide-y">
          <StatusRow
            label="Bridge connection"
            hint={
              ops?.ok
                ? `${opsPanelUrl()} — ${ops.data.counts.deals} deals, ${ops.data.counts.events} events, ${ops.data.counts.allocations} allocations`
                : ops
                  ? ops.error
                  : "OPS_PANEL_URL + OPS_BRIDGE_KEY — set the same secret on both apps"
            }
            ok={Boolean(ops?.ok)}
            icon={<Radar className="h-4 w-4" />}
          />
          <StatusRow
            label="Recording deals"
            hint={
              isOpsWriteEnabled()
                ? "This CRM can create deals and attach invoices in the tracker"
                : "OPS_BRIDGE_WRITE_KEY — a separate secret, so a leaked read key can never write"
            }
            ok={isOpsWriteEnabled()}
            icon={<KeyRound className="h-4 w-4" />}
          />
        </div>

        {ops && !ops.ok ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-[var(--ops-soft)] px-3 py-2 text-sm text-[var(--ops)]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              The CRM reached for the ops panel and couldn&apos;t use it. Check that{" "}
              <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">
                OPS_BRIDGE_KEY
              </code>{" "}
              is identical on both apps and that the tracker is deployed.
            </span>
          </p>
        ) : null}

        {!isOpsConfigured() ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground/80">
            <li>
              Generate a shared secret:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                openssl rand -hex 32
              </code>
            </li>
            <li>
              On the tracker, set{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                OPS_BRIDGE_KEY
              </code>{" "}
              to that value and redeploy.
            </li>
            <li>
              Here, set{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">OPS_PANEL_URL</code>{" "}
              to the tracker&apos;s URL and{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                OPS_BRIDGE_KEY
              </code>{" "}
              to the same secret.
            </li>
          </ol>
        ) : null}
      </section>

      {/* Database setup */}
      <section className="sheen rounded-2xl border bg-card p-5">
        <h2 className="font-semibold">Database</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Run the schema once in the Supabase SQL editor to create the tables this CRM uses.
        </p>
        <ol className="mt-3 space-y-2 text-sm list-decimal pl-5 text-foreground/80">
          <li>Open your Supabase project → <strong>SQL Editor</strong>.</li>
          <li>
            Paste the contents of{" "}
            <code className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">
              supabase/schema.sql
            </code>{" "}
            and run it — it&apos;s the consolidated schema (companies, contacts, leads,
            accounts, points of contact, activities and ops links) and is safe to re-run.
          </li>
          <li>
            Add the environment variables above in{" "}
            <strong>Vercel → Settings → Environment Variables</strong> (and your local{" "}
            <code className="font-mono text-xs rounded bg-muted px-1.5 py-0.5">.env.local</code>).
          </li>
        </ol>
      </section>
    </div>
  );
}
