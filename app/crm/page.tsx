import { Suspense } from "react";
import Link from "next/link";
import { PhoneCall } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { listLeads } from "@/lib/crm";
import { activityStats, listRecentActivities } from "@/lib/activities";
import { listOpsEvents, isOpsConfigured } from "@/lib/ops";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { buildQueue, formatDuration } from "@/lib/sales";
import { leadFigures } from "@/components/lead-stats";
import { ActivityFeed, OpsEventsPanel, PipelineByStage, TodaysCalls } from "@/components/dashboard/panels";
import { PageHeader } from "@/components/page-header";
import { SetupNotice } from "@/components/setup-notice";
import { StatCard, StatRow } from "@/components/stat-card";
import { HeaderSkeleton, PanelSkeleton, StatRowSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Command centre — LPGP Connect" };

function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The route's own fallback: the root loading.tsx is the generic desk skeleton,
 * so the command centre paints its real bones — header, one stat row, two
 * columns — from a boundary of its own while the book loads.
 */
export default function CommandCentre() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6" aria-busy="true" aria-label="Loading">
          <HeaderSkeleton actions={2} />
          <StatRowSkeleton count={5} />
          <div className="grid gap-4 lg:grid-cols-2">
            <PanelSkeleton />
            <PanelSkeleton />
            <PanelSkeleton />
            <PanelSkeleton />
          </div>
        </div>
      }
    >
      <CommandCentreBody />
    </Suspense>
  );
}

async function CommandCentreBody() {
  const user = await getSessionUser();

  const [leads, stats, activities, opsEvents] = await Promise.all([
    listLeads(),
    activityStats(user?.id ?? null),
    listRecentActivities(10),
    isOpsConfigured() ? listOpsEvents() : Promise.resolve(null),
  ]);

  const now = new Date();
  const userId = user?.id ?? null;
  const f = leadFigures(leads, userId, now.getTime());
  const queue = buildQueue(leads, "my-open", userId, now.getTime());
  const connectPct = stats.callsThisWeek ? Math.round((stats.connectsThisWeek / stats.callsThisWeek) * 100) : null;
  const first = user?.name ? user.name.split(" ")[0] : null;

  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title={first ? `${greeting(now)}, ${first}` : greeting(now)}
        description={
          queue.length
            ? `${queue.length} lead${queue.length === 1 ? "" : "s"} queued${f.callbacksDue ? ` — ${f.callbacksDue} call-back${f.callbacksDue === 1 ? "" : "s"} already due.` : ". Start at the top and work down."}`
            : "Nothing queued. Import a list or pull a lead into the pipeline to get going."
        }
        actions={
          <>
            <Button asChild>
              <Link href="/leads/workspace">
                <PhoneCall className="h-4 w-4" /> Start calling
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/import/leads">Import leads</Link>
            </Button>
          </>
        }
      />

      {!isSupabaseConfigured() ? <SetupNotice /> : null}

      {/* The numbers: one row, each with what it is counted from. */}
      <StatRow>
        <StatCard label="Calls today" value={stats.callsToday} basis={stats.talkTimeToday ? `${formatDuration(stats.talkTimeToday)} on the phone, your calls` : "Your calls logged since midnight"} href="/leads/workspace" />
        <StatCard label="Connect rate · 7 days" value={connectPct != null ? `${connectPct}%` : "—"} basis={stats.callsThisWeek ? `${stats.connectsThisWeek} connected of ${stats.callsThisWeek} call${stats.callsThisWeek === 1 ? "" : "s"}` : "No calls logged this week"} href="/leads/workspace" />
        <StatCard label="Open pipeline" value={formatUsd(f.openValue)} basis={`${f.open} open lead${f.open === 1 ? "" : "s"} · values as entered, USD`} href="/pipeline" />
        <StatCard label="Confirmed" value={formatUsd(f.wonValue)} basis="Confirmed leads, as entered · money lives in the ops panel" href="/deals" />
        <StatCard label="Needs you now" value={f.callbacksDue + f.neverCalled} basis={`${f.callbacksDue} call-back${f.callbacksDue === 1 ? "" : "s"} due · ${f.neverCalled} never called`} href="/leads/workspace" />
      </StatRow>

      {/* Two columns: what to do, and where the book stands. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TodaysCalls queue={queue} now={now.getTime()} />
        <PipelineByStage leads={leads} />
        <OpsEventsPanel
          events={opsEvents?.ok ? opsEvents.data : null}
          error={!isOpsConfigured() ? "Connect the ops panel in Settings to see event revenue here." : opsEvents && !opsEvents.ok ? opsEvents.error : null}
        />
        <ActivityFeed activities={activities} />
      </div>
    </div>
  );
}
