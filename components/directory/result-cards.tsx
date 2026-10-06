"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Eye, Layers, Mail, MapPin, Sparkles, Users } from "lucide-react";
import { CompanyLogo } from "@/components/company-logo";
import { CATEGORIES } from "@/lib/categories";
import { brandDomain } from "@/lib/directory/brand-domains";
import { headcountLabel, sizeLabel, sizeTitle } from "@/lib/directory/format";
import { locationLabel, providerPairs } from "@/lib/directory/records";
import { highlight, snippet } from "@/lib/directory/search";
import { STRATEGY_BY_KEY } from "@/lib/directory/strategies";
import { typeNameOf } from "@/lib/directory/taxonomy";
import { cn } from "@/lib/utils";
import type { Directory } from "./use-directory";
import type { ResultRow } from "./use-results";

const PAGE = 40;

/** A quiet icon button on a row; shown on hover, always reachable by keyboard. */
const ICON = "relative z-[1] grid h-8 w-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100";

/**
 * Search results as a list a reader takes in at a glance: each firm a row
 * with its mark, its name and what it is, one line of what it does, where it
 * is and what it holds, and its size on the right. The row opens the firm's
 * story; select, quick look and "more like this" sit on the row's edge.
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
    <div className="story space-y-4">
      <ol className="story-card story-rows overflow-hidden">
        {visible.map(({ record: r, score, reasons }) => {
          const on = selected.has(r.id);
          const text = r.description ?? r.lines;
          const blurb = mode === "keywords" ? snippet(text, query, 180) : text?.slice(0, 180);
          const brands = [...new Set(providerPairs(r).map((p) => p.brand))].slice(0, 4).map((i) => dir.brands[i]);
          const place = locationLabel(r);
          const typeName = typeNameOf(r.category, r.typeCode);
          const type = r.subType ?? typeName ?? CATEGORIES[r.category]?.name ?? r.category;
          const strategy = r.strategies.length ? (STRATEGY_BY_KEY[r.strategies[0]]?.name ?? null) : null;
          const size = sizeLabel(r);
          return (
            <li key={r.id} className={cn("group relative transition-colors", on ? "bg-[var(--primary-soft)]" : "hover:bg-[color-mix(in_oklab,var(--primary-soft)_55%,transparent)]")}>
              <div className="flex items-center gap-3.5 px-4 py-3.5 md:gap-4">
                <button
                  type="button"
                  onClick={() => onToggle(r.id)}
                  className={cn(
                    "relative z-[1] grid h-5 w-5 shrink-0 place-items-center rounded-[6px] border transition-colors max-md:hidden",
                    on ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-input text-transparent hover:text-muted-foreground",
                  )}
                  aria-label={on ? `Deselect ${r.name}` : `Select ${r.name}`}
                  aria-pressed={on}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <span className="story-logo shrink-0" style={{ borderRadius: 12 }}>
                  <CompanyLogo name={r.name} domain={r.domain} size={44} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Link href={`/companies/${r.id}`} className="truncate text-[15px] font-semibold tracking-[-0.01em] after:absolute after:inset-0 after:content-['']">
                      {r.name}
                    </Link>
                    <span className="truncate text-[12.5px] text-muted-foreground">{type}</span>
                    {strategy ? <span className="story-chip max-sm:hidden">{strategy}</span> : null}
                  </div>
                  {mode === "similar" && reasons.length ? (
                    <p className="mt-1 line-clamp-1 text-[12.5px] text-muted-foreground">{reasons.slice(0, 2).join(" · ")}</p>
                  ) : blurb ? (
                    <p className="mt-1 line-clamp-1 text-[13px] leading-snug text-muted-foreground" title={text ?? undefined}>
                      {mode === "keywords"
                        ? highlight(blurb, query).map((p, i) =>
                            p.hit ? (
                              <mark key={i} className="rounded-sm bg-[var(--primary-soft)] px-0.5 text-foreground">
                                {p.text}
                              </mark>
                            ) : (
                              <span key={i}>{p.text}</span>
                            ),
                          )
                        : blurb}
                    </p>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-muted-foreground">
                    {place ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{place}</span>
                      </span>
                    ) : null}
                    {r.funds ? (
                      <span className="inline-flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> {r.funds.toLocaleString("en-US")} {r.category === "LP" ? "commitments" : "funds"}
                      </span>
                    ) : null}
                    {r.contacts ? (
                      <span className="inline-flex items-center gap-1" title={r.connectable ? `${r.connectable} with a direct email` : undefined}>
                        {r.connectable ? <Mail className="h-3.5 w-3.5 text-[var(--success)]" /> : <Users className="h-3.5 w-3.5" />} {r.contacts} {r.contacts === 1 ? "person" : "people"}
                      </span>
                    ) : null}
                    {r.employees ? <span className="max-sm:hidden">{headcountLabel(r.employees)} staff</span> : null}
                    {brands.length ? (
                      <span className="avatar-stack inline-flex items-center max-md:hidden" title={brands.map((b) => b.name).join(", ")}>
                        {brands.map((b) => (
                          <CompanyLogo key={b.key} name={b.name} domain={brandDomain(b.key, b.companyId ? dir.byId.get(b.companyId)?.domain : null)} size={18} />
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right sm:block" title={sizeTitle(r)}>
                  <div className="figure text-[17px] leading-none">{mode === "all" ? size : (score ?? size)}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{mode === "all" ? (size === "—" ? "size not on file" : r.category === "LP" ? "assets" : "under management") : mode === "similar" ? "match" : "fit"}</div>
                </div>
                <span className="flex shrink-0 items-center">
                  <button type="button" onClick={() => onQuickLook(r.id)} className={ICON} title="Quick look" aria-label={`Quick look at ${r.name}`}>
                    <Eye className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onSimilar(r.id)} className={cn(ICON, "max-md:hidden")} title="Firms like this" aria-label={`Find firms similar to ${r.name}`}>
                    <Sparkles className="h-4 w-4" />
                  </button>
                  <ArrowUpRight className="story-card-arrow ml-1 h-4 w-4 max-md:hidden" />
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-center gap-3 text-[12.5px] text-muted-foreground">
        <span>
          {visible.length.toLocaleString("en-US")} of {rows.length.toLocaleString("en-US")} firms
        </span>
        {rows.length > shown ? (
          <button type="button" onClick={() => setShown(shown + PAGE)} className="chapter-more">
            Show {Math.min(PAGE, rows.length - shown)} more
          </button>
        ) : null}
      </div>
    </div>
  );
}
