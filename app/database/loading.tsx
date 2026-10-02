import { Skeleton } from "@/components/ui/skeleton";

// Discover before its index arrives: the same frame as the results view
// (stat strip, then the toolbar of search and facet buttons, then the ledger)
// so the figures and rows drop in where they belong. Most arrivals come from
// the header's book links and land on results, not the home stand.

function Bone({ className, style }: { className: string; style?: React.CSSProperties }) {
  return <Skeleton className={`rounded-[3px] bg-muted/70 ${className}`} style={style} />;
}

export default function Loading() {
  return (
    <div className="desk mx-auto max-w-[1480px] space-y-4 px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading">
      <div className="grid rounded-[4px] border bg-card" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2 border-l px-3 py-2.5 first:border-l-0">
            <Bone className="h-2.5 w-20" />
            <Bone className="h-5 w-16" />
            <Bone className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Bone className="h-8 min-w-[220px] flex-1" />
        {[52, 84, 72, 70, 54, 76, 50, 96].map((w, i) => (
          <Bone key={i} className="h-8" style={{ width: w }} />
        ))}
        <Bone className="h-8 w-32" />
        <div className="ml-auto flex items-center gap-1.5">
          <Bone className="h-8 w-16" />
          <Bone className="h-8 w-20" />
          <Bone className="h-8 w-20" />
        </div>
      </div>
      <div className="rounded-[4px] border bg-card">
        <div className="flex items-center gap-3 border-b px-3 py-2.5">
          <Bone className="h-3.5 w-3.5" />
          <Bone className="h-2.5 w-24" />
          <Bone className="h-2.5 w-12" />
          <Bone className="h-2.5 w-20" />
          <Bone className="ml-auto h-2.5 w-10" />
          <Bone className="h-2.5 w-10" />
          <Bone className="h-2.5 w-10" />
        </div>
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
            <Bone className="h-3.5 w-3.5" />
            <Bone className="h-[26px] w-[26px]" />
            <div className="flex-1 space-y-1.5">
              <Bone className="h-3 w-48 max-w-full" />
              <Bone className="h-2.5 w-72 max-w-full" />
            </div>
            <Bone className="hidden h-3 w-24 md:block" />
            <Bone className="h-3 w-14" />
            <Bone className="hidden h-3 w-10 md:block" />
            <Bone className="hidden h-3 w-10 md:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
