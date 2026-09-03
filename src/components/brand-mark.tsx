import { cn } from "@/lib/utils";

/**
 * Das Blatt als Wortbild-Ersatz -- auf Splash, Onboarding, Anmeldung und in
 * der Benachrichtigungs-Vorschau dasselbe Zeichen, damit eine Push-Meldung
 * erkennbar von hier kommt.
 */
export function BrandMark({
  className,
  iconClassName,
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "flex size-14 items-center justify-center rounded-lg bg-primary text-primary-foreground",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={cn("size-7.5", iconClassName)}
      >
        <path d="M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Zm3.5-3.5 8-8" />
      </svg>
    </span>
  );
}
