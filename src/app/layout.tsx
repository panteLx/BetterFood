import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope, Quicksand } from "next/font/google";
import { Providers } from "@/components/providers";
import { BottomNavGate } from "@/components/bottom-nav-gate";
import { ReviewBatchGuard } from "@/components/review-batch-guard";
import { APP_DESCRIPTION, APP_NAME, APP_TITLE, TITLE_TEMPLATE } from "@/lib/metadata";
import "./globals.css";

// Drei Schriften mit je einer klaren Aufgabe. Quicksand traegt alles, was
// die Form der Oberflaeche ausmacht -- Ueberschriften, Zeilentitel, Zahlen,
// Knopfbeschriftungen, Chips: ihre runden Endungen sind der typografische
// Teil des verspielten Auftritts. Manrope bleibt fuer Fliesstext, Meta-Zeilen
// und Platzhalter, wo eine humanistische Grotesk besser liest. JetBrains Mono
// steht ausschliesslich fuer Ziffernfolgen, bei denen die Stellen
// untereinander stehen muessen (EAN, Kalenderwochen, Mengen).
//
// Von Quicksand nur 500/600/700 laden: ein 800 gibt es in dieser Familie
// nicht, und next/font wuerde ein angefordertes Gewicht stillschweigend
// synthetisieren statt zu scheitern.
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const quicksand = Quicksand({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  // template greift auf jeder Unterseite, die ihren eigenen Titel setzt:
  // "Vorrat · BetterFood". default steht auf der Startseite und ueberall,
  // wo keiner gesetzt ist.
  title: {
    default: APP_TITLE,
    template: TITLE_TEMPLATE,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.json",
  // Eine selbst gehostete Speisekammer gehoert in keinen Suchindex: hinter
  // /login steht ohnehin nichts Oeffentliches, und die Anmeldeseite selbst
  // hat niemandem etwas zu sagen, der sie nicht schon kennt.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  // Ohne Bild und ohne metadataBase: die oeffentliche Adresse der Instanz
  // kennt erst der laufende Container (BETTER_AUTH_URL), und ein zur Bauzeit
  // eingebackenes localhost waere in jedem Docker-Image falsch -- derselbe
  // Fehler, den schon der SSO-Knopf einmal hatte.
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
  },
  formatDetection: {
    // Ohne das macht iOS aus jeder EAN und jedem Datum einen Anruf- oder
    // Kalenderlink.
    telephone: false,
    date: false,
    address: false,
    email: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    // Der Name unter dem Icon auf dem iOS-Home-Bildschirm.
    title: APP_NAME,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom app-weit gesperrt: die Oberflaeche ist eine installierte PWA mit
  // fester Spaltenbreite, und dort ist jedes versehentliche Aufziehen ein
  // verrutschtes Layout, aus dem man sich per Hand wieder herauszoomen muss.
  // Dieselbe Sperre haelt zugleich iOS davon ab, beim Fokussieren eines
  // Eingabefeldes hineinzuzoomen.
  maximumScale: 1,
  userScalable: false,
  //
  // viewportFit "cover" ist die Voraussetzung dafuer, dass env(safe-area-
  // inset-*) auf Geraeten mit Home-Indikator ueberhaupt einen Wert > 0
  // liefert; ohne das war die Polsterung im Add-Sheet wirkungslos und die
  // Navigationsleiste haette unter dem Indikator gelegen.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef8ef" },
    { media: "(prefers-color-scheme: dark)", color: "#131a16" },
  ],
};

export default function RootLayout({ children, modal }: LayoutProps<"/">) {
  return (
    <html
      lang="de"
      className={`${manrope.variable} ${quicksand.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {/* Gibt nichts aus, sieht aber jede Navigation: verwirft den
              Pruef-Batch, sobald der Nutzer /review verlaesst.

              Im Suspense wie die Navigationsleiste: usePathname ist unter
              cacheComponents Laufzeitwissen und bricht den Prerender jeder
              Route ab, wenn es ungeschuetzt im Layout steht ("Next.js
              encountered URL data usePathname() in a Client Component
              outside of <Suspense>"). Der Fallback ist null, weil die
              Komponente selbst nichts ausgibt. */}
          <Suspense fallback={null}>
            <ReviewBatchGuard />
          </Suspense>
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
