# foretab-app

Foretab customer dashboard at app.foretab.com. Next.js 15 + Tailwind v4 + shadcn/ui + Supabase.

## Phase 2 status

This repository implements Phase 2 of Foretab — the customer-facing build. The dispatch lives at `../foretab-engine/docs/` in the Slate Holdings org (see `phase-2-dispatch.md` and the `code-agent-b-*` addenda).

| Task | Status |
|---|---|
| 9 — Customer schema additions | Done (in foretab-engine) |
| 10 — Stripe integration | Deferred (waits on Cowork's Stripe setup) |
| 11 — Customer authentication | **In progress (this repo's initial scaffold)** |
| 12 — Customer dashboard scaffold | Next |
| 13 — Trial flow | Next |
| 14 — Customer-facing RLS on Phase 1 tables | Deferred (waits on Phase 1 done-criteria) |
| 15 — Data freshness indicators | Next |
| 16 — Saved filter views | Next |
| 17 — CSV export with audit logging | Deferred (waits on Task 14) |
| 18 — Account management | Deferred (waits on Task 10) |

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions)
- **React 19**
- **Tailwind v4** (CSS-only `@theme` config in `src/app/globals.css`)
- **shadcn/ui** (hand-written primitives in `src/components/ui/`)
- **Supabase JS** (via `@supabase/ssr` for cookie-based auth)
- **Biome** (lint + format, consistent with the marketing site)
- **TypeScript 5**

## Local development

```bash
# Install deps (pnpm preferred per Phase 2 dispatch §19; npm works equivalently)
npm install

# Copy env example, fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
cp .env.example .env.local

# Start dev server
npm run dev
```

App runs at http://localhost:3000.

## Environment

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.example` (committed) | Set to the foretab Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` (gitignored) | Public anon key — safe to ship to browser, gated by RLS |
| `NEXT_PUBLIC_SITE_URL` | `.env.local` per env | Drives OAuth redirects + email link domains |

No service-role key in this app — customer-facing access only, all RLS-enforced.

## Architecture

### Auth surfaces

| Route | Purpose |
|---|---|
| `/signup` | Email/password + Google OAuth signup |
| `/login` | Email/password + Google OAuth signin |
| `/verify-email` | Post-signup "check your inbox" screen + resend button |
| `/reset-password` | Request password reset email |
| `/reset-password/confirm` | Set new password from email link |
| `/state-selection` | Post-verification trial state picker (creates `trials`, `customer_states`, default `customer_saved_filters`) |
| `/auth/callback` | OAuth + email-link return handler (exchanges code for session) |

### Supabase clients

- `src/lib/supabase/server.ts` — Server Components / Server Actions / Route Handlers
- `src/lib/supabase/client.ts` — Client Components
- `src/lib/supabase/middleware.ts` — middleware (token refresh + route gating)

All three use the **anon** key + the user's JWT. The middleware enforces auth gating: unauthenticated users hitting protected routes get redirected to `/login` with a `?next=` param.

### Customer provisioning lifecycle

1. User signs up (email/password OR Google).
2. For email/password: Supabase sends verification email. For Google: email is pre-verified.
3. User clicks verification link or completes Google OAuth → returns to `/auth/callback`.
4. Callback exchanges code for session. **Postgres trigger** `on_auth_user_email_confirmed` (Phase 2 Task 11 migration 011) fires and creates the `public.customers` row.
5. User lands at `/state-selection`. Picks a state.
6. Server action `selectTrialState` creates `trials` + `customer_states` + 3 default `customer_saved_filters`.
7. User redirects to `/` → dashboard (Task 12 scaffold; pending).

### Configurable surfaces (per the configurable-not-hardcoded principle)

- Password rules, session TTL, token expiry, rate limits → Supabase Auth Dashboard
- Sellable states → `public.states_active_for_sale` view (Phase 2 Task 9 migration 009)
- Trial length (7 days) → constant in `src/lib/actions/trial.ts`; flagged with TODO for future config-table extraction

## Deploy

Vercel. Project to be linked to this repo (Britt's hookup). Production: `app.foretab.com`.

Build command: `npm run build`. Node version: 20+.

## Coordination

This repo is owned by Code Agent B. Code Agent A owns `foretab-engine` (Phase 1). Cross-repo coordination notes live in the foretab-engine docs.

## License

MIT
