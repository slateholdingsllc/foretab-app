# CLAUDE.md — foretab-app

Customer dashboard for Foretab (alcohol-license lead-gen SaaS) at
app.foretab.com. Next.js 15 App Router + React 19 + Tailwind v4 + Supabase.

- **Architecture & narrative:** read [PROJECT.md](PROJECT.md) — what the app
  is, how the two repos fit together, the customer lifecycle, and the
  surprises.
- **Known issues:** read [GAPS.md](GAPS.md) — severity-ordered audit; check it
  before "fixing" anything that looks wrong (some oddities are deliberate,
  §18 lists them).
- README.md is stale — do not trust it.

## Commands

```bash
npm run dev          # dev server, http://localhost:3000
npm run build        # production build — the main CI gate
npm run typecheck    # tsc --noEmit
npm run lint         # biome lint .
npm run format       # biome format --write .
npm run check        # biome check . (lint + format + organize imports)
```

There are **no tests** (GAPS.md #1). Verification = typecheck + build.
Deploy is Vercel on push; crons defined in `vercel.json` (3 daily, 14:00 UTC).

## The one rule that matters most

**The database schema lives in `../foretab-engine/supabase/migrations/`, not
here.** This repo has zero migrations. Any RPC signature, RLS policy, table
column, or trigger question → read the engine repo (also
`../foretab-engine/docs/schema.md`). RPC params here (`p_state_ids`, etc.)
must match engine migrations exactly; comments like "pending Agent A
migration 000NN" mean the DB side doesn't exist yet.

## Security-critical surfaces — do not modify without explicit human approval

- `src/lib/actions/trial.ts`, `src/lib/excluded-states.ts`,
  `src/lib/gate-rejections.ts`, `src/components/auth/signup-gate.tsx` —
  excluded-states legal gate (CA/WA/TX/VT/OR data-broker laws). The gate list
  comes from the DB RPC `excluded_business_states()`; **never add a hardcoded
  fallback** — throwing on failure is the designed behavior.
- `src/lib/actions/auth.ts`, `src/app/auth/callback/route.ts` — signup /
  consent-timestamp evidence chain.
- `src/app/api/stripe/webhook/route.ts`, `src/lib/stripe/*`,
  `src/lib/actions/checkout.ts`, `src/lib/pricing.ts` — billing. Prices in
  `pricing.ts` must stay in sync with Stripe + `foretab-engine/docs/pricing.md`.
- `src/middleware.ts`, `src/lib/supabase/middleware.ts` — auth gating.
- `src/app/(admin)/*`, `src/lib/sso/*`, `src/lib/admin-session/*`,
  `src/lib/admin-audit/*` — HQ operator SSO. Audit-write failures must abort
  the operation (refuse-on-failure), keep it that way.
- `vercel.json` + `src/app/api/cron/*` — compliance reminder emails.

## Supabase clients — pick the right one

| Import | Key | Use in |
|---|---|---|
| `@/lib/supabase/server` | anon + user JWT (RLS applies) | Server Components, actions, route handlers |
| `@/lib/supabase/client` | anon + user JWT | Client Components |
| `@/lib/supabase/admin` | **service-role (bypasses RLS)** | Cron routes, webhook, admin SSO, privileged writes only |

Pattern for privileged writes in server actions: authenticate + authorize
with the user client first, then write with the admin client. Several tables
(trials, customer_states) and columns (all `*_acknowledgment_at` /
`*_disclosure_at` legal-evidence timestamps) are service-role-write-only —
a user-client write "succeeds" with 0 rows affected (this bit us before;
always check `count`).

## Conventions

- **Files:** kebab-case components (`filter-form.tsx`); server actions in
  `src/lib/actions/*.ts` with `"use server"` at top; actions return
  `{ ok: true } | { ok: false, error: string }` and use `redirect()` for
  success navigation. **Never wrap action bodies in broad try/catch** —
  Next's `redirect()` works by throwing.
- **`"use client"` at leaf level only** — pages and layouts stay server
  components; interactive bits (forms, toggles, providers) are client leaves.
- **URL is the state store for filters.** `lib/dashboard/filters.ts`
  parse/serialize is the contract; client components `router.push()` new
  query strings, the server page re-renders. React state is only for
  transient UI (panels, density, theme).
- **Forms:** plain FormData + `useTransition`; no form/validation libraries.
- **Errors:** page data fetches go through `Promise.allSettled`; each section
  renders `SectionDegraded` on failure. Best-effort logging (gate rejections,
  feed access, view tracking) swallows errors on purpose.
- **Styling:** Tailwind v4 — tokens are CSS variables in
  `src/app/globals.css` `@theme` (dark default) with a `[data-theme="light"]`
  override block. **No tailwind.config.js exists.** Fonts: Bricolage
  Grotesque (display), Geist (body), Geist Mono (data/badges). Use semantic
  tokens (`bg-card`, `text-foreground-muted`, `border-border`), never hex.
- **Lint/format:** Biome — double quotes, semicolons, trailing commas,
  100-col, 2-space. Run `npm run check` before finishing.
- **Path alias:** `@/*` → `src/*`.

## Gotchas

- **Two feed paths** switched by `USE_RPC_ENFORCEMENT` env at runtime:
  RPC path (`lib/rpc/feed.ts`, offset cursor) vs direct PostgREST
  (`lib/dashboard/queries.ts`, keyset cursor). Cursor formats are
  incompatible. Feed changes usually must be made in BOTH files.
- **"Opening Now" default:** with no `?types=` and no `?all=1`,
  `(app)/page.tsx` injects `licenseTypes=['new_issuance','application']` +
  180-day window and uses the business-grain RPC. `filters` (defaults
  applied) vs `rawFilters` (verbatim URL) is intentional — display components
  get `rawFilters` so defaults don't show as chips.
- **Signal vocabulary is v2:** New / Established / Dormant (formerly
  hot/warm/cold). Badge color variants still use the old names.
- **`/signup` must stay `force-dynamic`** so `SIGNUP_OPEN` is read per
  request. `SIGNUP_FLOW_VERSION` picks legacy vs admin_link signup email flow.
- **`/admin` is not Supabase-authed** — it has its own JWT cookie from HQ
  SSO; middleware deliberately exempts it.
- **Don't re-add the `businesses` join** to the direct feed query — it was
  removed for an RLS performance timeout; use the denormalized
  `business_name`/`dba` columns.
- **PostgREST embedded relations** are sometimes arrays, sometimes objects —
  cron routes index `[0]`; be careful copying that pattern.
- **`suppressHydrationWarning` on `<html>`** is required (FOUC theme script,
  localStorage key `foretab-theme`).
- **Stripe API pinned to `2026-04-22.dahlia`:** `current_period_*` live on
  subscription items, `invoice.subscription` moved to
  `invoice.parent.subscription_details`. The handlers are correct; older
  Stripe example code is not.
- Engine-side quota: feed RPCs enforce 500 records/day → catch
  `QuotaExceededError` (`lib/rpc/errors.ts`) as the dashboard does.

## Environment variables (Vercel / .env.local)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`NEXT_PUBLIC_SITE_URL` (fallback only — origins are derived from request
headers), `SUPABASE_SERVICE_ROLE_KEY`, `SIGNUP_OPEN`, `SIGNUP_FLOW_VERSION`,
`USE_RPC_ENFORCEMENT`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_{SINGLE_STATE|MULTI_STATE|ALL_ACCESS}_{MONTHLY|ANNUAL}` (6,
read dynamically in `lib/stripe/prices.ts`), `CRON_SECRET`, `RESEND_API_KEY`,
`FORETAB_ADMIN_SESSION_SECRET`, `HQ_SSO_PUBLIC_KEY`.
`.env.example` is incomplete (GAPS.md #15).
