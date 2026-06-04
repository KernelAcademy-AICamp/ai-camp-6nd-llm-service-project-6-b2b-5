export default function ObservationTimelineLoading() {
  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
        <div className="h-7 w-44 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="h-10 w-full max-w-sm rounded bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-5 flex-1 rounded-md bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </main>
  );
}
