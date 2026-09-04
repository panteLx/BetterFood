# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Stack

Next.js 16 App Router (`cacheComponents: true`), React 19, TypeScript strict, Drizzle ORM over better-sqlite3 (single file `data/food-tracker.db`), better-auth, Tailwind v4, shadcn/ui on @base-ui/react. Package manager is npm. Self-hosted German-language PWA for household food-stock tracking.

Domain logic and all DB access live in `src/lib/**` (`data.ts` cached queries, `session.ts` auth/active-list guard, `expiry-check.ts` reminders, `receipt/` PDF parser). `src/instrumentation.ts` runs migrations, backfills and the hourly expiry scheduler at server boot.

## Commands

- **Typecheck: `npx tsc --noEmit`** — there is no script for it.
- `npm run build` is `next build --webpack` (deliberately not Turbopack). Output is `standalone`, so production runs `node server.js`, not `npm start`.
- Schema change: edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:migrate`. Commit the generated SQL **and** `drizzle/meta/_journal.json`.
- `npm run icons` regenerates all app icons from `src/components/brand-mark.tsx`; needs `sharp` and ImageMagick on PATH.
- There is no test framework. CI (`.github/workflows/container.yml`) only builds the container image — lint and typecheck never run there.

**Before claiming work is done, run `npx tsc --noEmit`, `npm run lint` and `npm run build`, and report the actual output.**

## Gotchas

- `next build` and `next dev` need an **already-migrated DB** — `src/db/index.ts` opens SQLite at module load. Fresh clone: `cp .env.example .env` → fill it → `npm run db:migrate`.
- `src/db/index.ts` sets `busy_timeout` **before** `journal_mode = WAL`. Removing that ordering makes `next build` abort with SQLITE_BUSY, because route collection opens the DB from parallel processes.
- `serverExternalPackages: ["better-sqlite3"]` in `next.config.ts` is load-bearing (native module).
- Cache invalidation is always `revalidateTag(tag, { expire: 0 })` — the default profile served stale labels. `optionalSession()` uses `"use cache: private"` so better-auth's `new Date()` does not break prerender. Env-gated features call `connection()` to force runtime evaluation.
- `src/proxy.ts` (Next 16 names the middleware file `proxy.ts`) gates public prefixes and enforces same-origin on mutating methods, but **every route and data page still calls `requireSession()` itself**. Keep both — the proxy is not the only gate.
- `reassignActiveListAway` in `src/lib/session.ts` must stay **synchronous**: better-sqlite3 transaction callbacks cannot await.
- CSP is `connect-src 'self'`. Open Food Facts is fetched server-side (`src/lib/off.ts`); any client-side external fetch needs a CSP change first.
- Env: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are required in production (startup throws). `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` are all-or-nothing — a partial set throws at startup. Without `CRON_SECRET`, `POST /api/cron/check-expiry` returns 503.
- Generated, do not edit: `public/sw.js`, `public/workbox-*.js`, `public/worker-*.js` (next-pwa).
- Docker runs as UID 1000; pre-existing volumes need a one-time `chown -R 1000:1000`.

## Style

- Comments and user-facing strings are **German**; identifiers, git history and PRs are **English**.
- Use real umlauts (ä/ö/ü/ß) in new text. Older files transliterate them (ae/oe/ue) — convert those when you are editing the file anyway.
- Comments explain **why**, with rationale, measured numbers and past bugs. That prose density is the house style, not noise.
- Double quotes, semicolons, 2-space indent, trailing commas, ~100-column width. No Prettier or Biome in the repo — `npm run lint` (ESLint flat config) is the only formatter.
- Files under `src/components/ui/` are shadcn-generated with very long class strings. Do not reformat them.
- Use the design tokens in `src/app/globals.css` (`--radius` 0.875rem and its derived scale, `surface-2`, `faint`, `primary-tint`, `warning`, `danger` plus tints, and the five named shadows `shadow-card/raise/nav/action/fab`). Never inline a hex color or `shadow-[...]`.
