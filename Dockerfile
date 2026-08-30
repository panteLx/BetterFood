# syntax=docker/dockerfile:1

# ---- Builder ----
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Kein Rueckkanal an Vercel, und der Telemetrie-Hinweis verschwindet aus dem
# Build-Log.
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 ist ein natives Modul, laedt sich sein Binary fuer
# linux/amd64 und linux/arm64 aber als Prebuild herunter (`prebuild-install ||
# node-gyp rebuild` als install-Skript). Deshalb steht hier keine Toolchain
# mehr: python3/make/g++ kosteten bei jedem kalten Build eine knappe Minute,
# ohne je etwas zu uebersetzen. Faellt der Prebuild-Download einmal aus, endet
# das laut im fehlgeschlagenen `npm ci` -- nicht still zur Laufzeit.
#
# Der Cache-Mount haelt den npm-Downloadordner ueber Builds hinweg vor. Er
# landet nie in einer Ebene, kostet also nichts an Groesse.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY . .

# Applies migrations once, sequentially, against a throwaway file in this
# build stage. This is what next build's route modules see when it imports
# them in parallel to collect page data (src/db/index.ts opens the database
# at module load time): a schema that already exists, so those parallel
# imports just open read connections instead of racing each other to create
# the same tables and intermittently hitting SQLITE_BUSY.
RUN npm run db:migrate

# `.next/cache` ist der Webpack-Cache: fuer den naechsten Build Gold wert,
# im Image dagegen nur Ballast (er allein war groesser als das fertige
# Ergebnis). Als Cache-Mount ist er beim Build da und danach weg.
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ---- Runner ----
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# `output: "standalone"` (next.config.ts) enthaelt den Server, die kompilierten
# Routen und genau die node_modules, die beim Build als gebraucht ermittelt
# wurden. Vorher wurde `/app` komplett uebernommen: devDependencies, Quellcode
# und Build-Cache inklusive.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Die beiden holt der standalone-Build bewusst nicht mit (sie gehoeren
# normalerweise vor ein CDN) -- hier serviert sie `server.js` selbst.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Die Migrationen laufen beim Start erneut (siehe RUN_MIGRATIONS unten) und
# lesen den Ordner ueber process.cwd() -- er ist Laufzeit-Eingabe, kein Code,
# und taucht deshalb in keiner Ablaufverfolgung auf.
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

RUN mkdir -p /app/data && chown node:node /app/data

# Das node-Image bringt diesen Nutzer schon mit. Ohne die Zeile lief der
# Serverprozess als root -- und damit auch alles, was ihm jemand unterschiebt;
# der PDF-Parser ist dafuer der naheliegendste Weg.
#
# Auf einem bestehenden Volume einmalig nachziehen, sonst kann der Prozess die
# SQLite-Datei nicht mehr schreiben:
#   docker run --rm -v betterfood_data:/data alpine chown -R 1000:1000 /data
USER node

EXPOSE 3000
VOLUME ["/app/data"]

# `next start` gibt es hier nicht mehr -- der standalone-Build bringt seinen
# eigenen Server mit, der Adresse und Port aus der Umgebung liest. Ohne
# HOSTNAME bindet er an localhost und waere von aussen nicht erreichbar.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The actual persistent volume is only attached at container runtime, not
# during build, so migrations need to run again here - src/instrumentation.ts
# does that via Next's instrumentation hook (register() runs once on server
# boot and must finish before requests are served) when this is "true".
ENV RUN_MIGRATIONS=true

CMD ["node", "server.js"]
