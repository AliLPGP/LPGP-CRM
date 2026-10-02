"use client";

import { useCallback, useSyncExternalStore } from "react";

// A media query as a value: read through an external-store subscription, so
// the server render (which has no viewport) and the first client render agree
// on `false`, and a rotation or a resize re-renders only what reads it. Never
// an effect that sets state — the answer is derived from the browser.

/** The phone breakpoint, the same line Tailwind's `max-md:` draws. */
export const PHONE = "(max-width: 767px)";

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Under 768px: the one question most of the mobile layout asks. */
export function usePhone(): boolean {
  return useMediaQuery(PHONE);
}
