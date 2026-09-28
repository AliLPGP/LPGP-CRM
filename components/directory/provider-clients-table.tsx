"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow } from "lucide-react";
import { locationLabel, unpackIndex, type PackedIndex } from "@/lib/directory/records";
import { sizeLabel, sizeTitle } from "@/lib/directory/format";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { cn } from "@/lib/utils";
import { BulkBar, type ListOption } from "./bulk-bar";

export type ClientMeta = { roles: string[]; funds: number; examples: string[] };

type Sort = "funds" | "aum" | "name";

/** A provider's Form ADV clients, selectable into lists and the pipeline. */
export function ProviderClientsTable({
  packed,
  meta,
  lists,
  isAdmin,
  signedIn,
}: {
  packed: PackedIndex;
  meta: Record<string, ClientMeta>;
  lists: ListOption[];
  isAdmin: boolean;
  signedIn: boolean;
}) {
  const index = useMemo(() => unpackIndex(packed), [packed]);
  const [sort, setSort] = useState<Sort>("funds");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list = index.records.filter((r) => meta[r.id]);
    const by: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      funds: (a, b) => meta[b.id].funds - meta[a.id].funds || (b.aum ?? 0) - (a.aum ?? 0),
      aum: (a, b) => (b.aum ?? -1) - (a.aum ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return list.sort(by[sort]);
  }, [index, meta, sort]);
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const head = (label: string, k: Sort, align: "left" | "right" = "left", className?: string) => (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button type="button" onClick={() => setSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === k && "text-foreground")}>
        {label}
        {sort === k ? <ArrowDownWideNarrow className="h-3 w-3" /> : null}
      </button>
    </th>
  );

  return (
    <>
      <div className="sheen overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="h-4 w-4 accent-[var(--primary)]"
                    aria-label="Select all"
                  />
                </th>
                {head("Manager", "name")}
                {head("Size", "aum", "right")}
                <th className="hidden px-3 py-2.5 text-left font-medium md:table-cell">Engaged as</th>
                {head("Funds", "funds", "right")}
                <th className="hidden px-5 py-2.5 text-left font-medium xl:table-cell">Funds filed, e.g.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = meta[r.id];
                const on = selected.has(r.id);
                return (
                  <tr key={r.id} className={cn("border-t align-top hover:bg-muted/30", on && "bg-accent/40")}>
                    <td className="py-3 pl-4 pr-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = new Set(selected);
                          if (on) next.delete(r.id);
                          else next.add(r.id);
                          setSelected(next);
                        }}
                        className="mt-1 h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-3">
                        <CompanyLogo name={r.name} domain={r.domain} size={30} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/companies/${r.id}`} className="font-semibold hover:text-primary">
                              {r.name}
                            </Link>
                            {r.category !== "GP" ? <CategoryBadge category={r.category} /> : null}
                            {r.subType ? <span className="text-xs text-muted-foreground">{r.subType}</span> : null}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{locationLabel(r) ?? ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular" title={sizeTitle(r)}>
                      {sizeLabel(r)}
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{m.roles.join(", ")}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular">{m.funds || "—"}</td>
                    <td className="hidden max-w-[320px] px-5 py-3 text-xs text-muted-foreground xl:table-cell">
                      <span className="line-clamp-2">{m.examples.join(" · ")}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <BulkBar
        selected={selected}
        records={index.records}
        lists={lists}
        isAdmin={isAdmin}
        signedIn={signedIn}
        onClear={() => setSelected(new Set())}
        onSimilar={(ids) => {
          window.location.href = `/database?like=${ids.join(",")}`;
        }}
        onNotice={setNotice}
      />
    </>
  );
}
