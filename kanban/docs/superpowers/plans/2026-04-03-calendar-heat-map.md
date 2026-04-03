# Calendar Heat Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a heat-map display mode to the portfolio calendar so year view colors mini day cells by yearly task load and month view colors day cells by month-local task load, with a header toggle beside the calendar period.

**Architecture:** Extend the existing calendar renderer with a second state axis for display mode instead of creating a separate screen. Keep the current year/month structure and navigation, then layer in task-count aggregation, heat-range normalization, and conditional styling for mini day cells and month day cells. Use Playwright regression tests to drive the work in small increments and protect current drill-down and aggregate calendar behavior.

**Tech Stack:** Single-file browser app in `kanban.html`, Playwright tests in `tests/app.test.js`, npm-based test runner

---

## File Structure

### Runtime

- Modify: `kanban.html`
  - Calendar state near `portfolioCalendarView`, `portfolioCalendarYear`, `portfolioCalendarMonth`
  - Calendar CSS around `.portfolio-calendar-header`, `.portfolio-calendar-mini-day`, `.portfolio-calendar-day-cell`
  - Calendar helpers around `buildPortfolioCalendarItems`, `doesPortfolioCalendarItemOccurOnDay`, `renderPortfolioCalendarMiniMonth`, `renderPortfolioCalendarYearView`, `renderPortfolioCalendarMonthView`, `renderPortfolioCalendarView`
  - Calendar click handling around `handlePortfolioCalendarViewClick`

### Tests

- Modify: `tests/app.test.js`
  - Extend `calendar view renders roadmap items and due-date tasks with month drill-down`
  - Extend `aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board`
  - Add focused heat-map regressions if the existing calendar test becomes too dense

### Docs

- Spec reference: `docs/superpowers/specs/2026-04-03-calendar-heat-map-design.md`

---

### Task 1: Add Heat Map Mode State And Header Toggle

**Files:**
- Modify: `tests/app.test.js`
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-03-calendar-heat-map-design.md`

- [ ] **Step 1: Write the failing year-view toggle test**

Add Playwright assertions to the existing calendar smoke test so it proves all of this in year view:

- a button exists beside `.portfolio-calendar-period`
- the button label starts as `Heat Map`
- clicking it switches the calendar into heat-map mode
- clicking it again returns to normal calendar mode

Example assertion shape:

```js
const header = page.locator('#portfolioCalendarView .portfolio-calendar-header');
const toggle = header.getByRole('button', { name: 'Heat Map' });
await expect(toggle).toBeVisible();
await toggle.click();
await expect(header.getByRole('button', { name: 'Calendar' })).toBeVisible();
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because the heat-map toggle does not exist yet

- [ ] **Step 3: Add the minimal calendar display-mode state**

In `kanban.html`, add a new in-memory state value near the other calendar state:

```js
let portfolioCalendarDisplayMode = 'calendar';
```

Add a helper if it keeps the render logic simpler:

```js
function isPortfolioCalendarHeatMapMode() {
  return portfolioCalendarDisplayMode === 'heatmap';
}
```

- [ ] **Step 4: Render the header toggle and wire click handling**

Update the calendar header markup in `renderPortfolioCalendarView` to place a button immediately beside `.portfolio-calendar-period`:

```js
<div class="portfolio-calendar-period-group">
  <div class="portfolio-calendar-period">${escapeHtml(periodLabel)}</div>
  <button class="btn" type="button" data-action="toggle-calendar-display-mode">
    ${isHeatMap ? 'Calendar' : 'Heat Map'}
  </button>
</div>
```

Handle the new action in `handlePortfolioCalendarViewClick`:

```js
if (action === 'toggle-calendar-display-mode') {
  portfolioCalendarDisplayMode = isPortfolioCalendarHeatMapMode() ? 'calendar' : 'heatmap';
  renderPortfolio();
  return;
}
```

- [ ] **Step 5: Add only the minimal CSS needed for header layout**

Add a small wrapper such as `.portfolio-calendar-period-group` so the period label and toggle sit together without breaking existing header controls.

- [ ] **Step 6: Re-run the same test to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS for the toggle visibility and mode-switch assertions

- [ ] **Step 7: Commit the toggle/state slice**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: add calendar heat map toggle state"
```

---

### Task 2: Implement Year View Heat Map On Mini Day Cells

**Files:**
- Modify: `tests/app.test.js`
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-03-calendar-heat-map-design.md`

- [ ] **Step 1: Write the failing year-view heat-map test**

Extend the year-view calendar test to prove:

- heat-map mode colors `.portfolio-calendar-mini-day-current`
- `.portfolio-calendar-month-card` itself does not receive the heat color
- zero-task mini days are greener than high-load mini days
- normalization is relative to task counts across the selected year

Use a seeded board with task dates spread across the same year so the test can compare low- and high-load days. Read styles in `page.evaluate()` and compare the mini day cell backgrounds directly.

Example shape:

