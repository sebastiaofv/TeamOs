# Phase 2.2 — Toolbar and Project Chips Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-2-toolbar-chips-design.md`

## Objective

Port the portfolio toolbar, project chips, view-mode toggle, and bulk-action
bar to React with exact legacy markup and behavior, leaving board/view
rendering and mutations in legacy behind host actions.

## Work sequence

1. Add `portfolioFilters` state and host action seams.
2. Add legacy baselines and behavior coverage for the controls.
3. Capture the legacy control baselines.
4. Create and mount `PortfolioControls`.
5. Move legacy URL/filter reads and delete replaced DOM render/listener code.
6. Run unit, build, visual, and full browser verification.
7. Update README and record deviations.

## Files

| File | Change |
|---|---|
| `src/state/store.js` | Add `portfolioFilters`. |
| `src/actions/legacyHost.js` | Add toolbar, chip, and bulk host actions. |
| `src/components/PortfolioControls.jsx` | Create the React controls and portals. |
| `src/components/AppIslands.jsx` | Mount the controls island. |
| `src/legacy/main.js` | Move filter state reads/writes, add host implementations, delete replaced render/listener code, and notify status changes. |
| `index.html` | Keep the outer control containers but remove their static children. |
| `tests/app.test.js` | Add 2.2 behavior coverage. |
| `tests/visual.test.js` | Add legacy control baselines. |
| `tests/unit/legacyHost.test.js` | Cover new host actions. |
| `README.md` | Document the Phase 2.2 port. |

## Acceptance criteria

- Toolbar, chips, and bulk bar are rendered only by React after mount.
- Existing ids/classes and all current control behavior remain intact.
- URL filter/sort/view state survives reload and filter reset behavior is unchanged.
- Save-state and retry labels update after persistence status changes.
- Bulk selection updates the React bulk-action bar while board cards remain legacy.
- `npm run test:unit`, `npm run build`, and the full Playwright suite pass.

## Deviations

- None.
