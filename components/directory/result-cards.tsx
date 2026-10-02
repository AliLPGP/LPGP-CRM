"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Eye, Mail, MapPin, Sparkles, Users } from "lucide-react";
import { CategoryBadge } from "@/components/category-badge";
import { CompanyLogo } from "@/components/company-logo";
import { Tag } from "@/components/intel/ui";
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

/** The one "show more" button every desk list ends with. */
const MORE = "rounded-[4px] border bg-card px-2.5 py-1 text-[12px] hover:bg-accent max-md:min-h-10";

/** A quiet icon button in a card's corner; shown on hover, always reachable by keyboard. */
const ICON = "grid h-6 w-6 place-items-center rounded-[3px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100";

function Figure({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0" title={title}>
      <p className="desk-label">{label}</p>
      <p className="figure mt-0.5 truncate text-[13px]">{value}</p>
    </div>
  );
}

/**
 * Results as cards: the overview beside the numbers, for reading a short
 * list rather than scanning a long one. The firm's name opens the profile;
 * the corner buttons select it, peek at it or find more like it.
 */
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
    <div className="space-y-3">
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
              className={cn("sheen group relative flex flex-col rounded-[4px] border bg-card p-3 transition-colors", on ? "border-foreground/60 bg-accent/30" : "hover:border-foreground/30")}
            >
              <div className="flex items-start gap-2.5">
                <CompanyLogo name={r.name} domain={r.domain} size={32} />
                <div className="min-w-0 flex-1">
                  <Link href={`/companies/${r.id}`} className="line-clamp-1 text-[13px] font-medium hover:underline">
                    {r.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11.5px] text-muted-foreground">
                    <CategoryBadge category={r.category} className="rounded-[3px] px-1.5 py-0 text-[10.5px]" />
                    {r.subType ? <span className="truncate">{r.subType}</span> : null}
                    {showType ? <span className="truncate">· {showType}</span> : null}
                    {strategy ? <Tag>{strategy}</Tag> : null}
                  </div>
                </div>
                <span className="flex shrink-0 items-center gap-0.5">
                  <button type="button" onClick={() => onQuickLook(r.id)} className={ICON} title="Quick look" aria-label={`Quick look at ${r.name}`}>
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onSimilar(r.id)} className={ICON} title="Find similar firms" aria-label={`Find firms similar to ${r.name}`}>
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggle(r.id)}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-[3px] border transition-colors",
                      on ? "border-foreground bg-foreground text-background" : "border-input bg-card text-transparent hover:text-muted-foreground",
                    )}
                    aria-label={on ? `Deselect ${r.name}` : `Select ${r.name}`}
                    aria-pressed={on}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>

              {mode === "similar" && reasons.length ? (
                <ul className="mt-2.5 space-y-0.5 text-[12px] text-muted-foreground">
                  {reasons.slice(0, 3).map((x) => (
                    <li key={x} className="flex gap-1.5">
                      <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-[var(--brass)]" />
                      <span className="line-clamp-1">{x}</span>
                    </li>
                  ))}
                </ul>
              ) : blurb ? (
                <p className="mt-2.5 line-clamp-2 text-[12.5px] leading-snug text-muted-foreground" title={text ?? undefined}>
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
                <p className="mt-2.5 text-[12.5px] text-muted-foreground">No overview on file.</p>
              )}

              <div className="mt-auto pt-3">
                <div className="grid grid-cols-4 gap-2 border-t pt-2.5">
                  <Figure label="Size" value={sizeLabel(r)} title={sizeTitle(r)} />
                  <Figure label="Team" value={headcountLabel(r.employees)} />
                  <Figure label="Est." value={r.founded ?? "—"} />
                  <Figure
                    label={mode === "all" ? "People" : mode === "similar" ? "Match" : "Fit"}
                    value={
                      mode === "all" ? (
                        <span className="inline-flex items-center gap-1">
                          {r.connectable ? <Mail className="h-3 w-3 text-[var(--success)]" /> : r.contacts ? <Users className="h-3 w-3" /> : null}
                          {r.contacts || "—"}
                        </span>
                      ) : (
                        (score ?? "—")
                      )
                    }
                    title={mode === "all" && r.connectable ? `${r.connectable} with a direct email on file` : undefined}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
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
                        <CompanyLogo name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={18} />
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        <span>
          Showing {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")}
        </span>
        {rows.length > shown ? (
          <button type="button" onClick={() => setShown(shown + PAGE)} className={cn(MORE, "text-foreground")}>
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
