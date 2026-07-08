# PROJECT.md — Foretab Customer App

> Written 2026-07-07 as a one-time deep knowledge transfer. Companion docs:
> [GAPS.md](GAPS.md) (honest audit of weaknesses) and [CLAUDE.md](CLAUDE.md)
> (operational conventions for AI-assisted sessions). The README.md is
> **stale** (it describes the early Phase-2 scaffold); trust this file instead.

## 1. What this is

Foretab is a B2B lead-generation SaaS for **beverage/alcohol industry sales
reps** (distributors, suppliers, service providers). The product ingests
public alcohol-license data from ~16 US states (9 currently published/active for sale), classifies each license event
with an LLM ("is this a new restaurant opening? a renewal? how strong a sales
signal is it?"), deduplicates records into business entities, and sells access
to the resulting feed as a dashboard + CSV export + map.

This repo (`foretab-app`) is the **customer-facing dashboard** at
`app.foretab.com`. Customers sign up, take a 7-day single-state trial, then
subscribe ($79/mo single state, $249/mo 5 states, $399/mo all states) to work
a "worklist" of leads: filter, save views, track lead status (a lightweight
CRM called "disposition"), see a map, and export CSVs.

The **data engine lives in the sibling repo** `../foretab-engine` (Python:
scrape → classify → dedup pipelines, plus ALL SQL migrations). The two repos
share one Supabase project. There are no migrations in this repo — the
database schema is owned by foretab-engine (`foretab-engine/supabase/migrations/`).

Organizational context you'll see in code comments: this is a Slate Holdings
project. "Agent A"/"Code Agent A" = the AI agent owning foretab-engine;
"Agent B"/"Code Agent B" = the one owning this repo; "Britt" = the human
operator (Brittany Lyons); "HQ" / "HQ-Slate" = a central operator console at
`hq.slateholdingsllc.com` that SSO's into this app's `/admin` area. "Dispatch"
= the planning docs in `foretab-engine/docs/`. Comments reference dispatch
sections (§7.2 etc.) and task numbers (Task 9–27) — those map to
`foretab-engine/docs/phase-1-dispatch.md` and related planning docs.

## 2. Tech stack and why

| Piece | Version | Why (as evidenced by the code) |
|---|---|---|
| Next.js App Router | 15.x | Server Components + Server Actions = almost no client-side data fetching; auth-aware SSR via cookies. `experimental.staleTimes` tuned for instant tab switching. |
| React | 19 | Comes with Next 15; `useTransition` used for pending states on server actions. |
| Supabase (`@supabase/ssr`) | 2.x | Postgres + Auth + RLS in one. The anon key ships to the browser; **RLS and SECURITY DEFINER RPCs are the security boundary**. Cookie-based sessions via `@supabase/ssr`. |
| Tailwind v4 (beta) | 4.0-beta | CSS-only `@theme` config in `src/app/globals.css` — there is **no tailwind.config.js**. Design tokens are CSS variables; light mode is a `[data-theme="light"]` override block. |
| shadcn/ui-style primitives | hand-written | `src/components/ui/*` are hand-rolled (cva + tailwind-merge), not generated. Only 8 primitives exist. |
| Biome | 1.9 | Lint + format (not ESLint/Prettier). Double quotes, semicolons, 100-col lines, 2-space indent. |
| Stripe | SDK 22, API pinned `2026-04-22.dahlia` | Checkout Sessions + Customer Portal (hosted, not custom billing UI) + webhook → `subscriptions` projection table. |
| Resend | 6.x | Transactional email (signup verification in `admin_link` mode, trial/renewal reminder crons). |
| jose | 6.x | Two JWT systems: verifying HQ-issued Ed25519 SSO tokens, and minting/verifying the HS256 `/admin` operator-session cookie. |
| Leaflet + react-leaflet | 1.9 / 5.0 | Map page. Client-only (`dynamic(..., { ssr: false })`), CartoDB Positron tiles (no API key). |
| Vercel | — | Hosting + 3 daily crons (`vercel.json`, all at 14:00 UTC, authed by `CRON_SECRET`). |

There are **no tests and no test framework** — see GAPS.md #1.

## 3. Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │ Supabase (project mjrridklwkdwzbethbjq)      │
 foretab-engine (Py)   │                                              │
 scrape→classify→dedup ├─ raw_records → classified_records ──────┐    │
 owns ALL migrations   │  (published_to_customers gate)  businesses   │
                       │                                  locations   │
                       │ customers / trials / customer_states /       │
                       │ subscriptions / customer_saved_filters /     │
                       │ customer_business_disposition(+events,       │
                       │  touches, viewed) / csv_export_log /         │
                       │ billing_events / gate_rejections / app_config│
                       │                                              │
                       │ SECURITY DEFINER RPCs: get_feed,             │
                       │  get_feed_by_business(+_count), get_map_pins,│
                       │  search_cities, get_license_detail,          │
                       │  get_business_license_history,               │
                       │  excluded_business_states, log_feed_access,  │
                       │  customer_accessible_state_ids (helper) ...  │
                       └──────▲─────────────▲─────────────▲───────────┘
                    anon key + user JWT   service-role key │
                       (RLS applies)      (bypasses RLS)   │
                              │                 │          │
┌─────────────────────────────┴─────────────────┴──────────┴──────────┐
│ foretab-app (this repo, Next.js on Vercel)                          │
│                                                                     │
│ middleware.ts ── token refresh + redirect-to-/login gating          │
│                                                                     │
│ (auth)/  signup·login·verify-email·reset-password  ── SignupGate    │
│ auth/callback + auth/finalize ── PKCE & OTP-hash session exchange   │
│ (app)/   / (worklist) · /pipeline · /map · /account ·               │
│          /state-selection · /trial-expired · /methodology           │
│ (admin)/ /admin ── HQ SSO only (own JWT cookie, NOT Supabase auth)  │
│ api/     export.csv · stripe/webhook · cron/* (3 daily reminders)   │
│                                                                     │
│ lib/supabase/{server,client,middleware,admin}  ← 4 client factories │
│ lib/actions/* ← server actions   lib/rpc/* ← RPC feed path          │
│ lib/dashboard/* ← direct-PostgREST feed path + filters/cursors      │
│ lib/disposition/* ← mini-CRM     lib/stripe/* ← billing             │
└─────────────────────────────────────────────────────────────────────┘
   Stripe (checkout, portal, webhooks)      Resend (email)      HQ-Slate (SSO)
```

### 3.1 The four Supabase clients — know which one you're holding

- `lib/supabase/server.ts` — **user-scoped**, anon key + user JWT from cookies.
  RLS applies. Use in Server Components, actions, route handlers.
- `lib/supabase/client.ts` — same, but for Client Components (browser).
- `lib/supabase/middleware.ts` — token refresh + route gating inside
  `src/middleware.ts`.
- `lib/supabase/admin.ts` — **service-role, bypasses RLS**. Only for: cron
  routes, Stripe webhook, admin SSO, and the specific privileged writes inside
  server actions (trial provisioning, disclosure-timestamp columns,
  customer_states mutations). The pattern everywhere is: *authenticate and
  authorize with the user client first, then perform the privileged write with
  the admin client*. The trust boundary is the server action, not RLS.

### 3.2 Customer lifecycle (the money path)

1. **Signup** (`/signup`, gated by `SIGNUP_OPEN=true` env — otherwise a
   coming-soon card). `SignupGate` (client) collects: business state (must not
   be in the excluded list), an excluded-state acknowledgment checkbox, and a
   Terms checkbox. Both checkbox timestamps are captured client-side at
   check-time and re-validated server-side in `lib/actions/auth.ts:signUp`.
2. Two signup email flows behind `SIGNUP_FLOW_VERSION` env:
   `legacy` (default; `supabase.auth.signUp` + Supabase's SMTP) vs `admin_link`
   (`admin.createUser` + `admin.generateLink` + Resend — built because the
   legacy path suffered Site-URL/template drift). Google OAuth is the third
   path; consent timestamps ride through the OAuth `redirectTo` query params.
3. **Email verified** → Supabase `/auth/v1/verify` → a **Postgres trigger**
   (`on_auth_user_email_confirmed`, engine migration 011) creates the
   `public.customers` row, fanning user_metadata out to legal-evidence columns
   (`business_state`, `excluded_state_acknowledgment_at`,
   `trial_cap_disclosure_at`, `arbitration_optout_disclosure_at`).
4. `/auth/callback` exchanges the code (PKCE) or bounces to `/auth/finalize`
   (client page) for OTP-hash links which servers can't read.
5. **`/state-selection`** → `lib/actions/trial.ts:selectTrialState` — the
   **LOAD-BEARING LEGAL GATE**. Re-validates business_state against
   `excluded_business_states()` (DB-config-driven, currently CA/WA/TX/VT/OR —
   data-broker-law states), logs rejections to `gate_rejections` with IP/UA,
   and only then provisions: `trials` row (7 days), `customer_states` grant,
   3 default `customer_saved_filters`. Writes use the admin client (those
   tables are service-role-write-only by design).
6. **Trial expiry** → dashboard redirects to `/trial-expired` (plan page).
   `createCheckoutSession` → Stripe Checkout (internal `customers.id` in
   session metadata) → webhook `checkout.session.completed` upserts
   `subscriptions`, sets `customers.status='active'` + `current_tier`, marks
   trial converted, and for all_access expands `customer_states` to every
   sellable state.
7. **Entitlement enforcement** is centralized in the DB helper
   `customer_accessible_state_ids()` (SECURITY DEFINER, engine-owned): union
   of active-trial states + active-subscription states. Every customer-facing
   RPC intersects requested states with it. Internal accounts
   (`customers.account_type='internal'`) get all sellable states, no trial.

### 3.3 The feed (worklist) — the most complex subsystem

**Two parallel query paths exist**, switched at runtime by the
`USE_RPC_ENFORCEMENT` env var (read per-request via `lib/rpc/flag.ts:rpcEnforced()`,
deliberately not a build-time constant):

- **RPC path** (production): `lib/rpc/feed.ts` calls SECURITY DEFINER
  functions `get_feed` / `get_feed_by_business` (+ `_count` variants) with
  ~14 `p_*` filter params. Quota-enforced DB-side (500 records/day →
  `QuotaExceededError`). Offset-based cursor (`lib/rpc/cursor.ts`).
- **Direct path** (legacy/fallback): `lib/dashboard/queries.ts` builds a
  PostgREST query on `classified_records` under RLS. Keyset cursor
  (`lib/dashboard/cursor.ts`) — a **different, incompatible cursor format**.

Flow: URL search params → `parseFiltersFromSearchParams`
(`lib/dashboard/filters.ts`, validates every field) → `FilterState` → one of
the two paths → `DashboardRecord[]` → disposition enrichment (one batched
query per page) → `Feed` component groups records by business.

**"Opening Now" default view**: when the URL has no `?types=` and no `?all=1`,
`(app)/page.tsx` silently applies `licenseTypes=['new_issuance','application']`
+ 180-day window and uses the **business-grain** RPC (`get_feed_by_business`,
one row per business, freshest license event). `&all=1` is the escape hatch
(map pin click-through uses it). The raw (un-defaulted) filters are what get
passed to display components so the defaults don't render as user-set chips —
`filters` vs `rawFilters` in `page.tsx` is intentional, don't "simplify" it.

The dashboard page fires ~9 queries via `Promise.allSettled` and streams the
feed through Suspense; every section degrades independently
(`SectionDegraded`). Freshness badges come from `data_source_health` +
cadence-aware banding in `lib/dashboard/freshness.ts`.

### 3.4 Disposition (mini-CRM)

`lib/disposition/` + `components/dashboard/disposition/`. Statuses:
implicit `uncontacted` (no row) | `saved` | `working` | `won` | `lost` |
`skip`, one row per (customer, business) in `customer_business_disposition`,
with append-only `customer_business_disposition_event` and per-license
`customer_license_touch` logs (unioned into the activity timeline). Server
actions in `lib/disposition/actions.ts` (setStatus, logTouch, setFollowUp,
updateNotes, logView). UI: status tabs with optimistic counts
(`StatusCountsContext`), slide-over `DetailPanel`, `TodayPanel` (due
follow-ups + new high-priority leads), Pipeline page funnel/win-rate/activity
charts (`lib/disposition/insights.queries.ts`). Signal vocabulary is v2:
**New / Established / Dormant** (renamed from hot/warm/cold — bridge arrays
`HOT_LIKE_SIGNALS` etc. still exist).

### 3.5 Admin & SSO

`/admin` is **not** Supabase-authed. `src/middleware.ts` exempts it; the
`(admin)/layout.tsx` enforces an operator session cookie
(`foretab_admin_session`, HS256 JWT, 8h, Path=/admin) minted by
`/admin/sso/start` after verifying an HQ-issued **Ed25519** short-lived token
(`lib/sso/verify.ts`, public key in `HQ_SSO_PUBLIC_KEY`). Two intents:
`operator_sso` (open admin) and `impersonate` (generates a Supabase magiclink
for a target customer and redirects into their session). Every admin action
writes `foretab_admin_audit` (refuse-on-failure: audit write errors abort the
operation).

### 3.6 Compliance surfaces (why the code is so paranoid)

Excluded-state gating exists because five states (CA, WA, TX, VT, OR) have
data-broker registration laws; Foretab refuses customers based there.
Enforcement points all read `public.excluded_business_states()` (backed by
`app_config`, operator-editable without deploy): signup UI gate, `signUp`
action, Google OAuth path, and `selectTrialState`. Rejections are logged
forensically (`gate_rejections`). Consent/disclosure timestamps
(`*_acknowledgment_at`, `*_disclosure_at`) are legal evidence — the
authenticated role has **no UPDATE grant** on them; writes require the admin
client (this caused a documented silent-failure bug, see
`writeCheckoutAcknowledgment`). CSV exports are audited *before* the response
is generated (`csv_export_log`, audit-fails → export refused). The renewal /
anniversary reminder crons implement Colorado SB25-145 / ROSCA-style
auto-renewal notice requirements. **Treat all of this as
REVIEW-BEFORE-TOUCHING.**

## 4. Key design decisions (and their reasoning)

1. **Server actions as the trust boundary, not RLS alone.** Provisioning
   tables are SELECT-only for the authenticated role; the action
   authenticates, runs the legal gate, then writes with service-role. Keeps
   RLS simple and puts complex authorization in reviewable TS.
2. **Configurable-not-hardcoded principle.** Excluded states, sellable states
   (`states_active_for_sale` view), Stripe price IDs (env vars) are all
   runtime-config. Trial length (7d) and tier state counts are still
   hardcoded with TODOs pointing at `app_config`.
3. **Header-derived origin, not `NEXT_PUBLIC_SITE_URL`.** `getRequestOrigin()`
   builds redirect/email URLs from the live `host` header because the env var
   caused an OAuth-redirect-to-localhost bug. (Duplicated in 3 files — see GAPS.)
4. **Dual feed paths with a runtime flag.** The direct-PostgREST path predates
   the SECURITY DEFINER RPCs; `USE_RPC_ENFORCEMENT` allowed staged cutover.
   RPC is the intended end state ("Phase 5" revokes direct table access).
5. **Idempotent, audit-first billing.** Webhook inserts the raw event into
   `billing_events` (UNIQUE stripe_event_id) before dispatching; handlers are
   upsert-based so Stripe retries are safe; failures are recorded for replay.
6. **Degrade, don't crash.** Best-effort logging swallows errors
   (gate_rejections, log_feed_access); page queries run under `allSettled`;
   the only hard-fail-by-design paths are the excluded-state check (refuse to
   proceed if the list can't be fetched) and audit writes (admin audit, CSV
   export log).
7. **Anti-enumeration posture** in auth flows: password reset and
   resendVerification return generic success regardless of account existence.
8. **Stripe stays the source of truth for billing**; `subscriptions` is a
   projection maintained solely by webhooks. No `stripe_customer_id` cached on
   `customers` — resolved via any prior subscription row.

## 5. Critical paths vs. safe-to-change

**Load-bearing — change with extreme care (see GAPS for REVIEW-BEFORE-TOUCHING):**
- `lib/actions/trial.ts`, `lib/excluded-states.ts`, `lib/gate-rejections.ts`,
  `components/auth/signup-gate.tsx` — the legal gate.
- `lib/actions/auth.ts`, `app/auth/callback/route.ts`, `app/auth/finalize/` —
  signup/verification chain (fragile historically; two flow versions live).
- `app/api/stripe/webhook/route.ts`, `lib/stripe/*` — money.
- `lib/rpc/feed.ts` + `lib/dashboard/queries.ts` + `lib/dashboard/filters.ts`
  — the feed; RPC param names must match engine migrations exactly.
- `src/middleware.ts` + `lib/supabase/middleware.ts` — auth gating.
- `/admin` + `lib/sso/*` + `lib/admin-session/*` — operator access.
- `vercel.json` cron entries + `app/api/cron/*` — compliance emails.

**Safe to change casually:**
- Everything in `components/ui/*`, most of `components/dashboard/*` visual
  polish, `globals.css` tokens, copy/text, `methodology-content.ts`,
  `state-names.ts`, `state-attributions.ts`, empty states, tour steps.

## 6. Surprises that will trip you up

1. **The database schema lives in the other repo.** To understand any RPC or
   RLS behavior, read `../foretab-engine/supabase/migrations/` and
   `../foretab-engine/docs/schema.md`. Feed RPC changes require a
   cross-repo dance (comments say "pending Agent A migration 000NN").
2. **Two cursor formats.** Keyset (`{s,i,n}`) on the direct path, offset
   (`{o}`) on the RPC path. A URL cursor from one path silently fails on the
   other. Flipping `USE_RPC_ENFORCEMENT` invalidates in-flight pagination URLs.
3. **PostgREST embedded relations are indexed `[0]`** in cron routes
   (`customer:customers!inner(...)` treated as array). Whether PostgREST
   returns object or array depends on FK detection — the casts are `as
   unknown as ...` so a mismatch is a silent runtime bug, not a type error.
4. **The businesses JOIN was removed from the direct feed path on purpose**
   (RLS made it O(page_size × table_rows), timing out at 51 rows). Display
   falls back to denormalized `business_name`/`dba` on `classified_records`.
   Don't re-add the join.
5. **`signal_strength` renamed hot/warm/cold → New/Established/Dormant** (v2).
   Some code still bridges via `HOT_LIKE_SIGNALS` arrays; `SignalBadge` maps
   New→"hot" color variant. Don't be confused by the leftover vocabulary.
6. **`suppressHydrationWarning` on `<html>`** is required by the FOUC theme
   script (sets `data-theme` pre-hydration; localStorage key `foretab-theme`).
7. **`force-dynamic` on /signup is deliberate** — `SIGNUP_OPEN` must be read
   per-request, or the flag freezes into the build.
8. **Google OAuth from /login can create a brand-new user**, bypassing both
   the SIGNUP_OPEN gate and the signup checkboxes. Documented as a known edge
   case in `signInWithGoogle`; the /state-selection gate still catches
   excluded states, but terms timestamps stay NULL (see GAPS #4).
9. **`.claude/` in this repo mostly contains an imported skill** (ui-ux-pro-max)
   plus scratch files — not project config to preserve carefully.
10. **`redirect()` inside try/catch**: Next's `redirect()` throws; several
    actions rely on it being the last statement. Don't wrap action bodies in
    broad try/catch or you'll swallow redirects.
11. **Stripe API `2026-04-22.dahlia` moved `current_period_*` onto
    subscription items** and `invoice.subscription` onto
    `invoice.parent.subscription_details`. Handlers already account for this;
    old Stripe tutorial patterns will look "wrong" but the code is right.
12. **Pricing appears in three places** (this repo's `lib/pricing.ts`, engine
    `docs/pricing.md`, and Stripe dashboard). Drift = legally-bad billing
    disclosures. Update all three together. Note `docs/pricing.md` in the
    engine repo also shows an older "13 states national" framing — the app's
    `lib/pricing.ts` is what customers see.
