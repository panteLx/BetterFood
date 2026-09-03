import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { RegisterForm } from "@/components/register-form";
import { getOidcDisplayName } from "@/lib/oidc";
import { getRegistrationOpen } from "@/lib/registration";

export const metadata: Metadata = {
  title: "Konto erstellen",
  description: "Lege ein Konto an und starte mit der ersten Vorratsliste deines Haushalts.",
};

/**
 * Ist die Registrierung zu, steht hier ein Satz statt eines Formulars.
 *
 * Bewusst eine Auskunft und keine Weiterleitung: unter Cache Components ist
 * die Huelle dieser Seite bereits ausgeliefert, wenn dieser Zweig laeuft --
 * ein redirect() liesse also erst "Konto erstellen" aufblitzen und spraenge
 * dann weg. Und bewusst nicht ueber PUBLIC_PREFIXES im Proxy geloest:
 * /register muss oeffentlich erreichbar bleiben, sonst schickt der Proxy
 * einen Besucher ohne Sitzung auf /welcome -- wo die Einfuehrung endet, indem
 * sie hierher fuehrt. Das waere eine Schleife.
 *
 * Der Riegel selbst sitzt ohnehin serverseitig in lib/auth.ts
 * (disableSignUp); dies hier ist die Erklaerung dazu, nicht der Schutz.
 */
async function RegisterFormSlot() {
  const [registrationOpen, ssoName] = await Promise.all([
    getRegistrationOpen(),
    getOidcDisplayName(),
  ]);

  if (!registrationOpen) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <p className="rounded-xl bg-card p-4 text-sm leading-relaxed font-medium text-muted-foreground shadow-row">
          Auf diesem Server können keine neuen Konten angelegt werden. Wenn du
          zu diesem Haushalt gehörst, lass dir von der Person, die ihn
          eingerichtet hat, einen Zugang geben.
        </p>
        <div className="flex-1" />
        <div className="flex justify-center">
          <Link href="/login" className="p-2 text-sm font-bold text-primary">
            Zur Anmeldung
          </Link>
        </div>
      </div>
    );
  }

  return <RegisterForm ssoName={ssoName} />;
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
        <RegisterFormSlot />
      </Suspense>
    </div>
  );
}
