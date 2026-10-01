"use client";

import { useEffect, useState } from "react";

export type CompanyOption = { id: string; name: string; category: string };

/**
 * Directory firms matching what is typed, fetched as the person types. The
 * answer carries the query it belongs to, so a slow reply never lands on a
 * newer entry. Rows from the previous query stay until the next arrive, which
 * keeps a picker from flickering empty between keystrokes.
 */
export function useCompanyOptions(query: string, enabled = true): CompanyOption[] {
  const q = query.trim();
  const [answer, setAnswer] = useState<{ q: string; rows: CompanyOption[] } | null>(null);

  useEffect(() => {
    if (!enabled || q.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/lookup?q=${encodeURIComponent(q)}`);
        const json = (await res.json()) as { companies?: CompanyOption[] };
        if (live) setAnswer({ q, rows: json.companies ?? [] });
      } catch {
        /* the field still works as free text */
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, enabled]);

  return answer?.rows ?? [];
}
