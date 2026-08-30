import type { Metadata } from "next";
import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { getOidcDisplayName } from "@/lib/oidc";

export const metadata: Metadata = {
  title: "Anmelden",
  description: "Melde dich an, um deinen Vorrat auf allen Geräten zu sehen.",
};

/**
 * Ob es SSO gibt, weiss erst der laufende Server -- deshalb steckt die
 * Abfrage in der Suspense-Grenze, die das Formular ohnehin schon braucht
 * (useSearchParams), und nicht in der statischen Huelle der Seite.
 */
async function LoginFormSlot() {
  const ssoName = await getOidcDisplayName();
  return <LoginForm ssoName={ssoName} />;
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col gap-6.5 px-6.5 pt-14 pb-8">
      <div className="flex flex-col gap-3.5">
        <BrandMark />
        <div>
          <h1 className="text-[26px] leading-snug">Willkommen zurück</h1>
          <p className="mt-1.5 text-sm leading-relaxed font-medium text-balance text-muted-foreground">
            Melde dich an, um deinen Vorrat auf allen Geräten zu sehen.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="flex-1" />}>
        <LoginFormSlot />
      </Suspense>
    </div>
  );
}
