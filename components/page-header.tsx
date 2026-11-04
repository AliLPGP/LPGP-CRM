import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="wordmark text-[10.5px] text-[var(--brass)]">{eyebrow}</p> : null}
        <h1 className="display mt-2 text-[26px] font-bold leading-tight md:text-[30px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-[14px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
