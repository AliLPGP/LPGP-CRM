"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  Loader2,
  MapPin,
  Pencil,
  Sparkles,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import {
  fetchEventSponsors,
  saveEventTarget,
  acceptInferredSeries,
  type EventSponsorRow,
} from "@/lib/event-target-actions";
import { PRODUCERS, SERIES, SERIES_COLOR, SERIES_MAP, type SeriesId } from "@/lib/events-catalogue";
import { formatEventDate, isEventDateTbc } from "@/lib/event-date";
import { formatOpsMoney, type DateTbc } from "@/lib/ops-types";
import { EventBar } from "@/components/events/charts";
import { RecordDealDialog } from "@/components/ops/record-deal-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FacetChips, FacetMenu } from "@/components/intel/facet-menu";
import { ListToolbar, SortSelect, facetOptions } from "@/components/list-toolbar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";

export type EventRow = {
  opsEventId: number;
  name: string;
  date: string | null;
  dateTbc: DateTbc;
  location: string;
  /** Producer team from the tracker's programme; "" when unassigned. */
  producer: string;
  actual: number;
  collected: number;
  sponsorCount: number;
  target: number | null;
  targetCurrency: string;
  targetSponsors: number | null;
  progress: number | null;
  series: SeriesId | null;
  seriesInferred: boolean;
};

/** Filter value for events the tracker has not assigned to a producer team. */
const NO_PRODUCER = "__none__";
const NO_SERIES = "unassigned";

type Sort = "date" | "allocated" | "progress" | "name";
const SORTS: { value: Sort; label: string }[] = [
  { value: "date", label: "Date" },
  { value: "allocated", label: "Allocated" },
  { value: "progress", label: "Against target" },
  { value: "name", label: "Name" },
];
/** Where an event stands against its target, as a facet. */
type Standing = "hit" | "short" | "none";
const STANDING_LABEL: Record<Standing, string> = { hit: "Hitting target", short: "Short of target", none: "No target set" };
const standingOf = (e: EventRow): Standing => (e.target ? ((e.progress ?? 0) >= 1 ? "hit" : "short") : "none");
const seriesLabel = (k: string) => (k === NO_SERIES ? "Unassigned" : `${SERIES_MAP[k as SeriesId]?.code ?? ""} · ${SERIES_MAP[k as SeriesId]?.short ?? k}`);
const producerLabel = (k: string) => (k === NO_PRODUCER ? "No producer" : k);

