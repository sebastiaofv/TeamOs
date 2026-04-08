# Calendar Day Item Cap Design

Date: 2026-04-08

## Goal

Reduce the number of visible items shown in each month-calendar day cell to a maximum of `4`, counting roadmap items and tasks together.

## Non-Goals

- No changes to year view.
- No changes to item ordering rules.
- No changes to calendar density, colors, or interactions.
- No separate cap for roadmap items versus task items.

## Current Context

The expanded month calendar currently renders up to `5` visible items per day cell before showing the existing `+N more` overflow indicator.

This means a crowded day may show five mixed roadmap/task entries directly in the cell.

## Proposed Approach

Apply a single behavior change in `renderPortfolioCalendarMonthView()`:

- change the visible item slice from `5` to `4`
- keep roadmap items and task items sharing the same combined cap
- leave sorting and rendering structure unchanged
- continue using the existing overflow indicator for hidden items

## Testing Plan

Update the existing month-calendar regression to prove:

1. A populated day now shows only `4` visible items total.
2. The overflow indicator increases accordingly.
3. Item ordering remains unchanged after the cap reduction.

Verification should use the focused calendar regressions.

## Risks

- Days with multiple roadmap entries will show fewer direct task chips before overflow.
- If tests only assert overflow text, ordering regressions could slip in unnoticed.

## Recommendation

Use a strict total-per-day cap of `4` in month view. It matches the request exactly and is the smallest possible behavioral change.
