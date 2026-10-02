"use client";

import Link from "next/link";

// A route that failed to render: one line, try again, and the way back. The
// header and footer stay up, because the frame did not fail — the page did.
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="desk mx-auto flex min-h-[60vh] max-w-[1480px] flex-col items-center justify-center px-4 py-16 text-center md:px-6">
      <p className="wordmark text-[10px] text-brass">Error</p>
      <h1 className="display mt-2 text-[22px] leading-tight md:text-[26px]">This page could not be drawn.</h1>
      <div className="mt-5 flex items-center gap-1.5">
        <button type="button" onClick={reset} className="inline-flex h-8 items-center rounded-[4px] bg-foreground px-3 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90">
          Try again
        </button>
        <Link href="/database" className="inline-flex h-8 items-center rounded-[4px] border bg-card px-3 text-[12.5px] transition-colors hover:bg-accent">
          Back to the overview
        </Link>
      </div>
    </div>
  );
}
