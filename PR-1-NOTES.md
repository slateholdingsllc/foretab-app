# PR 1 · Foundation — tokens, fonts, brand mark, theme toggle

**Branch:** `design/aesthetic-refresh-2026-05`
**Scope:** Design tokens (dark + light), Geist + Geist Mono via `next/font/google`, FOUC-safe theme initialization, and two new primitives (`BrandMark`, `ThemeToggle`). Zero changes to existing components.

---

## Files in this PR

| File | Status | Notes |
|---|---|---|
| `src/app/globals.css` | **rewritten** | Both themes. Dark in `@theme`; light overrides via `[data-theme="light"]`. shadcn semantic aliases (`--color-card`, `--color-primary`, `--color-muted`, etc.) preserved so every existing component re-skins automatically. |
| `src/app/layout.tsx` | **modified** | Adds Geist + Geist_Mono via `next/font/google`. Adds FOUC-safe theme init script. `suppressHydrationWarning` on `<html>`. |
| `src/components/ui/brand-mark.tsx` | **new** | Inline SVG. Body via `currentColor`, accent band via `var(--color-accent)`. Caller controls size via Tailwind. |
| `src/components/ui/theme-toggle.tsx` | **new** | Three-state segmented control: Light · Dark · System. Persists to `localStorage["foretab-theme"]`. Live-reacts to OS theme changes when in System mode. |

---

## What this PR does NOT touch (verifies dispatch's NO list)

- No changes to existing `src/components/ui/*` primitives (`button`, `badge`, `card`, `input`, `label`, `alert`) — those are **PR 2**.
- No changes to `src/components/dashboard/*` — those are **PR 3**.
- No changes to `src/app/(admin)/*` — Code Agent B's territory.
- No changes to routes, data fetching, server actions, Supabase queries, auth flows, or any new dependencies.
- `package.json` unchanged. (`next/font/google` is already available in Next 15; `lucide-react` is already installed.)

---

## Visual effect of PR 1 alone

Once this lands, every existing surface in the app will re-skin automatically because the shadcn semantic aliases in `globals.css` now point to the new dark tokens:

- Background flips from `#FFFFFF` to `#0A0E1A` (brand-matching).
- All text flips to `#F2F4F7` (or muted variants).
- Buttons get the new accent (`#2A7BFF`) with the proper hue-shift hover.
- Cards get the new surface color, border, and radius.
- Geist replaces the system fallback stack everywhere.

The app will look **markedly more brand-aligned** even before PR 2 refines the primitives. PR 2 fixes the remaining template-y details (hover states, badge variants, alert hierarchy). PR 3 then polishes the dashboard surfaces specifically.

The `BrandMark` and `ThemeToggle` components are written but not yet placed — PR 3 wires them into `dashboard/top-bar.tsx` and `auth/*-form.tsx`. If you want a quick visual smoke test post-deploy, you can manually drop `<ThemeToggle />` into any page to verify the segmented control renders correctly.

---

## Deferred to PR 2 (per the review revision)

**Card section-heading contrast rule.** In `card.tsx`, the `<CardTitle>` slot will use `text-foreground` (primary contrast), NOT `text-muted-foreground` or `text-foreground-subtle`. Card titles are primary-contrast text; meta and eyebrow labels stay muted. Encoded in PR 2 so PR 3 inherits the correction automatically.

---

## Validation steps (after Britt cherry-picks the branch)

1. **Type check.** `npm run typecheck` — should be clean. The only new types are SVG attribute props (`BrandMark`) and the local `Theme` union (`ThemeToggle`).
2. **Build.** `npm run build` — should be clean.
3. **Boot dev server.** `npm run dev`. Visit `/login`.
   - Background is `#0A0E1A` (dark, brand-matching), not `#FFFFFF`.
   - Text renders in Geist (not system-fallback Helvetica/SF).
   - No flash on cold load (FOUC script working).
4. **Toggle test (manual).** In DevTools console:
   ```js
   document.documentElement.dataset.theme = 'light';
   ```
   Page should swap to light surface (`#F6F7F9`) instantly. Then:
   ```js
   document.documentElement.dataset.theme = 'dark';
   ```
   Back to dark.
5. **localStorage persistence test.** Set `localStorage.setItem('foretab-theme', 'light')`, hard-refresh — page should boot in light mode without a flash.

---

## Coordination

- **Code Agent B / Task 22** — confirmed HQ-Slate-only by Britt; zero conflict surface.
- **Independent deployment.** This PR doesn't depend on Code Agent B's work landing first. The app continues to function with new tokens.
- **No data migrations.** Pure visual layer.

---

## After this lands

Britt does a fresh visual walkthrough of `app.foretab.com` — signup, dashboard, account. Existing components should look "darker and Geist-er" but otherwise mostly the same shape. **PR 2 fixes the remaining template-quality details** (hover states using hue-shift not opacity, badge semantic vocabulary, alert hierarchy, card-title contrast rule). **PR 3 polishes the dashboard surfaces.**
