export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 p-4">
        <div className="h-9 w-20 animate-pulse rounded-md bg-muted" />
        <div className="h-6 w-16 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
