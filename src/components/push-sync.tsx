"use client";

import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth-client";
import { syncPushSubscription } from "@/lib/push-client";

/**
 * Hält die Push-Subscription dieses Geräts am angemeldeten Konto fest.
 *
 * Sitzt bewusst in den Providers und nicht auf einer Seite: das Root-Layout
 * bleibt über Navigationen hinweg montiert, der Abgleich läuft also einmal pro
 * Anmeldung statt bei jedem Seitenwechsel. Und weil das Abmelden die
 * Subscription löscht, braucht es einen Ort, der ein späteres Anmelden
 * mitbekommt -- die Einstellungsseite, die früher die einzige Stelle mit
 * subscribeToPush() war, sieht ein Konto erst, wenn jemand sie öffnet.
 */
export function PushSync() {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const syncedFor = useRef<string | null>(null);

  useEffect(() => {
    // Abgemeldet: Merker zurücksetzen, sonst würde eine erneute Anmeldung
    // desselben Kontos im selben Tab als "schon erledigt" durchgehen.
    if (!userId) {
      syncedFor.current = null;
      return;
    }

    if (syncedFor.current === userId) return;
    syncedFor.current = userId;

    syncPushSubscription().catch(() => {
      syncedFor.current = null;
    });
  }, [userId]);

  return null;
}
