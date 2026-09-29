// What a desk screen looks like before its data arrives: the same frame,
// the same rhythm, quietly pulsing — so a click answers at once and the
// figures drop in where they belong.

function Bone({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[3px] bg-muted/70 ${className}`} />;
}

export function DeskSkeleton({ stats = 5, rows = 10 }: { stats?: number; rows?: number }) {
  return (
    <div className="desk mx-auto max-w-[1480px] space-y-4 px-4 py-5 md:px-6" aria-busy="true" aria-label="Loading">
      <div className="flex gap-4 border-b pb-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Bone key={i} className="h-3.5 w-16" />
        ))}
      </div>
      <Bone className="h-3 w-40" />
      <div className="space-y-2">
        <Bone className="h-3 w-24" />
        <Bone className="h-7 w-72" />
        <Bone className="h-3 w-[36rem] max-w-full" />
      </div>
      <div className="grid rounded-[4px] border bg-card" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))` }}>
        {Array.from({ length: stats }, (_, i) => (
          <div key={i} className="space-y-2 border-l px-3 py-2.5 first:border-l-0">
            <Bone className="h-2.5 w-20" />
            <Bone className="h-5 w-16" />
            <Bone className="h-2.5 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="rounded-[4px] border bg-card">
          <div className="border-b px-3 py-2.5">
            <Bone className="h-2.5 w-28" />
          </div>
          <div className="space-y-2.5 p-3">
            {Array.from({ length: rows }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone className="h-3 w-16" />
                <Bone className="h-3 flex-1" />
                <Bone className="h-3 w-12" />
                <Bone className="h-3 w-12" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-[4px] border bg-card">
              <div className="border-b px-3 py-2.5">
                <Bone className="h-2.5 w-24" />
              </div>
              <div className="space-y-2.5 p-3">
                {Array.from({ length: 5 }, (_, j) => (
                  <Bone key={j} className="h-3 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
