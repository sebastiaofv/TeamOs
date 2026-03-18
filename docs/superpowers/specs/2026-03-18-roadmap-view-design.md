# Roadmap View Design

## Summary

Add a roadmap view to the existing portfolio-selected project experience in the Kanban app. When a project board is selected from portfolio chips, the right side of the portfolio toolbar should expose a `Board | Roadmap` view toggle. The existing board view remains the default. The new roadmap view renders project planning items across a date axis with three sections in this order:

1. `Milestones`
2. `Phases`
3. `Sprints`

Tasks remain the operational source of truth. A task can belong to at most one phase, one milestone, and one sprint. Phase and milestone assignment happens inside the existing task modal via selectors. Sprint assignment happens through a bulk selection workflow on the board view, where multiple checked tasks can be grouped into a newly created sprint with start and end dates.

Only tasks already assigned to a roadmap item appear in the roadmap. Unassigned tasks remain visible only in board view.

## Goals

- Preserve the current board-centric workflow.
- Add project planning without introducing a second app model.
- Keep all roadmap data inside the existing board file.
- Support lightweight planning for milestones, phases, and sprints.
- Let users inspect which tasks belong to each roadmap item.

## Non-Goals

- Cross-project roadmap entities owned by portfolio ships.
- Drag-resize or drag-drop scheduling on the roadmap timeline.
- Multiple phases, milestones, or sprints per task.
- Automatic date derivation from due dates.
- Showing unassigned tasks in the roadmap view.

## Existing Context

The app is a plain HTML, CSS, and JavaScript single-file application in `kanban/kanban.html`. The selected project experience already exists inside portfolio mode:

- `kanban/kanban.html` has a portfolio toolbar, project chips, a selected-project timeline panel, and a board grid.
- Tasks already flow through normalization, validation, rendering, and modal editing in a single state pipeline.
- Board files already support extension data via `extensions`.

The roadmap feature should extend this architecture rather than create a parallel frontend or persistence model.

## Proposed Architecture

### Ownership

Each board owns its own roadmap configuration and roadmap entities. Portfolio mode simply exposes either the selected board's standard Kanban columns or the selected board's roadmap timeline.

### Source of truth

- `board.tasks[]` remains the source of truth for task assignment.
- `extensions.roadmap` stores roadmap entities and view metadata.
- The current selected portfolio board record remains the active context for both board and roadmap rendering.

### View switching

When `selectedPortfolioBoardId` is set, the right side of the portfolio toolbar should show a compact toggle:

- `Board`
- `Roadmap`

If no board is selected, the toggle is hidden. The current behavior remains unchanged unless a board is focused.

## Data Model

### Board extension

Add a new roadmap extension block:

```json
{
  "extensions": {
    "roadmap": {
      "version": 1,
      "milestones": [],
      "phases": [],
      "sprints": []
    }
  }
}
```

### Roadmap item shapes

Milestones:

```json
{
  "id": "milestone_123",
  "title": "Alpha release",
  "dueDate": "2026-04-15",
  "createdAt": "2026-03-18T10:00:00.000Z",
  "updatedAt": "2026-03-18T10:00:00.000Z"
}
```

Phases:

```json
{
  "id": "phase_123",
  "title": "Foundation",
  "startDate": "2026-04-01",
  "endDate": "2026-04-30",
  "createdAt": "2026-03-18T10:00:00.000Z",
  "updatedAt": "2026-03-18T10:00:00.000Z"
}
```

Sprints:

```json
{
  "id": "sprint_123",
  "title": "Sprint 12",
  "startDate": "2026-04-01",
  "endDate": "2026-04-14",
  "createdAt": "2026-03-18T10:00:00.000Z",
  "updatedAt": "2026-03-18T10:00:00.000Z"
}
```

### Task shape

Extend tasks with nullable references:

```json
{
  "phaseId": "phase_123",
  "milestoneId": "milestone_123",
  "sprintId": "sprint_123"
}
```

Each field is optional and may be `null` or absent in older files. A task may reference at most one phase, one milestone, and one sprint.

## Validation and Normalization

### Import behavior

Board import should normalize missing roadmap data to:

```json
{
  "version": 1,
  "milestones": [],
  "phases": [],
  "sprints": []
}
```

Task references should normalize to empty values when missing or invalid.

### Validation rules

- `extensions.roadmap.version` must equal `1`.
- `milestones`, `phases`, and `sprints` must be arrays.
- IDs must be non-empty unique strings within their own collection.
- Titles must be non-empty strings.
- Milestone `dueDate` must be `YYYY-MM-DD`.
- Phase and sprint `startDate` and `endDate` must be `YYYY-MM-DD`.
- Phase and sprint `startDate` must be less than or equal to `endDate`.
- Task `phaseId`, `milestoneId`, and `sprintId` must be strings or empty.

### Invalid references

If a task points to a roadmap entity that no longer exists, normalization should clear the invalid reference instead of breaking rendering or save behavior.

## UI Design

### Portfolio toolbar

When a board is selected:

