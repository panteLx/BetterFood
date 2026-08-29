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
- `CRON_SECRET` — Bearer-Token für `POST /api/cron/check-expiry`, z. B. mit `openssl rand -hex 32`
- `BETTER_AUTH_SECRET` — z. B. mit `openssl rand -hex 32`
- `BETTER_AUTH_URL` — Basis-URL der App (lokal `http://localhost:3000`)
- optional: `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `NEXT_PUBLIC_OIDC_DISPLAY_NAME` für Single Sign-on

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
npm run build       # Produktions-Build
npm run start        # Produktions-Server
npm run lint          # ESLint
npm run db:generate  # Migration aus Schema-Änderungen generieren
```

## Deployment

Docker-Image über `Dockerfile` / `compose.yaml`:

```bash
docker compose up -d
```

Die SQLite-Datenbank liegt im gemounteten `data`-Volume. Migrationen laufen beim Container-Start automatisch, wenn `RUN_MIGRATIONS=true` gesetzt ist.

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
