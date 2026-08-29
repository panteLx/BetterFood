# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

BetterFood ("Vorrat") is a self-hosted PWA for tracking household food inventory and expiry dates, with shared multi-user lists, barcode scanning (Open Food Facts lookup), and web push expiry reminders. German is the UI language — user-facing strings, error messages, and category data are German.

## Commands

- `npm run dev` — dev server (PWA service worker is disabled in dev; see `next.config.ts`)
- `npm run build` — production build. Uses `--webpack` explicitly, not the Turbopack default.
- `npm run lint` — ESLint (flat config, `eslint.config.mjs`)
- `npm run db:generate` — generate a Drizzle migration from schema changes in `src/db/schema.ts`
- `npm run db:migrate` — apply pending migrations to `./data/food-tracker.db`
- No test suite is configured in this repo.

## Architecture

**Next.js 16 with Cache Components.** `next.config.ts` sets `cacheComponents: true` and `partialPrefetching: true`. Data-fetching functions opt into caching explicitly with the `"use cache"` directive plus `cacheLife()`/`cacheTag()` (e.g. `src/lib/categories.ts`), and are invalidated on mutation via `revalidateTag`. `src/lib/session.ts`'s `requireSession()` uses `"use cache: private"` for per-session caching. Read `node_modules/next/dist/docs/` before touching caching or routing — this version's conventions (including `proxy.ts` replacing `middleware.ts`, see below) diverge from older Next.js knowledge.

**Auth gating happens in `src/proxy.ts`** (the Next 16 rename of `middleware.ts`), which redirects to `/login` when no better-auth session cookie is present, except for `PUBLIC_PREFIXES` (`/login`, `/register`, `/scan`, `/confirm`, `/api/auth`, `/api/lookup`) and any path with a file extension (PWA/static assets).

**Auth** is `better-auth` (`src/lib/auth.ts`) with the Drizzle adapter, email/password, and an optional generic OIDC/SSO plugin gated on `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` all being set. A `databaseHooks.user.create.after` hook (`claimLegacyData`) runs on every new user: creates them a default "Zuhause" list, and — only if they're the very first user in the database — claims any pre-existing list-less rows (items/categories/push subscriptions from before multi-user support existed).

**Data model** (`src/db/schema.ts`, `src/db/auth-schema.ts`): `lists` (owned, archivable) ← `listMembers` (join table) → users. `items` and `categories` both belong to a `listId`. A user has one `activeListId` (their currently-selected list); `src/lib/session.ts` (`requireActiveList`, `reassignActiveListAway`, `everyMemberHasAnotherActiveList`) handles picking/reassigning it and guards against leaving a member list-less when a list is archived or a membership is removed. `reassignActiveListAway` is intentionally synchronous — it's called inside `db.transaction(...)` and better-sqlite3 transaction callbacks must run fully synchronously.

**Migrations**: hand-write nothing under `drizzle/` — always run `db:generate` after a schema change. In production, migrations run at boot via `src/instrumentation.ts` → `src/instrumentation.node.ts`, gated on `RUN_MIGRATIONS=true` (see `Dockerfile`/`compose.yaml`); locally use `npm run db:migrate`.

**Categories**: `src/lib/categories.ts` holds the canonical `DEFAULT_CATEGORIES` (key, label, shelf-life days) — the source of truth for the seed migration. Users can freely rename/add/delete categories after seeding, so don't assume `DEFAULT_CATEGORIES` reflects any given list's actual categories.

**Category preselection is learned, never guessed.** `product_knowledge` (one row per list × product, keyed by barcode or by `nameKey` = `normalizeProductName(name)`) records how a household sorts a product. Every item save calls `rememberProduct`; `lookupKnownProduct` reads it back via `GET /api/items/known`, which `ItemForm` calls from the client — deliberately not a server-rendered prop, because `<Activity>` keeps a navigated-away `/confirm` alive and it would show a stale answer. A product the list has never seen gets no preselected category and no expiry date. There is no OFF-tag heuristic any more; it was removed because it was wrong too often and cannot work with user-defined categories. `/knowledge` (`knowledge-manager.tsx`) is where both halves — categories and learned products — are edited; `backfillProductKnowledge()` runs once at boot (`src/instrumentation.ts`) to seed the table from pre-existing item history.

**Barcode scanning**: `/scan` uses `@zxing` client-side, then `src/lib/off.ts` looks up the barcode against the Open Food Facts API (unauthenticated, public prefix) to prefill name/category on `/confirm` and `/add`.

**Push notifications**: `src/lib/push.ts` wraps `web-push`, configured lazily on first use (not at module load) so `VAPID_*` env vars aren't required during `next build`'s route-collection pass — they only need to be present as container runtime env vars. `POST /api/cron/check-expiry` is the notification job: bearer-token-protected via `CRON_SECRET`, iterates every list, applies each owner's `notification_lead_days` setting (default 2), and dedupes so an item is only notified once per day (`lastNotifiedAt`). A 404/410 from a push send means the subscription is dead and gets deleted. The custom service worker (`src/worker/index.js`, built by `@ducanh2912/next-pwa` via `customWorkerSrc`) handles the `push`/`notificationclick` events.

**UI components**: shadcn/ui-based primitives live in `src/components/ui/`; feature components (`inventory-list`, `item-form`, `list-manager`, `list-switcher`, `archive-list`, `category-manager`, `manual-add-dialog`, `knowledge-manager`, `user-combobox`) are flat under `src/components/`.

## Deployment

Docker image (`Dockerfile`, `compose.yaml`), single container with a mounted `data/` volume for the SQLite DB. Env vars are documented in `.env.example` (VAPID keys, `CRON_SECRET`, better-auth secret/URL, optional OIDC config, `ALLOWED_DEV_ORIGINS` for cross-origin dev access).
