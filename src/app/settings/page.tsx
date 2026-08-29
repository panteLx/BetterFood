"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermissionState,
  hasPushSubscription,
} from "@/lib/push-client";
import { ListManager } from "@/components/list-manager";
import { ThemeToggle } from "@/components/theme-toggle";
import { InstallHintSettings } from "@/components/install-hint";
import { authClient, useSession } from "@/lib/auth-client";

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [leadDays, setLeadDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enabling, setEnabling] = useState(false);
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

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setLeadDays(data.leadDays);
        setPermission(getNotificationPermissionState());
      })
      .finally(() => setLoading(false));

    // Nicht an der Berechtigung allein festmachen: die bleibt erteilt, auch
    // wenn dieses Gerät gar keine Subscription (mehr) hat. Sonst bot die
    // Seite eine Testbenachrichtigung an, die serverseitig ins Leere lief.
    void hasPushSubscription().then(setSubscribed);
    // Den stillen Abgleich einer bereits erteilten Berechtigung übernimmt
    // jetzt <PushSync /> im Root-Layout -- er muss auf jeder Seite laufen,
    // nicht nur hier, weil das Abmelden die Subscription löscht.
  }, []);

  async function handleSaveLeadDays() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadDays }),
      });
      if (!res.ok) throw new Error();
      toast.success("Gespeichert");
    } catch {
      toast.error("Konnte Einstellung nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEnablePush() {
    setEnabling(true);
    try {
      const ok = await subscribeToPush();
      setPermission(getNotificationPermissionState());
      setSubscribed(await hasPushSubscription());
      if (ok) {
        toast.success("Benachrichtigungen aktiviert");
      } else {
        toast.error("Benachrichtigungen konnten nicht aktiviert werden.");
      }
    } finally {
      setEnabling(false);
    }
  }

  async function handleTestNotification() {
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { sent?: number; error?: string }
        | null;

      // Den Grund vom Server durchreichen: "konnte nicht gesendet werden" war
      // die einzige Rückmeldung, egal ob die Subscription fehlte, die
      // VAPID-Schlüssel oder der Push-Dienst.
      if (!res.ok || !data?.sent) {
        toast.error(data?.error ?? "Testbenachrichtigung konnte nicht gesendet werden.");
        setSubscribed(await hasPushSubscription());
        return;
      }

      toast.success("Testbenachrichtigung gesendet");
    } catch {
      toast.error("Testbenachrichtigung konnte nicht gesendet werden.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
          ← Zurück
        </Button>
        <h1 className="text-lg font-semibold">Einstellungen</h1>
      </div>

      {session && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Angemeldet als {session.user.email}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            Abmelden
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label>Darstellung</Label>
        <ThemeToggle />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="leadDays">Erinnerung wie viele Tage vorher?</Label>
        <div className="flex gap-2">
          <Input
            id="leadDays"
            type="number"
            min={0}
            max={30}
            value={leadDays}
            disabled={loading}
            onChange={(e) => setLeadDays(Number(e.target.value))}
          />
          <Button onClick={handleSaveLeadDays} disabled={saving || loading}>
            Speichern
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Push-Benachrichtigungen</Label>
        <InstallHintSettings />
        {subscribed ? (
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">Aktiviert.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTestNotification}
              disabled={testing}
            >
              Testbenachrichtigung senden
            </Button>
          </div>
        ) : (
          <Button variant="outline" onClick={handleEnablePush} disabled={enabling}>
            {permission === "granted"
              ? "Benachrichtigungen erneut einrichten"
              : "Benachrichtigungen aktivieren"}
          </Button>
        )}
        {permission === "denied" && (
          <p className="text-sm text-destructive">
            Berechtigung wurde verweigert – bitte in den
            Browser-/System-Einstellungen erlauben.
          </p>
        )}
      </div>

      {/* Kategorien wurden frueher direkt hier gepflegt. Sie sind aber nur die
          eine Haelfte dessen, was die App ueber die Vorraete weiss -- die
          andere sind die Produkte selbst. Beides steht jetzt zusammen unter
          /knowledge, statt sich auf zwei Seiten zu verteilen. */}
      <Link
        href="/knowledge"
        className="flex items-center gap-3 rounded-xl border border-input p-3 text-left hover:bg-muted"
      >
        <BookOpen className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Datenbank</p>
          <p className="text-xs text-muted-foreground">
            Kategorien und gelernte Produktzuordnungen bearbeiten
          </p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-input p-3">
        <ListManager />
      </div>
    </div>
  );
}
