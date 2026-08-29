"use client";

import { useEffect, useState } from "react";
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
import { useTheme } from "next-themes";
import { LEAD_DAY_OPTIONS } from "@/lib/notification-settings";
import { useIsClient } from "@/lib/use-is-client";
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
 *
 * "Wie sie eingestellt sind" heisst woertlich der aktuelle Wert am rechten
 * Rand: "2 Tage vorher", "Dunkel", "Zuhause". Eine feste Beschreibung
 * ("Wann und wie früh wir uns melden") wiederholte nur, was die Zeile schon
 * heisst -- den Grund, die Seite zu oeffnen, liefert erst der Wert. Wo es
 * keinen einzelnen Wert gibt, steht weiterhin ein Hinweis darunter.
 */
const ROWS: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint?: string;
  value?: (state: SettingsSummary) => string | undefined;
}[] = [
  {
    href: "/settings/reminders",
    icon: Bell,
    label: "Erinnerungen",
    value: (state) => state.leadDaysLabel,
  },
  {
    href: "/settings/appearance",
    icon: Moon,
    label: "Darstellung",
    value: (state) => state.themeLabel,
  },
  {
    href: "/knowledge",
    icon: Database,
    label: "Datenbank",
    hint: "Kategorien und gelernte Produkte",
  },
  {
    href: "/settings/lists",
    icon: ListChecks,
    label: "Listen",
    value: (state) => state.activeListName,
  },
];

type SettingsSummary = {
  leadDaysLabel?: string;
  themeLabel?: string;
  activeListName?: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [leadDaysLabel, setLeadDaysLabel] = useState<string>();
  const [activeListName, setActiveListName] = useState<string>();

  // Erst im Client: theme steht vor der Hydration nicht fest, und ein
  // vorschnelles "Hell" waere schlimmer als ein Wert, der einen Tick spaeter
  // erscheint.
  const isClient = useIsClient();
  const { theme, resolvedTheme } = useTheme();
  const themeLabel = !isClient
    ? undefined
    : theme === "system"
      ? "System"
      : resolvedTheme === "dark"
        ? "Dunkel"
        : "Hell";

  useEffect(() => {
    let active = true;

    fetch("/api/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { leadDays?: number } | null) => {
        if (!active || !data) return;
        const option = LEAD_DAY_OPTIONS.find(
          (entry) => entry.days === data.leadDays,
        );
        setLeadDaysLabel(option?.label ?? `${data.leadDays} Tage vorher`);
      })
      .catch(() => {
        // Ohne Wert steht die Zeile eben nur mit ihrem Namen da -- ein
        // Fehlertext waere hier lauter als die Information wert ist.
      });

    fetch("/api/lists")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            lists?: { id: number; name: string }[];
            activeListId?: number;
          } | null,
        ) => {
          if (!active || !data) return;
          setActiveListName(
            data.lists?.find((list) => list.id === data.activeListId)?.name,
          );
        },
      )
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  const summary: SettingsSummary = {
    leadDaysLabel,
    themeLabel,
    activeListName,
  };

  async function handleSignOut() {
    // Vor dem Abmelden, solange die Session den Löschaufruf noch autorisiert:
    // sonst blieben die Erinnerungen dieses Kontos auf dem Gerät stehen.
    setSigningOut(true);
    const pushRemoved = await unsubscribeFromPush();
    if (!pushRemoved) {
      toast.warning(
        "Benachrichtigungen konnten nicht vollständig abgemeldet werden.",
      );
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
        <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-card p-3.5">
          <span className="flex size-11.5 shrink-0 items-center justify-center rounded-[13px] bg-primary-tint text-[17px] font-extrabold text-primary">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-bold">
              {name}
            </p>
            <p className="mt-1 truncate text-[12.5px] leading-tight font-medium text-muted-foreground">
              {session.user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="h-9 shrink-0 rounded-[10px] border border-border bg-surface-2 px-3.5 text-[13px] font-semibold disabled:opacity-60"
          >
            Abmelden
          </button>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          App
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {ROWS.map((row, index) => {
            const value = row.value?.(summary);
            return (
              <Link
                key={row.href}
                href={row.href}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  index < ROWS.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <row.icon
                  className="size-5 shrink-0 text-primary"
                  strokeWidth={1.8}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">
                    {row.label}
                  </span>
                  {row.hint && (
                    <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-muted-foreground">
                      {row.hint}
                    </span>
                  )}
                </span>
                {value && (
                  <span className="max-w-[9.5rem] shrink-0 truncate text-[13px] font-medium text-muted-foreground">
                    {value}
                  </span>
                )}
                <ChevronRight
                  className="size-4 shrink-0 text-faint"
                  strokeWidth={2}
                />
              </Link>
            );
          })}
        </div>
      </section>

      <p className="pt-1 pb-1 text-center text-[11px] leading-relaxed font-medium text-faint">
        BetterFood · v1.0.0 (stable)
      </p>
    </div>
  );
}
