import * as React from "react";

import { cn } from "@/lib/utils";

// A bone of the page before its data arrives. The radius follows the
// register (--radius is 4px inside .desk, 12px on the sales side), the pulse
// stops under prefers-reduced-motion, and the box is sized by the caller so
// the figure lands where the bone was.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="skeleton" aria-hidden className={cn("animate-pulse rounded-md bg-muted/70", className)} {...props} />
  );
}

export { Skeleton };
