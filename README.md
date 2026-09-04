<div align="center">

# BetterFood

**Der Vorrat im Blick, bevor er im Müll landet.**

_BetterFood ist eine selbst gehostete PWA für den Lebensmittelvorrat eines Haushalts. Artikel per Barcode-Scan (Open Food Facts) oder aus einem Kassenbon-PDF erfassen, Ablaufdaten im Blick behalten, Listen mit den anderen Haushaltsmitgliedern teilen — und rechtzeitig per Web-Push erinnert werden, bevor etwas schlecht wird._

![Version](https://img.shields.io/github/v/release/pantelx/betterfood?style=flat-square&label=version)
![Build](https://img.shields.io/github/check-runs/pantelx/betterfood/main?style=flat-square&label=build)

[Schnellstart](#schnellstart) · [Konfiguration](#konfiguration) · [GitHub Issues](https://github.com/panteLx/BetterFood/issues)

## Funktionen

| Funktion            | Beschreibung                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| **Vorrat**          | Artikel mit Menge, Ort und Ablaufdatum — mit Blick auf das, was zuerst geht |
| **Barcode-Scan**    | Produktdaten aus Open Food Facts, serverseitig abgefragt                   |
| **Kassenbon**       | PDF einlesen und die erkannten Posten übernehmen                           |
| **Listen**          | Mehrere Vorratslisten, geteilt mit den Haushaltsmitgliedern                |
| **Erinnerungen**    | Web-Push je Stufe (Tage vorher, am Tag, danach) und Wochenübersicht        |
| **Monatsziel**      | Wie viel vom Eingekauften tatsächlich gegessen wurde, samt Geld und CO₂     |
| **Wissen**          | Gelernte Produkte und Kategorien, die die Erfassung mit der Zeit abkürzen  |
| **Anmeldung**       | E-Mail und Passwort oder ein beliebiger OIDC-Anbieter                      |
| **PWA**             | Installierbar, mit Service Worker und eigenen Icons                        |

## Schnellstart

</div>

### Docker Compose

```bash
git clone https://github.com/panteLx/BetterFood.git
cd BetterFood
cp .env.example .env
# .env ausfüllen -- mindestens BETTER_AUTH_SECRET und BETTER_AUTH_URL
docker compose up -d
```

Die App läuft auf http://localhost:3000. Das erste Konto legt man selbst an, solange `ALLOW_REGISTRATION=true` gesetzt ist — danach [den Zugang schließen](#zugang-beschränken).

Die SQLite-Datenbank liegt im gemounteten `data`-Volume; die Migrationen laufen beim Container-Start automatisch (`RUN_MIGRATIONS=true`). Der Serverprozess läuft als unprivilegierter Nutzer `node` (UID 1000) — wer von einem älteren Image kommt, zieht die Rechte auf dem bestehenden Volume einmalig nach:

```bash
docker run --rm -v betterfood_data:/data alpine chown -R 1000:1000 /data
```

### Aus dem Quellcode

Braucht Node.js 20+ und npm.

```bash
git clone https://github.com/panteLx/BetterFood.git
cd BetterFood
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

`npm run db:migrate` muss vor dem ersten `npm run dev` oder `npm run build` laufen: die Datenbank wird beim Laden der Module geöffnet, nicht erst beim ersten Zugriff.

<div align="center">

## Konfiguration

</div>

### Erforderlich

```bash
BETTER_AUTH_SECRET=          # openssl rand -hex 32
BETTER_AUTH_URL=http://localhost:3000
```

Ohne beides startet die App in Produktion nicht. Jede symmetrische Operation der Anmeldeschicht hängt am Secret — ein mitgelieferter Standardwert wäre auf jeder Installation derselbe bekannte Wert.

### Web-Push

```bash
VAPID_PUBLIC_KEY=            # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:du@example.org
```

Alle drei oder keinen: ein halb gesetzter Satz bricht den Start ab, statt die Erinnerungen still ins Leere laufen zu lassen.

### Erinnerungen planen

Die App bringt einen eigenen Zeitgeber mit. Sie prüft zu jeder vollen Stunde, was abläuft, und hält sich dabei an die pro Nutzer eingestellte Uhrzeit (`08:00` / `09:00` / `18:00`) sowie an die Wochenübersicht am Sonntag. Dafür ist nichts einzurichten — es braucht nur die VAPID-Schlüssel.

Wer die Läufe lieber selbst plant (Cron, systemd-Timer, Uptime-Kuma …), setzt `INTERNAL_CRON=false`, vergibt ein `CRON_SECRET` und stößt die Route von außen an:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "https://example.org/api/cron/check-expiry?schedule=hourly"
```

Mit `?schedule=hourly` hält sich der Job an die eingestellte Uhrzeit — dafür muss er stündlich laufen. Ohne den Parameter meldet er bei jedem Lauf alles Fällige; das ist die richtige Wahl, wenn der Job nur einmal am Tag läuft. Ohne `CRON_SECRET` antwortet die Route mit `503` — sie ist öffentlich (ein externer Cron hat kein Sitzungs-Cookie), ein fehlendes Secret muss sie also schließen, nicht öffnen.

### Zugang beschränken

Eine Instanz gehört einem Haushalt, nicht dem Internet. Solange `ALLOW_REGISTRATION=true` gesetzt ist, kann **jeder**, der die Adresse kennt, ein Konto anlegen — und ein Konto kommt an die Nutzersuche, an die Mitgliederlisten und an den Rechnungsimport.

Für den ersten Start muss die Registrierung offen sein, sonst gibt es kein einziges Konto. Sind alle Haushaltsmitglieder angelegt:

```bash
# in .env
ALLOW_REGISTRATION=false
```

Danach `docker compose up -d --force-recreate`. Anmelden funktioniert weiter, nur neue Konten entstehen nicht mehr; der Link „Noch kein Konto?" verschwindet und `/register` leitet auf die Anmeldung. Wer ausschließlich SSO nutzt, kann die Registrierung dauerhaft zulassen — der Identity Provider entscheidet dann, wer überhaupt bis hierher kommt.

### Hinter einem Reverse Proxy

```bash
# Docker-Bridge zusätzlich zu localhost
TRUSTED_PROXIES=127.0.0.1/32,::1/128,172.16.0.0/12
```

`X-Forwarded-For` ist nur dann vertrauenswürdig, wenn ein Proxy ihn geschrieben hat, den man selbst kontrolliert. Ohne diesen Wert kann better-auth die Client-IP nicht ermitteln, und die Folgen sind still, aber real: das Limit für Anmeldeversuche (3 pro 10 Sekunden) gilt dann **für alle Nutzer zusammen** — ein einzelner Passwort-Rater sperrt damit jede Anmeldung aus —, und die Geräteliste unter *Einstellungen → Konto* zeigt keine IP-Adresse mehr, obwohl genau die dort das Erkennen eines fremden Zugriffs tragen soll.

Ist die App **direkt** erreichbar, gehört `TRUSTED_PROXIES=` stattdessen leer gesetzt — dann wird kein vom Client gesetzter Header ausgewertet.

### Single Sign-on

```bash
OIDC_ISSUER=https://sso.example.org
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_DISPLAY_NAME=OpenID Connect   # Beschriftung der Schaltfläche, optional
```

Alle drei erforderlichen Werte leer lassen schaltet die SSO-Schaltfläche komplett ab.

Sämtliche Optionen stehen in [.env.example](.env.example).

<div align="center">

## Befehle

</div>

```bash
npm run dev          # Entwicklungsserver auf :3000
npm run build        # Produktions-Build (output: "standalone")
npm run lint         # ESLint -- zugleich der einzige Formatierer im Projekt
npm run icons        # App-Icons aus dem Blatt-Zeichen neu bauen (braucht ImageMagick)
npm run db:generate  # Migration aus Schema-Änderungen erzeugen
npm run db:migrate   # Migrationen anwenden
```

Einen Typecheck gibt es bewusst ohne Skript: `npx tsc --noEmit`.

<div align="center">

## Releases

</div>

Wer Schreibrechte hat, schneidet ein Release aus einem sauberen `main`:

```bash
npm run release patch   # 0.1.0 -> 0.1.1
npm run release minor   # 0.1.0 -> 0.2.0
npm run release major   # 0.1.0 -> 1.0.0
```

Das hebt die Version in `package.json`/`package-lock.json` an, committet, taggt, pusht — und legt anschließend ein GitHub-Release mit automatisch erzeugten Notizen an. Der gepushte Tag löst [`container.yml`](.github/workflows/container.yml) aus, was das versionierte Docker-Image baut und veröffentlicht. Braucht die [GitHub CLI](https://cli.github.com), angemeldet über `gh auth login`.

### Welche Version läuft hier?

Ganz unten auf der Einstellungsseite, verlinkt auf die zugehörigen Release-Notizen bzw. den Commit:

| Anzeige            | Woher das Image stammt                                  |
| ------------------ | ------------------------------------------------------- |
| `v1.0.0`           | aus dem Tag `v1.0.0` gebaut — ein Release                |
| `dev (9312a14)`    | aus einem Push auf `main` gebaut — Zwischenstand         |

Beide Werte schreibt der Build als Literale fest (`next.config.ts` → [`src/lib/version.ts`](src/lib/version.ts)): die Version stammt immer aus `package.json`, den Commit setzt allein der Workflow und allein für Branch-Pushes. Ein lokaler `npm run dev` zeigt deshalb die Version aus `package.json`, auch wenn der Arbeitsstand längst weiter ist — was lokal läuft, weiß ohnehin nur `git status`.

<div align="center">

## Docker-Images

Die Images liegen unter `ghcr.io/pantelx/betterfood`:

| Tag      | Beschreibung                  |
| -------- | ----------------------------- |
| `latest` | aktuellstes Release           |
| `vX.Y.Z` | eine bestimmte Version        |
| `main`   | Entwicklungsstand (instabil)  |

## Tech-Stack

| Schicht    | Technologie                              |
| ---------- | ---------------------------------------- |
| Framework  | Next.js 16 (App Router), React 19, TypeScript |
| Datenbank  | SQLite, Drizzle ORM                      |
| Anmeldung  | better-auth                              |
| UI         | Tailwind CSS v4, shadcn/ui auf Base UI   |
| Produkte   | Open Food Facts                          |

## Unterstützen

[GitHub Issues](https://github.com/panteLx/BetterFood/issues) ·
[Buy Me a Coffee](https://www.buymeacoffee.com/pantel) ·
[GitHub Sponsors](https://github.com/sponsors/pantelx)

</div>
