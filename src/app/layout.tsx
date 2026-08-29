import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { Providers } from "@/components/providers";
import { BottomNavGate } from "@/components/bottom-nav-gate";
import "./globals.css";

// Manrope traegt die gesamte Typografie: die Oberflaeche setzt Ueberschriften
// in 800 gegen halbfette Labels in 600/700, und genau diese Spanne hat Geist
// nicht. JetBrains Mono steht ausschliesslich fuer Ziffernfolgen, bei denen
// die Stellen untereinander stehen muessen (EAN, Kalenderwochen).
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Vorrat – Lebensmittel-Tracker",
  description: "Behalte den Überblick, welche Lebensmittel bald ablaufen.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vorrat",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Kein maximumScale: Pinch-Zoom bleibt erlaubt (WCAG 1.4.4) -- bei einer
  // App, deren Kerninhalt kleingedruckte Haltbarkeitsangaben sind, trifft die
  // Sperre genau die Nutzer, die sie am noetigsten brauchen.
  //
  // viewportFit "cover" ist die Voraussetzung dafuer, dass env(safe-area-
  // inset-*) auf Geraeten mit Home-Indikator ueberhaupt einen Wert > 0
  // liefert; ohne das war die Polsterung im Add-Sheet wirkungslos und die
  // Navigationsleiste haette unter dem Indikator gelegen.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1310" },
  ],
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {/* Die Safe Area oben gehoert an genau eine Stelle: als
              installierte PWA laeuft der Inhalt sonst unter der Statusleiste
              des Geraets durch, und jede Seite muesste denselben Abstand
              selbst noch einmal setzen.
              max(...) statt des blossen Insets: im Browser ist
              env(safe-area-inset-top) 0, und dann klebte die Ueberschrift
              jeder Seite 8px unter der Fensterkante. Auf dem Geraet gewinnt
              weiterhin der echte Inset. */}
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col pt-[max(env(safe-area-inset-top),1.75rem)]">
            {children}
            <Suspense fallback={null}>
              <BottomNavGate />
            </Suspense>
          </div>
          {modal}
        </Providers>
      </body>
    </html>
  );
}
