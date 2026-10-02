import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The numbers a CRM screen opens with: a label, a figure, and the line that
 * says what the figure is counted from. The basis is always drawn — "—" when
 * there is nothing to say — so a row of cards lines up and nothing shifts
 * when one gains a sentence.
 */
export function StatCard({
  label,
  value,
  basis,
  href,
  className,
}: {
  label: string;
  value: number | string;
  basis?: string;
  href?: string;
  className?: string;
}) {
  const inner = (
    <div className={cn("sheen h-full rounded-2xl border bg-card px-5 py-4", href && "lift", className)}>
      <p className="eyebrow truncate">{label}</p>
      <p className="figure mt-2.5 text-[1.75rem] leading-none">{value}</p>
      <p className="mt-2 truncate text-[12.5px] text-muted-foreground" title={basis}>
        {basis || "—"}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** One row of StatCards, as many as fit, never wrapping into a second block on a desk. */
export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("grid gap-3", className)}
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
    >
      {children}
    </div>
  );
}