- Keep the existing controls.
- Add a new selected-board-only view switch on the right side of the portfolio toolbar.
- Default to `Board` when a board is first selected.
- Preserve the existing board view for users who do not use roadmap planning.

### Board view changes

Add lightweight multi-select controls to task cards in the selected mutable project board view:

- Each visible task card gets a checkbox.
- Selecting one or more tasks reveals a bulk sprint action bar.
- The bulk action bar includes:
  - selection count
  - clear selection
  - `Create Sprint`

The sprint creation flow prompts for:

- sprint title
- sprint start date
- sprint end date

Saving that flow:

- creates the sprint entity
- assigns all selected tasks to that sprint
- records a timeline event
- saves through the existing project save queue

Phase and milestone assignment do not use this bulk action flow.

### Task modal changes

Extend the existing task modal with two selectors:

- `Phase`
- `Milestone`

These selectors are populated from the currently selected board's roadmap extension data. They include a blank option for no assignment.

The modal does not include sprint assignment.

### Roadmap view layout

The roadmap replaces the board grid area when selected and should render:

- top date axis spanning the visible planning range
- three stacked sections in this order:
  - milestones
  - phases
  - sprints

Section behavior:

- Milestones render as dated markers on the timeline.
- Phases render as horizontal date-range bars.
- Sprints render as horizontal date-range bars.
- Each item occupies one row.
- Each row can be expanded to show assigned tasks.

### Task visibility inside roadmap rows

Clicking or expanding a roadmap row should reveal an inline list of assigned tasks:

- milestone row shows tasks with matching `milestoneId`
- phase row shows tasks with matching `phaseId`
- sprint row shows tasks with matching `sprintId`

The inline list can reuse the existing task card visual language in a compressed format. Clicking a task from this list should open the existing task detail or edit flow, depending on current behavior standards in portfolio mode.

### Creation and editing of roadmap items

The roadmap view should let users create:

- milestones
- phases
- sprints

Recommended first-version interaction:

- section-level `+ Add Milestone`, `+ Add Phase`, and `+ Add Sprint` buttons
- a lightweight modal or prompt-based editor for title and dates
- edit and delete actions per roadmap row

Delete behavior:

- deleting a milestone clears `milestoneId` on referencing tasks
- deleting a phase clears `phaseId` on referencing tasks
- deleting a sprint clears `sprintId` on referencing tasks

## Selectors and Rendering Helpers

Add selectors for:

- roadmap extension state for a board
- milestones sorted by date
- phases sorted by start date
- sprints sorted by start date
- tasks by milestone
- tasks by phase
- tasks by sprint
- visible roadmap date range

The date range should be computed from the earliest and latest roadmap item dates in the selected board. If no roadmap items exist yet, render an empty-state prompt encouraging the user to create the first milestone, phase, or sprint.

## Persistence and Timeline Integration

Roadmap mutations should reuse the same mutation/save infrastructure already used for task and board changes.

Record timeline events for:

- milestone created
- milestone updated
- milestone deleted
- phase created
- phase updated
- phase deleted
- sprint created
- sprint updated
- sprint deleted
- bulk sprint assignment
- task roadmap assignment changes made through the task modal

Event summaries should stay short and human-readable, matching the existing timeline conventions.

## Error Handling

- Read-only or historical preview states must keep roadmap mutations disabled, just like current task mutations.
- Invalid date input should block save and show a clear validation message.
- Empty titles should block save.
- If a board has no roadmap entities, roadmap view should show empty-state guidance rather than a blank chart.
- If selected tasks disappear because filters change before sprint creation completes, the final sprint assignment should operate only on tasks still resolvable in the selected board.

## Testing Strategy

Primary verification should be Playwright coverage in `kanban/tests/app.test.js`.

Minimum required tests:

1. Board payload import/export includes roadmap extension and task roadmap IDs.
2. Toolbar view toggle appears only when a project board is selected.
3. Task modal shows phase and milestone selectors populated from board roadmap data.
4. Saving a task persists selected `phaseId` and `milestoneId`.
5. Task cards support multi-select in mutable selected project board view.
6. Bulk sprint creation creates a sprint entity and assigns the checked tasks.
7. Roadmap view renders milestones as markers and phases/sprints as bars.
8. Expanding a roadmap row shows only the tasks assigned to that row.
9. Deleting a milestone, phase, or sprint clears task references safely.
10. Historical preview and read-only boards block roadmap mutations.

## Implementation Boundaries

This design intentionally keeps scope tight:

- No portfolio-level roadmap ownership
- No auto-generated phases, milestones, or sprints
- No drag scheduling in the roadmap timeline
- No unassigned-task lane in roadmap view
- No advanced dependencies between roadmap items

These can be added later without invalidating the data model proposed here.

## Recommendation

Implement roadmap support as an extension of the existing selected-board experience in portfolio mode. This is the lowest-risk path because it preserves the current board workflow, fits the single-file architecture, and uses the current save, validation, and timeline systems rather than creating a second planning engine.
