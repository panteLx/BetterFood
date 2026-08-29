export default function Loading() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-5 pt-2">
      <div className="size-11 animate-pulse rounded-2xl bg-muted" />
      <div className="flex flex-col items-center gap-4">
        <div className="size-23 animate-pulse rounded-[30px] bg-muted" />
        <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-8.5 w-32 animate-pulse rounded-xl bg-muted" />
      </div>
      <div className="h-56 animate-pulse rounded-3xl bg-muted" />
    </div>
  );
}
