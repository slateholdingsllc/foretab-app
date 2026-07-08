# GAPS.md — Honest audit of foretab-app weaknesses

> Written 2026-07-07 during the deep knowledge-transfer pass. Ordered by
> severity, most important first. Anything touching launch gating, RLS /
> SECURITY DEFINER functions, legal pages, Stripe/billing, or the
> excluded-states logic is marked **REVIEW-BEFORE-TOUCHING** — do not let an
> automated session "fix" those without a human explicitly approving the
> change and its blast radius.

---

## 1. Zero automated tests — CRITICAL

**What:** There is no test framework, no test script in `package.json`, and
not a single `*.test.*` file. The only verification gates are `tsc --noEmit`
and `biome lint`.

**Where:** Entire repo.

**Why it matters:** The riskiest logic in the app is plain TypeScript that
would be trivially unit-testable and is currently protected by nothing:
- `lib/dashboard/filters.ts` (URL ↔ FilterState parsing/serialization — the
  contract for every feed query, saved filter, and CSV export)
- `lib/dashboard/cursor.ts` + `lib/rpc/cursor.ts` (two incompatible cursor
  codecs)
- `lib/rpc/feed.ts:buildFilterParams` + `rawToRecord` (filter → RPC param
  mapping; silently drops unknown sorts)
- `lib/stripe/prices.ts` (env → price ID mapping, reverse lookup)
- `lib/stripe/handlers.ts` (webhook idempotency / tier mapping)
- `lib/dashboard/saved-filters.ts:normalizeFilterConfig` (accepts legacy
  snake_case shapes)
- `lib/csv/serialize.ts` (CSV escaping)
- `lib/sso/verify.ts` (SSO token claim validation)
- `lib/dashboard/freshness.ts` (cadence banding)

**Suggested fix (small, single task):** Add Vitest (`npm i -D vitest`) with a
`"test": "vitest run"` script, and write the first test file for
`lib/dashboard/filters.ts` covering: round-trip serialize/parse, rejection of
invalid enum values, `daysWindow` whitelist, and dispositionTab defaulting.
Subsequent single-file tasks: cursors, `buildFilterParams`, `prices.ts`,
`normalizeFilterConfig`, CSV escaping, `verifyHqSsoToken` (jose can mint a
test Ed25519 keypair).

---

## 2. Google OAuth from /login bypasses the signup gate — REVIEW-BEFORE-TOUCHING

**What:** `signInWithGoogle` (`src/lib/actions/auth.ts:366`) is used on both
/signup and /login. From /login there is no business-state field, no
excluded-state acknowledgment, no Terms checkbox — and Supabase
`signInWithOAuth` will **create a new user** if the Google account has never
signed in. Consequences:
1. New users can be created while `SIGNUP_OPEN` is unset (the coming-soon
   gate only guards the /signup page render).
2. Those users' `excluded_state_acknowledgment_at` / `trial_cap_disclosure_at`
   / `arbitration_optout_disclosure_at` legal-evidence columns stay NULL
   forever (the /auth/callback backfill only runs when the params are present,
   i.e. only for the /signup-originated flow).

