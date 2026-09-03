"use client";

import { cn } from "@/lib/utils";

/**
 * Der Schalter aus dem Design: eine Einstellung, die sofort wirkt, ohne einen
 * Speichern-Knopf daneben.
 *
 * role="switch" statt eines Checkbox-Inputs, weil genau das die Bedeutung
 * ist -- an oder aus, kein Formularfeld, das erst abgeschickt wird.
 */
export function Switch({
  checked,
  onCheckedChange,
  className,
  disabled,
  ...props
}: Omit<React.ComponentProps<"button">, "onChange"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "flex h-[31px] w-[52px] shrink-0 rounded-full p-[3px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
        checked ? "justify-end bg-(image:--gradient-primary)" : "justify-start bg-track",
        className,
      )}
      {...props}
    >
      <span className="block size-[25px] rounded-full bg-white shadow-row" />
    </button>
  );
}
