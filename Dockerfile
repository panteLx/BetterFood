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

# src/lib/push.ts calls webpush.setVapidDetails() at module load time, and
# Next.js imports every route module during `next build` to collect page
# data - so these must be set here too, not just at container runtime.
# NEXT_PUBLIC_VAPID_PUBLIC_KEY is additionally inlined into the client bundle
# at build time. No defaults on purpose: docker-compose.yml supplies the real
# values from .env, so a build without them fails loudly instead of silently
# shipping placeholder keys.
ARG VAPID_SUBJECT
ARG VAPID_PUBLIC_KEY
ARG VAPID_PRIVATE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV VAPID_SUBJECT=$VAPID_SUBJECT \
    VAPID_PUBLIC_KEY=$VAPID_PUBLIC_KEY \
    VAPID_PRIVATE_KEY=$VAPID_PRIVATE_KEY \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY

RUN npm run build

# ---- Runner ----
FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app ./
RUN mkdir -p /app/data

EXPOSE 3000
VOLUME ["/app/data"]

# The actual persistent volume is only attached at container runtime, not
# during build, so migrations need to run again here - src/instrumentation.ts
# does that via Next's instrumentation hook (register() runs once on server
# boot and must finish before requests are served) when this is "true".
ENV RUN_MIGRATIONS=true

CMD ["npm", "run", "start"]
