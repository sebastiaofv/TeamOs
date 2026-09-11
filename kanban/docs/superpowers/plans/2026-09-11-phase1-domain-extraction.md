# Phase 1: Domain Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 253 pure functions and `BoardRepository` out of `kanban.html` into tested ES modules under `src/`, on a Vite toolchain, without changing any behavior.

**Architecture:** `kanban.html` becomes `index.html` (a Vite entry) whose inline `<style>` and `<script>` move to `src/styles/legacy.css` and `src/legacy/main.js`. The script becomes `type="module"`. Domain functions are then cut from `main.js` into `src/domain/*.js` one module at a time and imported back, so the legacy app keeps running unchanged at every commit. A repeatable extraction script does the cutting so the work is mechanical rather than error-prone hand-editing.

**Tech Stack:** Vite 5, Vitest 2, Tailwind 3 (installed inert, used in Phase 2), Playwright 1.52 (existing), Node 18+, plain JavaScript (no TypeScript).

## Global Constraints

These apply to every task. A task is not complete if it violates one.

- **All 95 Playwright tests pass at every commit.** No task may leave the suite red.
- **Preserve every DOM `id`.** Ids are the parity oracle for the test suite.
- **No behavior changes.** Parity port only. Improvements get filed, not built.
- **`BOARD_SCHEMA_VERSION` stays `1`.** Existing `*.board.json` files must load unchanged.
- **No TypeScript.** Explicitly out of scope per the spec.
- **No reformatting of `src/legacy/main.js`.** Preserve its original 8-space indentation
  exactly. It contains HTML-building template literals where leading whitespace is
  string content; reindenting would silently change output. Domain modules are
  dedented by exactly 8 spaces on extraction (safe: they are pure logic).
- **Node 18+.** Board files keep the `.board.json` extension.
- **A failing assertion is investigated, never just adjusted.** The Vitest assertions
  in this plan were written from reading the source and some will be wrong guesses.
  When one fails, first check the function's behavior in the pre-migration file:

  ```bash
  git show e78741b:kanban/kanban.html | sed -n '/^        function NAME(/,/^        }/p'
  ```

  If the original and the extracted version agree, the assertion was a bad guess —
  correct the assertion. If they disagree, the extraction broke something — fix the
  code, never the assertion. **Never change an extracted function to satisfy an
  assertion.** State which case applied in your report.

**Reference spec:** `docs/superpowers/specs/2026-09-11-vite-react-tailwind-migration-design.md`

**Function inventory:** `docs/superpowers/plans/2026-09-11-phase1-function-inventory.md`
lists all 253 functions by target module. Tasks reference it instead of repeating long
name lists. Its per-module counts supersede the spec's table, which was a planning
estimate made with a coarser clustering rule; the total of 253 is identical.

---

### Task 1: Vite toolchain and legacy app served as a module

Converts the single-file app into a Vite project without changing a line of its logic.
This is the riskiest task in Phase 1 because it touches everything at once; it is also
the one that unlocks all the others.

**Files:**
- Create: `vite.config.js`, `vitest.config.js`, `scripts/extract-domain.mjs`
- Create: `src/legacy/main.js` (from `kanban.html` lines 3668-11074)
- Create: `src/styles/legacy.css` (from `kanban.html` lines 10-3197)
- Rename: `kanban.html` → `index.html`
- Modify: `index.html`, `package.json`, `playwright.config.js`, `tests/app.test.js:69-70`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `src/legacy/main.js` as an ES module; `window.__legacyTestApi` object
  exposing `{ normalizeColumns, normalizeTask, serializeBoardDataFromObject,
  normalizeRoadmapExtension }` for the 4 Playwright tests that call domain functions
  directly (removed in Task 6); `node scripts/extract-domain.mjs <module> <fn>...` CLI.

- [ ] **Step 1: Install the toolchain**

```bash
npm install --save-dev vite@^5.4.0 vitest@^2.1.0
```

- [ ] **Step 2: Split kanban.html into HTML, CSS, and JS**

The line numbers below are from the current `kanban.html` (11,078 lines). Run this
exactly; it does the split mechanically rather than by hand.

```bash
mkdir -p src/legacy src/styles src/domain scripts
# CSS: everything between <style> and </style>
sed -n '10,3197p' kanban.html > src/styles/legacy.css
# JS: everything between <script> and </script>
sed -n '3668,11074p' kanban.html > src/legacy/main.js
# HTML: head-before-style + head-after-style + body, with new references
{ sed -n '1,8p' kanban.html
  sed -n '3199,3666p' kanban.html
  printf '    <script type="module" src="/src/legacy/main.js"></script>\n'
  sed -n '11076,11078p' kanban.html
} > index.html
rm kanban.html   # `git add -A` in the commit step records the deletion
```

- [ ] **Step 3: Import the CSS from the JS entry**

Add as the very first line of `src/legacy/main.js`:

```javascript
import '../styles/legacy.css';
```

- [ ] **Step 4: Add the temporary test API shim**

The 4 Playwright tests at `tests/app.test.js` call `normalizeColumns(...)` and friends
via `page.evaluate`. Under `type="module"` these are no longer globals. This shim keeps
them green until Task 6 converts them to Vitest. Append to `src/legacy/main.js`, at the
very end after `init();`:

