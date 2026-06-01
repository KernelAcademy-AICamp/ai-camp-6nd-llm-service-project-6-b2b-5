export default function AttendanceLoading() {
  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="h-8 w-48 rounded-md bg-muted animate-pulse" />
      <div className="h-9 w-64 rounded-md bg-muted animate-pulse" />
      <div className="rounded-lg border">
        <div className="h-11 border-b bg-muted/40" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
          >
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
            <div className="h-9 w-32 rounded bg-muted animate-pulse" />
            <div className="h-9 w-24 rounded bg-muted animate-pulse" />
            <div className="h-9 w-24 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </main>
  );
}
