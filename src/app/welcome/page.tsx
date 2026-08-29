"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import {
  ReminderIllustration,
  ScanIllustration,
  StockIllustration,
  SwipeIllustration,
} from "@/components/onboarding-illustrations";
import { WELCOME_COOKIE } from "@/lib/welcome";
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
 * Splash und Onboarding, einmal vor der ersten Anmeldung.
 *
 * Das Setzen des Cookies ist der eigentliche Punkt: die Route wird vom Proxy
 * nur so lange angesteuert, wie niemand sie gesehen hat. Sie liegt bewusst
 * nicht hinter der Anmeldung -- wer erklaert bekommen soll, wofuer er ein
 * Konto anlegt, muss das vorher lesen koennen.
 */
function Welcome() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [step, setStep] = useState(-1);

  function finish(target: "/login" | "/register") {
    // Ein Jahr: laenger als jede Sitzung, kuerzer als "nie wieder" -- wer die
    // App nach einem Jahr neu installiert, darf die Einfuehrung erneut sehen.
    document.cookie = `${WELCOME_COOKIE}=1; path=/; max-age=31536000; samesite=lax`;
    router.replace(withRedirect(target, redirect));
  }

  if (step < 0) {
    return (
      <button
        type="button"
        onClick={() => setStep(0)}
        className="relative flex flex-1 flex-col items-center justify-center gap-5.5 bg-primary text-primary-foreground"
      >
        <BrandMark className="size-24 animate-pop rounded-[30px] bg-primary-foreground text-primary" iconClassName="size-13" />
        <span className="text-center">
          <span className="block text-3xl leading-tight font-extrabold tracking-tight">
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
          onClick={() => finish("/login")}
          className="p-2 text-sm font-semibold text-muted-foreground"
        >
          Überspringen
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-8.5">
        <div className="h-58 rounded-3xl border border-border bg-surface-2 p-4">
          <Illustration />
        </div>
        <div className="flex flex-col gap-3">
          <h1 className="text-[27px] leading-tight text-balance">{slide.title}</h1>
          <p className="text-[15px] leading-relaxed font-medium text-balance text-muted-foreground">
            {slide.body}
          </p>
        </div>
      </div>

      <div className="mb-6 flex items-center justify-center gap-1.5" aria-hidden="true">
        {SLIDES.map((entry, index) => (
          <span
            key={entry.title}
            className={cn(
              "h-1.5 rounded-full transition-all",
              index === step ? "w-5.5 bg-primary" : "w-1.5 bg-border",
            )}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => (isLast ? finish("/register") : setStep(step + 1))}
        className="h-14 rounded-[18px] bg-primary text-base font-bold text-primary-foreground"
      >
        {isLast ? "Los geht’s" : "Weiter"}
      </button>
    </div>
  );
}

export default function WelcomePage() {
  return (
    <Suspense fallback={<div className="flex-1 bg-primary" />}>
      <Welcome />
    </Suspense>
  );
}
