export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-3.5 px-5 pt-2">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-12 animate-pulse rounded-2xl bg-muted" />
      <div className="h-10 animate-pulse rounded-[13px] bg-muted" />
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-[20px] bg-muted" />
        ))}
      </div>
    </div>
  );
}
