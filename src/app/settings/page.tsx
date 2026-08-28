"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { subscribeToPush, getNotificationPermissionState } from "@/lib/push-client";
import { CategoryManager } from "@/components/category-manager";
import { ThemeToggle } from "@/components/theme-toggle";

export default function SettingsPage() {
  const router = useRouter();
  const [leadDays, setLeadDays] = useState(2);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setLeadDays(data.leadDays);
        setPermission(getNotificationPermissionState());
      })
      .finally(() => setLoading(false));

    // Permission can be "granted" from a previous attempt that never
    // finished storing a subscription (e.g. no service worker was
    // available at the time) - resync silently so this device isn't
    // stuck without a way to (re-)trigger subscribeToPush().
    if (getNotificationPermissionState() === "granted") {
      subscribeToPush();
    }
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
    const ok = await subscribeToPush();
    setPermission(getNotificationPermissionState());
    if (ok) {
      toast.success("Benachrichtigungen aktiviert");
    } else {
      toast.error("Benachrichtigungen konnten nicht aktiviert werden.");
    }
  }

  async function handleTestNotification() {
    setTesting(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error();
      const { sent } = (await res.json()) as { sent: number };
      if (sent === 0) throw new Error();
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

      <div className="flex flex-col gap-1.5">
        <Label>Push-Benachrichtigungen</Label>
        {permission === "granted" ? (
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
          <Button variant="outline" onClick={handleEnablePush}>
            Benachrichtigungen aktivieren
          </Button>
        )}
        {permission === "denied" && (
          <p className="text-sm text-destructive">
            Berechtigung wurde verweigert – bitte in den Browser-/System-Einstellungen erlauben.
          </p>
        )}
      </div>

      <CategoryManager />
    </div>
  );
}
