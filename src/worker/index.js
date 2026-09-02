self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "BetterFood", body: event.data.text() };
  }

  // Hier standen einmal Aktionsknöpfe ("Aufgebraucht" / "Noch da"). Safari
  // rendert `actions` weder unter iOS noch unter macOS -- in einem Haushalt,
  // der ausschließlich iPhones benutzt, waren sie also nie zu sehen. Was sie
  // lösen sollten (dieselbe Ware meldet sich tagelang mit demselben Satz),
  // löst jetzt das Stufenmodell in src/lib/expiry-check.ts, und zwar auf
  // jeder Plattform.
  const options = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    // Das Badge (die kleine Marke in der Statusleiste) färbt Android auf eine
    // einfarbige Silhouette ein: alles Nicht-Transparente wird weiß. Das
    // App-Icon ergab dort einen grauen Klecks, deshalb ein eigenes Zeichen
    // ohne Hintergrund.
    badge: "/icons/badge-96.png",
    // tag: eine neue Meldung derselben Liste ersetzt die vorherige, statt sich
    // zu stapeln. renotify bleibt aus, damit das Ersetzen still passiert.
    tag: payload.tag || "vorrat",
    renotify: false,
    data: {
      url: payload.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title || "BetterFood", options));
});

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

  event.waitUntil(focusOrOpen(data.url || "/"));
});