```javascript
        // TEMPORARY: bridges 4 Playwright tests that call domain functions directly.
        // Removed in Task 6 when those tests become Vitest unit tests.
        window.__legacyTestApi = {
            normalizeColumns,
            normalizeTask,
            serializeBoardDataFromObject,
            normalizeRoadmapExtension
        };
```

Then update those 4 tests to call through the shim, e.g. at `tests/app.test.js:789`:

```javascript
    const columns = await page.evaluate(() => window.__legacyTestApi.normalizeColumns([
```

- [ ] **Step 5: Write vite.config.js**

```javascript
import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { outDir: 'dist' }
});
```

- [ ] **Step 6: Write vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.js']
  }
});
```

- [ ] **Step 7: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test:unit": "vitest run",
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:headed": "playwright test --headed",
    "test:debug": "playwright test --debug"
  }
}
```

- [ ] **Step 8: Point Playwright at Vite**

In `playwright.config.js`, delete the `webServerCommand` Python branch entirely and
replace the `webServer` block with:

```javascript
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true,
    timeout: 30_000
  }
```

`vite preview` serves `dist/`, so the suite now tests the built output. Run
`npm run build` before `npm test`.

- [ ] **Step 9: Update the test navigation helper**

At `tests/app.test.js:70`, change `/kanban.html` to `/`:

```javascript
async function gotoApp(page) {
  await page.goto('/');
```

Then update the 3 direct navigations (around lines 388, 770, and one other — find them
with `grep -n "kanban.html" tests/app.test.js`):

```javascript
    await page.goto('/?pb=ghost&pv=roadmap');
```

Verify none remain:

```bash
grep -c "kanban.html" tests/app.test.js
```

Expected: `0`

- [ ] **Step 10: Write the extraction script**

This is the workhorse for Tasks 2-12. It cuts named top-level functions out of
`src/legacy/main.js`, dedents them by 8 spaces, writes them to a domain module as
named exports, and adds the import back into `main.js`.

```javascript
// scripts/extract-domain.mjs
// Usage: node scripts/extract-domain.mjs <module> <fnName> [<fnName>...]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [moduleName, ...fnNames] = process.argv.slice(2);
if (!moduleName || fnNames.length === 0) {
  console.error('Usage: node scripts/extract-domain.mjs <module> <fnName>...');
  process.exit(1);
}

const MAIN = 'src/legacy/main.js';
const OUT = `src/domain/${moduleName}.js`;
const lines = readFileSync(MAIN, 'utf8').split('\n');

const extracted = [];
const warnings = [];

for (const fn of fnNames) {
  const start = lines.findIndex((l) => l.startsWith(`        function ${fn}(`));
  if (start === -1) { console.error(`NOT FOUND: ${fn}`); process.exit(1); }
  // Top-level functions close with a '}' at exactly 8 spaces of indent.
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i] === '        }') { end = i; break; }
  }
  if (end === -1) { console.error(`NO CLOSE: ${fn}`); process.exit(1); }

  const body = lines.slice(start, end + 1);
  if (body.some((l) => l.includes('`'))) {
    warnings.push(`${fn}: contains a template literal — verify dedent did not change output`);
  }
  // Dedent by exactly 8 spaces; safe because domain functions are pure logic.
  const dedented = body.map((l) => (l.startsWith('        ') ? l.slice(8) : l));
  dedented[0] = dedented[0].replace(/^function /, 'export function ');
  extracted.push(dedented.join('\n'));

  lines.splice(start, end - start + 1);
}

const header = existsSync(OUT) ? readFileSync(OUT, 'utf8').trimEnd() + '\n\n' : '';
writeFileSync(OUT, header + extracted.join('\n\n') + '\n');

// Insert the import after the existing import block at the top of main.js.
let lastImport = 0;
for (let i = 0; i < 40; i++) if (lines[i]?.startsWith('import ')) lastImport = i;
lines.splice(lastImport + 1, 0,
  `import { ${fnNames.join(', ')} } from '../domain/${moduleName}.js';`);
writeFileSync(MAIN, lines.join('\n'));

