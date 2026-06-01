export default function EditChildLoading() {
  return (
    <main className="container mx-auto py-10 space-y-6">
      <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-6 space-y-3 bg-card">
          <div className="h-5 w-32 rounded bg-muted animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-9 rounded bg-muted animate-pulse" />
            <div className="h-9 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </main>
  );
}
