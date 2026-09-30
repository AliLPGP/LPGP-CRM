import { BadgeCheck, CalendarRange, Radar, Target, Users } from "lucide-react";
import { getEventPerformance } from "@/lib/event-performance";
import { isOpsWriteEnabled } from "@/lib/ops";
import { formatOpsMoney } from "@/lib/ops-types";
import { SERIES } from "@/lib/events-catalogue";
import { EventTable } from "@/components/events/event-table";
import { ProgressMeter, SeriesRevenueChart } from "@/components/events/charts";
import { Kpi } from "@/components/dashboard/panels";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event performance — LPGP Connect" };

// Targets can be set per currency, but the roll-up has to pick one to add in.
// GBP is the reporting currency; per-event figures keep their own.
const REPORTING_CURRENCY = "GBP";

export default async function EventPerformancePage() {
  const { events, series, totals, opsError } = await getEventPerformance();

  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Event performance"
        description="Every event in the ops panel, against the target you set here. Actuals come straight from the deal tracker — including who's sponsoring each event and who has paid."
      />

      {opsError ? (
        <EmptyState
          icon={<Radar className="mx-auto h-8 w-8" />}
          title="Not reading the ops panel"
          description={opsError}
        />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="mx-auto h-8 w-8" />}
          title="No events in the ops panel yet"
          description="Add portfolio events in the tracker and they'll appear here ready to target."
        />
      ) : (
        <>
          {/* Programme headline */}
          <section className="sheen rounded-2xl border bg-card p-6">
            <p className="eyebrow">Programme to date</p>
            <div className="mt-3 max-w-2xl">
              <ProgressMeter
                actual={totals.actual}
                target={totals.target}
                currency={REPORTING_CURRENCY}
              />
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              label="Allocated"
              value={formatOpsMoney(totals.actual, REPORTING_CURRENCY)}
              sub={`across ${totals.eventCount} event${totals.eventCount === 1 ? "" : "s"}`}
              tone="brand"
              icon={<Target className="h-4 w-4" />}
            />
            <Kpi
              label="Collected"
              value={formatOpsMoney(totals.collected, REPORTING_CURRENCY)}
              sub={
                totals.actual > 0
                  ? `${Math.round((totals.collected / totals.actual) * 100)}% of allocated is paid`
                  : "Nothing invoiced yet"
              }
              tone="success"
              icon={<BadgeCheck className="h-4 w-4" />}
            />
            <Kpi
              label="Total target"
              value={formatOpsMoney(totals.target, REPORTING_CURRENCY)}
              sub={
                totals.targeted
                  ? `${totals.targeted} of ${totals.eventCount} events targeted`
                  : "No targets set yet"
              }
              tone="neutral"
              icon={<CalendarRange className="h-4 w-4" />}
            />
            <Kpi
              label="Hitting target"
              value={totals.targeted ? `${totals.onTarget}/${totals.targeted}` : "—"}
              sub={
                totals.targeted
                  ? `${totals.targeted - totals.onTarget} still short`
                  : "Set a target to track this"
              }
              tone="ops"
              icon={<Users className="h-4 w-4" />}
            />
          </div>

          {/* Portfolio roll-up */}
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-semibold">Revenue by portfolio</h2>
                <p className="text-xs text-muted-foreground">
                  The {SERIES.length} programme series. The tick on each bar is that
                  portfolio&apos;s combined target.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Amounts in {REPORTING_CURRENCY}
              </p>
            </div>
            <div className="mt-5">
              <SeriesRevenueChart data={series} currency={REPORTING_CURRENCY} />
            </div>
          </section>

          {/* Per-event */}
          <EventTable
            events={events.map((e) => ({
              opsEventId: e.opsEventId,
              name: e.name,
              date: e.date,
              dateTbc: e.dateTbc,
              location: e.location,
              producer: e.producer,
              actual: e.actual,
              collected: e.collected,
              sponsorCount: e.sponsorCount,
              target: e.target,
              targetCurrency: e.targetCurrency,
              targetSponsors: e.targetSponsors,
              progress: e.progress,
              series: e.series,
              seriesInferred: e.seriesInferred,
            }))}
            currency={REPORTING_CURRENCY}
            canRecordDeals={isOpsWriteEnabled()}
          />
        </>
      )}
    </div>
  );
}
