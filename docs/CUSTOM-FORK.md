# Custom fork — overview & customization map

> This is **Agellar's fork** of `BEDOLAGA-DEV/bedolaga-cabinet`. It keeps the original
> functionality and API contract, and layers an **"aurora glass"** visual redesign on top.
> Server/credentials/deployment-specific notes are kept in a **separate private handoff doc**
> (not committed here, since this repo is public).

## Branch / remote model
```
origin   = Agellar/bedolaga-cabinet        (this fork; work on branch `custom`)
upstream = BEDOLAGA-DEV/bedolaga-cabinet    (original author, for updates)
```
Pull upstream updates: see [`UPDATE-GUIDE.md`](./UPDATE-GUIDE.md).

## Design system (how customizations are isolated)
Customizations are deliberately **isolated** to minimize merge conflicts with upstream:

- **`src/styles/aurora.css`** (NEW file) — all bespoke visuals. Unlayered rules (outside Tailwind's
  `@layer`) so a single class reliably overrides utility classes without `!important`:
  - `.glass-card` — frosted translucent surface.
  - `.aurora-hero` — accent-tinted glass hero (balance/connection/referral cards).
  - `.accent-ring` — animated rotating accent outline (mask-`::before` ring; edge-only, no bleed).
  - global aurora background on `body::before`; glass treatment for shared `.bento-card`.
  - Imported once in `src/main.tsx`.
- **`src/utils/glassTheme.ts`** — `getGlassColors()` feeds bg/border/shadow for all Subscription &
  Dashboard cards (one edit restyles the whole area). Accent wash is driven by `--color-accent-*`.
- **`src/types/theme.ts`** — `DEFAULT_THEME_COLORS` = brand palette (teal accent on navy).
  NOTE: the live accent/colors are also stored in the DB (admin Theme editor) and **override** these
  code defaults — so the design adapts to whatever accent the operator sets.
- Targeted edits in pages/components: `pages/{Balance,Referral,Subscription,Dashboard,TopUpMethodSelect,
  TopUpResult,SavedCards}.tsx`, `components/dashboard/SubscriptionCardActive.tsx`,
  `components/subscription/PurchaseCTAButton.tsx`, `components/news/NewsSection.tsx` (`compact` prop),
  `components/layout/AppShell/{AppHeader,MobileBottomNav}.tsx`.

## What changed (high level)
- **Balance / Referral / Subscription / Dashboard** restyled to aurora glass.
- Referral page: links to top (bot link + referral code shown separately), combined stats card.
- Subscription page streamlined into an action list: renew CTA → connection-link card (with QR) →
  My Devices → additional options → reissue. The big tariff card was removed (it lives on the Dashboard).
- Dashboard: quick-actions row (glass tiles), referral teaser, compact news digest, "∞ Безлимит" badge
  when traffic is unlimited.
- Primary CTAs (Top up / Renew / Connect) share the `.accent-ring` animated outline.
- Bottom-nav "Subscription" tab relabelled **"Devices"** (`nav.devices`, all locales: ru/en/zh/fa).

## Important: nginx caching (`nginx.conf`)
`index.html` is served `Cache-Control: no-store, no-cache, must-revalidate` so new builds reach clients
**including the Telegram Mini App WebView** (which caches per-URL very aggressively). Hashed JS/CSS keep a
1-year cache (safe — the content hash changes each build). Without this, the mini app keeps serving a stale
cached `index.html` that points at old asset hashes.

## No-code settings (DB-backed, survive code updates)
Stored in the backend's `system_settings` table — not in code, so they persist across updates:
- Theme colors — key `CABINET_THEME_COLORS` (admin → Theme).
- Bot main-menu (buttons, per-language labels, order, emoji, enable/disable, custom URL buttons) —
  keys `CABINET_MENU_LAYOUT` + `CABINET_BUTTON_STYLES` (admin → menu constructor).

Prefer configuring brand/menu via the admin UI rather than code — then it's update-proof.

## Validate before deploy
```
npm install
npm run build      # tsc + vite — catches dead imports / type errors across the project
npx eslint src     # expect 0 errors
```
