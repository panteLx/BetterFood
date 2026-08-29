"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { authClient } from "@/lib/auth-client";
import {
  HOUSEHOLD_COOKIE,
  HOUSEHOLD_COOKIE_MAX_AGE,
  normalizeHouseholdName,
} from "@/lib/household";
import { safeRedirect, withRedirect } from "@/lib/utils";

type SignUpPayload = Parameters<typeof authClient.signUp.email>[0];

const oidcDisplayName = process.env.NEXT_PUBLIC_OIDC_DISPLAY_NAME;

const fieldClass =
  "h-14 w-full rounded-[18px] border border-border bg-card px-4 text-[15px] font-semibold outline-none placeholder:text-faint focus-visible:ring-3 focus-visible:ring-ring/50";

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [name, setName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      // householdName steht in keiner Nutzerspalte, deshalb kennen die
      // Client-Typen das Feld nicht. Der Endpunkt reicht unbekannte Felder
      // aber an den create-Hook durch, der daraus die erste Liste benennt
      // (siehe readHouseholdName in lib/auth.ts).
      const { error } = await authClient.signUp.email({
        name,
        email,
        password,
        householdName,
      } as SignUpPayload);
      if (error) {
        toast.error(error.message ?? "Registrierung fehlgeschlagen.");
        return;
      }
      // Ziel beibehalten: wer von /confirm mit einem gescannten Produkt kommt,
      // soll nach der Registrierung genau dort weitermachen.
      router.push(safeRedirect(redirect));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  /**
   * Auch per SSO entsteht hier ein neues Konto -- und damit ein neuer
   * Haushalt. Der Name kann die Umleitung zum Anbieter nicht im
   * Anfragekoerper ueberstehen, deshalb legt er sich fuer die Dauer der
   * Runde in ein Cookie (siehe readHouseholdName in lib/auth.ts).
   */
  async function handleSso() {
    const household = normalizeHouseholdName(householdName);
    if (!household) {
      toast.error("Bitte einen Namen für den Haushalt eingeben.");
      return;
    }

    setSsoLoading(true);
    document.cookie = `${HOUSEHOLD_COOKIE}=${encodeURIComponent(household)}; path=/; max-age=${HOUSEHOLD_COOKIE_MAX_AGE}; samesite=lax`;
    try {
      await authClient.signIn.social({ provider: "oidc", callbackURL: safeRedirect(redirect) });
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        <input
          name="name"
          autoComplete="name"
          required
          placeholder="Dein Name"
          aria-label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={fieldClass}
        />
        {/* Der Haushalt ist die erste Liste. Bisher hiess sie fuer alle
            "Zuhause" -- ein Name, den man erst in den Einstellungen finden
            und aendern musste, um zu merken, dass er aenderbar ist. */}
        <input
          name="household"
          autoComplete="off"
          required
          placeholder="Haushalt, z. B. Zuhause"
          aria-label="Name des Haushalts"
          value={householdName}
          onChange={(event) => setHouseholdName(event.target.value)}
          className={fieldClass}
        />
        <input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="E-Mail"
          aria-label="E-Mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={fieldClass}
        />
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Passwort (mind. 8 Zeichen)"
          aria-label="Passwort"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={fieldClass}
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-1.5 h-14 rounded-[18px] bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
        >
          Konto erstellen
        </button>
      </form>

      {oidcDisplayName && (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs font-semibold text-faint">oder</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            disabled={ssoLoading}
            onClick={handleSso}
            className="h-13.5 rounded-[18px] border border-border bg-card text-[15px] font-semibold disabled:opacity-60"
          >
            Mit {oidcDisplayName} registrieren
          </button>
        </>
      )}

      <div className="flex-1" />

      <div className="flex justify-center">
        <Link
          href={withRedirect("/login", redirect)}
          className="p-2 text-sm font-bold text-primary"
        >
          Ich habe schon ein Konto
        </Link>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex flex-1 flex-col gap-6.5 px-6.5 pt-14 pb-8">
      <div className="flex flex-col gap-3.5">
        <BrandMark />
        <div>
          <h1 className="text-[26px] leading-snug">Konto erstellen</h1>
          <p className="mt-1.5 text-sm leading-relaxed font-medium text-balance text-muted-foreground">
            Dein Haushalt wird die erste Vorratsliste – teilen und umbenennen geht später
            jederzeit.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="flex-1" />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
