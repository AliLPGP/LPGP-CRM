"use client";

import { useEffect, useState } from "react";
import type { PackedFundUniverse } from "@/lib/directory/fund-universe";
import { FundUniverse } from "./fund-universe";

/**
 * The Funds page paints with the best-documented few thousand funds and
 * pulls the rest in the background, so a universe of tens of thousands never
 * holds up the first view. The browser keeps the result cached for the
 * session; the API route caches it at the edge.
 */
export function FundUniverseLoader({ initial, total }: { initial: PackedFundUniverse; total: number }) {
  const [full, setFull] = useState<PackedFundUniverse | null>(null);
  const partial = full == null && initial.funds.length < total;

  useEffect(() => {
    if (initial.funds.length >= total) return;
    const ctl = new AbortController();
    fetch("/api/directory/funds", { signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<PackedFundUniverse>) : null))
      .then((d) => {
        if (d && d.funds.length > initial.funds.length) setFull(d);
      })
      .catch(() => {});
    return () => ctl.abort();
  }, [initial.funds.length, total]);

  return (
    <div className="space-y-2">
      {partial ? (
        <p className="text-[11.5px] text-muted-foreground">
          Showing the {initial.funds.length.toLocaleString("en-US")} best-documented funds while the other {(total - initial.funds.length).toLocaleString("en-US")} load.
        </p>
      ) : null}
      <FundUniverse data={full ?? initial} />
    </div>
  );
}
