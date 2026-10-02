"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { usePhone } from "@/components/use-media-query";
import { cn } from "@/lib/utils";

// A facet as a data product shows it: one button per dimension across the
// top of a table, opening a searchable checklist with a count beside every
// value, grouped when the dimension has a hierarchy. Multi-select; the button
// says how many are ticked. Pure UI: the page owns the values and the counts.
//
// On a phone the checklist is a bottom sheet instead of a dropdown: full
// width, at most 70vh, over a backdrop, with a big Done. It is portaled to
// the body so no panel's stacking context can trap it under the ledger.

export type FacetOption = { key: string; label: string; count: number };
export type FacetGroup = { label: string; options: FacetOption[] };

/** The sheet's own Done: full width and a thumb tall; the dropdown's is the 12px button. */
const DONE = "rounded-[4px] bg-primary px-3 py-1 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover max-md:h-11 max-md:flex-1 max-md:text-[14px]";
const CLEAR = "rounded-[4px] px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground max-md:h-11 max-md:px-3 max-md:text-[13px]";

export function FacetMenu({
  label,
  groups,
  selected,
  onChange,
  width = 280,
  searchable = true,
}: {
  label: string;
  /** One group with no label for a flat list. */
  groups: FacetGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: number;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  const total = groups.reduce((n, g) => n + g.options.length, 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // The sheet is portaled, so it is outside the button's subtree in the DOM.
      if (ref.current?.contains(t) || sheetRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // A sheet holds the page behind it still, as the header's drawer does.
  useEffect(() => {
    if (!open || !phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, phone]);

  if (!total) return null;
  const needle = q.trim().toLowerCase();
  const on = selected.length > 0;
  const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  // The checklist, the same in the dropdown and the sheet.
  const panel = (
    <>
      {searchable && total > 8 ? (
        <div className="relative border-b p-2">
          <Search className="absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            // On a phone the keyboard would hide half the sheet before a value is read.
            autoFocus={!phone}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            className="h-8 w-full rounded-[4px] border border-input bg-background pl-7 pr-2 text-[12.5px] outline-none focus-visible:border-ring"
          />
        </div>
      ) : null}
      <div className="max-h-72 overflow-y-auto p-1.5 max-md:max-h-none max-md:min-h-0 max-md:flex-1">
        {groups.map((g, gi) => {
          const opts = needle ? g.options.filter((o) => o.label.toLowerCase().includes(needle)) : g.options;
          if (!opts.length) return null;
          return (
            <div key={g.label || gi} className={cn(gi > 0 && "mt-1.5 border-t pt-1.5")}>
              {g.label ? <p className="desk-label px-2 pb-1 pt-1">{g.label}</p> : null}
              {opts.map((o) => {
                const checked = selected.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(o.key)}
                    className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1 text-left text-[12.5px] hover:bg-accent max-md:min-h-10 max-md:text-[14px]"
                  >
                    <span className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[3px] border max-md:h-4 max-md:w-4", checked ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
                      {checked ? <Check className="h-2.5 w-2.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    <span className="figure text-[11px] text-muted-foreground">{o.count.toLocaleString("en-US")}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-2 py-1.5 max-md:px-3 max-md:py-2">
        <button type="button" onClick={() => onChange([])} className={CLEAR}>
          Clear
        </button>
        <button type="button" onClick={() => setOpen(false)} className={DONE}>
          Done
        </button>
      </div>
    </>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] transition-colors hover:bg-accent",
          on ? "border-foreground/60 text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {on ? <span className="figure rounded-[3px] bg-primary px-1 text-[10.5px] leading-4 text-primary-foreground">{selected.length}</span> : null}
        <ChevronDown className={cn("h-3 w-3 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        phone ? (
          createPortal(
            <>
              <button type="button" className="facet-backdrop" aria-label="Close" onClick={() => setOpen(false)} />
              <div ref={sheetRef} className="facet-sheet desk" role="listbox" aria-label={label}>
                <span className="facet-handle" aria-hidden />
                <p className="px-3 pb-1.5 pt-1 text-[14px] font-medium">{label}</p>
                {panel}
              </div>
            </>,
            document.body,
          )
        ) : (
          <div className="absolute left-0 top-[calc(100%+4px)] z-40 rounded-[4px] border bg-popover text-popover-foreground shadow-[var(--shadow-pop)]" style={{ width }} role="listbox" aria-label={label}>
            {panel}
          </div>
        )
      ) : null}
    </div>
  );
}

/** The selections across every facet, as removable chips under the bar. */
export function FacetChips({ chips, onClearAll }: { chips: { key: string; label: string; remove: () => void }[]; onClearAll: () => void }) {
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 rounded-[4px] border bg-card py-0.5 pl-2 pr-1 max-md:py-1.5">
          {c.label}
          <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`} className="rounded p-0.5 text-muted-foreground hover:text-foreground max-md:p-1.5">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <button type="button" onClick={onClearAll} className="px-1 text-muted-foreground hover:text-foreground max-md:min-h-9">
        Clear all
      </button>
    </div>
  );
}
