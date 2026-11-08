# Keepsake

A personal inventory app for the kids' clothes and toys: what we have, what
fits, what's missing, and what can be handed down or sold. It's an installable,
offline-first web app (PWA) built for iPhone.

**Live app:** https://micausti.github.io/keepsake/

## Principles

- **On-device data.** Everything is stored in the browser (IndexedDB). There
  is no server. Cloud backup and sync may come later.
- **Bring your own key.** AI auto-fill calls the Anthropic API straight from
  the browser with an API key entered in Settings. The key is stored only on
  the device and never goes in this repo.
- **Strict CSP.** The production build ships a Content Security Policy that
  allows scripts, styles and assets from the app's own origin only. The only
  other origin it can connect to is `https://api.anthropic.com`. See
  [`build/csp.ts`](build/csp.ts).
- **Few dependencies.** Runtime dependencies are React, Dexie (IndexedDB) with
  its React hooks, and the official Anthropic SDK, which is loaded only when
  the AI is used. Versions are pinned exactly, and install scripts are
  disabled (see [`.npmrc`](.npmrc)).

## Code layout

| Path | What's there |
| ---- | ------------ |
| `src/domain/` | Item fields and option lists (categories, statuses, conditions, seasons, platforms), UK size scales, search and filters, gaps and hand-me-downs, money and date helpers |
| `src/db/` | Dexie database schema, children and settings storage, storage persistence |
| `src/ai/` | Anthropic client (browser, user's own key), item description prompt and output schema |
| `src/photos/` | Photo resizing, EXIF stripping, date-taken reader |
| `src/pages/` | Home, Items (browse), item page, edit, add update, Add item, Gaps and Settings screens |
| `src/ui/` | Hash router, tab bar, shared controls |
| `build/` | Build-time Content Security Policy |

Data model notes:

- Money is stored as whole pence.
- Option lists store stable ids (`hand_down`, `new_with_tags`, `2-3y`, `k6.5`);
  labels can be reworded freely.
- Conditions follow Vinted's scale, so listings need no translation later.
- The database schema is versioned in `src/db/db.ts`. Never edit a released
  version; add a new one with an upgrade function.

## Roadmap

| Phase | Scope |
| ----- | ----- |
| 0 | Repo scaffold, CI/CD, deploy a placeholder PWA ✓ |
| 1 | Data model, Dexie, settings (API key, children, UK sizes) ✓ |
| 2 | Snap → AI auto-fill → review → save ✓ |
| 3 | Browse/filter/search; item page with condition timeline and updates ✓ |
| **4** | Gaps view by child/size/category; hand-me-down action ← *you are here* |
| 5 | Sell mode: copy-ready listings (Vinted, eBay, Facebook Marketplace, Depop); share-sheet photos; track listed/sold |
| 6 | Export/restore backup file plus a weekly reminder; polish |

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev        # http://localhost:5173/keepsake/
npm run typecheck
npm run lint
npm test
npm run build && npm run verify && npm run preview
```

The CSP is added only to production builds, because Vite's dev server needs
inline scripts. Use `npm run build && npm run preview` to test under the real
policy.

Icons are generated from `public/favicon.svg` with
`NODE_PATH=$(npm root -g) node scripts/generate-icons.mjs` (needs Playwright).

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- **Pull requests:** runs a runtime-dependency audit, type-check, lint, tests
  and a production build. It then checks that the build has the CSP, no inline
  scripts, and the PWA files.
- **Push to `main`:** runs the same checks, then deploys `dist/` to GitHub Pages.

Actions are pinned to commit SHAs. Dependabot keeps them and npm packages
up to date.

### One-time repo settings

1. **Settings → Pages → Build and deployment → Source:** *GitHub Actions*.
2. **Settings → Branches → Add rule** (or a ruleset) for `main`:
   require a pull request before merging, require the **Check** status check
   to pass, and block force pushes and deletions.
3. **Settings → Code security:** enable Dependabot alerts/security updates
   and secret scanning with push protection.

## Photos and AI

- Each photo is resized on the phone and re-encoded, which removes all EXIF
  metadata including GPS location. Only the date taken is read first, for the
  timeline.
- Stored: a ~2000px JPEG and a ~400px thumbnail. Sent to Claude: a ~1000px
  copy, which is never stored.
- Claude returns structured fields (checked against a schema) and marks any it
  guessed, so the form can flag them for checking. Requests run at low effort
  to keep each item at roughly a penny. Nothing is saved until you tap Save.

## API key safety

The key is kept in this site's IndexedDB on the phone. Two things to know:

- Create a key just for Keepsake in the Claude Console and give it a monthly
  spend limit, so a leaked key can't cost much.
- Browsers separate stored data by *origin*, and every GitHub Pages site under
  `micausti.github.io` shares one. Don't host other people's code on
  `micausti.github.io/...`, since a page there could read Keepsake's data. A
  custom domain would remove this concern.

## Installing on iPhone

Open the live URL in Safari, tap **Share → Add to Home Screen**. The app then
opens full-screen and works offline. When a new version is deployed, a
"new version available" banner offers to reload.
