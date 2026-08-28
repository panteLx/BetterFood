"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

const oidcDisplayName = process.env.NEXT_PUBLIC_OIDC_DISPLAY_NAME;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error("E-Mail oder Passwort ist falsch.");
        return;
      }
      router.push(searchParams.get("redirect") ?? "/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleSso() {
    setSsoLoading(true);
    try {
      await authClient.signIn.social({
        provider: "oidc",
        callbackURL: searchParams.get("redirect") ?? "/",
      });
    } finally {
      setSsoLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">E-Mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Passwort</Label>
          <Input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={loading}>
          Anmelden
        </Button>
      </form>

      {oidcDisplayName && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            oder
            <div className="h-px flex-1 bg-border" />
          </div>
          <Button type="button" variant="outline" disabled={ssoLoading} onClick={handleSso}>
            Mit {oidcDisplayName} anmelden
          </Button>
        </>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col justify-center gap-6 p-4">
      <h1 className="text-lg font-semibold">Anmelden</h1>
      <Suspense fallback={<div className="h-40" />}>
        <LoginForm />
      </Suspense>
      <p className="text-sm text-muted-foreground">
        Noch kein Konto?{" "}
        <Link href="/register" className="underline">
          Registrieren
        </Link>
      </p>
      <p className="text-sm text-muted-foreground">
        Nur ein Produkt nachschlagen?{" "}
        <Link href="/scan" className="underline">
          Ohne Anmeldung scannen
        </Link>
      </p>
    </div>
  );
}
