# Calendar Day Item Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit each month-calendar day cell to at most 4 visible items total, counting roadmap items and tasks together.

**Architecture:** Keep the change inside the existing month-view renderer in `kanban.html`. Reduce the current combined visible-item slice from 5 to 4, then update the existing Playwright month-calendar regression in `tests/app.test.js` so it proves the new cap and overflow count without changing ordering behavior.

**Tech Stack:** Single-file browser app in `kanban.html`, Playwright tests in `tests/app.test.js`, npm-based test runner

---

## File Structure

### Runtime

- Modify: `kanban.html`
  - Update `renderPortfolioCalendarMonthView()` where `visibleItems` is derived from the sorted day item list

### Tests

- Modify: `tests/app.test.js`
  - Extend `calendar view renders roadmap items and due-date tasks with month drill-down`
  - Reuse the existing April 10 crowded-day fixture to prove the max-visible-items behavior

### Docs

- Spec reference: `docs/superpowers/specs/2026-04-08-calendar-day-item-cap-design.md`

---

### Task 1: Add The Failing Cap Regression

**Files:**
- Modify: `tests/app.test.js`
- Spec: `docs/superpowers/specs/2026-04-08-calendar-day-item-cap-design.md`

- [ ] **Step 1: Extend the existing month-calendar regression**

In `calendar view renders roadmap items and due-date tasks with month drill-down`, keep the existing April 10 fixture and update the visible-item assertions so they prove the new total-per-day cap:

- roadmap items on April 10 remain `Build`, `Sprint 1`, `Launch`
- task items on April 10 reduce to only `Launch Task`
- overflow changes to `+2 more`

Target assertion shape:

```js
const aprilTenthDayTitles = await page
  .locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-items [data-calendar-item-title]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-calendar-item-title')));

expect(aprilTenthDayTitles).toEqual(['Launch Task']);
await expect(page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-item-overflow')).toHaveText('+2 more');
```

Keep the roadmap ordering assertions in place so this cap change does not loosen the recent milestone-order regression.

- [ ] **Step 2: Run the focused regression to verify it fails**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because the month calendar still shows 5 visible items and `+1 more`

---

### Task 2: Implement The 4-Item Cap

**Files:**
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-08-calendar-day-item-cap-design.md`

- [ ] **Step 1: Reduce the month-view visible item slice**

In `renderPortfolioCalendarMonthView()`, change:

```js
const visibleItems = dayItems.slice(0, 5);
```

to:

```js
const visibleItems = dayItems.slice(0, 4);
```

Do not change:

- day-item sorting
- roadmap-first rendering structure
- overflow rendering logic

- [ ] **Step 2: Re-run the focused regression to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS with April 10 showing only 4 visible total items
- PASS with April 10 task visibility reduced to one task
- PASS with overflow updated to `+2 more`

---

### Task 3: Verify The Calendar Surface And Commit

**Files:**
- Modify: `kanban.html` only if verification exposes a regression
- Modify: `tests/app.test.js` only if verification exposes a regression gap

- [ ] **Step 1: Run the focused calendar pair**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```

Expected:

- PASS
- aggregate calendar behavior remains unchanged

- [ ] **Step 2: Commit the cap change**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: cap calendar day items at four"
```

---

## Local Review Checklist

- [ ] Month view shows at most 4 visible items in any day cell.
- [ ] The cap applies to roadmap items and tasks together, not separately.
- [ ] Overflow count still reflects the hidden remainder accurately.
- [ ] Existing roadmap ordering remains unchanged.
- [ ] Aggregate calendar behavior remains unchanged.

## Verification Commands

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```
