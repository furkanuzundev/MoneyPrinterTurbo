# Google Analytics 4 — Design

Date: 2026-09-16 · Status: approved in chat

## Goal

Measure the Reelate acquisition → activation → revenue funnel with GA4, following
best practice: Consent Mode v2 with a first-party consent banner, recommended
event names, and a server-side `purchase` via Measurement Protocol so revenue is
not lost to ad blockers or closed tabs.

## Non-goals

- Google Ads / ad personalization signals (`ad_*` consent stays `denied`).
- Region-specific consent defaults (denied everywhere; see Trade-offs).
- Tracking the admin host, localhost, or any server-side event other than `purchase`.

## 1. Loading & consent

- `src/lib/analytics/config.ts` holds the public measurement ID
  (`GA_MEASUREMENT_ID`, env `NEXT_PUBLIC_GA_MEASUREMENT_ID` overrides it). A
  committed constant — not `web/.env.production` — because `.gitignore` and
  `.dockerignore` exclude all `web/.env.*`, so a build-time env file would never
  reach the Docker build. The ID is public (it ships in every page's HTML).
- `<Analytics />` (client component, root layout) renders nothing unless:
  a measurement ID exists, hostname is not `admin.*`, and hostname is not
  `localhost`/`127.0.0.1` (unless the ID comes from env, for dev verification).
- Inline bootstrap, before gtag.js loads:
  `gtag('consent','default',{analytics_storage:'denied', ad_storage:'denied',
  ad_user_data:'denied', ad_personalization:'denied', wait_for_update:500})`,
  then `gtag('consent','update',{analytics_storage:'granted'})` immediately if
  the stored choice is `granted`, then `gtag('config', ID)`.
- Consent choice stored in first-party cookie `reelate_consent` =
  `granted|denied`, `Max-Age` 1 year, `SameSite=Lax`, `Secure` on https.
- `<ConsentBanner />`: fixed bottom card, shown when no choice stored.
  Accept → store + `consent update analytics_storage granted`. Reject → store +
  `denied` update. "Cookie settings" links (landing footer, legal pages, privacy
  page) dispatch a `reelate:open-consent` window event that reopens the banner.

## 2. Events

`track(name, params)` in `src/lib/analytics/gtag.ts` — no-op if `window.gtag`
missing. Event helpers are typed so names stay consistent.

| Event | Trigger | Params |
|---|---|---|
| `page_view` | Automatic (enhanced measurement, history changes) | — |
| `cta_click` | Delegated click listener on `a[href^="/signin"]` | `cta_text`, `cta_href`, `page_path` |
| `sign_up` | Dashboard mount, user `createdAt` < 10 min ago, once per user (localStorage flag) | `method: "google"` |
| `user_id` config | Dashboard mount (`gtag('set', {user_id})`) | internal user id |
| `video_generate` | `POST /api/jobs` 2xx in wizard | `aspect`, `target_seconds`, `voice` |
| `credits_insufficient` | `POST /api/jobs` 402 | — |
| `video_download` | Download MP4 click (job-live, video-modal) | `location` |
| `video_rate` | Star pick saved | `rating` |
| `caption_rerender` | Re-render 2xx | — |
| `begin_checkout` | Buy button click | `currency: USD`, `value`, `items[]` |
| `purchase` | Server, Stripe webhook (below) | `transaction_id`, `value`, `currency`, `items[]` |

## 3. Server-side purchase (Measurement Protocol)

- Buy button reads `client_id` and `session_id` via `gtag('get', ID, ...)`
  (300 ms timeout; missing → omitted) and posts them to `/api/checkout`.
- `buildCheckoutParams` adds `ga_client_id` / `ga_session_id` to Stripe metadata
  when present (validated: client id `^\d+\.\d+$`, session id `^\d+$`).
- `handleStripeEvent`: only when `fulfillPurchase` returns `true` (first
  delivery), call `sendPurchaseEvent`. Payload built by pure
  `buildPurchasePayload` (`src/lib/analytics/measurement-protocol.ts`).
- `sendPurchaseEvent` posts to
  `https://www.google-analytics.com/mp/collect?measurement_id=…&api_secret=…`
  with a 3 s `AbortSignal.timeout`; skips silently without `GA_API_SECRET` or
  `ga_client_id`; catches and logs every error — never throws, so Stripe never
  retries because of analytics.
- Consent-denied users have no client id → no server event (revenue truth
  stays in the admin panel).

## 4. Legal

Privacy page §4 Cookies rewritten: session cookie + Google Analytics
(only after consent, `_ga*` cookies, what is collected, how to withdraw via
"Cookie settings"). `lastUpdated` bumped.

## 5. Testing

- Unit (vitest, node): consent cookie parse/serialize, MP payload builder,
  `sendPurchaseEvent` skip/timeout/no-throw (mocked fetch), checkout metadata,
  analytics id validators, `isTrackableHost`.
- Integration: webhook test — MP called once on first delivery, not on duplicate.
- Manual (Chrome, dev with env ID): no `_ga` cookie & no `collect` with
  `gcs=G111` before consent; accept → `_ga` set; admin host → no gtag request.

## 6. Operator guide

`deploy/ANALYTICS.md`: create GA4 property + web stream, give ID, create MP
API secret → `/opt/reelate/.env.production` `GA_API_SECRET`, mark key events,
add `checkout.stripe.com` + `stripe.com` to unwanted referrals, data retention
14 months, internal traffic filter, verify with DebugView / Realtime.

## Trade-offs

- Consent denied by default worldwide: simpler and legally safe everywhere;
  costs observed data in non-EU regions, partly recovered by Google modeling.
- `sign_up` is inferred from `createdAt` on first dashboard load instead of a
  server event: keeps it tied to the browser session so it attributes to the
  acquisition channel.
