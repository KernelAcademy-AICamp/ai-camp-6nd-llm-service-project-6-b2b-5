export default function NotesHistoryLoading() {
  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        <div className="h-7 w-48 rounded-md bg-muted animate-pulse" />
      </div>
      <div className="h-10 w-full max-w-sm rounded bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[88px] rounded-2xl bg-muted/40 animate-pulse" />
        ))}
      </div>
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-2 flex-1 rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </main>
  );
}
