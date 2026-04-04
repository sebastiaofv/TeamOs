# Calendar Density Design

Date: 2026-04-04

## Goal

Make the expanded month calendar denser so more roadmap items and tasks fit within each week row while keeping readability ahead of maximum compression.

- Apply the density pass to both roadmap items and task items.
- Increase the number of visible items in a day before overflow appears.
- Keep text legible and interactions unchanged.

## Non-Goals

- No changes to the year mini-month cards.
- No changes to heat-map logic or normalization.
- No changes to item colors, click behavior, or task-creation behavior.
- No aggressive typography shrinkage intended purely to maximize fit.

## Current Context

The month calendar currently uses relatively roomy day cells and item chips:

- `.portfolio-calendar-day-cell` uses a `130px` minimum height and `10px` padding.
- `.portfolio-calendar-week-roadmap` and `.portfolio-calendar-day-roadmap` use `8px` vertical spacing/padding.
- `.portfolio-calendar-item` and `.portfolio-calendar-roadmap-span` use `32px` minimum heights with `6px 8px` padding.
- Month view only renders up to `4` visible calendar items per day before showing overflow.

This keeps the calendar comfortable, but it limits how much roadmap and task information fits into a single month row.

## Proposed Approach

Apply a balanced density pass to the expanded month view only.

### Layout changes

- Reduce the month day-cell minimum height.
- Reduce day-cell internal padding.
- Reduce roadmap-lane padding and vertical gaps.
- Reduce the gap between roadmap and task stacks inside a day cell.

### Item changes

- Shrink roadmap spans and task chips together so they remain visually aligned.
- Reduce chip minimum height and padding.
- Keep labels single-line with truncation rather than allowing wrapped multi-line rows.
- Preserve current color usage and interaction states.

### Visibility change

- Increase the number of visible items in month view from `4` to `5`.
- Keep the overflow indicator for additional hidden items.

This gives the denser styling a visible payoff without pushing the layout into a cramped, low-legibility state.

## Rendering Notes

The behavior change is limited to the expanded month grid.

- Year view mini-month rendering should remain untouched.
- Roadmap spans and task chips should still share the same visual rhythm so mixed days remain scannable.
- Heat-map mode should inherit the denser layout automatically because the density change only affects spacing and sizing.

## Testing Plan

Extend the existing month calendar regression to prove:

1. The expanded month view renders with denser item metrics.
2. A crowded day can now show one additional visible item before overflow.
3. Task and roadmap item sizing remains aligned after compaction.
4. Aggregate calendar behavior and heat-map behavior remain unaffected.

Verification should use the focused calendar tests first, then the full suite after the density pass is complete.

## Risks

- Over-tightening spacing could make roadmap labels and task titles feel visually noisy.
- Raising the visible-item limit without enough density reduction could cause crowded cells to feel stacked and harder to scan.
- Month-only density changes could accidentally drift task and roadmap chip sizing apart if both styles are not updated together.

## Recommendation

Implement a moderate month-view density pass:

- denser rows
- slimmer chips
- one additional visible item

This is the smallest change that satisfies the request while preserving readability.
