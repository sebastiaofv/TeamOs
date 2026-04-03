# Calendar Heat Map Design

Date: 2026-04-03

## Goal

Add a heat-map mode to the calendar view so task load can be scanned quickly.

- The toggle lives beside the calendar period label.
- The feature uses tasks only.
- In year view, mini day cells inside month cards show heat.
- In month view, full day cells show heat.
- Year-view colors are normalized across all days in the selected year.
- Month-view colors are normalized within the selected month only.
- Zero-task periods trend green, heavier load trends toward red.

## Non-Goals

- No roadmap-based heat coloring.
- No separate heat-map screen or duplicate calendar renderer.
- No change to drill-down behavior between year and month views.
- No change to task creation or task detail behavior.

## Current Context

The calendar already supports two structural views:

- `year`: twelve month cards with mini day grids.
- `month`: one expanded month grid with roadmap spans and task items.

The calendar header already owns:

- period display
- previous/next navigation
- year/month drill-down controls

The rendering pipeline already separates:

- year rendering via `renderPortfolioCalendarYearView`
- month rendering via `renderPortfolioCalendarMonthView`
- calendar state via `portfolioCalendarView`, `portfolioCalendarYear`, and `portfolioCalendarMonth`

This makes the safest extension a visual-mode toggle layered on top of the existing year/month structure.

## Proposed Approach

Add a second calendar mode axis:

- structural mode: `year` or `month`
- visual mode: `calendar` or `heatmap`

The existing calendar layouts remain the source of truth. Heat map mode changes styling and data decoration only.

### Why this approach

- Preserves existing calendar navigation and drill-down behavior.
- Avoids duplicating markup for a separate heat-map screen.
- Keeps the feature easy to test because the same DOM structure remains in use.
- Minimizes risk to roadmap rendering and task interactions.

## State Model

Add a new in-memory state value for the calendar visual mode.

Suggested shape:

- `portfolioCalendarDisplayMode = 'calendar' | 'heatmap'`

Behavior:

- default to `calendar`
- switching between year and month preserves the display mode
- switching between calendar and heatmap preserves the current year/month selection

Persistence is not required in this iteration unless the team later decides calendar display mode should be reflected in the URL.

## Data Model

The heat map is based on task counts by ISO day.

### Shared helpers

Add helpers to:

1. collect task counts per ISO day from calendar items
2. compute normalization ranges
3. map counts to colors

Suggested helper responsibilities:

- `getPortfolioCalendarTaskCountsByDay(items)`
  - returns a `Map<isoDate, count>`
  - counts only items where `kind === 'task'`

- `getPortfolioCalendarYearHeatStats(taskCounts, year)`
  - evaluates all days in the selected year
  - returns min/max or equivalent scaling data

- `getPortfolioCalendarMonthHeatStats(taskCounts, year, month)`
  - evaluates only days in the selected month
  - returns month-local scaling data

- `getPortfolioCalendarHeatColor(count, stats)`
  - maps zero to green
  - maps maximum load to red
  - interpolates intermediate values through yellow/amber

### Year view normalization

For year view, normalization is based on all days in the selected year, not per month.

Implication:

- a day with 3 tasks in March and a day with 3 tasks in September share the same intensity
- monthly comparisons are visually meaningful across the full year

### Month view normalization

For month view, normalization is based only on days in the selected month.

Implication:

- the month view emphasizes local peaks inside the selected month
- a moderate day in a quiet month still reads as relatively busy

## Rendering Changes

### Header

Extend the calendar header controls with a button beside `.portfolio-calendar-period`.

Suggested labels:

- `Heat Map` when currently in normal calendar mode
- `Calendar` when currently in heat-map mode

This button should only switch visual mode and must not alter:

- selected year
- selected month
- year/month structural mode

### Year View

Reuse the existing month-card structure.

In heat-map mode:

- do not color the month card container
- color only `.portfolio-calendar-mini-day-current`
- leave outside-month mini cells muted
- keep existing mini markers visible if they remain legible on top of the heat background

The month card remains clickable and still opens the month drill-down.

### Month View

Reuse the existing month grid.

In heat-map mode:

- color `.portfolio-calendar-day-cell-current`
- keep outside-month filler cells visually muted and excluded from month normalization
- keep task and roadmap content visible on top of the colored cell

Roadmap spans should retain their current colors because the heat map is task-load based.

## Styling

Add heat-map-specific classes or data attributes instead of replacing base calendar classes.

Suggested direction:

- year view mini cells:
  - add a modifier/class for heat-map mode
- month view day cells:
  - add a modifier/class for heat-map mode

Styling goals:

- maintain text readability
- avoid fully saturated fills
- preserve today indicators and borders
- avoid making outside-month cells look active

## Interaction Rules

- `Heat Map` toggle works in both year and month views.
- Clicking a month card in year heat-map mode opens month heat-map mode.
- `Back to year` preserves heat-map mode.
- `Prev`/`Next` year navigation preserves heat-map mode.
- `Prev`/`Next` month navigation preserves heat-map mode.
- Task clicks and create-task interactions behave exactly as they do today.

## Error Handling and Edge Cases

- If a year has no tasks, all current-year mini day cells should render at the zero-load green state rather than erroring or falling back to red.
- If a month has no tasks, all current-month day cells should render at the zero-load green state.
- Outside-month cells must not distort normalization for month view.
- Historical preview should continue to reflect projected task data if the calendar is being viewed while a historical timeline selection is active.
- Aggregate portfolio view should count tasks across all visible boards because the user asked for load management across calendar tasks.

## Testing Plan

Add focused Playwright coverage for:

1. Header toggle renders beside the period label and flips visual mode.
2. Year view heat map colors mini day cells, not the month card container.
3. Year view normalization compares days across the full selected year.
4. Month drill-down preserves heat-map mode when opened from year view.
5. Month view colors current-month day cells.
6. Month view normalization is local to the selected month.
7. Zero-task periods render the low-load green state.
8. Existing month navigation and task interactions continue to work in heat-map mode.

## Risks

- Mini markers and text contrast may become harder to read on warmer heat colors.
- Shared rendering paths increase the chance of accidental regressions in normal calendar mode if the heat-map branches are not isolated cleanly.
- Month-local normalization can produce colors that differ from year view for the same absolute task count; this is intentional but should be documented in code comments if the helper names are not obvious.

## Recommendation

Implement heat map as a visual mode layered onto the existing calendar renderer.

This gives:

- minimal UI disruption
- predictable navigation
- strong reuse of current markup
- low regression risk compared with building a parallel screen
