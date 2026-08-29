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

**Auth gating happens in `src/proxy.ts`** (the Next 16 rename of `middleware.ts`), which redirects unauthenticated requests to `/login` — or to `/welcome` (splash + four-slide onboarding) when the `bf_welcome_seen` cookie is missing, see `src/lib/welcome.ts`. Exceptions: `PUBLIC_PREFIXES` (`/login`, `/register`, `/welcome`, `/scan`, `/confirm`, `/api/auth`, `/api/lookup`) and any path with a file extension (PWA/static assets).

**Routes**: `/` is the overview (greeting, counters, freshness bar, the four most urgent items), `/inventory` the full stock (search, status segments, grouping by expiry/place/category), `/item/[id]` the item detail, `/saved` the post-capture confirmation, `/archive`, `/knowledge` (products, categories, places), and `/settings` as a hub over `/settings/reminders`, `/settings/appearance` and `/settings/lists`. Anything that takes over the screen (`/scan`, forms, `/item`, `/welcome`, auth) is listed in `HIDDEN_PREFIXES` in `bottom-nav.tsx` and renders without the nav bar.

**`params`/`searchParams` must be awaited below a `<Suspense>` boundary** — Next 16's "Instant Navigation" validation rejects the blocking form. Same for anything derived from `new Date()`: an unstable value aborts the route's prerender, so date-dependent rendering runs behind `useIsClient()` (`src/lib/use-is-client.ts`) or takes the reference date as a prop.

**Auth** is `better-auth` (`src/lib/auth.ts`) with the Drizzle adapter, email/password, and an optional generic OIDC/SSO plugin gated on `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET` all being set. A `databaseHooks.user.create.after` hook (`claimLegacyData`) runs on every new user: creates them a default "Zuhause" list, and — only if they're the very first user in the database — claims any pre-existing list-less rows (items/categories/push subscriptions from before multi-user support existed).

**Data model** (`src/db/schema.ts`, `src/db/auth-schema.ts`): `lists` (owned, archivable) ← `listMembers` (join table) → users. `items`, `categories` and `places` all belong to a `listId`. `places` are the shelves the stock physically sits in (fridge / freezer / pantry, seeded from `DEFAULT_PLACES`); `items.placeId` is optional and falls back to null when a place is deleted — emptying a shelf must not take the food with it. A user has one `activeListId` (their currently-selected list); `src/lib/session.ts` (`requireActiveList`, `reassignActiveListAway`, `everyMemberHasAnotherActiveList`) handles picking/reassigning it and guards against leaving a member list-less when a list is archived or a membership is removed. `reassignActiveListAway` is intentionally synchronous — it's called inside `db.transaction(...)` and better-sqlite3 transaction callbacks must run fully synchronously.

**Migrations**: hand-write nothing under `drizzle/` — always run `db:generate` after a schema change. In production, migrations run at boot via `src/instrumentation.ts` → `src/instrumentation.node.ts`, gated on `RUN_MIGRATIONS=true` (see `Dockerfile`/`compose.yaml`); locally use `npm run db:migrate`.

**Categories**: `src/lib/categories.ts` holds the canonical `DEFAULT_CATEGORIES` (key, label, shelf-life days) — the source of truth for the seed migration. Users can freely rename/add/delete categories after seeding, so don't assume `DEFAULT_CATEGORIES` reflects any given list's actual categories.

**Category preselection is learned, never guessed.** `product_knowledge` (one row per list × product, keyed by barcode or by `nameKey` = `normalizeProductName(name)`) records how a household sorts a product. Every item save calls `rememberProduct`; `lookupKnownProduct` reads it back via `GET /api/items/known`, which `ItemForm` calls from the client — deliberately not a server-rendered prop, because `<Activity>` keeps a navigated-away `/confirm` alive and it would show a stale answer. A product the list has never seen gets no preselected category and no expiry date. There is no OFF-tag heuristic any more; it was removed because it was wrong too often and cannot work with user-defined categories. `/knowledge` (`knowledge-manager.tsx`) is where both halves — categories and learned products — are edited; `backfillProductKnowledge()` runs once at boot (`src/instrumentation.ts`) to seed the table from pre-existing item history.

**Barcode scanning**: `/scan` uses `@zxing` client-side, then `src/lib/off.ts` looks up the barcode against the Open Food Facts API (unauthenticated, public prefix) to prefill name/category on `/confirm` and `/add`.

**Design tokens**: `src/app/globals.css` carries the green palette in both modes plus four roles beyond the shadcn set — `surface-2`, `faint`, `primary-tint`/`primary-inv` and the three expiry states `warning`/`danger` with their tints. That fresh / soon / expired split carries the whole interface (`STATUS_CLASSES` in `src/lib/expiry.ts`); never hard-code a hex value for it. Typography is Manrope (400–800) with JetBrains Mono for digit sequences only.

**Push notifications**: `src/lib/push.ts` wraps `web-push`, configured lazily on first use (not at module load) so `VAPID_*` env vars aren't required during `next build`'s route-collection pass — they only need to be present as container runtime env vars. `POST /api/cron/check-expiry` is the notification job: bearer-token-protected via `CRON_SECRET`, iterates every list, applies each member's own reminder settings (`src/lib/notification-settings.ts`: lead days, time of day, Sunday weekly summary) and dedupes so an item is only notified once per day (`lastNotifiedAt`). The preferred hour is only honoured when the caller passes `?schedule=hourly` — a silent time check would never match a once-a-day cron and would mute reminders entirely. A 404/410 from a push send means the subscription is dead and gets deleted. The custom service worker (`src/worker/index.js`, built by `@ducanh2912/next-pwa` via `customWorkerSrc`) handles the `push`/`notificationclick` events. A subscription is bound to the logged-in user: signing out sends `DELETE /api/push/subscribe` and calls `subscription.unsubscribe()` (`unsubscribeFromPush`), so a logged-out device stops receiving that account's reminders; `<PushSync />` in `providers.tsx` re-binds the device's subscription on the next login (only when notification permission is already granted — it never prompts). **Testing push in dev**: `next dev` runs Turbopack, so next-pwa (a webpack plugin) never builds or registers a service worker and `navigator.serviceWorker.ready` would hang forever. `src/app/dev-sw.js/route.ts` serves `src/worker/index.js` verbatim at `/dev-sw.js` in development only (404 in production), and `getRegistration()` in `push-client.ts` registers it — so subscribing, `POST /api/push/test` and the notification actions all work on localhost.

**UI components**: shadcn/ui-based primitives live in `src/components/ui/` (including the design's own `chip`, `switch` and `sheet`); feature components (`home-overview`, `inventory-list`, `item-card`, `item-detail`, `item-form`, `date-sheet`, `list-manager`, `list-switcher`, `archive-list`, `category-manager`, `place-manager`, `knowledge-manager`, `user-combobox`) are flat under `src/components/`.

**Swipe gestures are never the only way**: `useSwipeActions` (`src/lib/use-swipe-actions.ts`) drives the stock and archive rows — right is used up, left is thrown away — and deliberately ignores mouse pointers. Every action it triggers is also reachable as a real button (item detail, archive row), because a pantry you can only tick off with a finger is not operable with a keyboard or a screen reader.

## Deployment

Docker image (`Dockerfile`, `compose.yaml`), single container with a mounted `data/` volume for the SQLite DB. Env vars are documented in `.env.example` (VAPID keys, `CRON_SECRET`, better-auth secret/URL, optional OIDC config, `ALLOWED_DEV_ORIGINS` for cross-origin dev access).
