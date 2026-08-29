"use client";

import { ThemeProvider } from "next-themes";
import { ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      {/* Ohne Offset legte sich der Toast ueber die Navigationsleiste und
          den zentralen Hinzufuegen-Button -- die Hauptaktion der App war
          waehrend jeder Rueckmeldung nicht erreichbar. Der Wert deckt
          Leistenhoehe, den ueberstehenden FAB und die Safe Area ab. */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))" }}
        mobileOffset={{ bottom: "calc(5.75rem + env(safe-area-inset-bottom))", left: "1rem", right: "1rem" }}
      />
    </ThemeProvider>
  );
}
