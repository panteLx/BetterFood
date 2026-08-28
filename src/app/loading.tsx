export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="h-7 w-32 animate-pulse rounded-md bg-muted" />
        <div className="flex shrink-0 gap-1">
          <div className="size-9 animate-pulse rounded-md bg-muted" />
          <div className="size-9 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
