export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <div className="h-6 w-48 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