export function EventTable({
  events,
  currency,
  canRecordDeals,
}: {
  events: EventRow[];
  currency: string;
  canRecordDeals: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [seriesSel, setSeriesSel] = useState<string[]>([]);
  const [producerSel, setProducerSel] = useState<string[]>([]);
  const [standingSel, setStandingSel] = useState<string[]>([]);
  const [sort, setSort] = useState<Sort>("date");
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [acceptBusy, setAcceptBusy] = useState(false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = events.filter((e) => {
      if (seriesSel.length && !seriesSel.includes(e.series ?? NO_SERIES)) return false;
      if (producerSel.length && !producerSel.includes(e.producer || NO_PRODUCER)) return false;
      if (standingSel.length && !standingSel.includes(standingOf(e))) return false;
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        e.location.toLowerCase().includes(needle) ||
        e.producer.toLowerCase().includes(needle)
      );
    });
    return rows.sort((a, b) => {
      switch (sort) {
        case "allocated":
          return b.actual - a.actual;
        case "progress":
          return (b.progress ?? -1) - (a.progress ?? -1);
        case "name":
          return a.name.localeCompare(b.name);
        default:
          // Dated events in order, undated after them.
          return (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name);
      }
    });
  }, [events, q, seriesSel, producerSel, standingSel, sort]);

  // Shared scale across every visible row, so bar lengths are comparable.
  const scale = Math.max(1, ...shown.map((e) => Math.max(e.actual, e.target ?? 0)));
  const inferred = events.filter((e) => e.seriesInferred && e.series);

  const seriesOptions = facetOptions(events, (e) => e.series ?? NO_SERIES, { order: [...SERIES.map((s) => s.id), NO_SERIES], label: seriesLabel }).filter((o) => o.count > 0);
  const producerOptions = facetOptions(events, (e) => e.producer || NO_PRODUCER, { order: [...PRODUCERS, NO_PRODUCER], label: producerLabel }).filter((o) => o.count > 0);
  const standingOptions = facetOptions(events, standingOf, { order: ["hit", "short", "none"], label: (k) => STANDING_LABEL[k as Standing] });
  const clearAll = () => {
    setQ("");
    setSeriesSel([]);
    setProducerSel([]);
    setStandingSel([]);
  };

  return (
    <div className="space-y-3">
      <ListToolbar
        search={{ value: q, onChange: setQ, placeholder: "Search events, cities or producers" }}
        facets={
          <>
            <FacetMenu label="Series" groups={[{ label: "", options: seriesOptions }]} selected={seriesSel} onChange={setSeriesSel} searchable={false} width={260} />
            <FacetMenu label="Producer" groups={[{ label: "", options: producerOptions }]} selected={producerSel} onChange={setProducerSel} searchable={false} width={220} />
            <FacetMenu label="Target" groups={[{ label: "", options: standingOptions }]} selected={standingSel} onChange={setStandingSel} searchable={false} width={220} />
          </>
        }
        sort={<SortSelect value={sort} onChange={setSort} options={SORTS} />}
        shown={shown.length}
        total={events.length}
        noun="events"
        chips={
          <FacetChips
            chips={[
              ...seriesSel.map((k) => ({ key: `s:${k}`, label: seriesLabel(k), remove: () => setSeriesSel(seriesSel.filter((x) => x !== k)) })),
              ...producerSel.map((k) => ({ key: `p:${k}`, label: producerLabel(k), remove: () => setProducerSel(producerSel.filter((x) => x !== k)) })),
              ...standingSel.map((k) => ({ key: `t:${k}`, label: STANDING_LABEL[k as Standing], remove: () => setStandingSel(standingSel.filter((x) => x !== k)) })),
            ]}
            onClearAll={clearAll}
          />
        }
      />

      <section className="sheen rounded-2xl border bg-card">
        {/* Inferred-series nudge. The page guesses from the event's name; this
            is how a guess becomes a stored fact. */}
        {inferred.length ? (
          <div className="flex flex-wrap items-center gap-3 border-b bg-[var(--ops-soft)] px-4 py-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--ops)]" />
            <p className="min-w-0 flex-1 text-[13px]">
              <span className="font-medium">{inferred.length} event</span>
              {inferred.length === 1 ? " has" : "s have"} a series suggested from{" "}
              {inferred.length === 1 ? "its" : "their"} name. Confirm to save{" "}
              {inferred.length === 1 ? "it" : "them"}.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={acceptBusy}
              onClick={async () => {
                setAcceptBusy(true);
                await acceptInferredSeries(
                  inferred.map((e) => ({
                    opsEventId: e.opsEventId,
                    eventName: e.name,
                    series: e.series as string,
                  })),
                );
                setAcceptBusy(false);
                router.refresh();
              }}
            >
              {acceptBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Confirm all
            </Button>
          </div>
        ) : null}

        <ul className="divide-y">
          {shown.map((e) => (
            <EventRowItem
              key={e.opsEventId}
              event={e}
              scale={scale}
              currency={currency}
              canRecordDeals={canRecordDeals}
              onEdit={() => setEditing(e)}
            />
          ))}
          {shown.length === 0 ? (
            <li className="p-3">
              <EmptyState
                title="No events match these filters"
                description={`${events.length} events are in the ops panel; none carry every filter you have set.`}
                action={
                  <button type="button" onClick={clearAll} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent">
                    Clear filters
                  </button>
                }
              />
            </li>
          ) : null}
        </ul>

        {editing ? (
          <TargetDialog
            key={editing.opsEventId}
            event={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function SeriesChip({ series }: { series: SeriesId | null }) {
  if (!series) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="h-2 w-2 rounded-[3px] bg-muted-foreground/40" aria-hidden />
        Unassigned
      </span>
    );
  }
  const meta = SERIES_MAP[series];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className="h-2 w-2 shrink-0 rounded-[3px]"
        style={{ background: SERIES_COLOR[series] }}
        aria-hidden
      />
      <span className="truncate">{meta?.short ?? series}</span>
    </span>
  );
}

function EventRowItem({
  event,
  scale,
  currency,
  canRecordDeals,
  onEdit,
}: {
  event: EventRow;
  scale: number;
  currency: string;
  canRecordDeals: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Tagged with the event it belongs to, so expanding shows a spinner without
  // an effect having to clear prior state.
  const [loaded, setLoaded] = useState<{ id: number; rows: EventSponsorRow[] } | null>(null);
  const sponsors = loaded?.id === event.opsEventId ? loaded.rows : null;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !sponsors) {
      const rows = await fetchEventSponsors(event.opsEventId);
      setLoaded({ id: event.opsEventId, rows });
    }
  }

  const pct = event.progress != null ? Math.round(event.progress * 100) : null;
  const hit = (event.progress ?? 0) >= 1;

  return (
    <li>
      <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 transition-colors duration-[120ms] hover:bg-muted/30 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
        {/* Identity */}
        <div className="min-w-0">
          <button
            type="button"
            onClick={toggle}
            className="group flex w-full items-center gap-2 text-left"
            aria-expanded={open}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium group-hover:text-[var(--brand)]">
                {event.name}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                <SeriesChip series={event.series} />
                {event.location ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    {event.location}
                  </span>
                ) : null}
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[11px] text-muted-foreground",
                    isEventDateTbc({ event_date: event.date, date_tbc: event.dateTbc }) && "italic",
                  )}
                >
                  <CalendarDays className="h-3 w-3" />
                  {formatEventDate({ event_date: event.date, date_tbc: event.dateTbc })}
                </span>
                {event.producer ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <UserRound className="h-3 w-3" />
                    {event.producer}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {event.sponsorCount}
                </span>
              </span>
            </span>
          </button>
        </div>

        {/* Progress */}
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tabular text-sm font-semibold">
              {formatOpsMoney(event.actual, currency)}
            </span>
            <span className="tabular text-[11px] text-muted-foreground">
              {event.target ? `target ${formatOpsMoney(event.target, currency)}` : "no target"}
            </span>
          </div>
          <div className="mt-1.5">
            <EventBar
              actual={event.actual}
              target={event.target}
              scale={scale}
              currency={currency}
            />
          </div>
        </div>

        {/* Status + edit */}
        <div className="flex shrink-0 items-center gap-2 justify-self-end">
          {pct != null ? (
            <Badge
              className={cn(
                "border-transparent tabular",
                hit
                  ? "bg-[var(--success-soft)] text-[var(--success)]"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {hit ? <BadgeCheck className="h-3 w-3" /> : null}
              {pct}%
            </Badge>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label={`Set target for ${event.name}`}
            title="Set target"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t bg-muted/30 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="eyebrow">Sponsoring this event</p>
            {canRecordDeals ? (
              <RecordDealDialog trigger="inline" presetEventId={event.opsEventId} />
            ) : null}
          </div>
          {sponsors === null ? (
            <p className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading from the ops panel…
            </p>
          ) : sponsors.length === 0 ? (
            <p className="min-h-[40px] text-sm text-muted-foreground">
              No sponsor&apos;s money is allocated to this event in the tracker yet — record a deal against it and it appears here.
            </p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {sponsors.map((s) => (
                <li
                  key={s.deal_id}
                  className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-2"
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      s.paid ? "bg-[var(--success)]" : "bg-muted-foreground/40",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{s.company}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {s.paid ? "Paid" : "Awaiting payment"}
                      {s.package_label ? ` · ${s.package_label}` : ""}
                      {s.signed_by ? ` · signed by ${s.signed_by}` : ""}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-[13px] font-medium">
                    {formatOpsMoney(s.allocated_amount, s.currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </li>
  );
}

function TargetDialog({
  event,
  onClose,
  onSaved,
}: {
  event: EventRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(event.target != null ? String(event.target) : "");
  const [sponsorsTarget, setSponsorsTarget] = useState(
    event.targetSponsors != null ? String(event.targetSponsors) : "",
  );
  const [series, setSeries] = useState<string>(event.series ?? "");
  const [currency, setCurrency] = useState(event.targetCurrency || "GBP");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await saveEventTarget({
      opsEventId: event.opsEventId,
      eventName: event.name,
      series,
      targetAmount: amount,
      targetCurrency: currency,
      targetSponsors: sponsorsTarget,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not save");
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader
        icon={<Target className="h-4.5 w-4.5" />}
        title="Set target"
        description={`${event.name} · ${formatEventDate(
          { event_date: event.date, date_tbc: event.dateTbc },
          { long: true },
        )}`}
        onClose={onClose}
      />
      <form onSubmit={submit} className="contents">
        <ModalBody className="space-y-4">
          <div>
            <Label className="mb-1.5">Series</Label>
            <NativeSelect
              className="w-full"
              value={series}
              onChange={(e) => setSeries(e.target.value)}
            >
              <option value="">Unassigned</option>
              {SERIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </NativeSelect>
            {event.seriesInferred ? (
              <p className="mt-1.5 text-xs text-[var(--ops)]">
                Suggested from the event name — saving confirms it.
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div>
              <Label className="mb-1.5">Revenue target</Label>
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="120000"
                inputMode="numeric"
                autoFocus
              />
            </div>
            <div>
              <Label className="mb-1.5">Currency</Label>
              <NativeSelect
                className="w-[92px]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {["GBP", "USD", "EUR", "CHF"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          <div>
            <Label className="mb-1.5">Sponsor target (optional)</Label>
            <Input
              value={sponsorsTarget}
              onChange={(e) => setSponsorsTarget(e.target.value)}
              placeholder="12"
              inputMode="numeric"
            />
          </div>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Currently allocated: <span className="tabular font-medium">
              {formatOpsMoney(event.actual, event.targetCurrency)}
            </span>{" "}
            across {event.sponsorCount} sponsor{event.sponsorCount === 1 ? "" : "s"} in the ops
            panel.
          </p>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save target
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
