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
          waehrend jeder Rueckmeldung nicht erreichbar. 6rem sind die Hoehe
          der schwebenden Insel (64px) samt ihrem Abstand nach unten (16px)
          und ein wenig Luft darueber -- eine Safe Area kommt nicht dazu,
          weil die Insel selbst keine mehr einrechnet. */}
      <Toaster
        position="bottom-center"
        offset={{ bottom: "6rem" }}
        mobileOffset={{
          bottom: "6rem",
          left: "1rem",
          right: "1rem",
        }}
      />
    </ThemeProvider>
  );
}
