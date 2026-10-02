import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Desk primitives shared by the intelligence screens. Server-safe: no hooks.
//
// One scale throughout: a header strip or a stat cell is `px-3 py-2`, a body
// is `p-3`, a control is 32px tall (`h-8`) and 12.5px type, a label is
// `.desk-label`, a figure is `.figure`, and the one radius is 4px.

/** The one button on the desk: a quiet outlined pill (the #333 border on black), 12px type. Export, columns, "Show more". */
export const deskButton = "inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-input bg-card px-2.5 text-[12px] transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-50";

/** The desk's primary button: the blue with white text. One per screen, for the action that moves things. */
export const deskPrimary = "inline-flex h-8 items-center gap-1.5 rounded-[4px] bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-default disabled:opacity-50";

/** A boxed section with a quiet header strip. */
export function Box({
  title,
  count,
  action,
  children,
  className,
  flush,
  id,
  defn,
}: {
  title?: React.ReactNode;
  count?: number | string | null;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** No padding: the body is a table. */
  flush?: boolean;
  id?: string;
  /** A definition shown on hovering the title. */
  defn?: string;
}) {
  return (
    <section id={id} className={cn("sheen scroll-mt-16 rounded-[4px] border bg-card", className)}>
      {title ? (
        <header className="flex min-h-9 items-center gap-2 border-b px-3 py-2">
          <h2 className={cn("desk-label text-foreground", defn && "defn")} data-tip={defn}>
            {title}
          </h2>
          {count != null ? <span className="figure text-[11px] font-medium text-muted-foreground">{typeof count === "number" ? count.toLocaleString("en-US") : count}</span> : null}
          {action ? <div className="ml-auto flex items-center gap-1.5">{action}</div> : null}
        </header>
      ) : null}
      <div className={flush ? "" : "p-3"}>{children}</div>
    </section>
  );
}

/** One statistic in a strip: label, figure, and its basis. */
export function Stat({
  label,
  value,
  basis,
  defn,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  basis?: React.ReactNode;
  defn?: string;
  href?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className={cn("desk-label truncate", defn && "defn")} data-tip={defn}>
        {label}
      </div>
      <div className="figure mt-1 truncate text-[19px] leading-none">{value}</div>
      {/* The basis line is always drawn, so every cell in a strip is the same height. */}
      <div className="mt-1 truncate text-[11px] text-muted-foreground">{basis ?? " "}</div>
    </>
  );
  const cls = cn("block min-w-0 border-l border-border px-3 py-2 first:border-l-0", href && "transition-colors hover:bg-accent/40", className);
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A row of Stats, ruled between. */
export function StatStrip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("sheen grid rounded-[4px] border bg-card", className)} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      {children}
    </div>
  );
}

/** The page that states a figure, as a quiet superscript-style link. */
export function Src({ url, name, asOf, className }: { url: string | null | undefined; name?: string | null; asOf?: string | null; className?: string }) {
  const text = [name, asOf].filter(Boolean).join(", ");
  // Only a web address becomes a link; anything else stays text.
  if (!url || !/^https?:\/\//i.test(url)) return text ? <span className={cn("text-[10.5px] text-muted-foreground", className)}>{text}</span> : null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-0.5 text-[10.5px] text-muted-foreground hover:text-foreground", className)}
      title={url}
    >
      {text || "Source"} <ExternalLink className="h-2.5 w-2.5" />
    </a>
  );
}

export function Tag({ children, strong, className, title }: { children: React.ReactNode; strong?: boolean; className?: string; title?: string }) {
  return (
    <span className={cn("tag", strong && "tag-strong", className)} title={title}>
      {children}
    </span>
  );
}

/** Nothing to show, said plainly: one sentence on why, and the one action that fills it. */
export function Empty({ children, action, className }: { children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-3 py-6 text-center text-[12.5px] text-muted-foreground", className)}>
      <p className="mx-auto max-w-md">{children}</p>
      {action ? <div className="mt-2.5 flex justify-center gap-1.5">{action}</div> : null}
    </div>
  );
}

/** Sub-tabs inside a screen, as links (the URL is the state). The active underline grows in over 150ms. */
export function SubTabs({ items, className }: { items: { href: string; label: string; count?: number | null; active?: boolean }[]; className?: string }) {
  return (
    <nav className={cn("desk-tabs", className)}>
      {items.map((t) => (
        <Link key={t.href} href={t.href} className="desk-tab" data-active={t.active ? "true" : undefined} aria-current={t.active ? "page" : undefined}>
          {t.label}
          {t.count != null ? <span className="count">{t.count.toLocaleString("en-US")}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The bar above every list, in one order: the search box, then the facet
 * menus and the sort (children), then the result count, with the export and
 * column controls on the right. Wraps on a narrow screen; nothing is cut off.
 */
export function Toolbar({
  search,
  children,
  count,
  right,
  className,
}: {
  /** The search input, which takes the free width up to 20rem. */
  search?: React.ReactNode;
  /** Facet menus and the sort control, in that order. */
  children?: React.ReactNode;
  /** "1,240 funds" — a figure with its noun, or any node. */
  count?: React.ReactNode;
  /** Export, columns, a view switch. */
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {search ? <div className="min-w-[180px] flex-1 basis-48 sm:max-w-xs">{search}</div> : null}
      {children ? <div className="flex flex-wrap items-center gap-1.5">{children}</div> : null}
      {count != null ? <div className="figure px-1 text-[11px] font-medium text-muted-foreground">{count}</div> : null}
      {right ? <div className="ml-auto flex flex-wrap items-center gap-1.5">{right}</div> : null}
    </div>
  );
}

/**
 * "Show N more" under a list, in the one button style. A client list passes
 * `onClick`; a server list that pages by URL passes `href`. With `remaining`
 * and `step` the label says how many come next and the button hides at zero.
 */
export function ShowMore({
  onClick,
  href,
  remaining,
  step,
  loading,
  disabled,
  label,
  className,
}: {
  onClick?: () => void;
  href?: string;
  /** Rows not yet shown; at 0 or below the button is not drawn. */
  remaining?: number;
  /** Rows the next click reveals; the label reads "Show {min(step, remaining)} more". */
  step?: number;
  loading?: boolean;
  disabled?: boolean;
  label?: React.ReactNode;
  className?: string;
}) {
  if (remaining != null && remaining <= 0) return null;
  const n = remaining != null && step != null ? Math.min(step, remaining) : step ?? remaining;
  const text = label ?? (loading ? "Loading…" : n != null ? `Show ${n.toLocaleString("en-US")} more` : "Show more");
  const cls = cn(deskButton, className);
  if (href && !onClick) {
    return (
      <Link href={href} className={cls} aria-disabled={disabled || loading || undefined}>
        {text}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={cls}>
      {text}
    </button>
  );
}

/** A small horizontal bar for a value against the row's maximum, in the one blue (`--chart-bar`). */
export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(1.5, Math.round((value / max) * 100)) : 0;
  return (
    <span className={cn("inline-block h-[5px] w-16 overflow-hidden rounded-[2px] bar-track align-middle", className)}>
      <span className="block h-full bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
