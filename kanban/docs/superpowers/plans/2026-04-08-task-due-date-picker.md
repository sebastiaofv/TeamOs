# Task Due Date Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the task modal due date text field with the same native date picker pattern used by roadmap milestone dates.

**Architecture:** Keep the change tightly scoped to the existing task modal in `kanban.html`. Swap `#taskDueDate` to a native `type="date"` input, preload it with ISO dates directly when creating or editing tasks, and save the field back as the same ISO string already stored in board JSON. Update the focused Playwright tests so they assert native date-input behavior while leaving display formatting in cards and detail views unchanged.

**Tech Stack:** Single-file browser app in `kanban.html`, Playwright tests in `tests/app.test.js`, npm-based test runner

---

## File Structure

### Runtime

- Modify: `kanban.html`
  - Task modal markup for `#taskDueDate`
  - Task modal open/edit prefill paths
  - Task draft extraction and validation around due dates
  - Due-date helper usage if the old text-parser becomes unused

### Tests

- Modify: `tests/app.test.js`
  - Existing due-date modal regression
  - Existing calendar-create-task regression
  - Existing invalid-due-date regression, replacing the old free-text expectation with native picker coverage

### Docs

- Spec reference: `docs/superpowers/specs/2026-04-08-task-due-date-picker-design.md`

---

### Task 1: Write The Failing Native Picker Regressions

**Files:**
- Modify: `tests/app.test.js`
- Spec: `docs/superpowers/specs/2026-04-08-task-due-date-picker-design.md`

- [ ] **Step 1: Update the task due-date regression to assert native input behavior**

Replace the current `dd/mm/yyyy`-specific assertions in the due-date test with native picker expectations:

- assert `#taskDueDate` is a `type="date"` input
- fill it with `2026-03-05`
- save the task
- assert board JSON still stores `2026-03-05`
- keep the card/detail display assertions if they still show formatted dates

Target assertion shape:

```js
await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
await page.locator('#taskDueDate').fill('2026-03-05');
```

- [ ] **Step 2: Update the calendar-create regression to expect ISO prefill**

In `calendar view renders roadmap items and due-date tasks with month drill-down`, change the task modal expectation after clicking a day cell from:

```js
await expect(page.locator('#taskDueDate')).toHaveValue('04/04/2026');
```

to:

```js
await expect(page.locator('#taskDueDate')).toHaveValue('2026-04-04');
await expect(page.locator('#taskDueDate')).toHaveAttribute('type', 'date');
```

- [ ] **Step 3: Replace the old invalid-text regression with native prefill coverage**

The current invalid test exists only because the field is free text. Replace it with a regression that proves editing an existing task loads the native date input correctly:

- seed a task with `dueDate: '2026-03-05'`
- open the task modal for edit
- assert `#taskDueDate` has `type="date"`
- assert `#taskDueDate` value is `2026-03-05`

This preserves coverage for modal prefill without depending on the removed text-format validation path.

- [ ] **Step 4: Run the focused due-date/calendar tests to verify they fail**

Run:

```bash
npm test -- --grep "due date input uses|invalid due date keeps|calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because the task modal still renders a text input
- FAIL because calendar create-task still prefills `dd/mm/yyyy`
- FAIL because existing edit/create paths still use `formatDueDateForUi()`

---

### Task 2: Implement The Native Task Date Picker

**Files:**
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-08-task-due-date-picker-design.md`

- [ ] **Step 1: Change the task modal field to a native date input**

In the task modal markup, change:

```html
<input type="text" id="taskDueDate" inputmode="numeric" placeholder="dd/mm/yyyy" pattern="\\d{2}/\\d{2}/\\d{4}">
```

to:

```html
<input type="date" id="taskDueDate">
```

- [ ] **Step 2: Preload task due dates with ISO values directly**

In the edit and create modal flows, replace:

```js
document.getElementById('taskDueDate').value = formatDueDateForUi(...);
```

with the normalized ISO value directly, for example:

```js
document.getElementById('taskDueDate').value = normalizeDueDate(task.dueDate);
document.getElementById('taskDueDate').value = normalizeDueDate(options.preferredDueDate);
```

using `|| ''` where needed.

- [ ] **Step 3: Save and validate the native date input as ISO**

In `readTaskFormDraft()`:

- keep `rawDueDate` as the trimmed field value
- replace `parseDueDateInput(...)` with `normalizeDueDate(...)`

Example:

```js
rawDueDate: document.getElementById('taskDueDate').value.trim(),
dueDate: normalizeDueDate(document.getElementById('taskDueDate').value),
```

Then update the validation message path so it no longer refers to `dd/mm/yyyy`.

Recommended guard:

```js
if (draft.rawDueDate && !draft.dueDate) {
  return {
    ok: false,
    message: 'Due date must be a valid date.',
    focusFieldId: 'taskDueDate'
  };
}
```

- [ ] **Step 4: Remove the obsolete text parser if it becomes unused**

If `parseDueDateInput()` has no remaining callers after the native-input switch, delete it. Keep `formatDueDateForUi()` if cards/detail views still use it for display formatting.

- [ ] **Step 5: Run the focused due-date/calendar tests to verify they pass**

Run:

```bash
npm test -- --grep "due date input uses|invalid due date keeps|calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS after renaming/updating the due-date tests
- PASS with native input type assertions
- PASS with ISO-prefilled task modal values

---

### Task 3: Verify The Surrounding Surface

**Files:**
- Modify: `kanban.html` only if verification exposes a regression
- Modify: `tests/app.test.js` only if verification exposes a regression gap

- [ ] **Step 1: Run the focused calendar/due-date set**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board|due date input uses|invalid due date keeps"
```

Expected:

- PASS
- task modal uses native date input in both direct create and calendar-create flows
- aggregate calendar behavior remains unchanged

- [ ] **Step 2: Commit if working on an isolated branch**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: use native date picker for task due dates"
```

Skip this step if execution is happening in a deliberately dirty checkout that is not ready for a commit.

---

## Local Review Checklist

- [ ] `#taskDueDate` is a native `type="date"` input.
- [ ] Creating a task from a calendar day prefills the correct ISO date.
- [ ] Editing an existing task preloads the saved ISO date.
- [ ] Saving still writes ISO due dates to in-memory state and persisted JSON.
- [ ] Card/detail due-date display formatting remains unchanged unless intentionally updated.
- [ ] The old `dd/mm/yyyy` task-input validation path is removed or generalized.

## Verification Commands

```bash
npm test -- --grep "due date input uses|invalid due date keeps|calendar view renders roadmap items and due-date tasks with month drill-down"
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board|due date input uses|invalid due date keeps"
```
