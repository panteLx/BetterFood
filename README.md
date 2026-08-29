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

## Tech-Stack

Next.js (App Router, Cache Components), React, TypeScript, Drizzle ORM mit SQLite, better-auth, Tailwind CSS, shadcn/ui.
