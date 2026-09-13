# Phase 2.4 — Portfolio Timeline Panel Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-4-timeline-panel-design.md`

## Objective

Port the portfolio timeline panel to React with exact legacy markup and
behavior, leaving timeline reconstruction, restore persistence, and modal
cleanup in legacy behind host actions.

## Work sequence

1. Add legacy timeline visual baselines and React-owned behavior coverage.
2. Publish display-ready timeline view state and add host action seams.
3. Create and mount `PortfolioTimeline` through the existing panel container.
4. Delete the replaced legacy timeline renderer and panel listeners.
5. Run unit, build, visual, and full browser verification.
6. Update README and record deviations.

## Files

| File | Change |
|---|---|
| `src/state/store.js` | Add `portfolioTimelineView`. |
| `src/actions/legacyHost.js` | Add timeline selection, expansion, latest, restore, and slider host actions. |
| `src/components/PortfolioTimeline.jsx` | Create the React timeline panel. |
| `src/components/AppIslands.jsx` | Mount the timeline island. |
| `src/legacy/main.js` | Publish the timeline view model, remove the legacy panel renderer/listeners, and register host actions. |
| `tests/app.test.js` | Add React timeline synchronization coverage. |
| `tests/visual.test.js` | Add legacy timeline baselines. |
| `tests/unit/legacyHost.test.js` | Cover timeline host actions. |
| `README.md` | Document the Phase 2.4 port. |

## Acceptance criteria

- Timeline panel markup is rendered only by React after mount.
- Existing ids, classes, data attributes, labels, and visual states remain
  intact.
- Event selection, expansion, latest, continuous slider dragging, scrolling,
  historical preview, and restore behavior remain intact.
- `npm run test:unit`, `npm run build`, and the full Playwright suite pass.

## Deviations

- None.
