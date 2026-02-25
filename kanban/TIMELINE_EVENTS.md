# Timeline Events

This document explains the timeline event format stored in board files under `extensions.timeline`, and the event types currently recognized by the app.

## Where Timeline Data Lives

Timeline data is stored in a board JSON file here:

```json
{
  "extensions": {
    "timeline": {
      "version": 1,
      "enabled": true,
      "nextId": 2,
      "events": [ ... ]
    }
  }
}
```

## Timeline Container Fields

- `version` (`number`)
  - Timeline schema version. Current value is `1`.
- `enabled` (`boolean`)
  - If `false`, the app will not append new events.
- `nextId` (`number`)
  - Monotonic counter used for the next event `id`.
- `events` (`array`)
  - Ordered event log (oldest to newest).

## Event Envelope (All Events)

Each timeline entry uses the same outer shape:

```json
{
  "id": 1,
  "ts": "2026-02-25T21:40:49.000Z",
  "type": "init",
  "data": {}
}
```

- `id` (`number`)
  - Numeric event identifier assigned from `nextId`.
- `ts` (`string`)
  - ISO timestamp.
- `type` (`string`)
  - Event type name (see list below).
- `data` (`object`)
  - Event payload. Shape depends on `type`.

## Important Behavior Notes

- The app guarantees at least one `init` event exists.
- `init` may be created:
  - when a timeline is first initialized
  - when old events are trimmed (the app writes a new snapshot `init` event)
- Timeline replay uses event payloads to rebuild board state.
- Some payload fields are only used for UI labels/details and are not required for replay.
- `archived_filter_toggled` supports legacy boolean values and newer string values (`active`, `all`, `archived`) for `data.to`.

## Event Types and Payloads

### `init`

Snapshot event used as the replay baseline.

`data` shape:

```json
{
  "board": {
    "columns": [ ... ],
    "tasks": [ ... ],
    "settings": {
      "title": "Board title",
      "sortMode": "manual",
      "showArchivedOnly": false,
      "archiveFilter": "active"
    }
  }
}
```

Replay impact:
- Sets the baseline state used by timeline preview/rebuild.

### `task_created`

Emitted when a new task is created.

`data` fields:
- `taskId` (`number`) - task id
- `taskTitle` (`string`) - label text for timeline UI
- `task` (`object`) - full created task snapshot (normalized task object)

Replay impact:
- Appends `data.task` to `state.tasks`.

### `task_updated`

Emitted when an existing task is edited.

`data` fields:
- `taskId` (`number`) - task id to update
- `taskTitle` (`string`) - timeline label convenience field
- `before` (`object`) - full task snapshot before edit
- `after` (`object`) - full task snapshot after edit

Replay impact:
- Replaces the task matching `taskId` with `data.after`.

Notes:
- Replay only needs `taskId` + `after`; `before` is used for timeline detail display ("Changes").

### `task_moved`

Emitted when a task changes column/status (drag/drop, including undo of a move).

`data` fields:
- `taskId` (`number`)
- `taskTitle` (`string`)
- `fromStatus` (`string`)
- `toStatus` (`string`)

Replay impact:
- Updates the task `status` to `toStatus`.

### `task_archived`

Emitted when a task is archived.

`data` fields:
- `taskId` (`number`)
- `taskTitle` (`string`)

Replay impact:
- Sets matching task `archived = true`.

### `task_restored`

Emitted when an archived task is restored (including undo of archive).

`data` fields:
- `taskId` (`number`)
- `taskTitle` (`string`)

Replay impact:
- Sets matching task `archived = false`.

### `tasks_cleared`

Recognized by timeline replay/UI, but currently not emitted by the visible UI flow.

`data` fields (expected by detail UI):
- `count` (`number`, optional) - number of tasks cleared

Replay impact:
- Replaces `state.tasks` with an empty array.

### `column_added`

Emitted when a column is created.

`data` fields:
- `column` (`object`) - `{ status, title }`
- `index` (`number`) - insertion index

Replay impact:
- Inserts `column` into `state.columns` at `index` (or end if missing).

### `column_renamed`

Emitted when a column title is renamed.

`data` fields:
- `status` (`string`) - column identifier
- `fromTitle` (`string`) - previous title (timeline UI)
- `toTitle` (`string`) - new title

Replay impact:
- Updates the matching column `title` to `toTitle`.

### `column_reordered`

Emitted when columns are reordered by drag/drop.

`data` fields:
- `fromIndex` (`number`)
- `toIndex` (`number`)

Replay impact:
- Moves one column from `fromIndex` to `toIndex`.

### `column_deleted`

Emitted when a column is deleted and tasks are reassigned.

`data` fields:
- `status` (`string`) - deleted column status
- `columnTitle` (`string`) - deleted column title (timeline UI)
- `fallbackStatus` (`string`) - destination column for moved tasks
- `fallbackTitle` (`string`) - destination title (timeline UI)
- `movedTaskCount` (`number`) - count of moved tasks (timeline UI)

Replay impact:
- Removes the deleted column from `state.columns`
- Reassigns tasks with deleted `status` to `fallbackStatus` (or first remaining column if fallback not found)

### `board_title_changed`

Emitted when the board title changes.

`data` fields:
- `fromTitle` (`string`)
- `toTitle` (`string`)

Replay impact:
- Sets `state.settings.title = toTitle`.

### `sort_mode_changed`

Emitted when the board sort mode changes.

`data` fields:
- `from` (`"manual" | "dueDate" | "effort"`)
- `to` (`"manual" | "dueDate" | "effort"`)

Replay impact:
- Sets `state.settings.sortMode = to`.

### `archived_filter_toggled`

Emitted when the board archive filter changes.

Current payload shape:
- `from` (`"active" | "all" | "archived"`)
- `to` (`"active" | "all" | "archived"`)

Legacy payload compatibility:
- Older events may use booleans (`false` = active, `true` = archived)

Replay impact:
- Normalizes `to` into an archive mode and updates:
  - `state.settings.archiveFilter`
  - `state.settings.showArchivedOnly` (derived boolean compatibility field)

## Minimal Replay-Critical Fields (Quick Reference)

For custom tooling that generates events, these are the fields replay actually depends on:

- `init`: `data.board`
- `task_created`: `data.task`
- `task_updated`: `data.taskId`, `data.after`
- `task_moved`: `data.taskId`, `data.toStatus`
- `task_archived`: `data.taskId`
- `task_restored`: `data.taskId`
- `tasks_cleared`: none (`data` may be empty)
- `column_added`: `data.column` (optional `data.index`)
- `column_renamed`: `data.status`, `data.toTitle`
- `column_reordered`: `data.fromIndex`, `data.toIndex`
- `column_deleted`: `data.status`, `data.fallbackStatus`
- `board_title_changed`: `data.toTitle`
- `sort_mode_changed`: `data.to`
- `archived_filter_toggled`: `data.to`

## Practical Guidance

- Prefer using the app to generate timeline events rather than hand-editing them.
- If you hand-edit:
  - keep `id` unique
  - keep `ts` valid ISO timestamps
  - keep events ordered
  - ensure the first event is an `init` snapshot
  - update `nextId` to be greater than the highest event `id`
