import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

// Desk primitives shared by the intelligence screens. Server-safe: no hooks.

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
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <h2 className={cn("desk-label text-foreground", defn && "defn")} data-tip={defn}>
            {title}
          </h2>
          {count != null ? <span className="figure text-[11px] text-muted-foreground">{typeof count === "number" ? count.toLocaleString("en-US") : count}</span> : null}
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
      <div className={cn("desk-label", defn && "defn")} data-tip={defn}>
        {label}
      </div>
      <div className="figure mt-1 text-[19px] leading-none">{value}</div>
      {basis ? <div className="mt-1 truncate text-[11px] text-muted-foreground">{basis}</div> : null}
    </>
  );
  const cls = cn("min-w-0 border-l border-border px-3 py-2 first:border-l-0", href && "hover:bg-accent/40", className);
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

/** Nothing to show, said plainly. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">{children}</p>;
}

/** Sub-tabs inside a screen, as links (the URL is the state). */
export function SubTabs({ items }: { items: { href: string; label: string; count?: number | null; active?: boolean }[] }) {
  return (
    <nav className="desk-tabs">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className="desk-tab" data-active={t.active ? "true" : undefined}>
          {t.label}
          {t.count != null ? <span className="count">{t.count.toLocaleString("en-US")}</span> : null}
        </Link>
      ))}
    </nav>
  );
}

/** A small horizontal bar for a value against the row's maximum. */
export function Bar({ value, max, className }: { value: number; max: number; className?: string }) {
  const pct = max > 0 ? Math.max(1.5, Math.round((value / max) * 100)) : 0;
  return (
    <span className={cn("inline-block h-[5px] w-16 overflow-hidden rounded-[2px] bar-track align-middle", className)}>
      <span className="block h-full bar-fill" style={{ width: `${pct}%` }} />
    </span>
  );
}
