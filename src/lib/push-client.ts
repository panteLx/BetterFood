function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function pushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window
  );
}

const DEV_SERVICE_WORKER_URL = "/dev-sw.js";
const REGISTRATION_TIMEOUT_MS = 10_000;

/**
 * Die aktive Service-Worker-Registrierung -- oder null, wenn es keine gibt.
 *
 * Zwei Fallen stecken hier drin. Erstens registriert im Entwicklungsmodus
 * niemand einen Worker: next-pwa ist ein Webpack-Plugin, `next dev` läuft mit
 * Turbopack. Also holen wir ihn uns hier selbst von /dev-sw.js (im Produktions-
 * Build existiert die Route nicht, dort hat next-pwa längst registriert).
 * Zweitens ist `navigator.serviceWorker.ready` ein Versprechen, das ohne
 * Registrierung nicht etwa abgelehnt wird, sondern schlicht nie erfüllt --
 * ein `await` darauf hängt lautlos bis zum Neuladen der Seite. Deshalb das
 * Zeitlimit: lieber ein ehrliches Scheitern als ein Button, der nichts tut.
 */
async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (process.env.NODE_ENV === "development") {
    try {
      await navigator.serviceWorker.register(DEV_SERVICE_WORKER_URL);
    } catch {
      return null;
    }
  }

  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), REGISTRATION_TIMEOUT_MS)),
  ]);
}

async function storeSubscription(subscription: PushSubscription): Promise<boolean> {
  const json = subscription.toJSON();
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });

  return res.ok;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported()) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration = await getRegistration();
  if (!registration) return false;

  const keyRes = await fetch("/api/push/public-key");
  if (!keyRes.ok) return false;
  const { publicKey } = (await keyRes.json()) as { publicKey?: string };
  if (!publicKey) return false;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
  });

  return storeSubscription(subscription);
}

/**
 * Beim Abmelden: die Subscription serverseitig löschen und sie im Browser
 * aufgeben. Beides zusammen, weil jede Hälfte für sich eine Lücke lässt --
 * bleibt die Zeile in der Datenbank, bekommt das Gerät weiter Erinnerungen
 * eines Kontos, an dem niemand mehr angemeldet ist; bleibt umgekehrt die
 * Browser-Subscription bestehen, liefe sie beim nächsten Login stumm weiter,
 * ohne dass der Server sie kennt.
 *
 * Schlägt der Server-Aufruf fehl (offline), wird trotzdem lokal abgemeldet:
 * der Endpunkt ist damit tot und der Cron-Job räumt die Zeile beim nächsten
 * Zustellversuch selbst weg (410 Gone).
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!pushSupported()) return true;

  try {
    // getRegistration() statt ready: ohne Worker loest das hier sofort auf,
    // während ready hängen bliebe -- und das Abmelden mit ihm.
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return true;

    let ok = true;
    try {
      const res = await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }

    await subscription.unsubscribe();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Nach dem Anmelden: die Subscription dieses Geräts wieder an das aktuelle
 * Konto binden. Ohne das bliebe ein Gerät nach Ab- und Wiederanmelden stumm,
 * bis jemand zufällig die Einstellungen öffnet. Fragt nie nach der
 * Berechtigung -- wer sie nie erteilt hat, soll durch einen Login nicht
 * plötzlich einen Systemdialog sehen.
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  if (Notification.permission !== "granted") return;

  const registration = await getRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    await storeSubscription(subscription);
    return;
  }

  await subscribeToPush();
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}

/**
 * Ob dieses Gerät tatsächlich eine Subscription besitzt.
 *
 * Die erteilte Berechtigung allein sagt das nicht: sie überlebt das
 * Abmelden, das Löschen der Website-Daten und einen abgebrochenen
 * Registrierungsversuch. Die Einstellungsseite meldete daher "Aktiviert",
 * während serverseitig nichts hinterlegt war -- und die Testbenachrichtigung
 * antwortete mit 404.
 */
export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}