```js
const colors = await page.evaluate(() => {
  const low = getComputedStyle(document.querySelector('[data-calendar-mini-day="2026-04-02"]')).backgroundColor;
  const high = getComputedStyle(document.querySelector('[data-calendar-mini-day="2026-04-10"]')).backgroundColor;
  const card = getComputedStyle(document.querySelector('.portfolio-calendar-month-card[data-month="3"]')).backgroundColor;
  return { low, high, card };
});
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because year heat colors are not implemented yet

- [ ] **Step 3: Add task-count and heat-range helpers**

In `kanban.html`, add focused helpers near the calendar helper section:

```js
function getPortfolioCalendarTaskCountsByDay(items) { /* tasks only */ }
function getPortfolioCalendarYearHeatStats(taskCounts, year) { /* min/max across all days in year */ }
function getPortfolioCalendarHeatColor(count, stats) { /* green -> amber -> red */ }
```

Implementation notes:

- count only `item.kind === 'task'`
- use ISO day keys
- include zero-count days when computing yearly comparisons so empty days stay green

- [ ] **Step 4: Thread heat-map data into mini-month rendering**

Pass heat-map options into `renderPortfolioCalendarYearView` and `renderPortfolioCalendarMiniMonth`.

Suggested call shape:

```js
renderPortfolioCalendarMiniMonth(monthItems, year, month, {
  aggregate: options.aggregate,
  heatmap: options.heatmap,
  taskCounts,
  heatStats
})
```

- [ ] **Step 5: Color only current mini day cells**

In `renderPortfolioCalendarMiniMonth`, apply inline style or a data attribute/class only to `.portfolio-calendar-mini-day-current` in heat-map mode. Do not apply heat color to the month card container.

Example:

```js
const heatStyle = options.heatmap && inCurrentMonth
  ? `background:${getPortfolioCalendarHeatColor(taskCount, options.heatStats)};`
  : '';
```

- [ ] **Step 6: Re-run the test to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS with visible year-view heat colors on mini day cells only

- [ ] **Step 7: Commit the year heat-map slice**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: add year calendar heat map"
```

---

### Task 3: Implement Month View Heat Map On Day Cells

**Files:**
- Modify: `tests/app.test.js`
- Modify: `kanban.html`
- Spec: `docs/superpowers/specs/2026-04-03-calendar-heat-map-design.md`

- [ ] **Step 1: Write the failing month-view heat-map test**

Add month-view assertions proving:

- heat-map mode persists after clicking `Open April 2026`
- current-month `.portfolio-calendar-day-cell-current` cells receive heat colors
- outside-month filler cells stay muted
- month normalization is local to the selected month only

Seed task data so a day in the current month becomes the local max while another current-month day remains low/zero.

- [ ] **Step 2: Run the targeted test to verify it fails**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- FAIL because month heat-map rendering is not implemented yet

- [ ] **Step 3: Add month-local normalization helpers**

In `kanban.html`, add a focused helper:

```js
function getPortfolioCalendarMonthHeatStats(taskCounts, year, month) {
  // use only in-month days for the selected month
}
```

Make sure outside-month filler dates do not affect the min/max range.

- [ ] **Step 4: Thread month heat-map options into month rendering**

Update `renderPortfolioCalendarMonthView` to receive:

- `heatmap`
- `taskCounts`
- month-local `heatStats`

Then apply the background only to current-month day cells in heat-map mode.

- [ ] **Step 5: Preserve existing content layering**

Keep roadmap spans, task chips, overflow text, and task-creation affordances working on top of the colored cell. If needed, adjust text/border contrast minimally rather than replacing existing item styles.

- [ ] **Step 6: Re-run the test to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down"
```

Expected:

- PASS with month heat colors applied to current-month cells only

- [ ] **Step 7: Commit the month heat-map slice**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: add month calendar heat map"
```

---

### Task 4: Cover Aggregate Calendar And Navigation Regressions

**Files:**
- Modify: `tests/app.test.js`
- Modify: `kanban.html` (only if regression fixes are needed)
- Spec: `docs/superpowers/specs/2026-04-03-calendar-heat-map-design.md`

- [ ] **Step 1: Write or extend failing regression tests**

Cover the remaining behavior that can regress easily:

- aggregate portfolio calendar can toggle heat-map mode
- aggregate heat uses task counts across visible boards
- `Prev`/`Next` year preserves heat-map mode
- `Prev`/`Next` month preserves heat-map mode
- `Back to year` preserves heat-map mode

Prefer extending these tests:

- `calendar view renders roadmap items and due-date tasks with month drill-down`
- `aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board`

- [ ] **Step 2: Run the focused calendar tests to verify failures**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```

Expected:

- FAIL only where heat-map persistence or aggregate behavior is still missing

- [ ] **Step 3: Fix the smallest remaining regressions**

Likely places:

- preserve `portfolioCalendarDisplayMode` when switching year/month
- make sure aggregate task counts include all visible boards
- keep non-heat calendar mode unchanged

Avoid unrelated calendar refactors.

- [ ] **Step 4: Re-run the focused calendar suite to verify it passes**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```

Expected:

- PASS for both focused calendar tests

- [ ] **Step 5: Run the full calendar/timeline-adjacent sanity check**

Run:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board|timeline slider previews historical state and restore persists it"
```

Expected:

- PASS
- no calendar regressions from the new state and styling branches

- [ ] **Step 6: Commit the final integration slice**

```bash
git add kanban.html tests/app.test.js
git commit -m "feat: add portfolio calendar heat map"
```

---

## Local Review Checklist

- [ ] Toggle is beside `.portfolio-calendar-period`, not elsewhere in the header.
- [ ] Year heat colors mini day cells only, not the month card container.
- [ ] Month heat colors current-month day cells only.
- [ ] Zero-task periods are green.
- [ ] Year view uses year-wide normalization.
- [ ] Month view uses month-local normalization.
- [ ] Drill-down and back navigation preserve heat-map mode.
- [ ] Aggregate calendar counts tasks across boards.
- [ ] Normal calendar mode still renders exactly as before when heat map is off.

## Verification Commands

Run these after completing the implementation:

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board"
```

```bash
npm test -- --grep "calendar view renders roadmap items and due-date tasks with month drill-down|aggregate calendar keeps cross-board context, uses board colors, and opens task detail without selecting a board|timeline slider previews historical state and restore persists it"
```
