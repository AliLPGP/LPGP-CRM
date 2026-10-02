"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDownWideNarrow, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FacetChips, FacetMenu, type FacetGroup } from "./facet-menu";

// The list toolbar for a server-rendered desk, where the URL is the state:
// search box, one facet dropdown per dimension, the sort, the result count,
// and whatever belongs on the right (an export, a research button). The page
// describes the facets and their counts; this component only reads the query
// string and writes it back with `router.replace`, so the page re-renders
// with the new cut and a link to the screen still says what is on it.

export type UrlFacet = {
  /** The query-string key the page reads. */
  param: string;
  label: string;
  /** One group with no label for a flat list. Counts are the page's. */
  groups: FacetGroup[];
  /** Several values at once, written comma-separated. Off, a new tick replaces the old. */
  multi?: boolean;
  searchable?: boolean;
  width?: number;
  /** A word before each chip, when the value alone would not say what it is ("Vintage 2010s"). */
  chipPrefix?: string;
  /** Labels for values a link can carry that no option offers (a custom range). */
  labels?: Record<string, string>;
};

export type UrlSort = {
  param: string;
  options: { key: string; label: string }[];
  /** The option the page sorts by when the URL says nothing; never written. */
  defaultKey: string;
};

const BUTTON = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border bg-card px-2.5 text-[12.5px] transition-colors hover:bg-accent";

/** The values a facet's param carries, as a list. */
export function facetValues(params: URLSearchParams, param: string): string[] {
  return (params.get(param) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function UrlFacets({
  facets,
  search,
  sort,
  count,
  right,
  reset = ["n", "page", "offset"],
  children,
  className,
}: {
  facets: UrlFacet[];
  /** The search box: which key it writes and what it looks for. Applied on Enter. */
  search?: { param: string; placeholder: string; width?: string };
  sort?: UrlSort;
  /** The result count beside the sort: how many, and of what. */
  count?: { value: number; noun: string; of?: number };
  /** Export, columns, a research button: the right-hand end of the bar. */
  right?: React.ReactNode;
  /** Query keys dropped whenever the cut changes: a page offset belongs to the old cut. */
  reset?: string[];
  /** The ledger under the bar; it dims while the next cut is on its way. */
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();

  const navigate = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const k of reset) next.delete(k);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const selectedOf = (f: UrlFacet) => facetValues(params, f.param);
  const labelOf = (f: UrlFacet, key: string) => {
    for (const g of f.groups) for (const o of g.options) if (o.key === key) return o.label;
    return f.labels?.[key] ?? key;
  };

  const chips = facets.flatMap((f) =>
    selectedOf(f).map((k) => ({
      key: `${f.param}:${k}`,
      label: f.chipPrefix ? `${f.chipPrefix} ${labelOf(f, k)}` : labelOf(f, k),
      remove: () => navigate({ [f.param]: selectedOf(f).filter((x) => x !== k).join(",") }),
    })),
  );

  const sortValue = sort ? (sort.options.some((o) => o.key === params.get(sort.param)) ? (params.get(sort.param) as string) : sort.defaultKey) : null;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        {search ? <SearchBox param={search.param} placeholder={search.placeholder} width={search.width} value={params.get(search.param) ?? ""} onCommit={(v) => navigate({ [search.param]: v })} /> : null}
        {/* On a phone the facets and the sort are one row that scrolls sideways; wider, they sit in the bar as before. */}
        <div className="facet-row md:contents">
        {facets.map((f) => {
          const selected = selectedOf(f);
          // A value a link brought that no option offers still shows as ticked;
          // without it the menu would drop the selection on the first click.
          const known = new Set(f.groups.flatMap((g) => g.options.map((o) => o.key)));
          const extra = selected.filter((k) => !known.has(k));
          const groups = extra.length ? [...f.groups, { label: "", options: extra.map((k) => ({ key: k, label: labelOf(f, k), count: count?.value ?? 0 })) }] : f.groups;
          return (
            <FacetMenu
              key={f.param}
              label={f.label}
              groups={groups}
              selected={selected}
              searchable={f.searchable}
              width={f.width}
              onChange={(next) => {
                if (f.multi) {
                  navigate({ [f.param]: next.join(",") });
                  return;
                }
                const added = next.find((k) => !selected.includes(k));
                navigate({ [f.param]: added ?? (next.length ? next[0] : null) });
              }}
            />
          );
        })}
        {sort ? (
          <label className={cn(BUTTON, "cursor-pointer text-muted-foreground")} title="Sort">
            <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            <select
              value={sortValue ?? sort.defaultKey}
              onChange={(e) => navigate({ [sort.param]: e.target.value === sort.defaultKey ? null : e.target.value })}
              className="bg-transparent text-[12.5px] text-foreground outline-none"
              aria-label="Sort by"
            >
              {sort.options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        </div>
        {count ? (
          <span className="px-1 text-[12px]" aria-live="polite">
            <span className={cn("figure", pending && "opacity-50")}>{count.value.toLocaleString("en-US")}</span>
            {count.of != null && count.of !== count.value ? <span className="figure text-muted-foreground"> of {count.of.toLocaleString("en-US")}</span> : null}{" "}
            <span className="text-muted-foreground">
              {count.noun}
              {pending ? " …" : ""}
            </span>
          </span>
        ) : null}
        {right ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{right}</div> : null}
      </div>
      <FacetChips chips={chips} onClearAll={() => navigate(Object.fromEntries(facets.map((f) => [f.param, null])))} />
      {children != null ? (
        <div className={cn("transition-opacity duration-150 ease-out", pending && "opacity-60")} aria-busy={pending || undefined}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The search box. What is typed stays local until Enter; the URL's value is
 * what the page answered, so a stale draft never overwrites a cut a link
 * brought. The draft carries the URL value it was typed against, and gives
 * way to a newer one.
 */
function SearchBox({ param, placeholder, width = "w-56", value, onCommit }: { param: string; placeholder: string; width?: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState({ against: value, text: value });
  const text = draft.against === value ? draft.text : value;
  return (
    <div className={cn("relative", width)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        name={param}
        value={text}
        onChange={(e) => setDraft({ against: value, text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(text.trim());
          }
          if (e.key === "Escape" && text) {
            setDraft({ against: value, text: "" });
            onCommit("");
          }
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-7 text-[12.5px] outline-none focus-visible:border-ring"
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft({ against: value, text: "" });
            onCommit("");
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
