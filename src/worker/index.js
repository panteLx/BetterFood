// Aktionen, die direkt aus der Benachrichtigung heraus beantwortet werden
// koennen. Vorher fuehrte jeder Klick nur auf die Startseite und der Nutzer
// musste den Artikel selbst wiederfinden, den ihm die Meldung gerade genannt
// hatte -- die Meldung war damit reine Arbeit statt einer erledigten Aufgabe.
const ACTION_USED = "used";
const ACTION_SNOOZE = "snooze";

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Vorrat", body: event.data.text() };
  }

  const options = {
    body: payload.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // tag: eine neue Meldung derselben Liste ersetzt die vorherige, statt sich
    // zu stapeln. renotify bleibt aus, damit das Ersetzen still passiert und
    // dieselbe Ware den Nutzer nicht taeglich neu anstupst.
    tag: payload.tag || "vorrat",
    renotify: false,
    data: {
      url: payload.url || "/",
      itemId: payload.itemId ?? null,
    },
  };

  // Aktionen ergeben nur Sinn, wenn die Meldung genau einen Artikel betrifft --
  // sonst waere unklar, worauf sich "Aufgebraucht" bezieht.
  if (payload.itemId) {
    options.actions = [
      { action: ACTION_USED, title: "Aufgebraucht" },
      { action: ACTION_SNOOZE, title: "Noch da" },
    ];
  }

  event.waitUntil(self.registration.showNotification(payload.title || "Vorrat", options));
});

async function respondFromNotification(action, itemId) {
  const request =
    action === ACTION_USED
      ? fetch(`/api/items/${itemId}/resolve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ status: "used" }),
        })
      : fetch(`/api/items/${itemId}/snooze`, { method: "POST", credentials: "include" });

  const res = await request;
  if (res.ok) return;

  // Fehlgeschlagen (z.B. Session abgelaufen): der Nutzer soll nicht im Glauben
  // bleiben, es sei erledigt -- also die App oeffnen, damit er es selbst sieht.
  await self.clients.openWindow("/");
}

async function focusOrOpen(url) {
  const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientList) {
    if ("focus" in client) {
      if ("navigate" in client) {
        try {
          await client.navigate(url);
        } catch {
          // Navigation kann fehlschlagen, der Fokus ist trotzdem besser als
          // ein zweites Fenster.
        }
      }
      return client.focus();
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  if (event.action && data.itemId) {
    event.waitUntil(respondFromNotification(event.action, data.itemId));
    return;
  }

  event.waitUntil(focusOrOpen(data.url || "/"));
});
