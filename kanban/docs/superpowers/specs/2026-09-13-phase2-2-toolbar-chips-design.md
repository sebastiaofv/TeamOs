# Phase 2.2 — Toolbar and Project Chips — Design

**Date:** 2026-09-13
**Status:** Approved for implementation

## Goal

Move the portfolio toolbar, project chips, save-state indicators, view-mode
toggle, and bulk-action bar from legacy DOM rendering to React while keeping
the existing ids, classes, behavior, and CSS unchanged.

## Decisions

| Concern | Decision |
|---|---|
| Rendering boundary | `PortfolioControls` renders through portals into the existing `#portfolioToolbar`, `#portfolioBoardsChips`, and `#portfolioBulkActions` containers. The containers remain in `index.html`; their children are React-owned. |
| State ownership | Filter values move from DOM fields into `appState.portfolioFilters`. Existing sort, selected-board, view-mode, bulk-selection, and save-state values remain in `appState`. |
| Legacy seam | React sends user actions to legacy through `legacyHost.js`. Legacy remains responsible for filtering, sorting, selection transitions, persistence, project removal, and bulk sprint workflows. |
| Save-state display | React reads the existing persistence state and derives the chip label exactly as legacy did. Persistence status notifications notify the React bridge instead of calling a legacy renderer. |
| Styling | Reuse `legacy.css` markup and classes. No Tailwind or visual redesign. |
| URL state | Legacy still owns URL serialization and initialization, but reads/writes `appState.portfolioFilters`; this allows the React controls to mount after legacy boot without a DOM handoff. |

## React surface

`src/components/PortfolioControls.jsx` contains three small views:

- `PortfolioToolbar`: search, archive/blocked/assignee/priority/effort filters,
  sort, view-mode buttons, and reset.
- `PortfolioChips`: All/project chips, read-only labels, save-state labels,
  retry, and remove actions.
- `PortfolioBulkActions`: selected-task count, clear, create-sprint, and
  assign-existing-sprint actions.

The component subscribes to the version-tick bridge. It does not mutate
portfolio state directly; callbacks use host actions.

## Legacy changes

- Add normalized filter state and host actions for toolbar/chip/bulk events.
- Make URL parsing, URL serialization, row filtering, search highlighting, and
  reset behavior read the filter state instead of querying toolbar DOM nodes.
- Remove legacy toolbar/chip/bulk renderers and their event listeners.
- Keep board/card/timeline/roadmap/calendar rendering in legacy for 2.2.
- Notify the bridge when persistence save/watch status changes so chips update.

## Compatibility requirements

- Preserve every toolbar/chip/bulk id and class.
- Keep the existing empty state, read-only label, retry button, save-state
  titles, filter options, sort mapping, URL parameters, and keyboard shortcuts.
- Keep bulk selection checkboxes in the legacy board view; their changes notify
  React so the bulk bar updates.
- Keep view-mode availability rules: Board and Calendar require loaded boards;
  Roadmap additionally requires a selected board.

## Verification

- Capture toolbar/chip/bulk screenshots against the legacy DOM before the port.
- Keep existing browser tests green and add React-owned behavior assertions for
  filter state, URL state, project chips, save retry, view modes, and bulk bar.
- Run `npm run test:unit`, `npm run build`, and the full Playwright suite.

## Out of scope

Timeline, board/card rendering, roadmap rendering, calendar rendering, Zustand,
dnd-kit, Tailwind, and the known chip “Unsaved”/“Saving” display quirk.