console.log(`Extracted ${fnNames.length} fn(s) to ${OUT}`);
warnings.forEach((w) => console.warn('WARN ' + w));
```

- [ ] **Step 11: Build and verify the app still works**

```bash
npm run build && npm test
```

Expected: build succeeds; all 95 Playwright tests pass.

If tests fail here, the split in Step 2 took wrong line numbers. Verify `index.html`
has no leftover `<style>`/`<script>` content and that `src/legacy/main.js` starts with
the `import` and ends with `init();` plus the shim.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "refactor: serve kanban app through Vite as an ES module

Splits the single-file kanban.html into index.html, src/styles/legacy.css,
and src/legacy/main.js with no logic changes. Adds a temporary
window.__legacyTestApi shim for the 4 Playwright tests that call domain
functions directly; removed in the board.js extraction.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract constants

**Files:**
- Create: `src/domain/constants.js`
- Modify: `src/legacy/main.js`

**Interfaces:**
- Consumes: Task 1's project structure
- Produces: named exports `BOARD_SCHEMA_VERSION`, `BOARD_APP_ID`, `BOARD_FILE_EXTENSION`,
  `DEFAULT_BOARD_TITLE`, `TASK_TITLE_MAX_LENGTH`, `EFFORT_BUCKETS`, `MAX_COLUMNS`,
  `BOARD_ARCHIVE_FILTER_VALUES`, `TEAMOS_EXTENSIONS_KEY`, `TASK_ATTACHMENTS_EXTENSIONS_KEY`,
  `ROADMAP_EXTENSION_KEY`, `ROADMAP_VERSION`, `TIMELINE_EXTENSION_KEY`, `TIMELINE_VERSION`,
  `ATTACHMENT_MAX_COUNT`, `ATTACHMENT_HARD_MAX_BYTES`, `ATTACHMENT_SOFT_WARN_BYTES`,
  `ATTACHMENT_TASK_SOFT_TOTAL_BYTES`, `ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES`,
  `PROJECT_FILE_WATCH_INTERVAL_MS`, `PROJECT_FILE_CONFLICT_SUPPRESS_MS`,
  `PROJECT_FILE_EXTERNAL_BADGE_MS`, `THEME_STORAGE_KEY`, `DEBUG_LOGS_ENABLED`,
  `CALENDAR_MONTH_NAMES`, `CALENDAR_MONTH_SHORT_NAMES`, `CALENDAR_WEEKDAY_NAMES`

- [ ] **Step 1: Create the constants module**

Cut the `const` declarations from the top of `src/legacy/main.js` (originally
`kanban.html:3674-3697` and `3749-3751`) into `src/domain/constants.js`, dedented, each
prefixed with `export`. The file begins:

```javascript
export const BOARD_SCHEMA_VERSION = 1;
export const BOARD_APP_ID = 'teamos-kanban';
export const BOARD_FILE_EXTENSION = '.json';
export const DEFAULT_BOARD_TITLE = 'Example Task Board';
export const TASK_TITLE_MAX_LENGTH = 80;
export const EFFORT_BUCKETS = ['XS', 'S', 'M', 'L', 'XL'];
export const MAX_COLUMNS = 5;
```

…continuing through `DEBUG_LOGS_ENABLED`, then the calendar name arrays:

```javascript
export const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CALENDAR_MONTH_SHORT_NAMES = CALENDAR_MONTH_NAMES.map((name) => name.slice(0, 3));
export const CALENDAR_WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```

- [ ] **Step 2: Import them back into main.js**

Add after the existing imports at the top of `src/legacy/main.js`:

```javascript
import {
    BOARD_SCHEMA_VERSION, BOARD_APP_ID, BOARD_FILE_EXTENSION, DEFAULT_BOARD_TITLE,
    TASK_TITLE_MAX_LENGTH, EFFORT_BUCKETS, MAX_COLUMNS, BOARD_ARCHIVE_FILTER_VALUES,
    TEAMOS_EXTENSIONS_KEY, TASK_ATTACHMENTS_EXTENSIONS_KEY, ROADMAP_EXTENSION_KEY,
    ROADMAP_VERSION, TIMELINE_EXTENSION_KEY, TIMELINE_VERSION, ATTACHMENT_MAX_COUNT,
    ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_SOFT_WARN_BYTES, ATTACHMENT_TASK_SOFT_TOTAL_BYTES,
    ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES, PROJECT_FILE_WATCH_INTERVAL_MS,
    PROJECT_FILE_CONFLICT_SUPPRESS_MS, PROJECT_FILE_EXTERNAL_BADGE_MS, THEME_STORAGE_KEY,
    DEBUG_LOGS_ENABLED, CALENDAR_MONTH_NAMES, CALENDAR_MONTH_SHORT_NAMES,
    CALENDAR_WEEKDAY_NAMES
} from '../domain/constants.js';
```

- [ ] **Step 3: Verify no duplicate declarations remain**

```bash
grep -c "^        const BOARD_SCHEMA_VERSION" src/legacy/main.js
```

Expected: `0`

- [ ] **Step 4: Build and test**

```bash
npm run build && npm test
```

Expected: build succeeds, 95 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: extract board and app constants to src/domain/constants.js

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Extract `util.js`

Generic helpers with no board-domain knowledge. Extracted first because everything
else may depend on them.

**Files:**
- Create: `src/domain/util.js`, `tests/unit/util.test.js`
- Modify: `src/legacy/main.js`

**Interfaces:**
- Consumes: `src/domain/constants.js`
- Produces: 19 named exports including `formatErrorMessage(error) -> string`,
  `isAbortError(error) -> boolean`, `isFileDrag(event) -> boolean`

- [ ] **Step 1: List the functions to extract**

Get the exact set from the legacy file — these are the pure functions that match none
of the domain clusters:

The complete list of all 25 `util.js` functions is in
`docs/superpowers/plans/2026-09-11-phase1-function-inventory.md` under `util.js`.
Confirm they are all still present before extracting:

```bash
grep -c "^        function " src/legacy/main.js
```

Expected: `402` (nothing extracted yet beyond constants).

- [ ] **Step 2: Write the failing test**

Create `tests/unit/util.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { formatErrorMessage, isAbortError } from '../../src/domain/util.js';

describe('formatErrorMessage', () => {
  it('returns the message from an Error', () => {
    expect(formatErrorMessage(new Error('boom'))).toBe('boom');
  });

  it('stringifies a non-Error value', () => {
    expect(typeof formatErrorMessage('plain string')).toBe('string');
  });
});

