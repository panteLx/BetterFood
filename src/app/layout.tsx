import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { BottomNav, BottomNavFallback } from "@/components/bottom-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  themeColor: "#16a34a",
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            {children}
            <Suspense fallback={<BottomNavFallback />}>
              <BottomNav />
            </Suspense>
          </div>
          {modal}
        </Providers>
      </body>
    </html>
  );
}