The code comment at auth.ts:369-373 acknowledges the state-gate half ("they
still hit the load-bearing /state-selection gate") — the excluded-state legal
gate does still hold at trial provisioning. But the SIGNUP_OPEN bypass and
the permanently-missing consent timestamps are real gaps in the compliance
evidence trail.

**Why it matters:** The whole R4 disclosure architecture exists to prove each
customer affirmatively acknowledged terms; a cohort with NULL timestamps
undermines it, and a closed-signup launch posture that isn't actually closed
is a launch-gating hole.

**Suggested fix (needs human sign-off on desired behavior):** In
`signInWithGoogle`, when the consent params are absent (login-page origin) and
the user turns out to be new, either (a) block at /auth/callback by checking
`customers` row age + NULL timestamps and routing to a "finish signup"
interstitial that collects the checkboxes, or (b) simply hide the Google
button on /login until launch. Smallest safe slice: also gate the /login
Google button behind `SIGNUP_OPEN` logic for not-yet-registered users is
impossible client-side — so option (a)'s interstitial is the durable fix.

---

## 3. Open redirect via `?next=` in signIn — HIGH (security)

**What:** `signIn` (`src/lib/actions/auth.ts:352,363`) does
`redirect(next || "/")` with `next` taken from form data, which flows from the
`?next=` URL param (`login-form.tsx`). Next.js `redirect()` accepts absolute
URLs, so `https://app.foretab.com/login?next=https://evil.example` sends a
successfully-authenticated user to an attacker page (classic phishing
amplifier: real login, then a fake "re-enter your password" page).
`next.config.ts` even has a comment acknowledging typedRoutes was disabled
because "we redirect to user-supplied strings."

`/auth/callback` is *mostly* safe by construction (`${origin}${next}`) but a
`next` beginning with `//` or containing a scheme is still worth normalizing,
and `updatePassword`/`signOut` are fine (fixed targets).

**Suggested fix (small):** Add a `safeNextPath(raw: string): string` helper
(returns `/` unless the value matches `/^\/(?!\/)/`) in `lib/utils.ts`; apply
it in `signIn`, `signInWithGoogle`'s `next`, and `/auth/callback`'s `next`.
Pure addition, no behavior change for legitimate paths.

---

## 4. Trial provisioning is non-transactional — HIGH — REVIEW-BEFORE-TOUCHING

**What:** `selectTrialState` (`src/lib/actions/trial.ts:189-248`) performs
four sequential writes (customers UPDATE, trials INSERT, customer_states
INSERT, saved-filters INSERT) with no transaction. If the `customer_states`
insert fails after the `trials` insert succeeds, the customer has a trial but
zero accessible states — a paying-funnel dead end that the idempotency guard
then *locks in* (the existing-trial check at line 115 redirects to `/` on
retry, so they can never re-provision). The double-click idempotency check is
also read-then-write, so two concurrent submissions can both pass the
`existingTrial` check; the `trials.customer_id` UNIQUE constraint saves the
second insert but produces a raw error message for the user.

**Suggested fix (small but on a legal-gate file — get approval):** Move the
provisioning into a single SECURITY DEFINER Postgres function
(`provision_trial(customer_id, state_id)`) in foretab-engine so it's atomic,
or at minimum make the app-side failure path delete the orphaned trial row
before returning the error. Also catch unique-violation (23505) on the trials
insert and treat it as the idempotent success path.

---

## 5. Trial CSV export cap has a read-then-write race — MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** `/api/export.csv` (`src/app/api/export.csv/route.ts:80-92`) reads
`fetchCumulativeExportRowCount`, computes `remaining`, serves up to that many
rows, then logs. Two concurrent requests both read the same count and can
jointly exceed `TRIAL_EXPORT_CUMULATIVE_CAP` (25). Low business impact today
(cap is small), but it's the enforcement mechanism for a paid feature.
Also: the audit insert uses the *user* client — fine under current RLS
(authenticated INSERT own rows) but means a customer could theoretically
INSERT fake `csv_export_log` rows directly via PostgREST to... inflate their
own usage (self-harm only; harmless).

**Suggested fix (small):** Enforce the cap DB-side: a trigger or a
`log_csv_export(...)` SECURITY DEFINER function that inserts and validates the
cumulative sum atomically, returning the allowed row budget. App-side change
is then just calling it before generating the CSV.

---

## 6. Cron email dedup writes after send — duplicate-email risk — MEDIUM

**What:** All three cron routes
(`src/app/api/cron/{subscription-renewal-reminders,monthly-anniversary-reminders,trial-expiry-reminder}/route.ts`)
send the email first, then insert the dedup row. If the insert fails (or the
function times out mid-loop), the next daily run re-sends. The code logs this
loudly but the failure mode is customer-visible duplicate legal notices.
Sequential per-candidate awaits also mean a large candidate list could
approach the Vercel function timeout (no batching, no concurrency cap, no
resume marker).

**Suggested fix (small):** Insert the dedup row *first* with a
`status='sending'` marker (or just insert-then-send and delete on send
failure), so a crash yields a missed-then-retried email rather than a
duplicate. One route at a time; the three share the same shape.

---

## 7. PostgREST embedded-relation `[0]` indexing is load-bearing and unchecked — MEDIUM

**What:** The cron routes cast joined rows as
`customer: Array<{...}>` and read `c.customer?.[0]`
(e.g. `subscription-renewal-reminders/route.ts:96-105`,
`trial-expiry-reminder/route.ts:72-79`). Whether PostgREST returns an array or
an object for an embedded many-to-one depends on FK metadata detection. The
`as unknown as` casts mean a shape change (e.g. after an engine migration
renames a FK) silently makes every candidate hit the "No recipient email"
branch — reminders quietly stop, which is a compliance failure with zero
errors thrown. Same unchecked-cast pattern exists at
`lib/rpc/feed.ts:242` (RPC rows), `lib/dashboard/queries.ts:379`, and
`lib/disposition/today.queries.ts:100`.

**Suggested fix (small):** Add a tiny `firstRow<T>(rel: T | T[] | null)`
helper that handles both shapes, and use it in the three cron routes and
`today.queries.ts`. Separately, log when a candidate loop produces
`errors.length === candidates.length` (all-fail = shape bug, page someone).

---

## 8. `getRequestOrigin()` trusts the Host header for auth-email links — MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** Triplicated helper (`lib/actions/auth.ts:140`,
`lib/actions/checkout.ts:229`, `lib/actions/account.ts:245`) builds the origin
for verification emails, password-reset links, OAuth redirects, and Stripe
return URLs from `host` / `x-forwarded-proto` headers. On Vercel the platform
sets these, so practical exploitability is low — but if the app is ever served
behind another proxy or a wildcard alias, a spoofed Host header poisons
password-reset links (account-takeover vector via emailed link pointing at an
attacker host). The comment explains why `NEXT_PUBLIC_SITE_URL` was abandoned
(it caused a real bug), so the fix must preserve preview-deploy ergonomics.

