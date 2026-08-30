# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

BetterFood is a self-hosted PWA for household food inventory and expiry dates: shared
multi-user lists, barcode scanning (Open Food Facts), PDF receipt import, web push reminders. German
is the UI language (strings, errors, category data); code, comments and commits are English.

## Commands

- `npm run dev` — dev server (PWA service worker disabled in dev, see `next.config.ts`)
- `npm run build` — production build; uses `--webpack` explicitly, not the Turbopack default
- `npm run lint` — ESLint (flat config)
- `npm run db:generate` / `npm run db:migrate` — Drizzle migration from `src/db/schema.ts` / apply it
- `npm run icons` — regenerate all app icons from `brand-mark.tsx` (needs ImageMagick for `.ico`)
- No test suite is configured.

## Next.js 16 specifics

`cacheComponents: true`, `partialPrefetching: true`. Data fetching opts into caching explicitly with
`"use cache"` + `cacheLife()`/`cacheTag()` (e.g. `src/lib/categories.ts`), invalidated on mutation
via `revalidateTag`; `requireSession()` uses `"use cache: private"`. Read
`node_modules/next/dist/docs/` before touching caching or routing — this version diverges from older
knowledge (`proxy.ts` replaces `middleware.ts`).

`params`/`searchParams` must be awaited **below** a `<Suspense>` boundary; the blocking form is
rejected by "Instant Navigation" validation. Same for anything derived from `new Date()` — an
unstable value aborts the prerender, so date-dependent rendering runs behind `useIsClient()` or takes
the reference date as a prop.

## Auth and routing

`src/proxy.ts` gates everything: unauthenticated requests go to `/login`, or to `/welcome` while the
`bf_welcome_seen` cookie is missing (`src/lib/welcome.ts`). The proxy sets that cookie on the first
_authenticated_ request, so the intro repeats until an account exists. Exceptions: `PUBLIC_PREFIXES`
(`/login`, `/register`, `/welcome`, `/api/auth`, `/api/cron`) and any path with a file extension
(static assets). `/api/cron` is public — an external cron has no session cookie and authenticates
with `CRON_SECRET`.

Auth is `better-auth` (`src/lib/auth.ts`) with the Drizzle adapter, email/password and an optional
OIDC plugin gated on `OIDC_ISSUER`/`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`. **That gate is read at
runtime, never at build time** — `src/lib/oidc.ts` is the single place it lives, and
`getOidcDisplayName()` (`await connection()`, inside `/login`'s and `/register`'s `<Suspense>`
boundary) carries the label to the client. A `NEXT_PUBLIC_*` var would be inlined by `next build`, so
a Docker image built without SSO could never show the button.

`databaseHooks.user.create.after` → `claimLegacyData` creates every new user's first list, named
after the `householdName` from the registration body (`readHouseholdName`, "Zuhause" for SSO) —
deliberately without a user column, since `lists.name` is the only truth afterwards. For the very
first user it also claims list-less rows from before multi-user support.

**Account self-service** (`/settings/account`): the name goes through `authClient.updateUser` (it
rewrites the session cookie); e-mail and password need own routes under `/api/account/`, for three
reasons. `changeEmail` sits under `user.changeEmail` and works without a mailer only via
`updateEmailWithoutVerification` — i.e. only while `emailVerified` stays false — and reports success
on an already-taken address, so the route pre-checks that and demands the password. `changePassword`
with `revokeOtherSessions` mints its replacement session **without** a request, so the route writes
user-agent and IP back onto the row that has none. `/list-sessions` needs a session younger than
`freshAge` (24 h) and returns plaintext tokens, so the device list reads the table itself and revokes
by `id` — showing `createdAt`, since `updatedAt` only moves once per `updateAge` and "last active"
would be up to a day off. Both routes verify the password through `auth.api.*`, which bypasses
better-auth's rate limiter, hence `src/lib/attempt-limit.ts`. Whether e-mail and password are
editable is one question (`src/lib/account.ts`): is there a `credential` account with a password —
SSO users have none. Errors inside a sheet render inline, not as a toast: the toast sits
`bottom-center`, underneath the open sheet. `push_subscriptions.session_id` is `ON DELETE CASCADE`,
so a revoked device goes quiet — which is why `<PushSync />` keys on the session id, revoking also
drops rows still carrying `session_id IS NULL` (pre-`0011`, unattributable), and the client rebinds
itself right after.

**Routes**: `/` overview, `/inventory`, `/item/[id]`, `/saved` (post-capture confirmation, which
re-offers the entry method just used — `src/lib/entry-method.ts`), `/archive`, `/receipt`,
`/knowledge`, `/settings` over `reminders`/`appearance`/`lists`/`account`. Anything taking over the screen
(`/scan`, forms, `/item`, `/receipt`, `/welcome`, auth) is in `HIDDEN_PREFIXES` in `bottom-nav.tsx`
and renders without the nav bar.

## Data model

