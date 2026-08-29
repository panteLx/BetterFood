"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  ChevronRight,
  Database,
  ListChecks,
  Moon,
  type LucideIcon,
} from "lucide-react";
import { InstallHintSettings } from "@/components/install-hint";
import { unsubscribeFromPush } from "@/lib/push-client";
import { authClient, useSession } from "@/lib/auth-client";

/**
 * "Mehr" ist eine Verteilerseite, keine Sammelseite.
 *
 * Vorher standen Erinnerungen, Darstellung und die komplette Listen-
 * verwaltung untereinander auf einem einzigen langen Screen -- inklusive
 * ausklappbarer Mitgliederlisten. Jede dieser Aufgaben hat jetzt ihre eigene
 * Seite, und hier steht nur noch, welche es gibt und wie sie gerade
 * eingestellt sind.
 */
const ROWS: { href: string; icon: LucideIcon; label: string; hint: string }[] = [
  {
    href: "/settings/reminders",
    icon: Bell,
    label: "Erinnerungen",
    hint: "Wann und wie früh wir uns melden",
  },
  {
    href: "/settings/appearance",
    icon: Moon,
    label: "Darstellung",
    hint: "Hell, dunkel oder wie das System",
  },
  {
    href: "/knowledge",
    icon: Database,
    label: "Datenbank",
    hint: "Produkte, Kategorien und Orte",
  },
  {
    href: "/settings/lists",
    icon: ListChecks,
    label: "Listen",
    hint: "Vorräte trennen und teilen",
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    // Vor dem Abmelden, solange die Session den Löschaufruf noch autorisiert:
    // sonst blieben die Erinnerungen dieses Kontos auf dem Gerät stehen.
    setSigningOut(true);
    const pushRemoved = await unsubscribeFromPush();
    if (!pushRemoved) {
      toast.warning("Benachrichtigungen konnten nicht vollständig abgemeldet werden.");
    }
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  const name = session?.user.name ?? "";
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-2 pb-4">
      <h1 className="text-[26px] leading-tight">Einstellungen</h1>

      {session && (
        <div className="flex items-center gap-3.5 rounded-3xl border border-border bg-card p-3.5">
          <span className="flex size-11.5 shrink-0 items-center justify-center rounded-2xl bg-primary-tint text-[17px] font-extrabold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-bold">{name}</p>
            <p className="mt-1 truncate text-[12.5px] leading-tight font-medium text-muted-foreground">
              {session.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="h-9 shrink-0 rounded-xl border border-border bg-surface-2 px-3.5 text-[13px] font-semibold disabled:opacity-60"
          >
            Abmelden
          </button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          App
        </h2>
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          {ROWS.map((row, index) => (
            <Link
              key={row.href}
              href={row.href}
              className={`flex items-center gap-3.5 px-4 py-3.5 ${
                index < ROWS.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <row.icon className="size-5 shrink-0 text-primary" strokeWidth={1.8} />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{row.label}</span>
                <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-muted-foreground">
                  {row.hint}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={2} />
            </Link>
          ))}
        </div>
      </section>

      <InstallHintSettings />

      <p className="pt-1 pb-1 text-center text-[11px] leading-relaxed font-medium text-faint">
        BetterFood · Web-App (PWA)
      </p>
    </div>
  );
}
