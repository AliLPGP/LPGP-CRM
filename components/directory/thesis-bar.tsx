"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
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
 * an earlier search puts that search's words back in the box.
 */
export function ThesisBar({
  initial,
  onSubmit,
  pending = false,
  aiReady = false,
}: {
  initial: string;
  onSubmit: (text: string) => void;
  pending?: boolean;
  aiReady?: boolean;
}) {
  const [text, setText] = useState(initial);

  return (
    <div className="space-y-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(text);
        }}
        className="sheen group relative flex items-center gap-2 rounded-2xl border bg-card p-2 pl-4 transition-shadow focus-within:border-[var(--brass)]/60 focus-within:shadow-[var(--shadow-pop)]"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-[var(--brass)]" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the firms you're after — “mid-market private credit managers in London using Alter Domus”"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80"
          aria-label="Thesis search"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText("");
              onSubmit("");
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Search
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>
      {/* One scrolling line on a phone; wraps on anything wider. */}
      <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 text-[12.5px] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        <span className="shrink-0 text-muted-foreground">
          {aiReady ? "Plain English works — try" : "Try"}
        </span>
        {EXAMPLE_THESES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setText(t);
              onSubmit(t);
            }}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-full border bg-card px-2.5 py-1 text-muted-foreground transition-colors",
              "hover:border-[var(--brass)]/50 hover:text-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
