"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Mail, MapPin, Sparkles, Users } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { brandDomain } from "@/lib/directory/brand-domains";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel, providerPairs } from "@/lib/directory/records";
import { highlight, snippet } from "@/lib/directory/search";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { typeNameOf } from "@/lib/directory/taxonomy";
import { cn } from "@/lib/utils";
import type { Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

const PAGE = 48;

/** Results as cards: logos, the overview and the numbers side by side. */
export function ResultCards({
  dir,
  rows,
  query,
  mode,
  selected,
  onToggle,
  onQuickLook,
  onSimilar,
}: {
  dir: Directory;
  rows: ResultRow[];
  query: string;
  mode: "all" | "keywords" | "similar";
  selected: Set<string>;
  onToggle: (id: string) => void;
  onQuickLook: (id: string) => void;
  onSimilar: (id: string) => void;
}) {
  const [shown, setShown] = useState(PAGE);
  const visible = rows.slice(0, shown);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {visible.map(({ record: r, score, reasons }) => {
          const on = selected.has(r.id);
          const text = r.description ?? r.lines;
          const blurb = mode === "keywords" ? snippet(text, query, 220) : text?.slice(0, 220);
          const brands = [...new Set(providerPairs(r).map((p) => p.brand))].slice(0, 5).map((i) => dir.brands[i]);
          const place = locationLabel(r);
          // The classified type, unless it only repeats the sub-type line above it.
          const typeName = typeNameOf(r.category, r.typeCode);
          const showType = typeName && typeName.toLowerCase() !== (r.subType ?? "").toLowerCase() ? typeName : null;
          const strategy = r.strategies.length ? (STRATEGY_BY_KEY[r.strategies[0]]?.name ?? null) : null;
          return (
            <article
              key={r.id}
              className={cn(
                "sheen group relative flex cursor-pointer flex-col rounded-2xl border bg-card p-4 transition-colors hover:border-[var(--brass)]/45",
                on && "border-[var(--brass)]/70 bg-accent/30",
              )}
              onClick={() => onQuickLook(r.id)}
            >
              <div className="flex items-start gap-3">
                <CompanyLogo name={r.name} domain={r.domain} size={44} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/companies/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="line-clamp-1 font-semibold hover:underline"
                  >
                    {r.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                    <CategoryBadge category={r.category} />
                    {r.subType ? <span className="truncate">{r.subType}</span> : null}
                  </div>
                  {showType || strategy ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      {showType ? <span className="truncate">{showType}</span> : null}
                      {strategy ? <span className="tag">{strategy}</span> : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(r.id);
                  }}
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-md border transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "bg-card text-transparent group-hover:text-muted-foreground",
                  )}
                  aria-label={on ? `Deselect ${r.name}` : `Select ${r.name}`}
                  aria-pressed={on}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>

              {mode === "similar" && reasons.length ? (
                <ul className="mt-3 space-y-0.5 text-[12px] text-muted-foreground">
                  {reasons.slice(0, 3).map((x) => (
                    <li key={x} className="flex gap-1.5">
                      <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />
                      <span className="line-clamp-1">{x}</span>
                    </li>
                  ))}
                </ul>
              ) : blurb ? (
                <p className="mt-3 line-clamp-3 text-[12.5px] leading-relaxed text-muted-foreground">
                  {mode === "keywords"
                    ? highlight(blurb, query).map((p, i) =>
                        p.hit ? (
                          <mark key={i} className="rounded-sm bg-[var(--accent)] px-0.5 text-foreground">
                            {p.text}
                          </mark>
                        ) : (
                          <span key={i}>{p.text}</span>
                        ),
                      )
                    : blurb}
                </p>
              ) : (
                <p className="mt-3 text-[12.5px] text-muted-foreground/70">No overview on file.</p>
              )}

              <div className="mt-auto pt-4">
                <div className="grid grid-cols-4 gap-2 border-t pt-3">
                  <div title={sizeTitle(r)}>
                    <p className="eyebrow text-[9.5px]">Size</p>
                    <p className="figure mt-0.5 text-[13px]">{sizeLabel(r)}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[9.5px]">Team</p>
                    <p className="figure mt-0.5 text-[13px]">{headcountLabel(r.employees)}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[9.5px]">Est.</p>
                    <p className="figure mt-0.5 text-[13px]">{r.founded ?? "—"}</p>
                  </div>
                  <div>
                    <p className="eyebrow text-[9.5px]">{mode === "all" ? "People" : mode === "similar" ? "Match" : "Fit"}</p>
                    <p className="figure mt-0.5 flex items-center gap-1 text-[13px]">
                      {mode === "all" ? (
                        <>
                          {r.connectable ? <Mail className="h-3 w-3 text-[var(--success)]" /> : r.contacts ? <Users className="h-3 w-3" /> : null}
                          {r.contacts || "—"}
                        </>
                      ) : (
                        (score ?? "—")
                      )}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1 truncate text-[11.5px] text-muted-foreground">
                    {place ? (
                      <>
                        <MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{place}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {brands.map((b) => (
                      <span key={b.key} title={b.name}>
                        <CompanyLogo
                          name={b.name}
                          domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)}
                          size={20}
                        />
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSimilar(r.id);
                      }}
                      className="ml-1 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      title="Find similar firms"
                      aria-label={`Find firms similar to ${r.name}`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
        {rows.length > shown ? (
          <button
            type="button"
            onClick={() => setShown(shown + PAGE)}
            className="rounded-md border bg-card px-3 py-1.5 text-foreground hover:bg-accent"
          >
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
