import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Nothing here, said once: what would be here and why it is empty, plus the one
 * action that fills it. Never a bare "No results".
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center", className)}>
      {icon ? <div className="mx-auto mb-2.5 flex justify-center text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
