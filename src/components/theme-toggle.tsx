"use client";

import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";

/**
 * Zwei Vorschaukarten statt dreier Textknoepfe.
 *
 * "Hell / Dunkel / System" nebeneinander liess offen, wie das Ergebnis
 * aussieht -- gerade bei einem dunklen Modus, der bewusst kein reines
 * Schwarz verwendet. Die Systemeinstellung ist deshalb keine dritte
 * gleichwertige Option mehr, sondern ein Schalter darunter: sie ist kein
 * eigenes Aussehen, sondern die Entscheidung, sie jemand anderem zu
 * ueberlassen.
 */
const THEMES = [
  {
    value: "light",
    label: "Hell",
    surface: "#f2f4f0",
    accent: "#37714c",
    card: "#ffffff",
  },
  {
    value: "dark",
    label: "Dunkel",
    surface: "#0e1310",
    accent: "#74c48d",
    card: "#1e2721",
  },
] as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();

  const followsSystem = theme === "system";
  const active = mounted ? (resolvedTheme ?? "light") : null;

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex gap-3">
        {THEMES.map((option) => {
          const selected = active === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-3 rounded-2xl border-2 bg-card p-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary" : "border-border",
              )}
            >
              <span
                className="flex h-26 w-full flex-col gap-1.5 rounded-[15px] border border-border p-2.5"
                style={{ background: option.surface }}
              >
                <span
                  className="h-6 rounded-[7px]"
                  style={{ background: option.accent }}
                />
                <span
                  className="h-3.5 rounded-[5px]"
                  style={{ background: option.card }}
                />
                <span
                  className="h-3.5 w-[70%] rounded-[5px]"
                  style={{ background: option.card }}
                />
              </span>
              <span className="text-sm font-bold">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Systemeinstellung folgen</p>
          <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-muted-foreground">
            Wechselt automatisch mit dem Gerät
          </p>
        </div>
        <Switch
          checked={mounted ? followsSystem : false}
          onCheckedChange={(value) =>
            setTheme(value ? "system" : (resolvedTheme ?? "light"))
          }
          aria-label="Systemeinstellung folgen"
        />
      </div>
    </div>
  );
}