describe('isAbortError', () => {
  it('detects an AbortError by name', () => {
    const err = new Error('cancelled');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for an ordinary error', () => {
    expect(isAbortError(new Error('other'))).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — `Failed to resolve import "../../src/domain/util.js"`

- [ ] **Step 4: Extract the functions**

```bash
node scripts/extract-domain.mjs util isAbortError formatErrorMessage isFileDrag
```

Repeat for the remaining generic helpers. Heed any `WARN … template literal` output
by diffing that function's behavior before and after.

- [ ] **Step 5: Run the unit test to verify it passes**

```bash
npm run test:unit
```

Expected: PASS — 4 tests.

If an assertion fails, follow the "failing assertion" rule in Global Constraints:
verify against the pre-migration source first, then correct either the assertion or
the extraction — whichever the comparison shows is wrong.

- [ ] **Step 6: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: 95 Playwright tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract generic helpers to src/domain/util.js with unit tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Extract `task.js`

**Files:**
- Create: `src/domain/task.js`, `tests/unit/task.test.js`
- Modify: `src/legacy/main.js`

**Interfaces:**
- Consumes: `constants.js` (`EFFORT_BUCKETS`, `TASK_TITLE_MAX_LENGTH`), `util.js`
- Produces: 41 exports including `normalizeTask(task, options) -> object`,
  `normalizeEffort(value) -> 'XS'|'S'|'M'|'L'|'XL'|null`,
  `normalizePriority(value) -> 'high'|'medium'|'low'|null`,
  `normalizeAssignee(value) -> string`, `normalizeAssignees(value) -> string[]`,
  `normalizeChecklist(checklist) -> object[]`, `normalizeTags(input) -> string[]`,
  `normalizeTaskStatus(status) -> string`, `normalizeTaskBlocked(value) -> boolean`,
  `normalizeBlockerReason(value) -> string`, `parseAssigneesInput(value) -> string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/task.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  normalizeEffort, normalizePriority, normalizeAssignee, normalizeAssignees
} from '../../src/domain/task.js';

describe('normalizeEffort', () => {
  it('uppercases and trims a valid bucket', () => {
    expect(normalizeEffort('  m ')).toBe('M');
  });

  it('returns null for a value outside the bucket list', () => {
    expect(normalizeEffort('HUGE')).toBeNull();
  });

  it('returns null for null and undefined', () => {
    expect(normalizeEffort(null)).toBeNull();
    expect(normalizeEffort(undefined)).toBeNull();
  });
});

describe('normalizePriority', () => {
  it('lowercases a valid priority', () => {
    expect(normalizePriority('HIGH')).toBe('high');
  });

  it('returns null for an unknown priority', () => {
    expect(normalizePriority('urgent')).toBeNull();
  });
});

describe('normalizeAssignee', () => {
  it('trims surrounding whitespace', () => {
    expect(normalizeAssignee('  Ada  ')).toBe('Ada');
  });

  it('returns an empty string for null', () => {
    expect(normalizeAssignee(null)).toBe('');
  });
});

describe('normalizeAssignees', () => {
  it('deduplicates case-insensitively and preserves first-seen order', () => {
    expect(normalizeAssignees(['Ada', 'ada', 'Grace'])).toEqual(['Ada', 'Grace']);
  });

  it('drops empty entries', () => {
    expect(normalizeAssignees(['Ada', '  ', ''])).toEqual(['Ada']);
  });

  it('wraps a bare string into a list', () => {
    expect(normalizeAssignees('Ada')).toEqual(['Ada']);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — cannot resolve `src/domain/task.js`.

- [ ] **Step 3: Extract the functions**

```bash
node scripts/extract-domain.mjs task \
  normalizeAssignee normalizeAssignees parseAssigneesInput normalizeEffort \
  normalizePriority normalizeTask normalizeTaskStatus normalizeTaskBlocked \
  normalizeBlockerReason normalizeChecklist normalizeTags
```

Then extract the remaining task-cluster functions the same way, in batches. After each
batch run `npm run build` — an unresolved reference fails the build immediately and
tells you which function still needs moving.

- [ ] **Step 4: Add the constants import to the new module**

`src/domain/task.js` references `EFFORT_BUCKETS` and `TASK_TITLE_MAX_LENGTH`. Add at
the top of the file:

```javascript
import { EFFORT_BUCKETS, TASK_TITLE_MAX_LENGTH } from './constants.js';
```

- [ ] **Step 5: Run the unit tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS — 10 tests.

- [ ] **Step 6: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: 95 Playwright tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract task normalizers to src/domain/task.js with unit tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Extract `scoring.js`

**Files:**
- Create: `src/domain/scoring.js`, `tests/unit/scoring.test.js`
- Modify: `src/legacy/main.js`

**Interfaces:**
- Consumes: `task.js` (`normalizeEffort`, `normalizePriority`)
- Produces: `priorityRank`, `effortRank`, `priorityScoreValue(priority) -> number`,
  `effortScoreValue(effort) -> number`, `taskScore(task) -> number|null`,
  `formatTaskScore(task) -> string`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/scoring.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  priorityScoreValue, effortScoreValue, taskScore, formatTaskScore
} from '../../src/domain/scoring.js';

describe('priorityScoreValue', () => {
  it('ranks high above medium above low', () => {
    expect(priorityScoreValue('high')).toBe(3);
    expect(priorityScoreValue('medium')).toBe(2);
    expect(priorityScoreValue('low')).toBe(1);
  });

  it('returns 0 for an unknown priority', () => {
    expect(priorityScoreValue('urgent')).toBe(0);
  });
});

describe('effortScoreValue', () => {
  it('maps buckets to a fibonacci-like scale', () => {
    expect(effortScoreValue('XS')).toBe(1);
    expect(effortScoreValue('S')).toBe(2);
    expect(effortScoreValue('M')).toBe(3);
    expect(effortScoreValue('L')).toBe(5);
    expect(effortScoreValue('XL')).toBe(8);
  });

  it('normalizes case before mapping', () => {
    expect(effortScoreValue('xl')).toBe(8);
  });

  it('returns 0 for an unknown bucket', () => {
    expect(effortScoreValue('XXL')).toBe(0);
  });
});

describe('taskScore', () => {
  it('divides priority by effort', () => {
    expect(taskScore({ priority: 'high', effort: 'M' })).toBe(1);
    expect(taskScore({ priority: 'high', effort: 'XS' })).toBe(3);
  });

  it('returns null when effort is missing', () => {
    expect(taskScore({ priority: 'high', effort: null })).toBeNull();
  });

  it('returns null when priority is missing', () => {
    expect(taskScore({ priority: null, effort: 'M' })).toBeNull();
  });

  it('returns null for a null task', () => {
    expect(taskScore(null)).toBeNull();
  });
});

describe('formatTaskScore', () => {
  it('formats a score to two decimal places', () => {
    expect(formatTaskScore({ priority: 'high', effort: 'L' })).toBe('0.60');
  });

  it('renders a dash when the score is not finite', () => {
    expect(formatTaskScore({ priority: null, effort: null })).toBe('-');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — cannot resolve `src/domain/scoring.js`.

- [ ] **Step 3: Extract the functions**

```bash
node scripts/extract-domain.mjs scoring \
  priorityRank effortRank priorityScoreValue effortScoreValue taskScore formatTaskScore
```

- [ ] **Step 4: Add the task import to the new module**

At the top of `src/domain/scoring.js`:

```javascript
import { normalizeEffort, normalizePriority } from './task.js';
```

- [ ] **Step 5: Run the unit tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS — 11 tests.

- [ ] **Step 6: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: 95 Playwright tests pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract score calculation to src/domain/scoring.js with unit tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Extract `board.js` and `validation.js`, retire the test shim

The largest extraction (51 + 2 functions) and the one that lets the 4 Playwright
tests become real unit tests.

**Files:**
- Create: `src/domain/board.js`, `src/domain/validation.js`, `tests/unit/board.test.js`
- Modify: `src/legacy/main.js`, `tests/app.test.js`

**Interfaces:**
- Consumes: `constants.js`, `task.js`, `util.js`
- Produces: `normalizeColumns(inputColumns) -> {status,title}[]`,
  `validateBoardData(data) -> void` (throws on invalid),
  `normalizeBoardArchiveFilter(value) -> string`, `getBoardTagSuggestions(board) -> string[]`,
  plus `assertRequiredExtension(name, ext, label) -> void` and
  `hasRequiredExtension(name, ext) -> boolean` from `validation.js`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/board.test.js`. The first two cases are ported verbatim from the
Playwright tests at `tests/app.test.js:788` and the one following it:

```javascript
import { describe, it, expect } from 'vitest';
import { normalizeColumns, validateBoardData } from '../../src/domain/board.js';
import { BOARD_SCHEMA_VERSION, BOARD_APP_ID } from '../../src/domain/constants.js';

describe('normalizeColumns', () => {
  it('keeps valid canonical columns and removes duplicates', () => {
    expect(normalizeColumns([
      { status: 'Backlog', title: 'Ideas' },
      { status: 'todo', title: 'Ready' },
      { status: 'to-do', title: 'Duplicate todo' },
      { status: 'in-progress', title: 'Working' },
      { status: 'done', title: '' },
      { status: 'custom', title: 'Ignored custom' }
    ])).toEqual([
      { status: 'backlog', title: 'Ideas' },
      { status: 'to-do', title: 'Ready' },
      { status: 'in-progress', title: 'Working' },
      { status: 'done', title: 'Done' }
    ]);
  });

  it('falls back to defaults when no valid columns are provided', () => {
    const columns = normalizeColumns([{ status: 'custom', title: 'Nope' }]);
    expect(columns.map((c) => c.status)).toEqual(['backlog', 'to-do', 'in-progress', 'done']);
  });
});

describe('validateBoardData', () => {
  const validBoard = () => ({
    schemaVersion: BOARD_SCHEMA_VERSION,
    appId: BOARD_APP_ID,
    title: 'Test Board',
    columns: [{ status: 'backlog', title: 'Backlog' }],
    tasks: []
  });

  it('accepts a well-formed board', () => {
    expect(() => validateBoardData(validBoard())).not.toThrow();
  });

  it('rejects a board with the wrong appId', () => {
    expect(() => validateBoardData({ ...validBoard(), appId: 'other-app' })).toThrow();
  });

  it('rejects a board with an unsupported schemaVersion', () => {
    expect(() => validateBoardData({ ...validBoard(), schemaVersion: 999 })).toThrow();
  });

  it('rejects a null board', () => {
    expect(() => validateBoardData(null)).toThrow();
  });
});
```

The exact expected `normalizeColumns` output above is copied from the existing
Playwright assertion. If it differs, trust `tests/app.test.js` — it is the oracle.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — cannot resolve `src/domain/board.js`.

- [ ] **Step 3: Extract validation.js first**

```bash
node scripts/extract-domain.mjs validation hasRequiredExtension assertRequiredExtension
```

- [ ] **Step 4: Extract board.js**

```bash
node scripts/extract-domain.mjs board \
  normalizeColumns validateBoardData normalizeBoardArchiveFilter getBoardTagSuggestions
```

Then extract the remaining board-cluster functions in batches, running
`npm run build` after each to surface unresolved references.

- [ ] **Step 5: Add imports to the new module**

At the top of `src/domain/board.js`:

```javascript
import { BOARD_SCHEMA_VERSION, BOARD_APP_ID, MAX_COLUMNS, BOARD_ARCHIVE_FILTER_VALUES, TASK_TITLE_MAX_LENGTH } from './constants.js';
import { normalizeTask, normalizeTaskStatus } from './task.js';
```

Trim this list to what `board.js` actually references — an unused import is a lint
smell, and the build will not catch it.

- [ ] **Step 6: Run the unit tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS — 6 new tests.

- [ ] **Step 7: Delete the 4 superseded Playwright tests and the shim**

Remove these 4 tests from `tests/app.test.js` — they are now covered by Vitest:
- `normalizeColumns keeps valid canonical columns and removes duplicates`
- `normalizeColumns falls back to defaults when no valid columns are provided`
- `legacy assignee strings are accepted and serialize as assignee lists`
- `roadmap schema normalizes roadmap entities and task assignment ids`

Port the last two into `tests/unit/task.test.js` and `tests/unit/roadmap.test.js`
respectively, keeping their existing assertions. (`roadmap.test.js` is created here
with just that case; Task 10 adds to it.)

Then delete the shim from the end of `src/legacy/main.js` — the whole
`window.__legacyTestApi = { … };` block and its comment.

Verify it is gone:

```bash
grep -c "__legacyTestApi" src/legacy/main.js tests/app.test.js
```

Expected: `0` for both files.

- [ ] **Step 8: Build and run both suites**

```bash
npm run build && npm run test:unit && npm test
```

Expected: unit tests pass; **91** Playwright tests pass (95 minus the 4 removed).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: extract board schema and validation to src/domain

Moves normalizeColumns, validateBoardData and the board cluster into
src/domain/board.js and src/domain/validation.js. Converts the 4 Playwright
tests that called domain functions via page.evaluate into Vitest unit tests
and removes the temporary window.__legacyTestApi shim.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Tasks 7-11: Remaining domain modules

These five follow the identical shape as Tasks 3-6. For each: write the failing Vitest
test, run it to confirm it fails, extract with `scripts/extract-domain.mjs`, add the
module's imports, confirm the unit test passes, run `npm run build && npm test` to
confirm 91 Playwright tests still pass, commit.

**Do not batch these into one commit.** Each module is independently reviewable and an
independent rollback point.

### Task 7: `src/domain/serialize.js` (7 fns)

- Functions: `hashTextContent`, `serializeBoardDataFromObject`, `getBoardExtensionsObject`,
  `normalizeBoardExtensionsValue`. **Full list:** see the function inventory for this module.
- Consumes: `constants.js`, `board.js`, `task.js`
- Test focus: round-trip a board through `serializeBoardDataFromObject` and assert
  `validateBoardData` accepts the result; assert `schemaVersion` is `1` and `appId` is
  `teamos-kanban` on output; assert `hashTextContent` is stable for identical input and
  differs for different input.
- **Watch for template literals** — this module builds JSON strings.

### Task 8: `src/domain/attachments.js` (16 fns)

- Functions: `normalizeTaskAttachments`, `attachmentTaskKey`, `getTaskAttachmentsMap`,
  `createAttachmentId`, `classifyAttachmentKind`, `estimateAttachmentDataUrlSizeBytes`,
  `attachmentDuplicateKey`, `normalizeAttachmentRecord`, `getLegacyTaskAttachmentsFromExtensions`,
  `getTaskAttachments`, `setTaskAttachments`, `removeLegacyTaskAttachmentsFromExtensions`,
  `stripLegacyTaskAttachmentsFromExtensions`, `calculateBoardAttachmentBytes`,
  `getTaskModalAttachmentDerivedMessages`, `handleTaskAttachmentsEditorClick` (all 16)
- Consumes: `constants.js` (the five `ATTACHMENT_*` limits), `util.js`
- Test focus: `estimateAttachmentDataUrlSizeBytes` against a known small data URL;
  `classifyAttachmentKind` for an image vs a non-image MIME type;
  `normalizeAttachmentRecord` rejecting a record over `ATTACHMENT_HARD_MAX_BYTES`.
- **Note:** `handleTaskAttachmentsEditorClick` classified as pure but is named as a
  handler. Inspect it first — if it touches the DOM, leave it in `main.js` for Phase 2
  and extract the other 15.

### Task 9: `src/domain/calendar.js` (36 fns)

- Functions: `formatLocalIsoDate`, `todayLocalIsoDate`, `formatDueDateForUi`,
  `normalizeDueDate`, `normalizeTimestamp`. **Full list:** see the function inventory for this module.
- Consumes: `constants.js` (`CALENDAR_MONTH_NAMES`, `CALENDAR_MONTH_SHORT_NAMES`,
  `CALENDAR_WEEKDAY_NAMES`)
- Test focus: `formatLocalIsoDate` returns `YYYY-MM-DD` for a fixed local date;
  `todayLocalIsoDate` matches that format; `normalizeDueDate` rejects malformed input
  and accepts a valid ISO date.
- **Timezone caution:** these are *local*-date functions. Pin the timezone so results
  are reproducible — add `process.env.TZ = 'UTC'` at the top of the test file, or set
  `TZ=UTC` in the `test:unit` script.

### Task 10: `src/domain/roadmap.js` (40 fns)

- Functions: `normalizeRoadmapRef`, `normalizeRoadmapDate`, `normalizeRoadmapItems`,
  `normalizeRoadmapExtension`, `createEmptyRoadmapExtension`, `getRoadmapExtensionObject`,
  `formatRoadmapDateRange`, `parseRoadmapIsoDate`, `addRoadmapDays`, `getRoadmapDayDiff`,
  `getRoadmapItemDateBounds`, `compareRoadmapItemsByDate`. **Full list:** see the function inventory for this module.
- Consumes: `constants.js` (`ROADMAP_EXTENSION_KEY`, `ROADMAP_VERSION`), `calendar.js`
- Test focus: the roadmap-schema case ported from `tests/app.test.js` in Task 6;
  `addRoadmapDays` across a month boundary; `getRoadmapDayDiff` for a known range;
  `normalizeRoadmapExtension` stamping `version` as `ROADMAP_VERSION`.

### Task 11: `src/domain/timeline.js` (32 fns)

- Functions: `getBoardTimelineData`, `getTimelineSelectionIndex`,
  `clearPortfolioTimelineSelection`, `normalizeTimelineEvent`, `normalizeTimelineChanges`,
  `normalizeTimelineExtension`. **Full list:** see the function inventory for this module.
- Consumes: `constants.js` (`TIMELINE_EXTENSION_KEY`, `TIMELINE_VERSION`), `calendar.js`
- Test focus: `normalizeTimelineEvent` filling defaults for a sparse event;
  `normalizeTimelineExtension` stamping `version` as `TIMELINE_VERSION`;
  `normalizeTimelineChanges` dropping malformed entries.
- **Note:** `clearPortfolioTimelineSelection` sounds stateful. If it mutates a module
  global, it belongs in the Phase 2 store, not here — leave it in `main.js`.

---

### Task 12: Extract the persistence layer

**Files:**
- Create: `src/persistence/boardRepository.js`, `src/persistence/fileSystem.js`,
  `tests/unit/boardRepository.test.js`
- Modify: `src/legacy/main.js`

**Interfaces:**
- Consumes: `domain/board.js` (`validateBoardData`), `domain/serialize.js`
  (`serializeBoardDataFromObject`, `hashTextContent`), `domain/validation.js`
  (`assertRequiredExtension`), `domain/util.js` (`formatErrorMessage`)
- Produces: `BoardRepository` object with `serialize`, `validate`, `readHandleFileMeta`,
  `readFileSnapshot`, `readHandleSnapshot`, `saveRecord`, `createRecordFromFile`,
  `createRecordFromHandle`, `importFromHandles`, `importFromLooseFiles`; plus
  `writeJsonToFileHandle(handle, payload)` from `fileSystem.js`

`fileWatch` is **deliberately excluded** — it coordinates through mutable globals and
timers, so it becomes store logic in Phase 2 rather than a Phase 1 module. The spec
flags it as the highest-risk area.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/boardRepository.test.js`. `BoardRepository` touches File System
Access handles, so test with fakes:

```javascript
import { describe, it, expect } from 'vitest';
import { BoardRepository } from '../../src/persistence/boardRepository.js';
import { BOARD_SCHEMA_VERSION, BOARD_APP_ID } from '../../src/domain/constants.js';

const validBoard = {
  schemaVersion: BOARD_SCHEMA_VERSION,
  appId: BOARD_APP_ID,
  title: 'Test Board',
  columns: [{ status: 'backlog', title: 'Backlog' }],
  tasks: []
};

const fakeFile = (name, contents) => ({
  name,
  lastModified: 1700000000000,
  size: contents.length,
  text: async () => contents
});

describe('BoardRepository.readFileSnapshot', () => {
  it('parses a valid board and reports file metadata', async () => {
    const file = fakeFile('demo.board.json', JSON.stringify(validBoard));
    const { parsed, fileMeta } = await BoardRepository.readFileSnapshot(file);

    expect(parsed.appId).toBe(BOARD_APP_ID);
    expect(fileMeta.lastModified).toBe(1700000000000);
    expect(typeof fileMeta.textHash).toBe('string');
  });

  it('rejects a file whose contents fail validation', async () => {
    const file = fakeFile('bad.board.json', JSON.stringify({ appId: 'wrong' }));
    await expect(BoardRepository.readFileSnapshot(file)).rejects.toThrow();
  });
});

describe('BoardRepository.createRecordFromFile', () => {
  it('rejects a file without the .board.json extension', async () => {
    const file = fakeFile('notes.txt', JSON.stringify(validBoard));
    await expect(BoardRepository.createRecordFromFile({ file })).rejects.toThrow();
  });
});

describe('BoardRepository.readHandleFileMeta', () => {
  it('rejects a handle that cannot produce a file', async () => {
    await expect(BoardRepository.readHandleFileMeta(null)).rejects.toThrow(
      'Project file handle is not readable.'
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:unit
```

Expected: FAIL — cannot resolve `src/persistence/boardRepository.js`.

- [ ] **Step 3: Move the File System Access helpers**

Cut `writeJsonToFileHandle` and its sibling FSA wrappers from `src/legacy/main.js`
into `src/persistence/fileSystem.js`, dedented, as named exports.

- [ ] **Step 4: Move BoardRepository**

Cut the whole `const BoardRepository = { … };` object (originally `kanban.html:5527`
onward) from `src/legacy/main.js` into `src/persistence/boardRepository.js`. Change
the declaration to `export const BoardRepository = {` and add at the top:

```javascript
import { validateBoardData } from '../domain/board.js';
import { serializeBoardDataFromObject, hashTextContent } from '../domain/serialize.js';
import { assertRequiredExtension } from '../domain/validation.js';
import { formatErrorMessage } from '../domain/util.js';
import { BOARD_FILE_EXTENSION } from '../domain/constants.js';
import { writeJsonToFileHandle } from './fileSystem.js';
```

`createPortfolioRecord` is referenced by `BoardRepository` — if it is still in
`main.js`, move it to `src/domain/board.js` and import it here.

- [ ] **Step 5: Import BoardRepository back into main.js**

```javascript
import { BoardRepository } from '../persistence/boardRepository.js';
```

- [ ] **Step 6: Run the unit tests to verify they pass**

```bash
npm run test:unit
```

Expected: PASS — 4 new tests.

- [ ] **Step 7: Build and run the full suite**

```bash
npm run build && npm test
```

Expected: 91 Playwright tests pass. This task carries the highest regression risk in
Phase 1 — the FSA stubbing harness in `tests/app.test.js` exercises these paths
heavily. If anything fails, the cause is almost certainly a missed import.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: extract BoardRepository and file I/O to src/persistence

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Tailwind toolchain, docs, and Phase 1 close-out

**Files:**
- Create: `tailwind.config.js`, `postcss.config.js`
- Modify: `src/styles/legacy.css`, `README.md`, `package.json`

**Interfaces:**
- Consumes: everything above
- Produces: a working Tailwind pipeline that is inert against the legacy CSS

- [ ] **Step 1: Install Tailwind**

```bash
npm install --save-dev tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0
```

- [ ] **Step 2: Write tailwind.config.js with preflight disabled**

Preflight is Tailwind's CSS reset. Enabling it against the 3,190 lines of existing
bespoke CSS would break the app's styling immediately. It stays off until Phase 2
retires the legacy stylesheet.

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {}
  },
  plugins: []
};
```

- [ ] **Step 3: Write postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 4: Add the Tailwind directives**

At the very top of `src/styles/legacy.css`, above the existing rules:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

With `preflight: false`, `@tailwind base` emits only custom-property definitions — no
reset — so existing styles are untouched.

- [ ] **Step 5: Prove the pipeline works, then confirm nothing regressed**

Temporarily add `class="mt-0"` to the `<body>` tag in `index.html`, then:

```bash
npm run build && grep -c "\.mt-0" dist/assets/*.css
```

Expected: `1` or more — Tailwind is generating utilities.

Remove the temporary class, then:

```bash
npm run build && npm test
```

Expected: 91 Playwright tests pass — Tailwind changed no existing styling.

- [ ] **Step 6: Update the README**

The README currently describes a single-file app opened directly in a browser and
lists Python 3 as a test prerequisite. Both are now wrong. Rewrite:

- Replace "A minimalist single-file Kanban app built with plain HTML, CSS, and
  JavaScript (`kanban.html`)" with a description of the Vite project.
- Replace the "Internal architecture (single-file, layered)" section with the real
  `src/` layout: `domain/`, `persistence/`, `legacy/`, `styles/`.
- Replace the "Run" section (`Open kanban.html directly`) with `npm install` then
  `npm run dev`.
- Delete Python 3 from the test prerequisites.
- Document `npm run test:unit` alongside `npm test`.
- Note that `src/legacy/main.js` is a temporary home for UI code pending Phase 2.

- [ ] **Step 7: Verify the Phase 1 exit criteria**

```bash
npm run build && npm run test:unit && npm test
echo "--- functions still in legacy ---"
grep -c "^        function " src/legacy/main.js
echo "--- domain modules ---"
ls src/domain/ src/persistence/
```

Expected: both suites green; the legacy function count is down from 402 to
approximately 149 (89 UI + 60 stateful); `src/domain/` holds 11 modules and
`src/persistence/` holds 2.

The stateful and UI functions remaining in `main.js` are Phase 2's scope. **Phase 1 is
complete when the domain functions are out, not when `main.js` is empty.**

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build: add Tailwind pipeline and update docs for the Vite project

Installs Tailwind with preflight disabled so it stays inert against the
existing bespoke CSS until Phase 2 retires it. Rewrites the README, which
still described a single-file app and a Python test dependency.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Phase 1 Definition of Done

- [ ] 253 pure functions live in `src/domain/*.js` as named exports
- [ ] `BoardRepository` and FSA helpers live in `src/persistence/*.js`
- [ ] Vitest suite covers every extracted module
- [ ] 91 Playwright tests pass (95 minus the 4 converted to Vitest)
- [ ] `npm run dev` and `npm run build` both work
- [ ] Tailwind is installed and generating utilities, inert against legacy CSS
- [ ] `window.__legacyTestApi` shim is gone
- [ ] README describes the Vite project, not the single-file app
- [ ] No behavior changed — no feature added, removed, or altered

**Next:** Phase 2 requires its own design spec before planning. Write it once Phase 1
lands, informed by what the extraction revealed about real data dependencies.
