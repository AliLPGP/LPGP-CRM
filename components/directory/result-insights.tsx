"use client";

import { useMemo } from "react";
import { Stat, StatStrip } from "@/components/intel/ui";
import { summarize } from "@/lib/directory/insights";
import { formatUsd } from "@/lib/utils";
import type { ResultRow } from "./use-results";

const n = (v: number) => v.toLocaleString("en-US");

/**
 * What a result set adds up to — the strip of figures every desk screen
 * opens with, above the toolbar. Each figure says what it is counted from;
 * a figure these firms do not carry is "—", never a zero.
 */
export function ResultInsights({ rows }: { rows: ResultRow[] }) {
  const s = useMemo(() => summarize(rows.map((r) => r.record), 1), [rows]);
  if (!rows.length) return null;

  const books = (["GP", "LP", "SP", "UN"] as const).filter((b) => s.books[b] > 0).map((b) => `${n(s.books[b])} ${b}`);
  const lead = s.countries[0];

  return (
    <StatStrip>
      <Stat label="Firms" value={n(s.total)} basis={books.join(" · ")} />
      <Stat
        label="Regulatory AUM"
        value={s.raum.firms ? formatUsd(s.raum.sum) : "—"}
        basis={s.raum.firms ? `Form ADV · ${n(s.raum.firms)} filers, a brand's total once` : "No Form ADV figure among these"}
        defn="Regulatory assets under management as filed on Form ADV, summed only across the firms that file one. A brand filing one total for several entities is counted once."
      />
      <Stat label="Key contacts" value={s.people ? n(s.people) : "—"} basis={s.people ? `${n(s.connectable)} with a direct email` : "None on file for these firms"} />
      <Stat label="Funds on file" value={s.funds ? n(s.funds) : "—"} basis={s.funds ? "Named on Form ADV Schedule D, or researched" : "None named by these firms"} />
      <Stat label="Countries" value={s.countries.length ? n(s.countries.length) : "—"} basis={lead ? `${lead.key} leads with ${n(lead.count)}` : "No headquarters on file"} />
      <Stat
        label="Provider links"
        value={s.providerLinks ? n(s.providerLinks) : "—"}
        basis={s.providerLinks ? `${n(s.filers)} managers name a provider` : "No Form ADV providers among these"}
        defn="Service providers (auditor, administrator, custodian, prime broker, placement agent) named on Form ADV Schedule D by these managers."
      />
    </StatStrip>
  );
}
