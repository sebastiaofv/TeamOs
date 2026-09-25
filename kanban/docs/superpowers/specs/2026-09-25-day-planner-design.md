# Day Planner — design

Date: 2026-09-25
Status: approved design, pending spec review

## Goal

A fourth portfolio view, "Day Planner", next to Board, Roadmap and Calendar.
It lets the user plan a day (or a work week) by dragging tasks from any loaded
project onto a time grid and setting start/end times in 15-minute steps.
Plans are stored in each project's JSON file.

## Non-goals

- No free (non-task) blocks. Only tasks can be scheduled. A user who wants to
  block out lunch creates a task for it.
- Scheduling never changes a task's status or any other task field.
- No recurring blocks, reminders, or calendar sync.
- No weekend columns.

## View

- New `PortfolioViewMode` value `'planner'`, shown as the "Day Planner" tab.
  It is available whenever at least one project is loaded (same rule as
  calendar).
- Layout: task tray (left, ~280px) + time grid (right). On narrow screens the
  tray stacks above the grid.
- Header: `‹` `Today` `›`, date label, `Day | Week` toggle, and a summary
  "Xh Ym planned of 8h" with a progress bar (in Week mode: of 40h).
- Grid window: 07:00–21:00, 15-minute slots, hour labels on the left.
  Hours outside working hours 09:00–17:00 are shaded.
- A red "now" line when the visible range contains today; on open the grid
  scrolls so ~08:30 is at the top.
- Day mode: a single column for the selected date.
- Week mode: Monday–Friday columns for the week containing the selected date;
  today's header is highlighted.
- `‹`/`›` move by one day in Day mode and by one week in Week mode. `Today`
  sets the selected date to today and keeps the current mode.
- Selected date and mode are view state (Zustand), not persisted to project
  files.

## Interactions

- **Schedule:** drag a task card from the tray onto a slot. A drop preview
  (ghost) shows the target time. The new block starts at the snapped slot and
  lasts 1 hour, clamped so it ends by 21:00.
- **Move:** drag a block vertically to change its time; in Week mode also
  horizontally to another weekday. Duration is kept; snaps to 15 minutes;
  clamped to the 07:00–21:00 window.
- **Resize:** drag the top or bottom edge. Snaps to 15 minutes; minimum
  duration 15 minutes; clamped to the window.
- **Remove:** select a block (click) and press Delete/Backspace, or click the
  × shown on hover.
- **Open task:** double-click a block to open the existing task detail dialog.
- **Overlaps** are allowed and laid out side by side within the column
  (calendar-style column packing).
- The same task may appear in any number of blocks.
- Every add/move/resize/remove is undoable through the existing undo toast.
- Keyboard: blocks are focusable; Delete removes; arrow Up/Down moves by 15
  minutes; Shift+Up/Down resizes the end by 15 minutes.

## Tray

- Lists tasks from all loaded projects, grouped by project, with
  the project color on the card's left border, priority pill, task id and
  effort.
- Filters: the tray uses the existing toolbar filters and project chips
  (search, archive, blocked, assignee, priority, effort, selected project),
  i.e. it starts from `portfolioVisibleRows`, the same rows the board shows.
  On top of that the tray has its own status chips (default: To do + Doing;
  also Backlog, Done), kept as component state.
- When a project chip is selected, the grid also shows only that project's
  blocks; with "All" it shows blocks from every loaded project.
- A task that already has at least one block in the visible range is shown
  dimmed with "✓ planned" but can still be dragged again.

## Blocks

- Colored by project (existing `ProjectColor`).
- Show task title, `HH:MM–HH:MM`, duration and project name; blocks of 15
  minutes show only the title and start time.
- Blocks whose task is done are shown struck through; blocks whose task is
  archived are shown faded.

## Storage

Each project JSON gains `extensions.dayPlanner`:

```json
{
  "extensions": {
    "dayPlanner": {
      "version": 1,
      "blocks": [
        { "id": "blk-k3j9x2", "taskId": 14, "date": "2026-09-25", "start": "09:00", "end": "10:00" }
      ]
    }
  }
}
```

- A block lives in the file of the project that owns its task.
- `id`: unique string within the file.
- `date`: `YYYY-MM-DD` (local date). `start`/`end`: `HH:MM`, on the 15-minute
  grid, `07:00 <= start < end <= 21:00`.
- The extension is created on first block and removed when it becomes empty
  (same pattern as `roadmap`).
- Normalization on load (`normalizeDayPlannerExtension`) drops: malformed
  blocks, off-grid or out-of-window times, `end <= start`, duplicate ids, and
  blocks whose `taskId` no longer exists in the board. Wrong `version` or a
  non-object value removes the extension.
- Writes go through the existing save queue (`runPortfolioBoardMutation`),
  like roadmap edits.
- Planner edits are **not** recorded as timeline events. Board-level timeline
  events store a full board snapshot, and planning produces many small edits
  a day, which would bloat the project file. The timeline stays a history of
  task and roadmap changes. (Timeline replay ignores unknown kinds, so nothing
  depends on planner events.)

## Code layout

Following `ARCHITECTURE.md`:

- `src/domain/dayPlanner.ts` — types (`DayPlanBlock`, `DayPlannerExtension`),
  constants (window, working hours, slot size, default duration), time
  parse/format, snapping and clamping, normalization, week-date helpers
  (Mon–Fri of a date), overlap column layout.
- `src/domain/types.ts` / `constants.ts` / `serialize.ts` — register the
  `dayPlanner` extension key and normalize it with the other extensions.
- `src/features/portfolio/queries/portfolioPlannerViews.ts` — tray model
  (filtered, grouped tasks with planned flag) and grid model (per-day blocks
  with layout and totals).
- `src/features/portfolio/commands/` — `addPlannerBlock`, `movePlannerBlock`,
  `resizePlannerBlock`, `removePlannerBlock`, each writing to the owning
  project and pushing an undo entry.
- `src/features/portfolio/state/` — `plannerDate`, `plannerMode` view state
  and `'planner'` view mode.
- `src/features/portfolio/planner/` — `PortfolioPlanner.tsx`,
  `PlannerTray.tsx`, `PlannerGrid.tsx`, `PlannerBlock.tsx`, using `@dnd-kit`
  as the board does.
- `src/styles/portfolio/planner.css` (registered in `app.css`), light and
  dark theme via existing tokens.
- `src/shared/i18n.ts` — EN and PT strings.

## Testing

- Vitest (domain): time parse/format, snapping, clamping, 1-hour default
  clamped at 21:00, normalization rejects each invalid case, Mon–Fri week
  helper, overlap layout.
- Vitest (queries/commands): add/move/resize/remove update the right project
  and are undoable; blocks for missing tasks are dropped.
- Playwright: load a project, open Day Planner, drag a task into a slot,
  resize it, switch to Week and move it to another day, assert the saved
  JSON contains the expected block.
