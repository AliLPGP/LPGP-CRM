import Link from "next/link";
import { ArrowLeft, ArrowRight, Briefcase, Building2, ChartLine, Landmark, Layers, Repeat, Rocket, TreePine, Trophy, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// The story register's building blocks (globals.css, "The story register"):
// a profile reads top to bottom as a header, a row of headline figures and
// numbered chapters. Server components; the chapter bar is the one client
// piece (chapter-nav.tsx).

export function StoryPage({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="story fade-in" data-accent={accent}>
      <div className="story-wrap">{children}</div>
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="story-back">
      <ArrowLeft className="h-3.5 w-3.5" /> {label}
    </Link>
  );
}

/** A row of large figures. Pass only the figures there is data for. */
export function Figures({ children }: { children: React.ReactNode }) {
  return <div className="story-figures mt-7">{children}</div>;
}

export function Figure({ label, value, basis, href, title }: { label: string; value: React.ReactNode; basis?: React.ReactNode; href?: string; title?: string }) {
  const body = (
    <>
      <div className="story-figure-value" title={title}>
        {value}
      </div>
      <div className="story-figure-label">{label}</div>
      {basis ? <div className="story-figure-basis">{basis}</div> : null}
    </>
  );
  return href ? (
    <Link href={href} className="story-figure">
      {body}
    </Link>
  ) : (
    <div className="story-figure">{body}</div>
  );
}

/** A chapter: number, eyebrow, a sentence for a title, an optional lead and "see all". */
export function Chapter({
  id,
  n,
  eyebrow,
  title,
  lead,
  more,
  children,
}: {
  id: string;
  /** The chapter's number; a closing chapter (similar firms) has none. */
  n?: number | null;
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  more?: { href: string; label: string } | null;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="chapter" aria-labelledby={`${id}-title`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="chapter-eyebrow">{n != null ? `${String(n).padStart(2, "0")} · ${eyebrow}` : eyebrow}</div>
          <h2 id={`${id}-title`} className="chapter-title">
            {title}
          </h2>
          {lead ? <p className="chapter-lead">{lead}</p> : null}
        </div>
        {more ? <MoreLink href={more.href}>{more.label}</MoreLink> : null}
      </div>
      {children}
    </section>
  );
}

export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="chapter-more">
      {children} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

export function Meter({ pct, className }: { pct: number; className?: string }) {
  const w = Math.max(2, Math.min(100, pct));
  return (
    <div className={cn("meter", className)} role="presentation">
      <span style={{ width: `${w}%` }} />
    </div>
  );
}

export function Chip({ children, strong, className, title }: { children: React.ReactNode; strong?: boolean; className?: string; title?: string }) {
  return (
    <span className={cn("story-chip", strong && "story-chip-strong", className)} title={title}>
      {children}
    </span>
  );
}

const CLASS_ICON: Record<string, LucideIcon> = {
  private_equity: Briefcase,
  private_credit: Landmark,
  venture_capital: Rocket,
  real_estate: Building2,
  infrastructure: Zap,
  natural_resources: TreePine,
  secondaries: Repeat,
  hedge_funds: ChartLine,
  sports: Trophy,
};

/** The icon an asset class wears: identity by shape, never by a hue. */
export function ClassIcon({ cls, className }: { cls: string | null | undefined; className?: string }) {
  const Icon = (cls && CLASS_ICON[cls]) || Layers;
  return (
    <span className={cn("icon-tile", className)}>
      <Icon className="h-[18px] w-[18px]" />
    </span>
  );
}

/** A skeleton the shape of a chapter of cards, while it streams in. */
export function ChapterSkeleton({ cards = 3 }: { cards?: number }) {
  const bone = "animate-pulse rounded-[8px] bg-muted/70";
  return (
    <div className="chapter" aria-busy="true" aria-label="Loading">
      <div className={`${bone} h-2.5 w-36`} />
      <div className={`${bone} mt-3 h-6 w-[min(420px,80%)]`} />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="story-card h-[176px] p-4">
            <div className={`${bone} h-9 w-9`} />
            <div className={`${bone} mt-4 h-4 w-2/3`} />
            <div className={`${bone} mt-3 h-3 w-1/2`} />
            <div className={`${bone} mt-6 h-1.5 w-full`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The figure row's placeholder while the figures that need a read arrive. */
export function FiguresSkeleton({ n = 4 }: { n?: number }) {
  const bone = "animate-pulse rounded-[6px] bg-muted/70";
  return (
    <div className="story-figures mt-7" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="story-figure">
          <div className={`${bone} h-7 w-24`} />
          <div className={`${bone} mt-3 h-3 w-20`} />
        </div>
      ))}
    </div>
  );
}

const fmtPct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${Number(v).toFixed(digits)}%`);
const fmtMult = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(2)}x`);
export { fmtMult, fmtPct };

/** A whole story page while it loads: the header's shape, the figures, a chapter. */
export function StorySkeleton() {
  const bone = "animate-pulse rounded-[8px] bg-muted/70";
  return (
    <StoryPage>
      <div className={`${bone} h-3 w-28`} />
      <div className="mt-5 flex items-start gap-6">
        <div className={`${bone} h-[72px] w-[72px] rounded-[16px]`} />
        <div className="min-w-0 flex-1">
          <div className={`${bone} h-2.5 w-40`} />
          <div className={`${bone} mt-3 h-10 w-[min(420px,80%)]`} />
          <div className={`${bone} mt-4 h-3.5 w-[min(640px,95%)]`} />
          <div className={`${bone} mt-2 h-3.5 w-[min(520px,85%)]`} />
        </div>
      </div>
      <FiguresSkeleton n={5} />
      <ChapterSkeleton />
    </StoryPage>
  );
}