`src/db/schema.ts` / `src/db/auth-schema.ts`: `lists` (owned, archivable) ← `listMembers` → users;
`items`, `categories` and `places` all belong to a `listId`. `places` are the physical shelves
(seeded from `DEFAULT_PLACES`); `items.placeId` is nullable with `ON DELETE SET NULL`, since emptying
a shelf must not delete the food. The _form_ requires a place whenever the list has any
(`item-form.tsx`), but the API stays permissive. `categories.defaultPlaceId` points the other way.

A user has one `activeListId`; `src/lib/session.ts` (`requireActiveList`, `reassignActiveListAway`,
`everyMemberHasAnotherActiveList`) picks and reassigns it and guards against leaving a member
list-less. `reassignActiveListAway` is intentionally synchronous: it runs inside `db.transaction(…)`,
whose better-sqlite3 callbacks must be fully synchronous.

**Migrations**: never hand-write under `drizzle/`, run `db:generate` after every schema change. One
exception bites silently: for a new foreign-key column drizzle-kit emits
`ADD COLUMN … REFERENCES x(id)` **without** the `ON DELETE` action, leaving it NO ACTION — SQLite
accepts it there, so add it to the generated line by hand (`0008`/`0010`); where it already went
wrong, use a `--custom` table rebuild (`0009`). In production migrations run at boot via
`src/instrumentation.ts` → `.node.ts`, gated on `RUN_MIGRATIONS=true`.

## Categories, places and learned knowledge

`src/lib/categories.ts` holds the canonical `DEFAULT_CATEGORIES` (key, label, shelf-life days,
`defaultPlace`) — source of truth for the seed migration only; users rename/add/delete freely
afterwards, so never assume it reflects a given list. `applyDefaultCategoryPlaces(listId)` resolves
`defaultPlace` to an id after both seeds have run (call order irrelevant) and only fills rows still
null. `/knowledge` → _Sortierung_ (`sorting-manager.tsx`) groups over the **place list**, not over
`defaultPlaceId`, so a category pointing at a deleted shelf lands in "Ohne Standardfach" rather than
a phantom group; `DELETE /api/places/[id]` also revalidates the categories tag, because
`ON DELETE SET NULL` changes category rows that route never touches.

**Category and place preselection are learned, never guessed.** `product_knowledge` (one row per
list × product, keyed by barcode or `nameKey` = `normalizeProductName(name)`) records how a household
sorts a product — category _and_ shelf, applied independently on the next entry. The shelf prefill
follows a three-step precedence — what the list learned about **this product** > the **category's**
default shelf > nothing — identical in `item-form.tsx` and `POST /api/receipt/parse`. Only a
**hand-picked** shelf is permanent (`placeTouchedRef` / `placeTouched`); an actively changed category
always drags its default shelf along (`applyCategory`, `withCategory`), which is why the category is
asked **first**. There is deliberately no OFF-tag heuristic — it cannot work with user categories.

Every save calls `rememberProduct` (synchronous, takes an `Executor`, so the receipt import runs it
in one transaction). `lookupKnownProduct` reads it back via `GET /api/items/known`, which `ItemForm`
calls from the client — deliberately not a server prop, because `<Activity>` keeps a navigated-away
`/confirm` alive and would show a stale answer.

## Capture paths

**Barcode scan** (`/scan`): `@zxing` client-side, then `src/lib/off.ts` against Open Food Facts to
prefill name/category on `/confirm` or `/add`.

**Receipt import** (`/receipt`): a whole shop from a delivery service's PDF invoice; the missing EAN
costs nothing because `product_knowledge` also keys on `nameKey`. Parsing is server-side (`unpdf`,
pure JS, nothing to configure) and the file is read in memory and never stored — a receipt carries
name and address. `src/lib/receipt/` is three thin layers: `layout.ts` rebuilds printed lines from
pdf.js fragments (cluster by y, sort by x, a gap wider than ~0.55× the font height becomes the two
spaces marking a column, i.e. `pdftotext -layout`), `parse.ts` reads
`Name ␣␣ Menge ␣ MwSt ␣ Einzelpreis ␣ Gesamt` and drops deposit/fee/credit lines (reported as
`ignored`, never silently), `profiles.ts` supplies per-retailer labels. Use numbered capture groups
(`tsconfig` targets ES2017). A weight in the quantity column ("600g") goes into `note`, **not** the
name, which is the learning key; expiry dates come from the invoice's delivery date, not today.

`POST /api/receipt/parse` returns a proposal per line with learned category/shelf, and **every line
arrives checked**; the VAT class only adds a dismissable "vermutlich kein Lebensmittel" hint on
unknown lines (importing a product once is itself the "this is food" marker, hence no `nonFood`
column). `POST /api/items/import` writes confirmed lines in one transaction and shares the merge
rule with `POST /api/items` through `findMergeTarget` (`src/lib/item-merge.ts`, pure, because
the callers fetch candidates differently); it stays blocked while a checked line has no category. A
renamed line writes a **second** knowledge row keyed by the raw receipt wording but carrying the
household's name (`rememberProduct`'s `lookupName`). Duplicate-receipt protection is deliberately
absent — the merge rule sums visibly and the review screen is the check.

