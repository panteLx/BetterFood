"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { safeRedirect, withRedirect } from "@/lib/utils";

export function LoginForm({
  ssoName,
  registrationOpen,
}: {
  ssoName: string | null;
  registrationOpen: boolean;
}) {
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
        <Input
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          placeholder="E-Mail"
          aria-label="E-Mail"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-14 text-base font-semibold"
        />
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="Passwort"
          aria-label="Passwort"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-14 text-base font-semibold"
        />
        <Button type="submit" disabled={loading} className="mt-1.5 h-14 w-full text-base">
          Anmelden
        </Button>
      </form>

      {ssoName && (
        <>
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-hairline" />
            <span className="text-xs font-semibold text-faint">oder</span>
            <span className="h-px flex-1 bg-hairline" />
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={ssoLoading}
            onClick={handleSso}
            className="h-13.5 w-full text-[15px]"
          >
            Mit {ssoName} anmelden
          </Button>
        </>
      )}

      <div className="flex-1" />

      {/* Der Redirect muss mit auf /register: wer aus einer Erinnerung oder
          einem Lesezeichen kommt, landet sonst nach der Anmeldung nicht dort,
          wo er hinwollte, sondern auf einer leeren Startseite. */}
      {registrationOpen && (
        <div className="flex justify-center">
          <Link
            href={withRedirect("/register", redirect)}
            className="p-2 text-sm font-bold text-primary"
          >
            Noch kein Konto? Registrieren
          </Link>
        </div>
      )}
    </div>
  );
}
