"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Hell", icon: Sun },
  { value: "dark", label: "Dunkel", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

const subscribe = () => () => {};

/**
 * False on the server and during the first client render, so the markup
 * matches before next-themes has resolved a theme.
 */
function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  return (
    <div className="inline-flex w-fit rounded-lg border border-border p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={mounted && theme === value ? "secondary" : "ghost"}
          className={cn("gap-1.5", !mounted && "opacity-0")}
          onClick={() => setTheme(value)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </div>
  );
}