**Suggested fix (small):** Extract ONE shared `getRequestOrigin()` into
`src/lib/request-origin.ts` (kills the triplication) and add an allowlist
check: accept `*.vercel.app`, `app.foretab.com`, `localhost:*`; otherwise fall
back to `NEXT_PUBLIC_SITE_URL`. Then replace the three copies with imports.

---

## 9. Middleware public-path matching is prefix-based — LOW-MEDIUM

**What:** `lib/supabase/middleware.ts:49-58` uses
`pathname.startsWith(p)` over `["/login","/signup",...,"/admin"]`. Any route
named e.g. `/loginwhatever` or `/signup-bonus` would silently be public. Also
`/` (root) is special-cased public-ish (`isRoot`) and relies on
`(app)/layout.tsx` + page guards to redirect — which they do, but it means the
worklist page executes its full auth stack per anonymous hit.

**Why it matters:** It works today because no colliding routes exist; it's a
foot-gun for the next route someone adds.

**Suggested fix (small):** Match on exact segment boundaries:
`pathname === p || pathname.startsWith(p + "/")`.

---

## 10. Checkout doesn't verify the pre-charge acknowledgment server-side — LOW-MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** The plan page disables Subscribe buttons until the checkbox is
checked, and `writeCheckoutAcknowledgment` records the timestamp — but
`createCheckoutSession` (`lib/actions/checkout.ts:30`) never checks that
`checkout_acknowledgment_at` is set. A devtools-crafted POST reaches Stripe
Checkout with no recorded acknowledgment, weakening the disclosure-evidence
chain the rest of the code works so hard to maintain (compare: signup path
validates its timestamps server-side).

