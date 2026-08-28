export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
