# BetterFood

Selbst gehostete PWA zur Verwaltung von Lebensmittelvorräten: Ablaufdaten im Blick behalten, Artikel per Barcode-Scan (Open Food Facts) erfassen, Listen mit anderen Haushaltsmitgliedern teilen und per Web-Push an bald ablaufende Artikel erinnert werden.

## Voraussetzungen

- Node.js 20+
- npm

## Setup

```bash
npm install
cp .env.example .env
```

`.env` ausfüllen (siehe Kommentare in `.env.example`):

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — mit `npx web-push generate-vapid-keys` erzeugen
- `VAPID_SUBJECT` — Kontakt-URI für Push-Dienste (z. B. `mailto:...`)
- `INTERNAL_CRON` — `false` schaltet den eingebauten stündlichen Zeitgeber für die Erinnerungen ab (Standard: an)
- `CRON_SECRET` — Bearer-Token für `POST /api/cron/check-expiry`, z. B. mit `openssl rand -hex 32`. Ohne diesen Wert antwortet die Route mit `503`; der eingebaute Zeitgeber läuft davon unabhängig
- `BETTER_AUTH_SECRET` — z. B. mit `openssl rand -hex 32`
- `BETTER_AUTH_URL` — Basis-URL der App (lokal `http://localhost:3000`)
- `ALLOW_REGISTRATION` — siehe [Zugang beschränken](#zugang-beschränken)
- `TRUSTED_PROXIES` — siehe [Hinter einem Reverse Proxy](#hinter-einem-reverse-proxy)
- optional: `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_DISPLAY_NAME` für Single Sign-on

Datenbank-Migrationen anwenden:

```bash
npm run db:migrate
```

## Entwicklung

```bash
npm run dev
```

App läuft auf `http://localhost:3000`.

## Weitere Befehle

```bash
npm run build        # Produktions-Build
npm run start        # Produktions-Server
npm run lint         # ESLint
npm run icons        # App-Icons aus dem Blatt-Zeichen neu bauen (braucht ImageMagick)
npm run db:generate  # Migration aus Schema-Änderungen generieren
```

## Deployment

Docker-Image über `Dockerfile` / `compose.yaml`:

```bash
docker compose up -d
```

Die SQLite-Datenbank liegt im gemounteten `data`-Volume. Migrationen laufen beim Container-Start automatisch, wenn `RUN_MIGRATIONS=true` gesetzt ist. Der Serverprozess läuft als unprivilegierter Nutzer `node` (UID 1000) — wer von einem älteren Image kommt, zieht die Rechte auf dem bestehenden Volume einmalig nach:

```bash
docker run --rm -v betterfood_data:/data alpine chown -R 1000:1000 /data
```

### Zugang beschränken

Eine Instanz gehört einem Haushalt, nicht dem Internet. Solange `ALLOW_REGISTRATION=true` gesetzt ist, kann **jeder**, der die Adresse kennt, ein Konto anlegen — und ein Konto kommt an die Nutzersuche, an die Mitgliederlisten und an den Rechnungsimport.

Für den ersten Start muss die Registrierung offen sein, sonst gibt es kein einziges Konto. Sind alle Haushaltsmitglieder angelegt:

```bash
# in .env
ALLOW_REGISTRATION=false
```

Danach `docker compose up -d --force-recreate`. Anmelden funktioniert weiter, nur neue Konten entstehen nicht mehr; der Link „Noch kein Konto?" verschwindet und `/register` leitet auf die Anmeldung. Wer ausschließlich SSO nutzt, kann die Registrierung dauerhaft zulassen — der Identity Provider entscheidet dann, wer überhaupt bis hierher kommt.

### Hinter einem Reverse Proxy

Steht die App hinter nginx, Caddy oder Traefik, muss `TRUSTED_PROXIES` die CIDR-Bereiche nennen, aus denen dieser Proxy die Verbindung aufbaut:

```bash
# in .env -- Docker-Bridge zusätzlich zu localhost
TRUSTED_PROXIES=127.0.0.1/32,::1/128,172.16.0.0/12
```

Ohne diesen Wert kann better-auth die Client-IP nicht vertrauenswürdig ermitteln. Die Folgen sind still, aber real: das Limit für Anmeldeversuche (3 pro 10 Sekunden) gilt dann **für alle Nutzer zusammen** — ein einzelner Passwort-Rater sperrt damit jede Anmeldung aus —, und die Geräteliste unter *Einstellungen → Konto* zeigt keine IP-Adresse mehr, obwohl genau die dort das Erkennen eines fremden Zugriffs tragen soll.

Ist die App **direkt** erreichbar (kein Proxy davor), gehört stattdessen `TRUSTED_PROXIES=` leer gesetzt — dann wird kein vom Client gesetzter Header ausgewertet.

### Erinnerungen planen

Die App bringt einen eigenen Zeitgeber mit: sie prüft zu jeder vollen Stunde, was abläuft, und hält sich dabei an die pro Nutzer eingestellte Uhrzeit (`08:00` / `09:00` / `18:00`) sowie an die Wochenübersicht am Sonntag. Dafür ist nichts einzurichten — es braucht nur die VAPID-Schlüssel.

Wer die Läufe lieber selbst plant (Cron, systemd-Timer, Uptime-Kuma …), setzt `INTERNAL_CRON=false` und stößt die Route von außen an:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://example.org/api/cron/check-expiry?schedule=hourly"
```

Mit `?schedule=hourly` hält sich der Job an die eingestellte Uhrzeit — dafür muss er stündlich laufen. Ohne den Parameter meldet er bei jedem Lauf alles Fällige; das ist die richtige Wahl, wenn der Job nur einmal am Tag läuft.

## Tech-Stack

Next.js (App Router, Cache Components), React, TypeScript, Drizzle ORM mit SQLite, better-auth, Tailwind CSS, shadcn/ui.
