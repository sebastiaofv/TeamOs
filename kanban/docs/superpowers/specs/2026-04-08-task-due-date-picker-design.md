# Task Due Date Picker Design

Date: 2026-04-08

## Goal

Make the task modal due date field use the same native date-picker interaction as the milestone date field.

- Replace free-text due date entry in the task modal.
- Let users pick a due date from the browser date picker.
- Keep the stored task due date format as ISO `YYYY-MM-DD`.

## Non-Goals

- No changes to milestone, phase, or sprint date inputs.
- No changes to calendar rendering beyond prefilled task-modal values.
- No changes to the JSON storage format for due dates.
- No custom date-picker UI.

## Current Context

The task modal due date field currently uses a text input with `dd/mm/yyyy` formatting and custom parsing/validation.

Roadmap milestone dates already use a native `type="date"` input, which gives users a browser picker and an ISO-backed value.

This creates two different date-entry patterns in the same app for conceptually similar fields.

## Proposed Approach

Change the task modal due date input to match the roadmap milestone input.

### UI

- Replace `#taskDueDate` from `type="text"` to `type="date"`.
- Remove the `dd/mm/yyyy` placeholder, pattern, and numeric-input behavior from that field.
- Keep the field label and overall modal layout unchanged.

### Data flow

- When opening an existing task, set the task due date field with the saved ISO date directly.
- When opening a new task from the calendar, prefill the field with the selected ISO date directly.
- When saving, read the native date input value and persist it as the same ISO string already used in board data.

### Validation

- Blank due dates remain allowed.
- The browser date input becomes the source of truth for valid populated values.
- The old text-format validation path for task due dates is removed.

## Testing Plan

Update the existing Playwright coverage to prove:

1. The task due date field is a native date input.
2. Creating or editing a task loads the date picker with the expected ISO value.
3. Saving still persists the same ISO due date to board JSON.
4. Calendar day creation still prefills the correct due date in the task modal.
5. The old invalid free-text due date path is removed or replaced with coverage appropriate to the new native input behavior.

Verification should focus on the existing due-date and calendar task-creation regressions first.

## Risks

- Existing tests that expect `dd/mm/yyyy` UI values will fail and must be updated.
- Any code that still formats task modal dates for display instead of using ISO values directly could leave the field blank.
- Manual invalid-date-entry behavior changes because the native date input owns the UI format.

## Recommendation

Use the same native `type="date"` input for task due dates that milestones already use. It aligns the UI, removes unnecessary parsing complexity, and preserves the existing stored date format.
