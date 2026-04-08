# Calendar Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the expanded month calendar denser so more roadmap and task items fit in each week row without sacrificing readability.

**Architecture:** Keep the change scoped to the existing month-view renderer and CSS. Tighten month-grid spacing and item sizing in `kanban.html`, then raise the month-view visible-item cap by one so the denser layout actually surfaces more content before overflow. Use the existing month calendar Playwright regression as the primary safety net.

**Tech Stack:** Single-file browser app in `kanban.html`, Playwright tests in `tests/app.test.js`, npm-based test runner

---

## File Structure

### Runtime

- Modify: `kanban.html`
  - Month-view CSS around `.portfolio-calendar-week-roadmap`, `.portfolio-calendar-roadmap-span`, `.portfolio-calendar-day-cell`, `.portfolio-calendar-day-roadmap`, `.portfolio-calendar-day-items`, and `.portfolio-calendar-item`
  - Month renderer around `renderPortfolioCalendarMonthView`

### Tests

- Modify: `tests/app.test.js`
  - Extend `calendar view renders roadmap items and due-date tasks with month drill-down`
  - Reuse the existing April 10 crowded-day fixture to prove one extra visible item and denser metrics

### Docs

- Spec reference: `docs/superpowers/specs/2026-04-04-calendar-density-design.md`

---

### Task 1: Add The Failing Month-Density Regression

**Files:**
- Modify: `tests/app.test.js`
- Spec: `docs/superpowers/specs/2026-04-04-calendar-density-design.md`

- [ ] **Step 1: Extend the existing month calendar test with dense-layout expectations**

In `calendar view renders roadmap items and due-date tasks with month drill-down`, keep the existing April 10 fixture and add assertions that prove:

- April 10 now shows `2` visible tasks instead of `1`
- the overflow indicator becomes `+1 more`
- the month day cell uses the denser metrics
- roadmap and task chips still share the same compact sizing

Use the existing April 10 day because it already has:

- `3` roadmap items (`Launch`, `Build`, `Sprint 1`)
- `3` tasks (`Launch Task`, `Scale Task`, `Support Task`)

Target assertion shape:

```js
const aprilTenthDayTitles = await page
  .locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-day-items [data-calendar-item-title]')
  .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-calendar-item-title')));
expect(aprilTenthDayTitles).toEqual(['Launch Task', 'Scale Task']);

await expect(page.locator('[data-calendar-day="2026-04-10"] .portfolio-calendar-item-overflow')).toHaveText('+1 more');
```

Update the existing `calendarItemMetrics` evaluation to include the day-cell metrics too:

```js
const dayCell = document.querySelector('[data-calendar-day="2026-04-10"]');
const dayCellStyle = dayCell ? getComputedStyle(dayCell) : null;
```

Assert the new compact values explicitly:

- `cellMinHeight` is `112px`
- `cellPadding` is `8px 8px 8px 8px`
- `roadmapGap` equals `taskGap`
- `roadmapFontSize` equals `taskFontSize`
- `roadmapPadding` equals `taskPadding`

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because the month view still shows only one visible task on April 10 and the roomy metrics are still in place

---

### Task 2: Implement The Readable Density Pass

**Files:**
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-04-calendar-density-design.md`

- [ ] **Step 1: Tighten the month-grid layout styles**

In `kanban.html`, update only the expanded month-view styles to these compact values:

```css
.portfolio-calendar-week-roadmap {
  gap: 3px;
  padding: 6px 6px;
}

.portfolio-calendar-roadmap-span {
  min-height: 26px;
  padding: 4px 6px;
  font-size: 11px;
  line-height: 1.25;
}

.portfolio-calendar-day-cell {
  min-height: 112px;
  padding: 8px;
}

.portfolio-calendar-day-roadmap {
  gap: 4px;
  margin-top: 6px;
  margin-bottom: 6px;
}

.portfolio-calendar-day-items {
  gap: 4px;
}

.portfolio-calendar-item {
  min-height: 26px;
  padding: 4px 6px;
  font-size: 11px;
  line-height: 1.25;
}
```

Keep:

- single-line truncation
- existing colors
- existing hover/focus behavior
- year-view mini-month styles untouched

- [ ] **Step 2: Raise the visible-item cap in month view**

In `renderPortfolioCalendarMonthView`, change the visible item slice from:

```js
const visibleItems = dayItems.slice(0, 4);
```

to:

```js
const visibleItems = dayItems.slice(0, 5);
```

Do not change ordering logic. The intent is still:

- roadmap items first
- then tasks
- then overflow if more remain

- [ ] **Step 3: Re-run the focused test to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS with April 10 showing `Launch Task` and `Scale Task`
- PASS with the overflow reduced to `+1 more`
- PASS with the compact month-view metrics

---

### Task 3: Verify The Surrounding Calendar Surface And Commit

**Files:**
- Modify: `tests/app.test.js` only if focused verification exposes a regression gap
- Modify: `kanban.html` only if focused verification exposes a runtime regression

- [ ] **Step 1: Run the focused calendar pair**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```

Expected:

- PASS
- aggregate calendar behavior remains unchanged

- [ ] **Step 2: Run the full suite**

Run:

```bash
npm test
```

Expected:

- PASS
- no regressions in heat-map, aggregate calendar, or timeline behavior

- [ ] **Step 3: Commit the density pass**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: compact month calendar items"
```

---

## Local Review Checklist

- [ ] Month-view rows are visibly denser without becoming cramped.
- [ ] Tasks and roadmap spans share the same compact sizing.
- [ ] April 10 shows one additional visible task before overflow.
- [ ] Overflow remains in place for hidden items.
- [ ] Year mini-month cards are unchanged.
- [ ] Heat-map mode still works in month and year views.
- [ ] Aggregate calendar behavior is unchanged.

## Verification Commands

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
npm test
```
