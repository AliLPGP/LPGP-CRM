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

/** A provider's Form ADV clients as a desk ledger, selectable into lists and the pipeline. */
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

  const head = (label: string, k: Sort, className?: string) => (
    <th className={className}>
      <button type="button" onClick={() => setSort(k)} className={cn("inline-flex items-center gap-1 hover:text-foreground", sort === k && "text-foreground")}>
        {label}
        {sort === k ? <ArrowDownWideNarrow className="h-3 w-3" /> : null}
      </button>
    </th>
  );

  return (
    <>
      <div className="sheen rounded-[4px] border bg-card">
        <div className="desk-scroll">
          <table className="desk-table">
            <thead>
              <tr>
                <th className="w-8">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
                    className="h-3.5 w-3.5 accent-[var(--foreground)]"
                    aria-label="Select all"
                  />
                </th>
                {head("Manager", "name")}
                {head("Size", "aum", "num")}
                <th className="hidden md:table-cell">Engaged as</th>
                {head("Funds", "funds", "num")}
                <th className="hidden xl:table-cell">Funds filed, e.g.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const m = meta[r.id];
                const on = selected.has(r.id);
                return (
                  <tr key={r.id} className={cn("align-top", on && "bg-accent/40")}>
                    <td>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = new Set(selected);
                          if (on) next.delete(r.id);
                          else next.add(r.id);
                          setSelected(next);
                        }}
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--foreground)]"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td>
                      <div className="flex gap-2.5">
                        <CompanyLogo name={r.name} domain={r.domain} size={24} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link href={`/companies/${r.id}`} className="font-medium hover:underline">
                              {r.name}
                            </Link>
                            {r.category !== "GP" ? <CategoryBadge category={r.category} className="rounded-[3px] px-1.5 py-0 text-[10px]" /> : null}
                            {r.subType ? <span className="text-[11px] text-muted-foreground">{r.subType}</span> : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{locationLabel(r) ?? ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="num whitespace-nowrap" title={sizeTitle(r)}>
                      {sizeLabel(r)}
                    </td>
                    <td className="hidden text-muted-foreground md:table-cell">{m.roles.join(", ")}</td>
                    <td className="num whitespace-nowrap">{m.funds || "—"}</td>
                    <td className="hidden max-w-[320px] text-[11.5px] text-muted-foreground xl:table-cell">
                      <span className="line-clamp-2">{m.examples.join(" · ")}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {notice ? <p className="text-[12px] text-muted-foreground">{notice}</p> : null}
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
