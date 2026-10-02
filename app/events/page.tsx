import { CalendarRange, Radar } from "lucide-react";
import { getEventPerformance } from "@/lib/event-performance";
import { isOpsWriteEnabled } from "@/lib/ops";
import { formatOpsMoney } from "@/lib/ops-types";
import { SERIES } from "@/lib/events-catalogue";
import { EventTable } from "@/components/events/event-table";
import { SeriesRevenueChart } from "@/components/events/charts";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard, StatRow } from "@/components/stat-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Event performance — LPGP Connect" };

// Targets can be set per currency, but the roll-up has to pick one to add in.
// GBP is the reporting currency; per-event figures keep their own.
const REPORTING_CURRENCY = "GBP";

export default async function EventPerformancePage() {
  const { events, series, totals, opsError } = await getEventPerformance();
  const pct = totals.target > 0 ? Math.round((totals.actual / totals.target) * 100) : null;

  return (
    <div className="mx-auto max-w-[95rem] space-y-6 px-4 py-8 md:px-6">
      <PageHeader
        eyebrow="Sales CRM"
        title="Event performance"
        description="Every event in the ops panel, against the target you set here. Actuals come straight from the deal tracker — including who's sponsoring each event and who has paid."
      />

      {opsError ? (
        <EmptyState icon={<Radar />} title="Not reading the ops panel" description={opsError} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<CalendarRange />}
          title="No events in the ops panel yet"
          description="Events and their sponsors live in the tracker; add portfolio events there and they appear here ready to target."
        />
      ) : (
        <>
          {/* The programme's numbers. Every figure is in the reporting
              currency; targets set in another currency are left out of the
              roll-up and say so on their own row. */}
          <StatRow>
            <StatCard
              label={`Allocated (${REPORTING_CURRENCY})`}
              value={formatOpsMoney(totals.actual, REPORTING_CURRENCY)}
              basis={
                pct != null
                  ? `${pct}% of target · ${totals.actual < totals.target ? `${formatOpsMoney(totals.target - totals.actual, REPORTING_CURRENCY)} to go` : `${formatOpsMoney(totals.actual - totals.target, REPORTING_CURRENCY)} ahead`}`
                  : `Across ${totals.eventCount} event${totals.eventCount === 1 ? "" : "s"}, no programme target set`
              }
            />
            <StatCard
              label="Collected"
              value={formatOpsMoney(totals.collected, REPORTING_CURRENCY)}
              basis={totals.actual > 0 ? `${Math.round((totals.collected / totals.actual) * 100)}% of allocated is paid` : "Nothing invoiced yet"}
            />
            <StatCard
              label="Total target"
              value={totals.target > 0 ? formatOpsMoney(totals.target, REPORTING_CURRENCY) : "—"}
              basis={totals.targeted ? `${totals.targeted} of ${totals.eventCount} events targeted, ${REPORTING_CURRENCY} targets only` : "No targets set yet"}
            />
            <StatCard
              label="Hitting target"
              value={totals.targeted ? `${totals.onTarget} / ${totals.targeted}` : "—"}
              basis={totals.targeted ? `${totals.targeted - totals.onTarget} still short` : "Set a target on an event to track this"}
            />
            <StatCard label="Events" value={totals.eventCount} basis="In the ops panel, every series" />
          </StatRow>

          {/* Portfolio roll-up */}
          <section className="sheen rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="font-semibold">Revenue by portfolio</h2>
                <p className="text-xs text-muted-foreground">
                  The {SERIES.length} programme series. The tick on each bar is that portfolio&apos;s combined target.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">Amounts in {REPORTING_CURRENCY}</p>
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
