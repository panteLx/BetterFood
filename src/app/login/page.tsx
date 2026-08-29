"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand-mark";
import { authClient } from "@/lib/auth-client";
import { safeRedirect, withRedirect } from "@/lib/utils";

const oidcDisplayName = process.env.NEXT_PUBLIC_OIDC_DISPLAY_NAME;

const fieldClass =
  "h-14 w-full rounded-[18px] border border-border bg-card px-4 text-[15px] font-semibold outline-none placeholder:text-faint focus-visible:ring-3 focus-visible:ring-ring/50";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error("E-Mail oder Passwort ist falsch.");
        return;
      }
      router.push(safeRedirect(redirect));
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleSso() {
    setSsoLoading(true);
    try {
      await authClient.signIn.social({ provider: "oidc", callbackURL: safeRedirect(redirect) });
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
        {/* name + autoComplete: ohne beides bietet iOS weder das Ausfuellen
            aus dem Schluesselbund noch das Speichern eines Passworts an. */}
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
          autoComplete="current-password"
          required
          placeholder="Passwort"
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
          Anmelden
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
            Mit {oidcDisplayName} anmelden
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* Der Redirect muss mit auf /register: wer erst scannt und dann ein
          Konto anlegt, verliert sonst genau das Produkt, das ihn hergefuehrt
          hat, und landet auf einer leeren Startseite. */}
      <div className="flex flex-col items-center gap-1">
        <Link
          href={withRedirect("/register", redirect)}
          className="p-2 text-sm font-bold text-primary"
        >
          Noch kein Konto? Registrieren
        </Link>
        <Link href="/scan" className="p-2 text-sm font-semibold text-muted-foreground">
          Nur nachschlagen – ohne Anmeldung scannen
        </Link>
      </div>
    </div>
  );
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
        <LoginForm />
      </Suspense>
    </div>
  );
}
