# Phase 2.3 — Portfolio Board and Task Cards — Design

**Date:** 2026-09-13
**Status:** Approved for implementation

## Goal

Move the portfolio board grid, columns, add-task cards, and portfolio task-card
markup from legacy DOM rendering to React while preserving the existing ids,
classes, interaction behavior, and CSS.

## Decisions

| Concern | Decision |
|---|---|
| Rendering boundary | `PortfolioBoard` renders through a portal into the existing `#portfolioBoard` container. The container remains in `index.html`; its children are React-owned. |
| Derived rows | Legacy continues to apply filters, sorting, timeline projection, and row normalization. It stores the current visible rows in `appState.portfolioVisibleRows` for the React board. |
| Task actions | Existing delegated board click/change/pointer handlers remain in legacy for editing, archiving, deleting, selection, bulk checkboxes, and add-task cards. |
| Drag and drop | React attaches the existing native drag callbacks through `legacyHost.js`; legacy retains mutation validation, persistence, and rendering state transitions. |
| Styling | Reuse `legacy.css` markup and classes. No visual redesign or Tailwind pass. |
| Other views | Timeline, roadmap, and calendar remain legacy for this phase. The board island may render hidden board content while another view is active, matching the existing board container contract. |

## React surface

`src/components/PortfolioBoard.jsx` contains:

- `PortfolioBoard`: buckets visible rows into the canonical columns and renders
  the existing `#portfolio-<status>-column` containers.
- `PortfolioTaskCard`: renders project badges, metadata, selection checkbox,
  search highlights, and task action buttons with the legacy attributes.

The component subscribes to the version-tick bridge. It does not mutate
portfolio state directly; drag callbacks use host actions and click/change
events continue through the legacy board delegation.

## Legacy changes

- Add `portfolioVisibleRows` state and populate it during `renderPortfolio`.
- Delete the legacy board-grid renderer and direct card/column drag listener
  setup.
- Keep `createPortfolioTaskCard` only for roadmap task-list cards, where the
  roadmap view still owns rendering.
- Keep the board container's delegated click, change, and pointer handlers.
- Notify React after bulk checkbox state changes as in Phase 2.2.

## Compatibility requirements

- Preserve `.portfolio-board-grid`, `.portfolio-column`,
  `#portfolio-<status>-column`, `.add-task-card`, `.portfolio-task-card`, and
  all card data attributes.
- Preserve read-only and historical disabled actions, project badges, search
  highlighting, metadata order, selection checkboxes, and empty-column text.
- Preserve writable-board add-task cards and native HTML5 drag/drop behavior.
- Preserve filtered row ordering and card visibility in all-projects and selected
  project views.

## Verification

- Capture board/card screenshots against the current legacy renderer before the
  port.
- Keep existing browser behavior green and add a React-board synchronization
  assertion.
- Run `npm run test:unit`, `npm run build`, and the full Playwright suite.

## Out of scope

Timeline, roadmap, calendar, task mutation logic, dnd-kit, Zustand, Tailwind,
and task-card visual changes.
