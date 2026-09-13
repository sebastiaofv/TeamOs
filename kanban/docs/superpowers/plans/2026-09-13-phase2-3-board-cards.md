# Phase 2.3 — Portfolio Board and Task Cards Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-3-board-cards-design.md`

## Objective

Port the portfolio board grid and task cards to React with exact legacy markup
and behavior, leaving filtering, task mutations, timeline/roadmap/calendar
rendering, and board event delegation in legacy behind the existing seams.

## Work sequence

1. Add the legacy board/card visual baselines and behavior coverage.
2. Add `portfolioVisibleRows` state and native drag host actions.
3. Create and mount `PortfolioBoard` through the existing board container.
4. Delete the replaced legacy grid renderer and direct card/column listeners.
5. Run unit, build, visual, and full browser verification.
6. Update README and record deviations.

## Files

| File | Change |
|---|---|
| `src/state/store.js` | Add `portfolioVisibleRows`. |
| `src/actions/legacyHost.js` | Add native board drag host actions. |
| `src/components/PortfolioBoard.jsx` | Create React board and task-card markup. |
| `src/components/AppIslands.jsx` | Mount the board island. |
| `src/legacy/main.js` | Publish visible rows, remove legacy board renderer/listeners, and register drag hosts. |
| `tests/app.test.js` | Add React board synchronization coverage. |
| `tests/visual.test.js` | Add legacy board/card baselines. |
| `tests/unit/legacyHost.test.js` | Cover native drag host actions. |
| `README.md` | Document the Phase 2.3 port. |

## Acceptance criteria

- Board columns and task cards are rendered only by React after mount.
- Existing ids/classes, filters, card metadata, disabled states, selection, and
  add-task behavior remain intact.
- Native drag/drop still updates task status and autosaves writable projects.
- Task action buttons and bulk selection still use legacy behavior.
- `npm run test:unit`, `npm run build`, and the full Playwright suite pass.

## Deviations

- None.