Also in this file: the Stripe-customer resolution
(`.from("subscriptions").select("stripe_customer_id").limit(1).maybeSingle()`)
takes an arbitrary subscription with no `order`/status filter — a customer
with an old canceled subscription could get their new checkout attached to
whichever Stripe customer that row points to (fine today since it's 1:1, but
fragile).

**Suggested fix (small):** At the top of `createCheckoutSession`, read
`checkout_acknowledgment_at` on the customer row; if NULL, return
`{ok:false, error:"Please confirm the acknowledgment first."}`. Optionally
order the prior-sub lookup by `created_at desc`.

---

## 11. `updateCustomerStates` can strand all_access→downgrade and trial-state overlap — LOW-MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** `lib/actions/account.ts:31` diffs only `granted_via='subscription'`
rows, deliberately leaving trial rows alone. But after a trial converts, the
trial-granted `customer_states` row persists (nothing deletes it at
conversion; `handleCheckoutSessionCompleted` only marks the trial converted).
A single_state subscriber whose trial state differs from their picked
subscription state ends up with **two** accessible states (trial row never
expires from `customer_states` — expiry is enforced in
`customer_accessible_state_ids()` only if the DB helper checks trial validity;
per engine docs it checks trials.status/expiry, so the stale row is likely
inert — but the app-side upsert `ignoreDuplicates: true` on a state that
already has a trial row means the customer gets NO subscription row for that
state, and when the trial later expires they lose access to a state they're
paying for).

**Why it matters:** The ignoreDuplicates branch is the bug: picking your trial
state as your paid state writes nothing, and access silently dies at trial
expiry.

**Suggested fix (small, but entitlement logic — get approval):** In
`updateCustomerStates`, when a selected state collides with a trial-granted
row, UPDATE that row to `granted_via='subscription', subscription_id=...,
trial_id=null` instead of ignoring the conflict. Verify against
`customer_accessible_state_ids()` semantics in
`foretab-engine/supabase/migrations/` first.

---

## 12. Dual feed paths + duplicated logic — MEDIUM (tech debt)

**What:** Two complete implementations of the feed exist
(`lib/dashboard/queries.ts` direct PostgREST vs `lib/rpc/feed.ts` RPC),
switched by `USE_RPC_ENFORCEMENT` at runtime, with:
- `fetchDispositionsByBusinessId` duplicated in both files (comment admits
  "duplicated to avoid circular dep").
- Two incompatible cursor codecs (`lib/dashboard/cursor.ts` keyset vs
  `lib/rpc/cursor.ts` offset) — flipping the flag breaks any bookmarked/
  in-flight pagination URL silently.
- Feature drift: `fetchUncontactedCount` only exists on the RPC path (tab
  badge shows nothing when flag is off); `leadTypes` filter is dropped on the
  RPC path (`p_lead_type` "omit until Agent A adds"); five sort options
  silently fall back to `newest` on the RPC path (`rpc/feed.ts:143-146`);
  `signal_strength_reason`/`notes` are null on RPC, populated on direct;
  `classification_version` is hardcoded `"2"` on RPC.

**Why it matters:** Every feed change must be made twice or the paths drift
further; the flag makes behavior environment-dependent and untestable.

