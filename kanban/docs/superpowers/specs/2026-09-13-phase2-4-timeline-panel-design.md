# Phase 2.4 — Portfolio Timeline Panel — Design

**Date:** 2026-09-13
**Status:** Approved for implementation

## Goal

Move the portfolio timeline panel markup from legacy DOM rendering to React
while preserving its collapsed and expanded states, historical preview flow,
slider behavior, event-list scrolling, and restore action.

## Decisions

| Concern | Decision |
|---|---|
| Rendering boundary | `PortfolioTimeline` renders through a portal into the existing `#portfolioTimelinePanel` container. The outer container remains in `index.html`; its children are React-owned. |
| Derived view state | Legacy continues to resolve the selected board, normalized timeline, selected event, and preview status. It publishes a display-ready `portfolioTimelineView` to `appState` during `renderPortfolio()`. |
| Timeline behavior | React calls timeline host actions for event selection, latest, expand/collapse, restore, and slider input. Legacy retains reconstruction, mutation validation, persistence, and modal-closing behavior. |
| Slider drag | React marks the existing legacy drag state on pointer-down and sends input values through the host. The document-level pointer-up/cancel commit remains in legacy so releasing outside the range input still commits reliably. |
| Scroll position | Legacy caches the current event-list scroll offset before a render. React restores the selected board's cached offset after the portal updates. |
| Styling | Reuse the existing `legacy.css` timeline classes and markup. No visual redesign or Tailwind pass. |

## React surface

`src/components/PortfolioTimeline.jsx` contains:

- `PortfolioTimeline`: subscribes to the bridge and portals into the existing
  timeline container.
- `PortfolioTimelineView`: renders the empty, collapsed, expanded, historical,
  summary, event-list, and event-detail states.

The component renders only display data. It does not reconstruct board state or
mutate timeline state directly; all state transitions use
`src/actions/legacyHost.js`.

## Legacy changes

- Add `portfolioTimelineView` state and populate it in `renderPortfolio()`.
- Delete the legacy timeline panel markup renderer and incremental DOM sync.
- Remove the timeline panel click/input/pointerdown listeners; retain the
  document-level pointer-up/cancel commit for range dragging.
- Register timeline host actions for React.
- Keep timeline reconstruction, restore persistence, and modal cleanup in
  legacy.

## Compatibility requirements

- Preserve `#portfolioTimelinePanel`, `data-board-id`, `timeline-panel` and all
  existing timeline classes and data attributes.
- Preserve empty-board messaging, collapsed state, latest/restore controls,
  historical preview banner, summary pills, event ordering, selected event
  detail, diff formatting, and read-only labeling.
- Preserve slider updates during continuous dragging and event-list scroll
  position when selecting another event.
- Preserve restore availability only for writable boards.

## Verification

- Capture expanded latest and historical preview screenshots against the legacy
  renderer before the port.
- Add a behavior assertion that reads the React-owned timeline markup and
  confirms its published view state follows selected events.
- Cover host action delegation in unit tests.
- Run `npm run test:unit`, `npm run build`, and the full Playwright suite.

## Out of scope

Board rendering, roadmap rendering, calendar rendering, timeline domain rules,
Zustand, dnd-kit, Tailwind, and visual changes to the timeline.
