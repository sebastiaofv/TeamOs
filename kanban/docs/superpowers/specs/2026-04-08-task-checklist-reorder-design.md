# Task Checklist Reorder Design

Date: 2026-04-08

## Goal

Allow checklist items in the task edit modal to be reordered by drag and drop.

- Reordering happens only while editing a task.
- Users drag checklist rows by a dedicated handle.
- Saving the task persists the reordered checklist item sequence.

## Non-Goals

- No drag-and-drop reordering in the read-only task detail modal.
- No changes to checklist completion behavior.
- No changes to checklist storage shape.
- No keyboard-based reorder controls in this change.

## Current Context

The task modal checklist editor already renders each todo item as a `.checklist-editor-row` with:

- a completion checkbox
- a text input
- a remove button

The editor syncs its current rows back to the hidden `#taskChecklist` textarea, which is then parsed and saved with the task.

Checklist items can currently be added, edited, removed, and toggled, but not reordered.

## Proposed Approach

Add drag-and-drop reordering to the checklist editor rows inside the task modal.

### UI

- Add a dedicated drag handle to each checklist editor row.
- Only the handle should initiate dragging.
- Keep the checkbox, text field, and remove button behavior unchanged.
- Show a visible drop-target state while dragging so the landing position is clear.

### Data flow

- Reuse the existing checklist editor row data as the source of truth.
- On drop, rebuild the checklist editor rows in the new order.
- Immediately sync the reordered rows back to the hidden `#taskChecklist` textarea.
- Saving the task should persist the reordered checklist array without changing item structure.

### Scope boundary

- Apply drag-and-drop only to the checklist editor in the task modal.
- Leave the detail modal checklist rendering untouched.

## Testing Plan

Add focused Playwright coverage that proves:

1. A checklist row can be dragged to a new position in the task modal.
2. The visible row order updates immediately after drop.
3. Saving the task persists the new checklist order to in-memory board state.
4. Existing checklist editing behavior remains intact.

Verification should use a focused checklist/task-modal test run first.

## Risks

- Making the whole row draggable could interfere with text editing and checkbox clicks.
- Reorder logic could break the index-based event handlers if row indices are not rebuilt after drop.
- If the hidden checklist textarea is not resynced after reorder, the saved order could remain stale.

## Recommendation

Use a drag handle plus native row drag-and-drop inside the task modal checklist editor. It matches the requested interaction while staying compatible with the existing checklist editor structure.
