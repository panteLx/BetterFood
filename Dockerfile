# ---- Builder ----
FROM node:22-bookworm-slim AS builder

# better-sqlite3 is a native module and needs a toolchain to compile against this base image
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Applies migrations once, sequentially, against a throwaway file in this
# build stage. This is what next build's route modules see when it imports
# them in parallel to collect page data (src/db/index.ts opens the database
# at module load time): a schema that already exists, so those parallel
# imports just open read connections instead of racing each other to create
# the same tables and intermittently hitting SQLITE_BUSY.
RUN npm run db:migrate

RUN npm run build

# ---- Runner ----
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder --chown=node:node /app ./
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

# The actual persistent volume is only attached at container runtime, not
# during build, so migrations need to run again here - src/instrumentation.ts
# does that via Next's instrumentation hook (register() runs once on server
# boot and must finish before requests are served) when this is "true".
ENV RUN_MIGRATIONS=true

CMD ["npm", "run", "start"]