**Suggested fix:** Confirm production has run with `USE_RPC_ENFORCEMENT=true`
long enough, then (single task) delete the direct-path branches from
`fetchDashboardPage`/`fetchAllRecordsForExport`, delete the keyset cursor, and
make `rpcEnforced()` return `true` unconditionally (keep the function so call
sites don't churn). Coordinate first — the engine's "Phase 5 revoke direct
table access" is the matching DB-side step.

---

## 13. `resendVerification` allows unauthenticated magiclink generation for any email — LOW-MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** In `admin_link` mode, `resendVerification`
(`lib/actions/auth.ts:448-533`) takes any email from an unauthenticated form
and, for *existing* users (verified or not), generates a **magiclink** (full
login link) and emails it. The link goes only to the account owner, so it's
not takeover — but it lets anyone trigger login-capable emails to arbitrary
customers with no rate limit at the app layer (Supabase admin.generateLink is
not subject to the normal auth rate limiter), a phishing-priming and
annoyance vector.

**Suggested fix (small):** Track resend attempts per email in a short-lived
in-memory/db counter or simply check the target user's
`email_confirmed_at` first (via `admin.auth.admin.listUsers` lookup) and only
mint links for unconfirmed accounts; confirmed accounts get the generic
success response with no email.

---

## 14. Legal/pricing constants triplicated across repos — MEDIUM — REVIEW-BEFORE-TOUCHING

**What:** Tier prices live in `src/lib/pricing.ts`, in
`foretab-engine/docs/pricing.md`, and in Stripe products. The file's own
header says drift = "legally-bad billing disclosures" (the emailed renewal
reminders and the trial-expired plan page must state the exact charge).
There is no check that the env-configured Stripe price actually bills the
amount `TIER_PRICING` displays. Also `TIER_STATE_COUNT` (1/5/∞) and
`TRIAL_LENGTH_DAYS` (7) are hardcoded with TODO(configurable-not-hardcoded).

**Suggested fix (small):** Add a startup-time (or cron `?test=1`-style)
consistency check: fetch each configured Stripe price via the SDK and compare
`unit_amount` to `TIER_PRICING[tier][period] * 100`, logging loudly on
mismatch. Full config-table migration is a bigger cross-repo task.

---

## 15. README.md is badly stale — MEDIUM (docs)

**What:** `README.md` describes the repo as the "initial scaffold" of Task 11,
lists the dashboard as "Next", says "No service-role key in this app" —
false: `SUPABASE_SERVICE_ROLE_KEY` is used extensively (`lib/supabase/admin.ts`),
and omits ~15 env vars the app now requires (STRIPE_*, CRON_SECRET, RESEND_*,
FORETAB_ADMIN_SESSION_SECRET, HQ_SSO_PUBLIC_KEY, USE_RPC_ENFORCEMENT,
SIGNUP_FLOW_VERSION, SIGNUP_OPEN). `.env.example` covers only 5 of them.
A new engineer following the README will misconfigure the app.

**Suggested fix (small):** Rewrite README's env table from the definitive
list (grep `process.env.` across `src/` — currently: NEXT_PUBLIC_SUPABASE_URL,
NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL, SUPABASE_SERVICE_ROLE_KEY,
SIGNUP_FLOW_VERSION, SIGNUP_OPEN, USE_RPC_ENFORCEMENT, STRIPE_SECRET_KEY,
STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_{SINGLE_STATE,MULTI_STATE,ALL_ACCESS}_{MONTHLY,ANNUAL},
CRON_SECRET, RESEND_API_KEY (check email libs), FORETAB_ADMIN_SESSION_SECRET,
HQ_SSO_PUBLIC_KEY), delete the stale Phase-2 status table, and point to
PROJECT.md. Update `.env.example` to list (empty) all server-side vars.

---

## 16. Mobile filter access is broken/unwired — MEDIUM (UX)

**What:** The sidebar containing `FilterForm` is `lg:hidden`-inverted (desktop
only), and `mobile-filter-sheet.tsx` exists but per the UI exploration is not
rendered anywhere reachable; `MobileWorklistControls` covers search but not
the full filter set. Mobile users likely cannot filter.

**Suggested fix (small):** Wire `MobileFilterSheet` into
`MobileWorklistControls` (or the worklist tabs slot) behind a "Filters"
button; it already exists, so this is mostly composition + a manual check at
375px width.

---

## 17. Assorted tech debt (LOW, each a small standalone task)

1. **Dead/deferred component:** `components/dashboard/disposition/recently-viewed.tsx`
   renders "Unrated" for every item (signal join deferred "to PR-2") and may
   not be mounted. Either wire the signal data or delete it.
2. **Hardcoded colors in the map:** `components/map/map-view.tsx:31-39,214-223`
   uses literal hexes (#F59E0B, #4F7EEB, #94a3b8) — ignores theming. Move to
   CSS-variable-driven values.
3. **`filter-form.tsx:138`** — `statesKey = states.join(",")` +
   eslint-disable to fake deep comparison; order-sensitive. Sort before join.
4. **DetailPanel optimistic revert** (`disposition/detail-panel.tsx:109-125`)
   has no error handling on the post-mutation timeline refresh.
5. **Radius vocabulary drift:** buttons `rounded` (4px), status tabs
   `rounded-sm`, cards `rounded-lg`, top-bar chips `rounded-xl`/pill; the
   PR-1 notes said buttons would go pill-shaped — incomplete rollout.
6. **Repo cruft:** `tsconfig.tsbuildinfo` is committed (add to .gitignore),
   `foretab-app-preview.html` and `PR-1-NOTES.md` are stale scratch artifacts
   at the root, and `.claude/` contains a vendored skill + `logs/`/`tmp_*`
   scratch files.
7. **`getNewHighPriority` fetches `limit * 8` rows** and dedups client-side
   (`disposition/today.queries.ts:142,193`) — relies on RPC ordering; a
   business-grain RPC call would be exact.
8. **`fetchBusinessIdsByDispositionStatus` runs twice per direct-path query**
   (queries.ts:229,238) with no memoization.
9. **Magic numbers:** PAGE_SIZE=50, MAP_PIN_CAP=500, trial export cap=25,
   paid export cap=10,000, saved-filter cap=20 (DB-enforced but string-matched
   in error handling via `/20.*saved filters/i` — brittle if the DB message
   changes).
10. **`signal_strength` typed as `string`** in `lib/disposition/types.ts`
    (kept loose for the v1→v2 cutover). Pin to
    `"New" | "Established" | "Dormant"` once confident, and delete the
    `HOT_LIKE_SIGNALS`/`WARM_LIKE_SIGNALS` bridge arrays.
11. **Admin session has no revocation** (`lib/admin-session/index.ts`): an 8h
    HS256 cookie can't be killed server-side short of rotating the secret.
    Acceptable for now (single operator), note for when operators multiply.
12. **In-flight uncommitted work:** the working tree has a modified
    `vercel.json` plus untracked `src/app/api/cron/trial-expiry-reminder/` and
    `src/lib/email/trial-expiry-reminder.ts` on branch
    `agentc/fix-map-pin-clickthrough` — a cron feature riding an unrelated
    branch. Commit it on its own branch or it will get tangled.

---

## 18. Things that look like gaps but are deliberate (don't "fix")

- **`filters` vs `rawFilters` split** in `(app)/page.tsx` — Opening Now
  defaults must not render as user-set chips.
- **Businesses JOIN absent from the direct feed path** — removed for an RLS
  performance timeout; denormalized columns are the fallback.
- **Audit-before-response in export.csv** and **refuse-on-audit-failure in
  admin actions** — compliance-first ordering, keep it.
- **Swallowed errors** in `logGateRejection`, `log_feed_access`, `logView` —
  intentional best-effort logging.
- **`redirect()` after error-return patterns** in server actions — Next
  redirect-by-throw; don't wrap in try/catch.
- **`suppressHydrationWarning` on `<html>`** — required by the FOUC theme
  script.
- **`SIGNUP_FLOW_VERSION=legacy` still default** — the admin_link cutover has
  a documented sequence in `.env.example`; flipping it is an operator
  decision, not a cleanup.
