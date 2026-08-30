import { Suspense } from "react";
import { BrandMark } from "@/components/brand-mark";
import { RegisterForm } from "@/components/register-form";
import { getOidcDisplayName } from "@/lib/oidc";

async function RegisterFormSlot() {
  const ssoName = await getOidcDisplayName();
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