In the review screen (`receipt-import.tsx`) a row asks the category first, then shelf and expiry;
picking a category immediately opens that line's `DateSheet`, and a hand-set date (`expiryOverride`)
then survives every later category change. Bulk assignment chains one line at a time (`dateQueue`),
carrying over the last **actively picked** date (`carriedDate`); swiping away ends the walk, and the
sheet's self-close after `onConfirm` must not be read as an abort (`advancingRef`). A bulk _shelf_
does not chain.

## Push notifications

`src/lib/push.ts` wraps `web-push`, configured lazily on first use so `VAPID_*` need not exist during
`next build`'s route collection. `runExpiryCheck` (`src/lib/expiry-check.ts`) iterates every list,
applies each member's own settings (`src/lib/notification-settings.ts`) and dedupes per day via
`lastNotifiedAt`. The preferred hour is only honoured when `respectPreferredHour` is set — a silent
time check would never match a once-a-day cron and would mute reminders entirely. Two callers: the
scheduler in `instrumentation.node.ts` (hourly plus a boot catch-up, off via `INTERNAL_CRON=false`)
and `POST /api/cron/check-expiry` (bearer `CRON_SECRET`, hour honoured only with `?schedule=hourly`).
A 404/410 from a send deletes the dead subscription.

A subscription is bound to the logged-in user: signing out sends `DELETE /api/push/subscribe` and
calls `unsubscribeFromPush`; `<PushSync />` re-binds on the next login, only when permission is
already granted — it never prompts. The custom service worker is `src/worker/index.js`, built by
`@ducanh2912/next-pwa` via `customWorkerSrc`.

**Testing push in dev**: `next dev` runs Turbopack, so next-pwa (a webpack plugin) never registers a
worker and `navigator.serviceWorker.ready` would hang. `src/app/dev-sw.js/route.ts` serves the worker
at `/dev-sw.js` in development only and `push-client.ts` registers it, so push works on localhost.

## Design system

**Tokens** live in `src/app/globals.css`: the green palette in both modes plus `surface-2`, `faint`,
`primary-tint`/`primary-inv` and the expiry states `warning`/`danger` with tints. The
fresh/soon/expired split carries the whole interface (`STATUS_CLASSES` in `src/lib/expiry.ts`) —
never hard-code a hex for it. Manrope (400–800), JetBrains Mono for digits; `--radius` (14px) is the
button radius inside sheets, dialogs and form footers.

**Elevation is a token, not a `shadow-[…]` in a component**, because the modes solve it differently:
light mode uses a drop shadow, dark mode a light top edge (`inset 0 1px 0 rgb(255 255 255 / .055)`).
Four steps: `shadow-card`, `shadow-raise` (hairline only, `none` in light mode), `shadow-nav`,
`shadow-action`/`shadow-fab`. **Every dark value takes its hue from the light one**, changing only
saturation and lightness; dark surfaces sit at S≈8 % and `--border` is opaque, not white with alpha.

Primitives (shadcn/ui-based, plus the design's own `chip`, `switch`, `sheet` and `picker`) live in
`src/components/ui/`; feature components are flat under `src/components/`. Conventions worth keeping:

- **One rendering for every irreversible question**: `confirm-dialog.tsx` (its confirm button prints
  `text-background`, not white — `--danger` is light salmon in dark mode).
- **A restock is a new packet, not a bigger number**: _Nachgekauft_ asks for the new expiry date
  first (`DateSheet`, only the closing button commits) and posts via `restockItem`
  (`src/lib/item-actions.ts`); `findMergeTarget` decides whether it merges or becomes its own row.
- **Swipe gestures are never the only way**: `useSwipeActions` drives stock and archive rows and
  ignores mouse pointers; every action is also reachable as a real button.
- **Toasts are inverted** (`ui/sonner.tsx`); Sonner's own rules are two attribute selectors deep, so
  overrides need Tailwind's `!`.
- **The top inset lives in `layout.tsx`** — pages add only their own `pt-2`, never a second top gap
  (`RouteModal`'s `fullscreen` variant repeats it, being portalled outside the layout).

**Titles and icons**: `src/lib/metadata.ts` holds the app strings and `TITLE_TEMPLATE`, set as the
root layout's `title.template`. A segment setting its own `title` stops the parent template below it
(`settings/layout.tsx` repeats it), and Client Component pages cannot export `metadata` at all —
each has a `layout.tsx` carrying only the title; `public/manifest.json` repeats the strings by hand.
Deliberately no `metadataBase` and no OG image: the public address is only known at runtime
(`BETTER_AUTH_URL`), so a build-time read would bake `localhost` into every image. All icons are
generated from the one leaf path in `brand-mark.tsx` (`npm run icons`) in three non-interchangeable
cuts — `icon-*.png` rounded, `maskable-*.png` full-bleed at 40 %, `apple-icon.png` opaque.

## Deployment

Single Docker container (`Dockerfile`, `compose.yaml`), `data/` volume for the SQLite DB, env vars
documented in `.env.example`.
