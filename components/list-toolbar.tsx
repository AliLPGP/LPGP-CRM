import { ChevronDown, Search } from "lucide-react";
import type { FacetOption } from "@/components/intel/facet-menu";
import { cn } from "@/lib/utils";

/**
 * The one toolbar every CRM list wears, in the order the standard fixes:
 * search · facet dropdowns · sort · result count · actions on the right, then
 * the chips for whatever is selected. Hook-free, so a client list owns the
 * state and this only lays it out. The controls share FacetMenu's 32px,
 * 4px-radius family so the bar reads as one piece; the panels around it keep
 * the CRM's 12–16px radius.
 */
export function ListToolbar({
  search,
  facets,
  sort,
  shown,
  total,
  noun,
  actions,
  chips,
}: {
  search: { value: string; onChange: (v: string) => void; placeholder: string };
  facets?: React.ReactNode;
  sort?: React.ReactNode;
  shown: number;
  total: number;
  noun: string;
  actions?: React.ReactNode;
  chips?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
            className="h-8 w-full rounded-[4px] border border-input bg-card pl-8 pr-2 text-[12.5px] outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
          />
        </label>
        {facets}
        {sort}
        <span className="tabular whitespace-nowrap px-1 text-[12px] text-muted-foreground">
          {shown === total ? total.toLocaleString("en-US") : `${shown.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`} {noun}
        </span>
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div> : null}
      </div>
      {chips}
    </div>
  );
}

/** The sort control, in the toolbar's family. */
export function SortSelect<T extends string>({
  value,
  onChange,
  options,
  label = "Sort",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label?: string;
}) {
  return (
    <span className="relative inline-flex">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={label}
        className="h-8 appearance-none rounded-[4px] border bg-card pl-2.5 pr-7 text-[12.5px] text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:border-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label}: {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 opacity-60" />
    </span>
  );
}

/** "Show N more" — one button style everywhere. */
export function ShowMore({
  remaining,
  step,
  onClick,
  className,
}: {
  remaining: number;
  step: number;
  onClick: () => void;
  className?: string;
}) {
  if (remaining <= 0) return null;
  return (
    <div className={cn("flex items-center gap-2 px-1", className)}>
      <button type="button" onClick={onClick} className="rounded-[4px] border bg-card px-2.5 py-1 text-[12px] transition-colors hover:bg-accent">
        Show {Math.min(step, remaining).toLocaleString("en-US")} more
      </button>
      <span className="text-[12px] text-muted-foreground">{remaining.toLocaleString("en-US")} not shown</span>
    </div>
  );
}

/**
 * Facet options for one dimension, counted over the rows. `order` fixes the
 * sequence (a stage ladder, a status list); otherwise the commonest first.
 * A value no row carries is left out unless `order` names it.
 */
export function facetOptions<T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
  opts: { label?: (k: string) => string; order?: readonly string[] } = {},
): FacetOption[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  const label = opts.label ?? ((k: string) => k);
  if (opts.order) {
    const named = opts.order.map((k) => ({ key: k, label: label(k), count: m.get(k) ?? 0 }));
    const rest = [...m.entries()].filter(([k]) => !opts.order!.includes(k)).sort((a, b) => b[1] - a[1]);
    return [...named, ...rest.map(([k, n]) => ({ key: k, label: label(k), count: n }))];
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, label: label(k), count: n }));
}
