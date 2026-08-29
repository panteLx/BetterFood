export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="h-12 w-52 animate-pulse rounded-lg bg-muted" />
        <div className="h-9.5 w-28 animate-pulse rounded-[13px] bg-muted" />
      </div>
      <div className="h-36 animate-pulse rounded-3xl bg-muted" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-[20px] bg-muted" />
        ))}
      </div>
    </div>
  );
}
