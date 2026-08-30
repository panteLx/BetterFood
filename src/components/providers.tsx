"use client";

import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { PushSync } from "@/components/push-sync";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <PushSync />
      {/* Ohne Offset legte sich der Toast ueber die Navigationsleiste und
          den zentralen Hinzufuegen-Button -- die Hauptaktion der App war
          waehrend jeder Rueckmeldung nicht erreichbar. Der Wert deckt
          Leistenhoehe, den ueberstehenden FAB und die Safe Area ab -- und
          rechnet dabei mit demselben max(), mit dem die Leiste selbst ihre
          untere Polsterung bildet. */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(4.5rem + max(env(safe-area-inset-bottom),1.25rem))" }}
        mobileOffset={{
          bottom: "calc(4.5rem + max(env(safe-area-inset-bottom),1.25rem))",
          left: "1rem",
          right: "1rem",
        }}
      />
    </ThemeProvider>
  );
}
