# Phase 2.5–2.8 — Remaining React Migration Plan

**Status:** Implemented on `codex/phase2-5-8`
**Parent:** `2026-09-13-phase2-foundation-react-bridge-design.md`

## Scope

Complete the remaining portfolio view ports, move browser integration into React
lifecycle hooks, replace the version-tick state source with four Zustand slices,
and establish the semantic Tailwind token layer without changing the existing
visual contract.

## Delivered slices

1. **2.5 Roadmap** — `PortfolioRoadmap.jsx` owns the shared axis, today marker,
   milestone/phase/sprint rows, disclosure state, and linked read-only task cards.
   The legacy click delegate remains only for mutation/detail actions.
2. **2.6 Calendar** — `PortfolioCalendar.jsx` owns year/month layouts, roadmap
   spans, due-date task buttons, overflow handling, and calendar/heatmap modes.
   The legacy delegate remains only for navigation, task detail, and create-task
   actions.
3. **2.7 Shell/state** — `useTheme` and `usePortfolioFileIntegration` own theme,
   picker/drop, focus/visibility, and watcher lifecycles. `state/slices.js`
   provides `portfolio`, `board`, `ui`, and `files` slices combined by Zustand.
   A temporary top-level proxy keeps in-place persistence mutations safe while
   the remaining mutation runtime is extracted.
4. **2.8 Tailwind** — `styles/tailwind.css` is the build entry for Tailwind;
   semantic colors resolve to the existing theme variables and migrated surfaces
   use the aliases alongside the established bespoke layout CSS. Preflight stays
   disabled so parity is preserved.

## Verification

- `npm run test:unit` — 869 passing tests.
- `npm run build` — production bundle succeeds.
- `npm test` — 132 black-box tests and 37 visual tests pass.
- New visual coverage protects roadmap light/dark, calendar year light/dark, and
  calendar month heatmap light states.
