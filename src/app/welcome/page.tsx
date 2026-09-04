"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avo } from "@/components/avo";
import { BrandMark } from "@/components/brand-mark";
import {
  ReminderIllustration,
  ScanIllustration,
  StockIllustration,
  SwipeIllustration,
} from "@/components/onboarding-illustrations";
import { Button, buttonVariants } from "@/components/ui/button";
import { DEMO_FOOTNOTE } from "@/lib/demo-data";
import { cn, withRedirect } from "@/lib/utils";

const SLIDES = [
  {
    illustration: StockIllustration,
    title: "Behalte deinen Vorrat im Blick",
    body: "BetterFood merkt sich, was in Kühlschrank, Gefrierfach und Schrank liegt – und wie lange es noch hält.",
  },
  {
    illustration: ScanIllustration,
    title: "Scannen oder tippen",
    body: "Verpacktes per Barcode, Salat und Reste von Hand. Beides dauert wenige Sekunden.",
  },
  {
    illustration: SwipeIllustration,
    title: "Abhaken mit einer Wischgeste",
    body: "Nach rechts wischen heißt aufgebraucht, nach links weggeworfen. Falsch gewischt? Der Hinweis unten macht es rückgängig.",
  },
  {
    illustration: ReminderIllustration,
    title: "Wir melden uns rechtzeitig",
    body: "Du bekommst eine Erinnerung, bevor etwas abläuft. Nicht ständig – nur wenn es zählt.",
  },
] as const;

/**
 * Splash und Onboarding vor der ersten Anmeldung.
 *
 * Der Hauptweg hier heraus fuehrt auf die Registrierung: die Einfuehrung
 * erklaert, wofuer man ein Konto anlegt, und endet deshalb genau dort. Wer
 * schon eins hat, findet den Weg zum Anmelden darunter. Seit dem letzten
 * Schritt steht daneben die Demo unter /demo -- fuer alle, denen vier
 * Illustrationen die Frage "und wie sieht das mit echten Artikeln aus?" nicht
 * beantworten. Sie ist rein lesend und fuehrt am Ende ebenfalls auf
 * /register.
 *
 * Der Merker dafuer, dass das erledigt ist, wird nicht hier gesetzt, sondern
 * mit der ersten erfolgreichen Anmeldung im Proxy -- siehe WELCOME_COOKIE.
 * Ohne Konto bleibt die App fuer diesen Besucher ein leeres Versprechen, und
 * dann ist die Erklaerung beim naechsten Oeffnen genau das, was fehlt.
 */
function Welcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [step, setStep] = useState(-1);

  function finish() {
    router.replace(withRedirect("/register", redirect));
  }

  if (step < 0) {
    return (
      <button
        type="button"
        onClick={() => setStep(0)}
        className="relative flex flex-1 flex-col items-center justify-center gap-5.5 bg-(image:--gradient-primary) text-primary-foreground"
      >
        <BrandMark className="size-24 animate-pop rounded-[30px] bg-primary-foreground text-primary" iconClassName="size-13" />
        <span className="text-center">
          <span className="block font-heading text-3xl leading-tight font-bold tracking-tight">
            BetterFood
          </span>
          <span className="mt-2 block text-sm leading-snug font-medium opacity-75">
            Nichts mehr vergessen. Nichts mehr wegwerfen.
          </span>
        </span>
        <span className="absolute bottom-14 text-xs font-medium opacity-50">
          Tippen zum Starten
        </span>
      </button>
    );
  }

  const slide = SLIDES[step];
  const Illustration = slide.illustration;
  const isLast = step === SLIDES.length - 1;

  return (
    <div className="flex flex-1 flex-col px-6.5 pt-6 pb-10">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={finish}
          className="p-2 text-sm font-semibold text-muted-foreground"
        >
          Überspringen
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8.5">
        <div className="relative h-58 rounded-2xl bg-surface-2 p-4">
          <Illustration />
          {/* Der erste Auftritt des Maskottchens, noch vor jedem Konto --
              dieselbe Stelle "Titel mit Avo daneben" wie im Hinzufügen-Blatt,
              hier auf die Illustration gelegt, weil ein Slide-Titel im
              Wechsel mit dem Fließtext ohnehin schon zwei Zeilen beansprucht. */}
          <Avo size="sm" mood="happy" className="absolute right-4 bottom-4" />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-[27px] leading-tight text-balance">{slide.title}</h1>
          {/* Maße aus 8h: 14,5px/500 auf 1,55 Zeilenhöhe, auf 280px begrenzt.
              Die Begrenzung ist der eigentliche Punkt -- in der 390px-Spalte
              lief der Satz sonst über die volle Breite und damit über die
              Zeilenlänge hinaus, ab der ein Fließtext in dieser Größe
              schwerer zu lesen wird als eine Überschrift. Sie gilt auf allen
              vier Schritten und nicht nur auf dem letzten: die Schritte
              blättern ineinander, und ein Absatz, der beim Weiterblättern
              seine Breite wechselt, sieht aus wie ein Fehler. */}
          <p className="max-w-[280px] text-[14.5px] leading-[1.55] font-medium text-balance text-muted-foreground">
            {slide.body}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
        {SLIDES.map((entry, index) => (
          <span
            key={entry.title}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === step ? "w-5.5 bg-primary" : "w-1.5 bg-track",
            )}
          />
        ))}
      </div>

      {/* Knopfgruppe aus 8h: 36px unter der Punkt-Navigation, 10px zwischen
          den Zeilen. */}
      <div className="mt-9 flex flex-col gap-2.5">
        <Button
          type="button"
          onClick={() => (isLast ? finish() : setStep(step + 1))}
          className="h-14 w-full text-[16.5px]"
        >
          {isLast ? "Konto erstellen" : "Weiter"}
        </Button>

        {/* Der zweite Weg, und nur auf dem letzten Schritt: bis hierher
            erklärt die Einführung, wofür die App gut ist, danach steht die
            Frage "und wie sieht das aus?" -- die Demo beantwortet sie, ohne
            vorher nach einer E-Mail-Adresse zu fragen. Auf den Schritten
            davor stünde sie im Weg, weil dort noch "Weiter" die gemeinte
            Handlung ist.

            Der Fußnotensatz gehört dazu und nicht in die Demo allein: Er ist
            die einzige Stelle, an der vor dem Tippen steht, dass dort ein
            erfundener Vorrat wartet und kein eigener. */}
        {isLast && (
          <>
            <Link
              href="/demo"
              className={cn(buttonVariants({ variant: "outline" }), "h-14 w-full text-[16.5px]")}
            >
              Mit Demo-Vorrat ausprobieren
            </Link>
            <p className="text-center text-[12px] leading-snug font-semibold text-balance text-muted-foreground">
              {DEMO_FOOTNOTE}
            </p>
          </>
        )}

        {/* Wer schon ein Konto hat, ist auf einem neuen Geraet trotzdem hier
            gelandet -- ohne diesen Weg fuehrte der einzige Knopf ihn zur
            Registrierung mit einer bereits vergebenen E-Mail. */}
        <Link
          href={withRedirect("/login", redirect)}
          className="flex h-11 items-center justify-center text-sm font-semibold text-muted-foreground"
        >
          Ich habe schon ein Konto
        </Link>
      </div>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-(image:--gradient-primary)" />}>
      <Welcome />
    </Suspense>
  );
}
