"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDownWideNarrow, Mail, Sparkles, Users } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import type { SortKey } from "@/lib/directory/filters";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel } from "@/lib/directory/records";
import { highlight, snippet } from "@/lib/directory/search";
import { cn } from "@/lib/utils";
import type { ResultRow } from "./use-results";

const PAGE = 50;

function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-[var(--accent)] px-0.5 text-foreground">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function SortHead({
  label,
  k,
  sort,
  onSort,
  align = "left",
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const on = sort === k;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" ? "text-right" : "text-left", className)}>
      <button
        type="button"
        onClick={() => onSort(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", on && "text-foreground")}
      >
        {label}
        {on ? <ArrowDownWideNarrow className="h-3 w-3" /> : null}
      </button>
    </th>
  );
}

/**
 * Discover's results. Shows fifty at a time; it's keyed by the query upstream,
 * so a new search starts back at the first fifty.
 */
export function ResultsTable({
  rows,
  sort,
  onSort,
  query,
  mode,
  selected,
  onToggle,
  onToggleMany,
  onSimilar,
  empty,
}: {
  rows: ResultRow[];
  sort: SortKey;
  onSort: (k: SortKey) => void;
  query: string;
  mode: "all" | "keywords" | "similar";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[], on: boolean) => void;
  onSimilar: (id: string) => void;
  empty: React.ReactNode;
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);
  const allOn = visible.length > 0 && visible.every((r) => selected.has(r.record.id));

  if (rows.length === 0) {
    return <div className="sheen rounded-2xl border bg-card px-6 py-14 text-center">{empty}</div>;
  }

  return (
    <div className="space-y-3">
      <div className="sheen overflow-hidden rounded-2xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="w-10 py-2.5 pl-4 pr-1">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => onToggleMany(visible.map((r) => r.record.id), !allOn)}
                    className="h-4 w-4 accent-[var(--primary)]"
                    aria-label="Select all shown"
                  />
                </th>
                <SortHead label="Firm" k="name" sort={sort} onSort={onSort} className="min-w-[300px]" />
                <SortHead label="Size" k="aum" sort={sort} onSort={onSort} align="right" />
                <SortHead label="Team" k="employees" sort={sort} onSort={onSort} align="right" className="hidden md:table-cell" />
                <SortHead label="People" k="contacts" sort={sort} onSort={onSort} align="right" className="hidden md:table-cell" />
                {mode !== "all" ? (
                  <SortHead
                    label={mode === "similar" ? "Match" : "Fit"}
                    k={mode === "similar" ? "similarity" : "relevance"}
                    sort={sort}
                    onSort={onSort}
                    align="right"
                  />
                ) : null}
                <th className="w-10 pr-4" />
              </tr>
            </thead>
            <tbody>
              {visible.map(({ record: r, score, reasons }) => {
                const on = selected.has(r.id);
                const meta = [locationLabel(r), r.founded ? `Est. ${r.founded}` : null].filter(Boolean) as string[];
                const blurb =
                  mode === "keywords"
                    ? snippet(r.description ?? r.lines, query, 170)
                    : (r.description ?? r.lines)?.slice(0, 170);
                return (
                  <tr
                    key={r.id}
                    className={cn("group border-t align-top transition-colors hover:bg-muted/30", on && "bg-accent/40")}
                  >
                    <td className="py-3 pl-4 pr-1">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(r.id)}
                        className="mt-1 h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Select ${r.name}`}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-3">
                        <CompanyLogo name={r.name} domain={r.domain} size={36} />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <Link href={`/companies/${r.id}`} className="font-semibold hover:text-primary">
                              {r.name}
                            </Link>
                            <CategoryBadge category={r.category} />
                            {r.subType ? <span className="text-xs text-muted-foreground">{r.subType}</span> : null}
                            {r.adv ? (
                              <span
                                className="rounded border px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                                title={r.adv === "ERA" ? "Exempt reporting adviser (Form ADV)" : "SEC-registered adviser (Form ADV)"}
                              >
                                {r.adv === "ERA" ? "ERA" : "RIA"}
                              </span>
                            ) : null}
                          </div>
                          {mode === "similar" && reasons.length ? (
                            <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted-foreground">
                              {reasons.map((x) => (
                                <li key={x} className="flex gap-1.5">
                                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />
                                  <span className="line-clamp-1">{x}</span>
                                </li>
                              ))}
                            </ul>
                          ) : blurb ? (
                            <p className="mt-0.5 line-clamp-2 max-w-[62ch] text-[12.5px] leading-snug text-muted-foreground">
                              {mode === "keywords" ? <Highlighted text={blurb} query={query} /> : blurb}
                            </p>
                          ) : null}
                          {meta.length ? (
                            <p className="mt-1 text-xs text-muted-foreground">{meta.join(" · ")}</p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular" title={sizeTitle(r)}>
                      {sizeLabel(r)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right tabular text-muted-foreground md:table-cell">
                      {headcountLabel(r.employees)}
                    </td>
                    <td className="hidden whitespace-nowrap px-3 py-3 text-right md:table-cell">
                      {r.contacts ? (
                        <span className="inline-flex items-center gap-1 tabular text-muted-foreground" title={r.connectable ? `${r.connectable} with a direct email on file` : undefined}>
                          {r.connectable ? <Mail className="h-3 w-3 text-[var(--success)]" /> : <Users className="h-3 w-3" />}
                          {r.contacts}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    {mode !== "all" ? (
                      <td className="px-3 py-3 text-right">
                        {score != null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--chart-track)]">
                              <span className="block h-full rounded-full bg-[var(--chart-bar)]" style={{ width: `${score}%` }} />
                            </span>
                            <span className="tabular text-xs text-muted-foreground">{score}</span>
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                    <td className="py-3 pr-4 text-right">
                      <button
                        type="button"
                        onClick={() => onSimilar(r.id)}
                        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                        title="Find similar firms"
                        aria-label={`Find firms similar to ${r.name}`}
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
        <div className="flex gap-2">
          {rows.length > shown ? (
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="rounded-md border bg-card px-3 py-1.5 text-foreground hover:bg-accent"
            >
              Show {Math.min(PAGE, rows.length - shown)} more
            </button>
          ) : null}
          {rows.length > shown + PAGE ? (
            <button
              type="button"
              onClick={() => setShown(rows.length)}
              className="rounded-md px-3 py-1.5 hover:bg-accent hover:text-foreground"
            >
              Show all
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
