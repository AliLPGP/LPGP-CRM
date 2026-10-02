"use client";

import { useState } from "react";
import { CalendarDays, Check, Loader2, Search } from "lucide-react";
import type { KnownEvent } from "@/lib/pipeline-conflicts";
import { formatEventDate } from "@/lib/event-date";
import { PRODUCERS } from "@/lib/events-catalogue";
import type { LeadEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Which events a lead is being pursued for. Multi-select chips, because a
 * sponsor is often pitched a multi-event package.
 *
 * When the tracker sends producers, chips sit under a small heading per
 * producer team (in the programme's order), with anything unassigned under
 * "Other". Without producers it's one flat list.
 *
 * `events` is null while loading and empty when the ops panel has none.
 */
export function EventPicker({
  events,
  value,
  onChange,
  disabled,
}: {
  events: KnownEvent[] | null;
  value: LeadEvent[];
  onChange: (next: LeadEvent[]) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const selected = new Set(value.map((e) => e.event_id));

  if (events === null) {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading events…
      </p>
    );
  }
  if (!events.length) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
        No events to choose from yet — they come from the ops panel.
      </p>
    );
  }

  const needle = filter.trim().toLowerCase();
  // Selected chips always show, even when the filter would hide them —
  // a choice must never vanish from view.
  const visible = events.filter(
    (e) =>
      selected.has(e.event_id) ||
      !needle ||
      e.event_name.toLowerCase().includes(needle) ||
      e.location.toLowerCase().includes(needle) ||
      e.producer.toLowerCase().includes(needle),
  );

  const groups = groupByProducer(visible);

  function toggle(e: KnownEvent) {
    if (disabled) return;
    if (selected.has(e.event_id)) onChange(value.filter((v) => v.event_id !== e.event_id));
    else onChange([...value, { event_id: e.event_id, event_name: e.event_name }]);
  }

  const chips = (rows: KnownEvent[]) =>
    rows.map((e) => {
      const on = selected.has(e.event_id);
      return (
        <button
          key={e.event_id}
          type="button"
          onClick={() => toggle(e)}
          disabled={disabled}
          aria-pressed={on}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors disabled:opacity-60",
            on
              ? "border-[var(--brand)] bg-[var(--accent)] text-[var(--accent-foreground)]"
              : "hover:border-foreground/25 hover:bg-accent/50",
          )}
        >
          {on ? (
            <Check className="h-3 w-3 shrink-0" />
          ) : (
            <CalendarDays className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-medium">{e.event_name}</span>
          <span className="shrink-0 text-muted-foreground">
            {e.location ? `· ${e.location} ` : ""}· {formatEventDate(e)}
          </span>
        </button>
      );
    });

  return (
    <div className="space-y-2">
      {events.length > 8 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter events…"
            className="h-8 w-full rounded-lg border bg-background pl-8 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          />
        </div>
      ) : null}

      <div className="max-h-56 space-y-2.5 overflow-y-auto pr-1">
        {groups === null ? (
          <div className="flex flex-wrap gap-1.5">{chips(visible)}</div>
        ) : (
          groups.map((g) => (
            <div key={g.producer}>
              <p className="eyebrow mb-1">{g.producer}</p>
              <div className="flex flex-wrap gap-1.5">{chips(g.events)}</div>
            </div>
          ))
        )}
        {visible.length === 0 ? (
          <p className="px-1 text-xs text-muted-foreground">No events match “{filter}”.</p>
        ) : null}
      </div>

      {value.length ? (
        <p className="text-[11px] text-muted-foreground">
          {value.length} event{value.length === 1 ? "" : "s"} selected
        </p>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Optional, but it&apos;s what lets the heads-up be per event.
        </p>
      )}
    </div>
  );
}

/**
 * Producer groups in programme order, then any producer the catalogue does
 * not know, then "Other" for unassigned events. Null when nothing carries a
 * producer, so the picker stays a flat list.
 */
function groupByProducer(
  rows: KnownEvent[],
): { producer: string; events: KnownEvent[] }[] | null {
  if (!rows.some((e) => e.producer)) return null;
  const known: string[] = [...PRODUCERS];
  const extra = [...new Set(rows.map((e) => e.producer).filter((p) => p && !known.includes(p)))];
  const order = [...known, ...extra.sort(), ""];
  return order
    .map((p) => ({
      producer: p || "Other",
      events: rows.filter((e) => e.producer === p),
    }))
    .filter((g) => g.events.length > 0);
}
