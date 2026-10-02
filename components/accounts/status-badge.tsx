import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * An account's status, in the theme's own inks rather than a Tailwind
 * palette: active is the success tone, a renewal due is the ops amber,
 * churned is the destructive claret, a prospect is quiet. One place, so the
 * card and the account page say it the same way.
 */
const STATUS_STYLE: Record<string, string> = {
  Active: "bg-[var(--success-soft)] text-[var(--success)]",
  "Renewal due": "bg-[var(--ops-soft)] text-[var(--ops)]",
  Prospect: "bg-muted text-muted-foreground",
  Churned: "bg-destructive/10 text-destructive",
};

export function AccountStatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge className={cn("border-transparent", STATUS_STYLE[status] ?? "bg-muted text-muted-foreground", className)}>{status}</Badge>;
}
