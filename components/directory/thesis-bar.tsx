"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export const EXAMPLE_THESES = [
  "Private credit managers in London with $1bn+ AUM",
  "US public pensions that disclose commitments",
  "Fund administrators serving venture firms",
  "Growth equity firms audited by KPMG",
  "Healthcare private equity in New York",
  "Sovereign wealth funds in the Middle East",
];

/**
 * The thesis box. Mounted with a key of the query it shows, so going back to
 * an earlier search puts that search's words back in the box. On the home
 * stand it is the big input with the examples under it; in the results
 * toolbar (`compact`) it is the one search box every list screen starts with.
 */
export function ThesisBar({
  initial,
  onSubmit,
  pending = false,
  aiReady = false,
  examples = true,
  compact = false,
}: {
  initial: string;
  onSubmit: (text: string) => void;
  pending?: boolean;
  aiReady?: boolean;
  /** The example searches under the box; the home page shows them. */
  examples?: boolean;
  /** The toolbar form: one line, 32px, no examples. */
  compact?: boolean;
}) {
  const [text, setText] = useState(initial);

  if (compact) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text);
        }}
        className="relative min-w-[220px] flex-1"
        role="search"
      >
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search firms in a sentence — “private credit in London using Alter Domus”"
          className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-[76px] text-[12.5px] outline-none focus-visible:border-ring"
          aria-label="Thesis search"
        />
        <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
          {text ? (
            <button
              type="button"
              onClick={() => {
                setText("");
                onSubmit("");
              }}
              className="grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button type="submit" className="inline-flex h-6 items-center gap-1 rounded-[3px] bg-primary px-2 text-[11.5px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover">
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Search
          </button>
        </span>
      </form>
    );
  }

  return (
    <div className="space-y-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text);
        }}
        className="sheen flex items-center gap-2 rounded-[4px] border bg-card p-1.5 pl-3 transition-colors focus-within:border-primary"
        role="search"
      >
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--brass)]" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the firms you're after — “mid-market private credit managers in London using Alter Domus”"
          className="h-9 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/80"
          aria-label="Thesis search"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              onSubmit("");
            }}
            className="grid h-8 w-8 place-items-center rounded-[4px] text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button type="submit" className="inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Search
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      {/* One scrolling line on a phone; wraps on anything wider. */}
      {examples ? (
        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 text-[12px] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <span className="shrink-0 text-muted-foreground">{aiReady ? "Plain English works — try" : "Try"}</span>
          {EXAMPLE_THESES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setText(t);
                onSubmit(t);
              }}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-[4px] border bg-card px-2 py-0.5 text-muted-foreground transition-colors",
                "hover:border-primary/60 hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
