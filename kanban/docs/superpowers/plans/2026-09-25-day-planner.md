# Day Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Day Planner" portfolio view where tasks from any loaded project are dragged onto a 15-minute time grid (Day or Mon–Fri Week), moved, and resized, with the plan stored in each project's JSON under `extensions.dayPlanner`.

**Architecture:** Pure rules (time math, normalization, gestures, overlap layout) live in `src/domain/dayPlanner.ts` and are hooked into board serialization. A query builds a `PlannerViewModel` from the store. Commands add, update, and remove blocks through the existing `runPortfolioBoardMutation` write path, with undo. React components under `src/features/portfolio/planner/` render the tray and grid. `@dnd-kit` handles dragging from the tray to the grid. A small pointer hook handles moving and resizing blocks.

**Tech Stack:** React 19, TypeScript, Zustand, `@dnd-kit/core`, Vitest (node environment, `tests/unit/**`), Playwright (`tests/e2e/**`).

**Spec:** `docs/superpowers/specs/2026-09-25-day-planner-design.md`

## Global Constraints

- Grid window 07:00–21:00; working hours 09:00–17:00 (shaded outside).
- Slot size 15 minutes; all start/end times are on the 15-minute grid; minimum block length 15 minutes.
- A dropped task always creates a 1-hour block (clamped so it ends by 21:00).
- Week mode shows Monday–Friday only.
- `Today` jumps to today and keeps the current Day/Week mode; `‹ ›` step 1 day (Day) or 1 week (Week).
- Only tasks can be scheduled — no free blocks.
- Scheduling never changes any task field (status included).
- A task may appear in any number of blocks.
- Planner edits do **not** append timeline events.
- Stored shape: `extensions.dayPlanner = { version: 1, blocks: [{ id, taskId, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM" }] }`; the key is removed when there are no blocks.
- Every user-visible string goes through `src/shared/i18n.ts` with both `en` and `pt` entries.
- Follow `ARCHITECTURE.md`: domain code has no React, Zustand, or browser globals.
- 4-space indentation in `src/`, 2-space in `tests/` (match the surrounding files).

## File Map

| File | Status | Responsibility |
| --- | --- | --- |
| `src/domain/types.ts` | modify | `DayPlanBlock`, `DayPlannerExtension`, `BoardExtensions.dayPlanner` |
| `src/domain/constants.ts` | modify | `DAY_PLANNER_EXTENSION_KEY`, `DAY_PLANNER_VERSION` |
| `src/domain/dayPlanner.ts` | create | time math, dates, gestures, normalization, read/write, overlap layout |
| `src/domain/serialize.ts` | modify | normalize `dayPlanner` with the task id set |
| `src/domain/board.ts` | modify | `normalizePortfolioViewMode` accepts `'planner'` |
| `src/features/portfolio/types.ts` | modify | `'planner'` view mode, `PlannerMode` |
| `src/features/portfolio/state/slices.ts` | modify | `portfolioPlannerDate`, `portfolioPlannerMode` |
| `src/features/portfolio/commands/portfolioControls.ts` | modify | planner navigation actions |
| `src/features/portfolio/commands/portfolioNavigation.ts` | modify | `pv=planner` URL state |
| `src/features/portfolio/queries/portfolioPlannerViews.ts` | create | `buildPortfolioPlannerViewModel` |
| `src/features/portfolio/queries/index.ts` | modify | export the planner query |
| `src/features/portfolio/commands/plannerCommands.ts` | create | add / update / remove block + undo |
| `src/features/portfolio/commands/taskCommands.ts` | modify | expose `showUndo` |
| `src/features/portfolio/commands/portfolioCommands.ts` | modify | wire planner actions |
| `src/features/portfolio/planner/PortfolioPlanner.tsx` | create | view shell, header, DnD context |
| `src/features/portfolio/planner/PlannerTray.tsx` | create | status chips + draggable task cards |
| `src/features/portfolio/planner/PlannerGrid.tsx` | create | hour axis, day columns, now line, blocks |
| `src/features/portfolio/planner/PlannerBlock.tsx` | create | one block: render, keyboard, gesture start |
| `src/features/portfolio/planner/usePlannerBlockGesture.ts` | create | pointer move/resize hook |
| `src/features/portfolio/planner/plannerGeometry.ts` | create | px ⇄ minutes constants/helpers shared by grid + DnD |
| `src/features/portfolio/shell/PortfolioControls.tsx` | modify | "Day Planner" toolbar button |
| `src/app/App.tsx` | modify | mount `PortfolioPlanner` |
| `src/shared/i18n.ts` | modify | `planner.*` strings, `formatPlannerDateLabel` |
| `src/styles/portfolio/planner.css` | create | planner styles |
| `src/styles/app.css` | modify | import `planner.css` |
| `tests/unit/dayPlanner.test.ts` | create | domain tests |
| `tests/unit/plannerViews.test.ts` | create | query tests |
| `tests/unit/plannerCommands.test.ts` | create | command tests |
| `tests/unit/portfolioControls.test.ts` | modify | planner control tests |
| `tests/e2e/planner.test.ts` | create | end-to-end planner tests |

Commands used throughout:

- Unit: `npx vitest run tests/unit/<file>.test.ts`
- E2E: `npx playwright test tests/e2e/planner.test.ts`
- Types: `npm run typecheck`
- Lint: `npm run lint`

---

### Task 1: Domain time, date and gesture rules

**Files:**
- Modify: `src/domain/types.ts` (after `TimelineExtension`, and in `BoardExtensions`)
- Modify: `src/domain/constants.ts` (after `TIMELINE_VERSION`)
- Create: `src/domain/dayPlanner.ts`
- Test: `tests/unit/dayPlanner.test.ts`

**Interfaces:**
- Produces (from `@/domain/dayPlanner`):
  - constants `PLANNER_SLOT_MINUTES = 15`, `PLANNER_DAY_START = 420`, `PLANNER_DAY_END = 1260`, `PLANNER_WORK_START = 540`, `PLANNER_WORK_END = 1020`, `PLANNER_DEFAULT_BLOCK_MINUTES = 60`
  - `type PlannerBlockTimes = Pick<DayPlanBlock, 'date' | 'start' | 'end'>`
  - `type PlannerGestureMode = 'move' | 'resize-start' | 'resize-end'`
  - `parsePlannerTime(value: unknown): number | null`
  - `plannerMinutes(value: string): number`
  - `formatPlannerTime(minutes: number): string`
  - `formatPlannerDuration(minutes: number): string`
  - `snapPlannerMinutes(minutes: number): number`
  - `clampPlannerStart(start: number, duration: number): number`
  - `minutesAtPlannerOffset(offsetPx: number, slotPx: number): number`
  - `createPlannerBlockTimes(startMinutes: number): { start: string; end: string }`
  - `applyPlannerGesture(times: PlannerBlockTimes, mode: PlannerGestureMode, deltaMinutes: number, targetDate?: string): PlannerBlockTimes`
  - `shiftPlannerDate(isoDate: string, days: number): string`
  - `getPlannerWeekDates(isoDate: string): string[]`
- Produces (from `@/domain/types`): `DayPlanBlock`, `DayPlannerExtension`
- Produces (from `@/domain/constants`): `DAY_PLANNER_EXTENSION_KEY = 'dayPlanner'`, `DAY_PLANNER_VERSION = 1`

- [ ] **Step 1: Add the types and constants**

In `src/domain/types.ts`, after the `TimelineExtension` type:

```ts
// A task scheduled on the day planner. Times are local "HH:MM" on the
// 15-minute grid; the block belongs to the project file that owns the task.
export type DayPlanBlock = {
    id: string;
    taskId: number;
    date: string;
    start: string;
    end: string;
};
export type DayPlannerExtension = {
    version: number;
    blocks: DayPlanBlock[];
};
```

In the same file, add the `dayPlanner` entry to `BoardExtensions`:

```ts
export type BoardExtensions = {
    [key: string]: unknown;
    roadmap?: RoadmapExtension;
    timeline?: TimelineExtension;
    dayPlanner?: DayPlannerExtension;
    teamOsKanban?: TeamOsExtensions;
};
```

In `src/domain/constants.ts`, after `export const TIMELINE_VERSION = 1;`:

```ts
export const DAY_PLANNER_EXTENSION_KEY = 'dayPlanner';
export const DAY_PLANNER_VERSION = 1;
```

- [ ] **Step 2: Write the failing tests**

Create `tests/unit/dayPlanner.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  PLANNER_DAY_END,
  PLANNER_DAY_START,
  applyPlannerGesture,
  clampPlannerStart,
  createPlannerBlockTimes,
  formatPlannerDuration,
  formatPlannerTime,
  getPlannerWeekDates,
  minutesAtPlannerOffset,
  parsePlannerTime,
  shiftPlannerDate,
  snapPlannerMinutes
} from '../../src/domain/dayPlanner';

describe('parsePlannerTime', () => {
  it('parses on-grid times inside the 07:00–21:00 window', () => {
    expect(parsePlannerTime('07:00')).toBe(420);
    expect(parsePlannerTime('09:45')).toBe(585);
    expect(parsePlannerTime('21:00')).toBe(1260);
  });

  it('rejects malformed, off-grid and out-of-window values', () => {
    expect(parsePlannerTime('9:00')).toBeNull();
    expect(parsePlannerTime('09:10')).toBeNull();
    expect(parsePlannerTime('06:45')).toBeNull();
    expect(parsePlannerTime('21:15')).toBeNull();
    expect(parsePlannerTime('24:00')).toBeNull();
    expect(parsePlannerTime(900)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats minutes as HH:MM', () => {
    expect(formatPlannerTime(420)).toBe('07:00');
    expect(formatPlannerTime(1005)).toBe('16:45');
  });

  it('formats durations compactly', () => {
    expect(formatPlannerDuration(45)).toBe('45m');
    expect(formatPlannerDuration(60)).toBe('1h');
    expect(formatPlannerDuration(210)).toBe('3h 30m');
    expect(formatPlannerDuration(0)).toBe('0m');
  });
});

describe('snapping and clamping', () => {
  it('snaps to the nearest 15 minutes', () => {
    expect(snapPlannerMinutes(547)).toBe(540);
    expect(snapPlannerMinutes(548)).toBe(555);
  });

  it('keeps a block of the given duration inside the window', () => {
    expect(clampPlannerStart(400, 60)).toBe(PLANNER_DAY_START);
    expect(clampPlannerStart(1230, 60)).toBe(PLANNER_DAY_END - 60);
    expect(clampPlannerStart(601, 60)).toBe(600);
  });

  it('maps a pixel offset in a day column to the slot under it', () => {
    expect(minutesAtPlannerOffset(0, 24)).toBe(420);
    expect(minutesAtPlannerOffset(23, 24)).toBe(420);
    expect(minutesAtPlannerOffset(24, 24)).toBe(435);
    expect(minutesAtPlannerOffset(-10, 24)).toBe(420);
  });

  it('creates a 1-hour block that ends by 21:00', () => {
    expect(createPlannerBlockTimes(600)).toEqual({ start: '10:00', end: '11:00' });
    expect(createPlannerBlockTimes(1245)).toEqual({ start: '20:00', end: '21:00' });
  });
});

describe('applyPlannerGesture', () => {
  const block = { date: '2026-09-25', start: '09:00', end: '10:00' };

  it('moves keeping the duration, snapping and clamping', () => {
    expect(applyPlannerGesture(block, 'move', 37)).toEqual({ date: '2026-09-25', start: '09:30', end: '10:30' });
    expect(applyPlannerGesture(block, 'move', -500)).toEqual({ date: '2026-09-25', start: '07:00', end: '08:00' });
    expect(applyPlannerGesture(block, 'move', 15, '2026-09-24')).toEqual({ date: '2026-09-24', start: '09:15', end: '10:15' });
  });

  it('resizes the start without passing the end', () => {
    expect(applyPlannerGesture(block, 'resize-start', -30)).toEqual({ date: '2026-09-25', start: '08:30', end: '10:00' });
    expect(applyPlannerGesture(block, 'resize-start', 120)).toEqual({ date: '2026-09-25', start: '09:45', end: '10:00' });
  });

  it('resizes the end without passing the start or the window', () => {
    expect(applyPlannerGesture(block, 'resize-end', 45)).toEqual({ date: '2026-09-25', start: '09:00', end: '10:45' });
    expect(applyPlannerGesture(block, 'resize-end', -120)).toEqual({ date: '2026-09-25', start: '09:00', end: '09:15' });
    expect(applyPlannerGesture(block, 'resize-end', 1000)).toEqual({ date: '2026-09-25', start: '09:00', end: '21:00' });
  });

  it('ignores the target date for resizes', () => {
    expect(applyPlannerGesture(block, 'resize-end', 15, '2026-09-24').date).toBe('2026-09-25');
  });
});

describe('planner dates', () => {
  it('shifts ISO dates across month boundaries', () => {
    expect(shiftPlannerDate('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftPlannerDate('2026-10-01', -7)).toBe('2026-09-24');
  });

  it('returns Monday–Friday of the week containing the date', () => {
    const week = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'];
    expect(getPlannerWeekDates('2026-09-25')).toEqual(week);
    expect(getPlannerWeekDates('2026-09-21')).toEqual(week);
    expect(getPlannerWeekDates('2026-09-27')).toEqual(week);
  });

  it('returns an empty week for an invalid date', () => {
    expect(getPlannerWeekDates('nope')).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/dayPlanner.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/domain/dayPlanner"`.

- [ ] **Step 4: Implement `src/domain/dayPlanner.ts`**

```ts
// Day planner rules: the 15-minute time grid, block gestures and planner dates.
// Times are minutes since midnight; stored values are "HH:MM" strings.

import type { DayPlanBlock } from './types';
import { parseRoadmapIsoDate } from './roadmap';

export const PLANNER_SLOT_MINUTES = 15;
export const PLANNER_DAY_START = 7 * 60;
export const PLANNER_DAY_END = 21 * 60;
export const PLANNER_WORK_START = 9 * 60;
export const PLANNER_WORK_END = 17 * 60;
export const PLANNER_DEFAULT_BLOCK_MINUTES = 60;

export type PlannerBlockTimes = Pick<DayPlanBlock, 'date' | 'start' | 'end'>;
export type PlannerGestureMode = 'move' | 'resize-start' | 'resize-end';

// Minutes for an on-grid "HH:MM" inside the planner window, otherwise null.
export function parsePlannerTime(value: unknown): number | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    const total = hours * 60 + minutes;
    if (total % PLANNER_SLOT_MINUTES !== 0) return null;
    if (total < PLANNER_DAY_START || total > PLANNER_DAY_END) return null;
    return total;
}

// For values already normalized; falls back to the start of the window.
export function plannerMinutes(value: string): number {
    return parsePlannerTime(value) ?? PLANNER_DAY_START;
}

export function formatPlannerTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatPlannerDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `${rest}m`;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function snapPlannerMinutes(minutes: number): number {
    return Math.round(minutes / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_MINUTES;
}

// The snapped start that keeps a block of `duration` inside the window.
export function clampPlannerStart(start: number, duration: number): number {
    return Math.max(PLANNER_DAY_START, Math.min(PLANNER_DAY_END - duration, snapPlannerMinutes(start)));
}

// The slot under a vertical pixel offset from the top of a day column.
export function minutesAtPlannerOffset(offsetPx: number, slotPx: number): number {
    const slot = Math.max(0, Math.floor(offsetPx / slotPx));
    return PLANNER_DAY_START + slot * PLANNER_SLOT_MINUTES;
}

export function createPlannerBlockTimes(startMinutes: number): { start: string; end: string } {
    const start = clampPlannerStart(startMinutes, PLANNER_DEFAULT_BLOCK_MINUTES);
    return { start: formatPlannerTime(start), end: formatPlannerTime(start + PLANNER_DEFAULT_BLOCK_MINUTES) };
}

// New times for a block after dragging it (`move`) or one of its edges.
// `targetDate` only applies to moves.
export function applyPlannerGesture(
    times: PlannerBlockTimes,
    mode: PlannerGestureMode,
    deltaMinutes: number,
    targetDate: string = times.date
): PlannerBlockTimes {
    const start = plannerMinutes(times.start);
    const end = plannerMinutes(times.end);
    const delta = snapPlannerMinutes(deltaMinutes);
    if (mode === 'move') {
        const duration = end - start;
        const nextStart = clampPlannerStart(start + delta, duration);
        return { date: targetDate, start: formatPlannerTime(nextStart), end: formatPlannerTime(nextStart + duration) };
    }
    if (mode === 'resize-start') {
        const nextStart = Math.max(PLANNER_DAY_START, Math.min(end - PLANNER_SLOT_MINUTES, start + delta));
        return { date: times.date, start: formatPlannerTime(nextStart), end: times.end };
    }
    const nextEnd = Math.min(PLANNER_DAY_END, Math.max(start + PLANNER_SLOT_MINUTES, end + delta));
    return { date: times.date, start: times.start, end: formatPlannerTime(nextEnd) };
}

export function shiftPlannerDate(isoDate: string, days: number): string {
    const date = parseRoadmapIsoDate(isoDate);
    if (!date) return isoDate;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

// Monday–Friday of the week that contains `isoDate`.
export function getPlannerWeekDates(isoDate: string): string[] {
    const date = parseRoadmapIsoDate(isoDate);
    if (!date) return [];
    const mondayOffset = (date.getUTCDay() + 6) % 7;
    const monday = shiftPlannerDate(isoDate, -mondayOffset);
    return [0, 1, 2, 3, 4].map((day) => shiftPlannerDate(monday, day));
}
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/dayPlanner.test.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/constants.ts src/domain/dayPlanner.ts tests/unit/dayPlanner.test.ts
git commit -m "feat(planner): add day planner time and date rules"
```

---

### Task 2: Stored blocks — normalization, read/write, serialization

**Files:**
- Modify: `src/domain/dayPlanner.ts`
- Modify: `src/domain/serialize.ts`
- Test: `tests/unit/dayPlanner.test.ts` (append)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (from `@/domain/dayPlanner`):
  - `normalizeDayPlannerBlock(value: unknown, taskIds?: ReadonlySet<number>): DayPlanBlock | null`
  - `normalizeDayPlannerExtension(value: unknown, taskIds?: ReadonlySet<number>): DayPlannerExtension | null`
  - `getDayPlannerBlocks(boardData: LooseBoardData | null | undefined): DayPlanBlock[]`
  - `setDayPlannerBlocks(boardData: LooseBoardData, blocks: DayPlanBlock[]): void`
  - `createDayPlanBlockId(): string`
- Produces (from `@/domain/serialize`): `normalizeBoardExtensionsValue(value, { includeTimeline?, taskIds? })`. `serializeBoardDataFromObject` and `createBoardStateSnapshot` drop blocks whose task is missing.

- [ ] **Step 1: Append the failing tests**

Add these imports to the top of `tests/unit/dayPlanner.test.ts` (merge into the existing import from `dayPlanner`):

```ts
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import {
  createDayPlanBlockId,
  getDayPlannerBlocks,
  normalizeDayPlannerBlock,
  normalizeDayPlannerExtension,
  setDayPlannerBlocks
} from '../../src/domain/dayPlanner';
```

Append:

```ts
const validBlock = { id: 'blk-1', taskId: 1, date: '2026-09-25', start: '09:00', end: '10:00' };

describe('normalizeDayPlannerBlock', () => {
  it('keeps a valid block', () => {
    expect(normalizeDayPlannerBlock(validBlock)).toEqual(validBlock);
  });

  it.each([
    ['missing id', { ...validBlock, id: '' }],
    ['non-integer task id', { ...validBlock, taskId: 'x' }],
    ['bad date', { ...validBlock, date: '2026-02-30' }],
    ['off-grid time', { ...validBlock, start: '09:05' }],
    ['outside the window', { ...validBlock, end: '21:15' }],
    ['end before start', { ...validBlock, start: '10:00', end: '09:00' }],
    ['zero length', { ...validBlock, end: '09:00' }],
    ['not an object', 'blk']
  ])('drops a block with %s', (_label, value) => {
    expect(normalizeDayPlannerBlock(value)).toBeNull();
  });

  it('drops a block whose task is not in the given id set', () => {
    expect(normalizeDayPlannerBlock(validBlock, new Set([2]))).toBeNull();
    expect(normalizeDayPlannerBlock(validBlock, new Set([1]))).toEqual(validBlock);
  });
});

describe('normalizeDayPlannerExtension', () => {
  it('keeps valid blocks, drops invalid ones and duplicate ids', () => {
    const result = normalizeDayPlannerExtension({
      version: 1,
      blocks: [validBlock, { ...validBlock, start: 'bad' }, { ...validBlock, start: '11:00', end: '12:00' }]
    });
    expect(result).toEqual({ version: 1, blocks: [validBlock] });
  });

  it('returns null for a wrong version, a non-object or no remaining blocks', () => {
    expect(normalizeDayPlannerExtension({ version: 2, blocks: [validBlock] })).toBeNull();
    expect(normalizeDayPlannerExtension([])).toBeNull();
    expect(normalizeDayPlannerExtension({ version: 1, blocks: [] })).toBeNull();
  });
});

describe('reading and writing blocks', () => {
  it('writes blocks and removes the extension when empty', () => {
    const data = createEmptyProjectData('P');
    setDayPlannerBlocks(data, [validBlock]);
    expect(data.extensions.dayPlanner).toEqual({ version: 1, blocks: [validBlock] });
    expect(getDayPlannerBlocks(data)).toEqual([validBlock]);
    setDayPlannerBlocks(data, []);
    expect(data.extensions).not.toHaveProperty('dayPlanner');
    expect(getDayPlannerBlocks(data)).toEqual([]);
  });

  it('creates unique block ids', () => {
    expect(createDayPlanBlockId()).toMatch(/^blk_\d+_[a-z0-9]+$/);
    expect(createDayPlanBlockId()).not.toBe(createDayPlanBlockId());
  });
});

describe('serialization', () => {
  it('drops blocks whose task no longer exists and keeps the rest', () => {
    const data = createEmptyProjectData('P');
    data.board.tasks.push(fromPartial({ id: 1, title: 'Kept', status: 'to-do' }));
    data.extensions.dayPlanner = {
      version: 1,
      blocks: [validBlock, { ...validBlock, id: 'blk-2', taskId: 99 }]
    };
    const serialized = serializeBoardDataFromObject(data);
    expect(serialized.extensions.dayPlanner).toEqual({ version: 1, blocks: [validBlock] });
  });

  it('removes the extension when no block survives', () => {
    const data = createEmptyProjectData('P');
    data.extensions.dayPlanner = { version: 1, blocks: [{ ...validBlock, taskId: 99 }] };
    expect(serializeBoardDataFromObject(data).extensions).not.toHaveProperty('dayPlanner');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/dayPlanner.test.ts`
Expected: FAIL — `normalizeDayPlannerBlock is not a function` (and the related imports).

- [ ] **Step 3: Implement normalization and read/write**

In `src/domain/dayPlanner.ts`, replace the import block with:

```ts
import type { DayPlanBlock, DayPlannerExtension, LooseBoardData } from './types';
import { DAY_PLANNER_EXTENSION_KEY, DAY_PLANNER_VERSION } from './constants';
import { getBoardExtensionsObject } from './extensions';
import { parseRoadmapIsoDate } from './roadmap';
import { isRecord } from './util';
```

Append to the file:

```ts
// A stored block, or null when it is malformed, off the grid, empty, or (when
// `taskIds` is given) points at a task that does not exist.
export function normalizeDayPlannerBlock(value: unknown, taskIds?: ReadonlySet<number>): DayPlanBlock | null {
    if (!isRecord(value)) return null;
    const id = typeof value.id === 'string' ? value.id.trim() : '';
    const taskId = Number(value.taskId);
    const date = typeof value.date === 'string' && parseRoadmapIsoDate(value.date) ? value.date : '';
    const start = parsePlannerTime(value.start);
    const end = parsePlannerTime(value.end);
    if (!id || !Number.isInteger(taskId) || !date || start === null || end === null || end <= start) return null;
    if (taskIds && !taskIds.has(taskId)) return null;
    return { id, taskId, date, start: formatPlannerTime(start), end: formatPlannerTime(end) };
}

// Null when the value is not a version-1 extension or no block survives, so
// callers can drop the key.
export function normalizeDayPlannerExtension(value: unknown, taskIds?: ReadonlySet<number>): DayPlannerExtension | null {
    if (!isRecord(value) || value.version !== DAY_PLANNER_VERSION || !Array.isArray(value.blocks)) return null;
    const seen = new Set<string>();
    const blocks: DayPlanBlock[] = [];
    value.blocks.forEach((entry) => {
        const block = normalizeDayPlannerBlock(entry, taskIds);
        if (!block || seen.has(block.id)) return;
        seen.add(block.id);
        blocks.push(block);
    });
    return blocks.length > 0 ? { version: DAY_PLANNER_VERSION, blocks } : null;
}

export function getDayPlannerBlocks(boardData: LooseBoardData | null | undefined): DayPlanBlock[] {
    return normalizeDayPlannerExtension(boardData?.extensions?.[DAY_PLANNER_EXTENSION_KEY])?.blocks || [];
}

export function setDayPlannerBlocks(boardData: LooseBoardData, blocks: DayPlanBlock[]): void {
    const extensions = getBoardExtensionsObject(boardData, { create: true });
    if (blocks.length === 0) {
        delete extensions[DAY_PLANNER_EXTENSION_KEY];
        return;
    }
    const extension: DayPlannerExtension = { version: DAY_PLANNER_VERSION, blocks };
    extensions[DAY_PLANNER_EXTENSION_KEY] = extension;
}

export function createDayPlanBlockId(): string {
    return `blk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
```

- [ ] **Step 4: Hook the extension into serialization**

In `src/domain/serialize.ts`:

1. Extend the constants import to add `DAY_PLANNER_EXTENSION_KEY`, and add `import { normalizeDayPlannerExtension } from './dayPlanner';`.
2. Change `normalizeBoardExtensionsValue` so it takes a `taskIds` option and normalizes the planner before the timeline early return:

```ts
export function normalizeBoardExtensionsValue(
    extensionsValue: unknown,
    options: { includeTimeline?: boolean; taskIds?: ReadonlySet<number> } = {}
): BoardExtensions {
    const includeTimeline = options.includeTimeline !== false;
    const base = stripLegacyTaskAttachmentsFromExtensions(extensionsValue);
    const nextExtensions = ((base && typeof base === 'object' && !Array.isArray(base))
        ? { ...base }
        : {}) as BoardExtensions;

    if (Object.prototype.hasOwnProperty.call(nextExtensions, ROADMAP_EXTENSION_KEY)) {
        const normalizedRoadmap = normalizeRoadmapExtension(nextExtensions[ROADMAP_EXTENSION_KEY]);
        if (normalizedRoadmap) {
            nextExtensions[ROADMAP_EXTENSION_KEY] = normalizedRoadmap;
        } else {
            delete nextExtensions[ROADMAP_EXTENSION_KEY];
        }
    }

    if (Object.prototype.hasOwnProperty.call(nextExtensions, DAY_PLANNER_EXTENSION_KEY)) {
        const normalizedPlanner = normalizeDayPlannerExtension(nextExtensions[DAY_PLANNER_EXTENSION_KEY], options.taskIds);
        if (normalizedPlanner) {
            nextExtensions[DAY_PLANNER_EXTENSION_KEY] = normalizedPlanner;
        } else {
            delete nextExtensions[DAY_PLANNER_EXTENSION_KEY];
        }
    }

    if (!includeTimeline) {
        delete nextExtensions[TIMELINE_EXTENSION_KEY];
        return nextExtensions;
    }
    // ...timeline branch unchanged...
```

3. In `createBoardStateSnapshot`, change the `extensions:` line to:

```ts
        extensions: normalizeBoardExtensionsValue(input.extensions, {
            includeTimeline: false,
            taskIds: new Set(normalizedTasks.map((task) => Number(task.id)))
        })
```

4. In `serializeBoardDataFromObject`, change the `extensions:` line to:

```ts
        extensions: normalizeBoardExtensionsValue(input.extensions, {
            taskIds: new Set(normalizedTasks.map((task) => Number(task.id)))
        })
```

- [ ] **Step 5: Run the planner tests and the full unit suite**

Run: `npx vitest run tests/unit/dayPlanner.test.ts`
Expected: PASS.

Run: `npm run test:unit`
Expected: PASS — the existing roadmap and serialization tests are unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/domain/dayPlanner.ts src/domain/serialize.ts tests/unit/dayPlanner.test.ts
git commit -m "feat(planner): store day planner blocks in the project extension"
```

---

### Task 3: Overlap layout

**Files:**
- Modify: `src/domain/dayPlanner.ts`
- Test: `tests/unit/dayPlanner.test.ts` (append)

**Interfaces:**
- Produces: `type PlannerLayoutSlot = { column: number; columns: number }` and `layoutPlannerBlocks(blocks: readonly { id: string; start: string; end: string }[]): Map<string, PlannerLayoutSlot>`

- [ ] **Step 1: Append the failing tests**

Add `layoutPlannerBlocks` to the `dayPlanner` import, then append:

```ts
describe('layoutPlannerBlocks', () => {
  const b = (id: string, start: string, end: string) => ({ id, start, end });

  it('gives non-overlapping blocks the full width', () => {
    const layout = layoutPlannerBlocks([b('a', '09:00', '10:00'), b('b', '10:00', '11:00')]);
    expect(layout.get('a')).toEqual({ column: 0, columns: 1 });
    expect(layout.get('b')).toEqual({ column: 0, columns: 1 });
  });

  it('puts overlapping blocks side by side', () => {
    const layout = layoutPlannerBlocks([b('a', '09:00', '11:00'), b('b', '10:00', '12:00')]);
    expect(layout.get('a')).toEqual({ column: 0, columns: 2 });
    expect(layout.get('b')).toEqual({ column: 1, columns: 2 });
  });

  it('reuses a freed column inside the same overlap group', () => {
    const layout = layoutPlannerBlocks([
      b('long', '09:00', '12:00'),
      b('first', '09:00', '10:00'),
      b('second', '10:00', '11:00')
    ]);
    expect(layout.get('long')).toEqual({ column: 0, columns: 2 });
    expect(layout.get('first')).toEqual({ column: 1, columns: 2 });
    expect(layout.get('second')).toEqual({ column: 1, columns: 2 });
  });

  it('lays out separate overlap groups independently', () => {
    const layout = layoutPlannerBlocks([
      b('a', '09:00', '10:00'), b('b', '09:00', '10:00'), b('c', '13:00', '14:00')
    ]);
    expect(layout.get('c')).toEqual({ column: 0, columns: 1 });
    expect(layout.get('b')!.columns).toBe(2);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/dayPlanner.test.ts -t layoutPlannerBlocks`
Expected: FAIL — `layoutPlannerBlocks is not a function`.

- [ ] **Step 3: Implement**

Append to `src/domain/dayPlanner.ts`:

```ts
export type PlannerLayoutSlot = { column: number; columns: number };

// Calendar-style packing: blocks that overlap (directly or through a chain)
// form a group; each takes the first free column, and every block in a group
// shares that group's column count.
export function layoutPlannerBlocks(blocks: readonly { id: string; start: string; end: string }[]): Map<string, PlannerLayoutSlot> {
    const sorted = [...blocks].sort((a, b) => plannerMinutes(a.start) - plannerMinutes(b.start)
        || plannerMinutes(b.end) - plannerMinutes(a.end)
        || a.id.localeCompare(b.id));
    const layout = new Map<string, PlannerLayoutSlot>();
    let group: { id: string; column: number }[] = [];
    let columnEnds: number[] = [];
    let groupEnd = -Infinity;
    const flush = () => {
        group.forEach(({ id, column }) => layout.set(id, { column, columns: columnEnds.length }));
        group = [];
        columnEnds = [];
    };
    sorted.forEach((block) => {
        const start = plannerMinutes(block.start);
        const end = plannerMinutes(block.end);
        if (start >= groupEnd) {
            flush();
            groupEnd = -Infinity;
        }
        let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
        if (column < 0) {
            column = columnEnds.length;
            columnEnds.push(end);
        } else {
            columnEnds[column] = end;
        }
        group.push({ id: block.id, column });
        groupEnd = Math.max(groupEnd, end);
    });
    flush();
    return layout;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/dayPlanner.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/dayPlanner.ts tests/unit/dayPlanner.test.ts
git commit -m "feat(planner): lay out overlapping blocks side by side"
```

---

### Task 4: Planner view mode, view state and navigation

**Files:**
- Modify: `src/features/portfolio/types.ts:65`
- Modify: `src/domain/board.ts:81-85`
- Modify: `src/features/portfolio/state/slices.ts`
- Modify: `src/features/portfolio/commands/portfolioControls.ts`
- Modify: `src/features/portfolio/commands/portfolioNavigation.ts:45-49`
- Test: `tests/unit/portfolioControls.test.ts` (append)

**Interfaces:**
- Consumes: `shiftPlannerDate` (Task 1); `todayLocalIsoDate` from `@/domain/util`.
- Produces:
  - `PortfolioViewMode = 'board' | 'roadmap' | 'calendar' | 'planner'`; `type PlannerMode = 'day' | 'week'` (from `@/features/portfolio/types`)
  - State fields `portfolioPlannerDate: string` (`''` means today) and `portfolioPlannerMode: PlannerMode` (default `'day'`)
  - Controls (module-level exports from `portfolioControls.ts` and on `createPortfolioControlActions()`): `setPortfolioPlannerMode(mode: unknown): void`, `shiftPortfolioPlannerDate(step: number): void`, `showPortfolioPlannerToday(): void`
  - The URL writes `pv=planner` when projects are loaded.

- [ ] **Step 1: Write the failing tests**

Append inside `describe('portfolio control actions', ...)` in `tests/unit/portfolioControls.test.ts`:

```ts
    it('switches to the planner view only when projects are loaded', () => {
        const { actions, store } = createActions();
        actions.setPortfolioViewMode('planner');
        expect(store.getState().selectedPortfolioViewMode).toBe('board');

        store.setState({ portfolioBoards: [createBoard('p1', 'Project')] });
        actions.setPortfolioViewMode('planner');
        expect(store.getState().selectedPortfolioViewMode).toBe('planner');
    });

    it('navigates planner dates by day or by week and keeps the mode on Today', () => {
        const { actions, store } = createActions();
        store.setState({ portfolioPlannerDate: '2026-09-25', portfolioPlannerMode: 'day' });

        actions.shiftPortfolioPlannerDate(1);
        expect(store.getState().portfolioPlannerDate).toBe('2026-09-26');

        actions.setPortfolioPlannerMode('week');
        actions.shiftPortfolioPlannerDate(-1);
        expect(store.getState().portfolioPlannerDate).toBe('2026-09-19');
        expect(store.getState().portfolioPlannerMode).toBe('week');

        actions.showPortfolioPlannerToday();
        expect(store.getState().portfolioPlannerDate).toBe('');
        expect(store.getState().portfolioPlannerMode).toBe('week');
    });

    it('ignores unknown planner modes', () => {
        const { actions, store } = createActions();
        actions.setPortfolioPlannerMode('month');
        expect(store.getState().portfolioPlannerMode).toBe('day');
    });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/portfolioControls.test.ts`
Expected: FAIL — `actions.shiftPortfolioPlannerDate is not a function`; the first test fails because `'planner'` is normalized to `'board'`.

- [ ] **Step 3: Add the view mode and state**

`src/features/portfolio/types.ts` — replace the `PortfolioViewMode` line with:

```ts
export type PortfolioViewMode = 'board' | 'roadmap' | 'calendar' | 'planner';
export type PlannerMode = 'day' | 'week';
```

`src/domain/board.ts` — in `normalizePortfolioViewMode`, add before `return 'board';`:

```ts
    if (value === 'planner') return 'planner';
```

`src/features/portfolio/state/slices.ts`:
- Add `PlannerMode` to the import from `@/features/portfolio/types`.
- In `PortfolioSlice`, after `portfolioCalendarMonth: number | null;` add:

```ts
    // '' shows today; the planner date is view state and never saved to files.
    portfolioPlannerDate: string;
    portfolioPlannerMode: PlannerMode;
```

- In `createPortfolioSlice()`, after `portfolioCalendarMonth: null` add `,` and:

```ts
        portfolioPlannerDate: '',
        portfolioPlannerMode: 'day'
```

`canUsePortfolioViewMode` needs no change: its fallback already requires at least one loaded board. `normalizeSelection` in `portfolioViewState.ts` already resets to `'board'` when no boards are loaded.

- [ ] **Step 4: Add the planner controls**

In `src/features/portfolio/commands/portfolioControls.ts`:
- Add imports: `import { shiftPlannerDate } from '@/domain/dayPlanner';` and `import { todayLocalIsoDate } from '@/domain/util';`.
- Add these functions inside `createPortfolioControlActions`, after `shiftPortfolioCalendarYear`:

```ts
    function setPortfolioPlannerMode(mode: unknown) {
        if (mode !== 'day' && mode !== 'week') return;
        commitState({ portfolioPlannerMode: mode });
    }

    // One step is a day in Day mode and a week in Week mode.
    function shiftPortfolioPlannerDate(step: number) {
        const state = getState();
        const current = state.portfolioPlannerDate || todayLocalIsoDate();
        const days = Number(step || 0) * (state.portfolioPlannerMode === 'week' ? 7 : 1);
        commitState({ portfolioPlannerDate: shiftPlannerDate(current, days) });
    }

    function showPortfolioPlannerToday() {
        commitState({ portfolioPlannerDate: '' });
    }
```

- Add `setPortfolioPlannerMode`, `shiftPortfolioPlannerDate`, `showPortfolioPlannerToday` to the returned object (keep it alphabetical).
- After the other module-level exports at the bottom, add:

```ts
export const setPortfolioPlannerMode: PortfolioControlActions['setPortfolioPlannerMode'] = (...args) => activeActions.setPortfolioPlannerMode(...args);
export const shiftPortfolioPlannerDate: PortfolioControlActions['shiftPortfolioPlannerDate'] = (...args) => activeActions.shiftPortfolioPlannerDate(...args);
export const showPortfolioPlannerToday: PortfolioControlActions['showPortfolioPlannerToday'] = (...args) => activeActions.showPortfolioPlannerToday(...args);
```

- [ ] **Step 5: Persist the view in the URL**

In `src/features/portfolio/commands/portfolioNavigation.ts`, replace the calendar condition:

```ts
    const aggregateView = state.selectedPortfolioViewMode === 'calendar' || state.selectedPortfolioViewMode === 'planner';
    if (aggregateView && (state.portfolioBoards || []).length > 0) {
        params.set('pv', state.selectedPortfolioViewMode);
    } else if (state.selectedPortfolioBoardId && state.selectedPortfolioViewMode === 'roadmap') {
        params.set('pv', state.selectedPortfolioViewMode);
    }
```

- [ ] **Step 6: Run the tests, typecheck and commit**

Run: `npx vitest run tests/unit/portfolioControls.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: no errors.

```bash
git add src/features/portfolio/types.ts src/domain/board.ts src/features/portfolio/state/slices.ts src/features/portfolio/commands/portfolioControls.ts src/features/portfolio/commands/portfolioNavigation.ts tests/unit/portfolioControls.test.ts
git commit -m "feat(planner): add planner view mode and date navigation"
```

---

### Task 5: Planner view model query

**Files:**
- Create: `src/features/portfolio/queries/portfolioPlannerViews.ts`
- Modify: `src/features/portfolio/queries/index.ts`
- Test: `tests/unit/plannerViews.test.ts`

**Interfaces:**
- Consumes: `getDayPlannerBlocks`, `getPlannerWeekDates`, `layoutPlannerBlocks`, `plannerMinutes`, `PLANNER_WORK_START`, `PLANNER_WORK_END` (domain); `createPortfolioProjectColor` (`@/domain/board`); `isBoardInHistoricalPreview`, `SelectorState` (queries).
- Produces (exported from `@/features/portfolio/queries`):

```ts
export type PlannerTrayItem = {
    boardId: string; taskId: number; title: string; status: TaskStatus;
    priority: Priority | null; effort: Effort | null; color: ProjectColor;
    canDrag: boolean; planned: boolean;
};
export type PlannerTrayGroup = { boardId: string; boardTitle: string; color: ProjectColor; items: PlannerTrayItem[] };
export type PlannerBlockView = {
    id: string; boardId: string; boardTitle: string; taskId: number; title: string;
    date: string; start: string; end: string; startMinutes: number; endMinutes: number;
    color: ProjectColor; done: boolean; archived: boolean; canEdit: boolean;
    column: number; columns: number;
};
export type PlannerDayView = { date: string; isToday: boolean; blocks: PlannerBlockView[] };
export type PlannerViewModel = {
    mode: PlannerMode; date: string; today: string; days: PlannerDayView[];
    plannedMinutes: number; capacityMinutes: number; trayGroups: PlannerTrayGroup[];
};
export function buildPortfolioPlannerViewModel(
    state: SelectorState,
    options: { today: string; trayStatuses: readonly TaskStatus[] }
): PlannerViewModel;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/plannerViews.test.ts`:

```ts
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { buildPortfolioPlannerViewModel } from '../../src/features/portfolio/queries';

function task(id: number, title: string, status = 'to-do', extra: Record<string, unknown> = {}) {
  return fromPartial({
    id, title, status, archived: false, description: '', assignees: [], tags: [], checklist: [],
    priority: null, effort: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...extra
  });
}

function board(id: string, title: string, tasks: any[], blocks: any[] = [], handle: unknown = {}) {
  const data = createEmptyProjectData(title);
  data.board.tasks.push(...tasks);
  if (blocks.length) data.extensions.dayPlanner = { version: 1, blocks };
  return { id, colorSeed: 0, handle, fileName: `${id}.json`, title, data };
}

function state(boards: any[], extra: Record<string, unknown> = {}) {
  return createAppStore(fromAny({
    portfolioBoards: boards,
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    ...extra
  })).getState();
}

const TODAY = '2026-09-25';
const ACTIVE = ['to-do', 'doing'] as const;

describe('buildPortfolioPlannerViewModel', () => {
  it('shows one day, defaulting to today, with blocks from every project', () => {
    const s = state([
      board('a', 'Alpha', [task(1, 'Write spec')], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:30' }]),
      board('b', 'Bravo', [task(7, 'Fix bug', 'doing')], [
        { id: 'y', taskId: 7, date: TODAY, start: '10:00', end: '11:00' },
        { id: 'z', taskId: 7, date: '2026-09-24', start: '10:00', end: '11:00' }
      ])
    ]);
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.mode).toBe('day');
    expect(model.date).toBe(TODAY);
    expect(model.days).toHaveLength(1);
    expect(model.days[0].isToday).toBe(true);
    expect(model.days[0].blocks.map((b) => [b.id, b.title, b.boardTitle, b.column, b.columns])).toEqual([
      ['x', 'Write spec', 'Alpha', 0, 2],
      ['y', 'Fix bug', 'Bravo', 1, 2]
    ]);
    expect(model.plannedMinutes).toBe(150);
    expect(model.capacityMinutes).toBe(8 * 60);
  });

  it('shows Monday–Friday in week mode', () => {
    const s = state([board('a', 'Alpha', [task(1, 'T')], [
      { id: 'mon', taskId: 1, date: '2026-09-21', start: '09:00', end: '09:15' },
      { id: 'sat', taskId: 1, date: '2026-09-26', start: '09:00', end: '09:15' }
    ])], { portfolioPlannerMode: 'week', portfolioPlannerDate: '2026-09-23' });
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.days.map((d) => d.date)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25']);
    expect(model.days[0].blocks.map((b) => b.id)).toEqual(['mon']);
    expect(model.days[4].isToday).toBe(true);
    expect(model.capacityMinutes).toBe(5 * 8 * 60);
  });

  it('limits blocks to the selected project and skips blocks for missing tasks', () => {
    const a = board('a', 'Alpha', [task(1, 'A')], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:00' }]);
    const b = board('b', 'Bravo', [task(2, 'B')], [{ id: 'y', taskId: 2, date: TODAY, start: '09:00', end: '10:00' }]);
    a.data.extensions.dayPlanner!.blocks.push({ id: 'ghost', taskId: 99, date: TODAY, start: '11:00', end: '12:00' });
    const model = buildPortfolioPlannerViewModel(state([a, b], { selectedPortfolioBoardId: 'a' }), { today: TODAY, trayStatuses: ACTIVE });
    expect(model.days[0].blocks.map((block) => block.id)).toEqual(['x']);
  });

  it('marks done and archived tasks, and read-only projects as not editable', () => {
    const s = state([board('a', 'Alpha', [
      task(1, 'Done one', 'done'),
      task(2, 'Archived one', 'to-do', { archived: true })
    ], [
      { id: 'd', taskId: 1, date: TODAY, start: '09:00', end: '10:00' },
      { id: 'r', taskId: 2, date: TODAY, start: '10:00', end: '11:00' }
    ], null)]);
    const [done, archived] = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE }).days[0].blocks;
    expect(done).toMatchObject({ done: true, archived: false, canEdit: false });
    expect(archived).toMatchObject({ done: false, archived: true });
  });

  it('builds tray groups from the visible rows filtered by status, flagging planned tasks', () => {
    const s = state([board('a', 'Alpha', [
      task(1, 'Planned', 'to-do'),
      task(2, 'Unplanned', 'doing'),
      task(3, 'Later', 'backlog')
    ], [{ id: 'x', taskId: 1, date: TODAY, start: '09:00', end: '10:00' }])]);
    const model = buildPortfolioPlannerViewModel(s, { today: TODAY, trayStatuses: ACTIVE });

    expect(model.trayGroups).toHaveLength(1);
    expect(model.trayGroups[0].boardTitle).toBe('Alpha');
    expect(model.trayGroups[0].items.map((item) => [item.title, item.planned, item.canDrag]).sort()).toEqual([
      ['Planned', true, true],
      ['Unplanned', false, true]
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/plannerViews.test.ts`
Expected: FAIL — `buildPortfolioPlannerViewModel is not a function`.

- [ ] **Step 3: Implement the query**

Create `src/features/portfolio/queries/portfolioPlannerViews.ts`:

```ts
// Day planner view model: tray groups from the visible rows and per-day
// blocks from every project in scope.

import type { Effort, Priority, ProjectColor, Task, TaskStatus } from '@/domain/types';
import type { BoardRecord, PlannerMode } from '@/features/portfolio/types';
import { createPortfolioProjectColor } from '@/domain/board';
import {
    PLANNER_WORK_END,
    PLANNER_WORK_START,
    getDayPlannerBlocks,
    getPlannerWeekDates,
    layoutPlannerBlocks,
    plannerMinutes
} from '@/domain/dayPlanner';
import { normalizeTaskStatus } from '@/domain/task';
import type { SelectorState } from './portfolioRowViews';
import { isBoardInHistoricalPreview } from './portfolioTimelineViews';

export type PlannerTrayItem = {
    boardId: string;
    taskId: number;
    title: string;
    status: TaskStatus;
    priority: Priority | null;
    effort: Effort | null;
    color: ProjectColor;
    canDrag: boolean;
    planned: boolean;
};
export type PlannerTrayGroup = { boardId: string; boardTitle: string; color: ProjectColor; items: PlannerTrayItem[] };
export type PlannerBlockView = {
    id: string;
    boardId: string;
    boardTitle: string;
    taskId: number;
    title: string;
    date: string;
    start: string;
    end: string;
    startMinutes: number;
    endMinutes: number;
    color: ProjectColor;
    done: boolean;
    archived: boolean;
    canEdit: boolean;
    column: number;
    columns: number;
};
export type PlannerDayView = { date: string; isToday: boolean; blocks: PlannerBlockView[] };
export type PlannerViewModel = {
    mode: PlannerMode;
    date: string;
    today: string;
    days: PlannerDayView[];
    plannedMinutes: number;
    capacityMinutes: number;
    trayGroups: PlannerTrayGroup[];
};

const boardColor = (board: BoardRecord): ProjectColor => board.projectColor || createPortfolioProjectColor(board.colorSeed || 0);
const boardTitle = (board: BoardRecord): string => board.title || board.fileName;

function buildDayBlocks(state: SelectorState, boards: BoardRecord[], dates: Set<string>): PlannerBlockView[] {
    return boards.flatMap((board) => {
        const tasks = new Map<number, Task>(board.data.board.tasks.map((task) => [Number(task.id), task]));
        const canEdit = Boolean(board.handle) && !isBoardInHistoricalPreview(state, board.id);
        return getDayPlannerBlocks(board.data).flatMap((block) => {
            const task = tasks.get(block.taskId);
            if (!task || !dates.has(block.date)) return [];
            return [{
                ...block,
                boardId: board.id,
                boardTitle: boardTitle(board),
                title: task.title,
                startMinutes: plannerMinutes(block.start),
                endMinutes: plannerMinutes(block.end),
                color: boardColor(board),
                done: normalizeTaskStatus(task.status) === 'done',
                archived: Boolean(task.archived),
                canEdit,
                column: 0,
                columns: 1
            }];
        });
    });
}

export function buildPortfolioPlannerViewModel(
    state: SelectorState,
    { today, trayStatuses }: { today: string; trayStatuses: readonly TaskStatus[] }
): PlannerViewModel {
    const mode: PlannerMode = state?.portfolioPlannerMode === 'week' ? 'week' : 'day';
    const date = state?.portfolioPlannerDate || today;
    const dates = mode === 'week' ? getPlannerWeekDates(date) : [date];
    const allBoards = Array.isArray(state?.portfolioBoards) ? state.portfolioBoards : [];
    const selectedId = state?.selectedPortfolioBoardId || '';
    const boards = selectedId ? allBoards.filter((board) => board.id === selectedId) : allBoards;

    const blocks = buildDayBlocks(state, boards, new Set(dates));
    const days: PlannerDayView[] = dates.map((day) => {
        const dayBlocks = blocks.filter((block) => block.date === day);
        const layout = layoutPlannerBlocks(dayBlocks);
        return {
            date: day,
            isToday: day === today,
            blocks: dayBlocks
                .map((block) => ({ ...block, ...(layout.get(block.id) || { column: 0, columns: 1 }) }))
                .sort((a, b) => a.startMinutes - b.startMinutes || a.column - b.column)
        };
    });

    const plannedKeys = new Set(blocks.map((block) => `${block.boardId}:${block.taskId}`));
    const statusSet = new Set(trayStatuses);
    const groups = new Map<string, PlannerTrayGroup>();
    (Array.isArray(state?.portfolioVisibleRows) ? state.portfolioVisibleRows : []).forEach((row) => {
        const status = normalizeTaskStatus(row.task.status);
        if (!statusSet.has(status)) return;
        const board = allBoards.find((entry) => entry.id === row.boardId);
        if (!board) return;
        let group = groups.get(board.id);
        if (!group) {
            group = { boardId: board.id, boardTitle: boardTitle(board), color: boardColor(board), items: [] };
            groups.set(board.id, group);
        }
        const taskId = Number(row.taskId ?? row.task.id);
        group.items.push({
            boardId: board.id,
            taskId,
            title: row.task.title,
            status,
            priority: row.task.priority,
            effort: row.task.effort,
            color: group.color,
            canDrag: Boolean(row.canMutate) && !row.historical,
            planned: plannedKeys.has(`${board.id}:${taskId}`)
        });
    });
    const trayGroups = allBoards.map((board) => groups.get(board.id)).filter((group): group is PlannerTrayGroup => Boolean(group));

    return {
        mode,
        date,
        today,
        days,
        plannedMinutes: blocks.reduce((sum, block) => sum + block.endMinutes - block.startMinutes, 0),
        capacityMinutes: (PLANNER_WORK_END - PLANNER_WORK_START) * dates.length,
        trayGroups
    };
}
```

In `src/features/portfolio/queries/index.ts`:
- Add `import { buildPortfolioPlannerViewModel } from './portfolioPlannerViews';` next to the calendar import.
- Add `buildPortfolioPlannerViewModel` to the final `export { ... }` list.
- Add: `export type { PlannerBlockView, PlannerDayView, PlannerTrayGroup, PlannerTrayItem, PlannerViewModel } from './portfolioPlannerViews';`

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/plannerViews.test.ts`
Expected: PASS. If the tray test gets no rows, check that `createAppStore` derived `portfolioVisibleRows`. It does this on creation, and the default archive filter is `'active'`.

- [ ] **Step 5: Commit**

```bash
git add src/features/portfolio/queries/portfolioPlannerViews.ts src/features/portfolio/queries/index.ts tests/unit/plannerViews.test.ts
git commit -m "feat(planner): build the planner view model"
```

---

### Task 6: Planner commands with undo

**Files:**
- Create: `src/features/portfolio/commands/plannerCommands.ts`
- Modify: `src/features/portfolio/commands/taskCommands.ts` (return object, ~line 308)
- Modify: `src/features/portfolio/commands/portfolioCommands.ts`
- Modify: `src/shared/i18n.ts` (only the three undo messages; the other strings come in Task 7)
- Test: `tests/unit/plannerCommands.test.ts`

**Interfaces:**
- Consumes: `BoardMutationContext` (`getBoardRecord`, `runPortfolioBoardMutation`), `TaskActions['showUndo']`, and domain `createDayPlanBlockId`, `createPlannerBlockTimes`, `getDayPlannerBlocks`, `normalizeDayPlannerBlock`, `setDayPlannerBlocks`, `PlannerBlockTimes`.
- Produces (on `PortfolioMutationActions`, reached through `usePortfolioActions()`):
  - `addPlannerBlock(boardId: string, taskId: number, date: string, startMinutes: number): Promise<boolean>`
  - `updatePlannerBlock(boardId: string, blockId: string, times: PlannerBlockTimes): Promise<boolean>`
  - `removePlannerBlock(boardId: string, blockId: string): Promise<boolean>`
  - `showUndo(message: string, undoFn: () => unknown): void` (now exported from task actions)
- i18n keys: `planner.blockAdded`, `planner.blockUpdated`, `planner.blockRemoved`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/plannerCommands.test.ts`:

```ts
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';

function createBoard() {
  const data = createEmptyProjectData('Project');
  data.board.tasks.push(fromPartial({
    id: 1, title: 'Plan me', description: '', status: 'to-do', archived: false,
    checklist: [], assignees: [], tags: [],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  }));
  return { id: 'p1', colorSeed: 0, handle: {}, fileName: 'p1.json', title: 'Project', data };
}

function setup() {
  const store = createAppStore(fromAny({
    portfolioBoards: [createBoard()],
    portfolioTimelineSelection: { boardId: '', eventIndex: null },
    portfolioTimelineExpandedByBoardId: {},
    portfolioBulkSelectionByBoardId: {},
    portfolioDetailContext: null,
    selectedPortfolioBoardId: '',
    undoAction: null,
    undoToast: null,
    projectSaveStateById: new Map()
  }));
  const enqueueSave = vi.fn(async () => true);
  const actions = createPortfolioMutationActions({
    store, enqueueSave, markDirty: vi.fn(), closeDialogFn: vi.fn(), openDialogFn: vi.fn(),
    confirm: vi.fn(() => true), alert: vi.fn()
  });
  const blocks = () => store.getState().portfolioBoards[0].data.extensions.dayPlanner?.blocks || [];
  const task = () => store.getState().portfolioBoards[0].data.board.tasks[0];
  const events = () => store.getState().portfolioBoards[0].data.extensions.timeline?.events || [];
  return { store, actions, enqueueSave, blocks, task, events };
}

describe('planner commands', () => {
  it('adds a 1-hour block without touching the task or the timeline', async () => {
    const { actions, blocks, task, events, enqueueSave } = setup();
    const before = structuredClone(task());

    await expect(actions.addPlannerBlock('p1', 1, '2026-09-25', 600)).resolves.toBe(true);

    expect(blocks()).toEqual([expect.objectContaining({ taskId: 1, date: '2026-09-25', start: '10:00', end: '11:00' })]);
    expect(task()).toEqual(before);
    expect(events().filter((event) => event.kind !== 'board.baseline')).toHaveLength(0);
    expect(enqueueSave).toHaveBeenCalledTimes(1);
  });

  it('clamps a late drop so the block ends at 21:00', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 1250);
    expect(blocks()[0]).toMatchObject({ start: '20:00', end: '21:00' });
  });

  it('refuses unknown tasks and invalid dates', async () => {
    const { actions, blocks } = setup();
    await expect(actions.addPlannerBlock('p1', 42, '2026-09-25', 600)).resolves.toBe(false);
    await expect(actions.addPlannerBlock('p1', 1, 'soon', 600)).resolves.toBe(false);
    expect(blocks()).toEqual([]);
  });

  it('allows the same task in several blocks', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 840);
    expect(blocks()).toHaveLength(2);
  });

  it('updates a block and undoes back to the previous times', async () => {
    const { actions, blocks, store } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const id = blocks()[0].id;

    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-24', start: '13:00', end: '14:45' })).resolves.toBe(true);
    expect(blocks()[0]).toMatchObject({ date: '2026-09-24', start: '13:00', end: '14:45' });
    expect(store.getState().undoToast?.message).toBeTruthy();

    await actions.performUndo();
    expect(blocks()[0]).toMatchObject({ date: '2026-09-25', start: '09:00', end: '10:00' });
  });

  it('rejects invalid or unchanged updates', async () => {
    const { actions, blocks, enqueueSave } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const id = blocks()[0].id;
    enqueueSave.mockClear();

    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '10:00', end: '09:00' })).resolves.toBe(false);
    await expect(actions.updatePlannerBlock('p1', id, { date: '2026-09-25', start: '09:00', end: '10:00' })).resolves.toBe(false);
    await expect(actions.updatePlannerBlock('p1', 'missing', { date: '2026-09-25', start: '09:00', end: '10:00' })).resolves.toBe(false);
    expect(enqueueSave).not.toHaveBeenCalled();
  });

  it('removes a block, drops the empty extension, and undo restores it', async () => {
    const { actions, blocks, store } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    const original = blocks()[0];

    await expect(actions.removePlannerBlock('p1', original.id)).resolves.toBe(true);
    expect(store.getState().portfolioBoards[0].data.extensions).not.toHaveProperty('dayPlanner');

    await actions.performUndo();
    expect(blocks()).toEqual([original]);
  });

  it('undoing an add removes the block', async () => {
    const { actions, blocks } = setup();
    await actions.addPlannerBlock('p1', 1, '2026-09-25', 540);
    await actions.performUndo();
    expect(blocks()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/unit/plannerCommands.test.ts`
Expected: FAIL — `actions.addPlannerBlock is not a function`.

- [ ] **Step 3: Expose `showUndo` from task actions**

In `src/features/portfolio/commands/taskCommands.ts`, add `showUndo,` to the returned object (after `performUndo,`).

- [ ] **Step 4: Add the undo messages**

In `src/shared/i18n.ts`, add to `en` (after the last `calendar.*` entry):

```ts
    'planner.blockAdded': 'Task scheduled',
    'planner.blockUpdated': 'Plan updated',
    'planner.blockRemoved': 'Removed from plan',
```

and to `pt` at the same position:

```ts
    'planner.blockAdded': 'Tarefa agendada',
    'planner.blockUpdated': 'Plano atualizado',
    'planner.blockRemoved': 'Removida do plano',
```

- [ ] **Step 5: Implement the commands**

Create `src/features/portfolio/commands/plannerCommands.ts`:

```ts
// Day planner edits. Blocks are written to the project that owns the task;
// the task itself and the timeline are never changed.

import type { DayPlanBlock } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import type { TaskActions } from './taskCommands';
import {
    createDayPlanBlockId,
    createPlannerBlockTimes,
    getDayPlannerBlocks,
    normalizeDayPlannerBlock,
    setDayPlannerBlocks,
    type PlannerBlockTimes
} from '@/domain/dayPlanner';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { translateCurrent } from '@/shared/i18n';

export function createPlannerActions(
    { getBoardRecord, runPortfolioBoardMutation }: BoardMutationContext,
    { showUndo }: Pick<TaskActions, 'showUndo'>
) {
    const findBlock = (boardId: string, blockId: string): DayPlanBlock | null => (
        getDayPlannerBlocks(getBoardRecord(boardId)?.data).find((block) => block.id === blockId) || null
    );

    // `update` returns the next block list, or null to leave the board untouched.
    function writeBlocks(boardId: string, update: (blocks: DayPlanBlock[]) => DayPlanBlock[] | null): Promise<boolean> {
        return runPortfolioBoardMutation(boardId, (data) => {
            const next = update(getDayPlannerBlocks(data));
            if (!next) return false;
            setDayPlannerBlocks(data, next);
            return true;
        });
    }

    const putBlock = (boardId: string, block: DayPlanBlock) => writeBlocks(boardId, (blocks) => (
        [...blocks.filter((entry) => entry.id !== block.id), block]
    ));
    const dropBlock = (boardId: string, blockId: string) => writeBlocks(boardId, (blocks) => (
        blocks.some((entry) => entry.id === blockId) ? blocks.filter((entry) => entry.id !== blockId) : null
    ));

    async function addPlannerBlock(boardId: string, taskId: number, date: string, startMinutes: number): Promise<boolean> {
        const record = getBoardRecord(boardId);
        if (!record || !parseRoadmapIsoDate(date)) return false;
        if (!record.data.board.tasks.some((task) => Number(task.id) === Number(taskId))) return false;
        const block: DayPlanBlock = { id: createDayPlanBlockId(), taskId: Number(taskId), date, ...createPlannerBlockTimes(startMinutes) };
        const added = await putBlock(boardId, block);
        if (added) showUndo(translateCurrent('planner.blockAdded'), () => dropBlock(boardId, block.id));
        return added;
    }

    async function updatePlannerBlock(boardId: string, blockId: string, times: PlannerBlockTimes): Promise<boolean> {
        const previous = findBlock(boardId, blockId);
        const next = previous ? normalizeDayPlannerBlock({ ...previous, ...times }) : null;
        if (!previous || !next) return false;
        if (next.date === previous.date && next.start === previous.start && next.end === previous.end) return false;
        const updated = await putBlock(boardId, next);
        if (updated) showUndo(translateCurrent('planner.blockUpdated'), () => putBlock(boardId, previous));
        return updated;
    }

    async function removePlannerBlock(boardId: string, blockId: string): Promise<boolean> {
        const previous = findBlock(boardId, blockId);
        if (!previous) return false;
        const removed = await dropBlock(boardId, blockId);
        if (removed) showUndo(translateCurrent('planner.blockRemoved'), () => putBlock(boardId, previous));
        return removed;
    }

    return { addPlannerBlock, updatePlannerBlock, removePlannerBlock };
}
```

In `src/features/portfolio/commands/portfolioCommands.ts`:
- Add `import { createPlannerActions } from './plannerCommands';`
- After `const timeline = createTimelineActions(context, tasks);` add `const planner = createPlannerActions(context, tasks);`
- Change the return to `return { ...tasks, ...roadmap, ...timeline, ...planner, ...interactions };`

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npx vitest run tests/unit/plannerCommands.test.ts`
Expected: PASS. (The only timeline event is the `board.baseline` event that `runPortfolioBoardMutation` always ensures; planner edits add none.)

Run: `npm run test:unit && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/portfolio/commands/plannerCommands.ts src/features/portfolio/commands/taskCommands.ts src/features/portfolio/commands/portfolioCommands.ts src/shared/i18n.ts tests/unit/plannerCommands.test.ts
git commit -m "feat(planner): add, move, resize and remove planner blocks with undo"
```

---

### Task 7: Planner view shell — toolbar button, header, tray

**Files:**
- Create: `src/features/portfolio/planner/plannerGeometry.ts`
- Create: `src/features/portfolio/planner/PortfolioPlanner.tsx`
- Create: `src/features/portfolio/planner/PlannerTray.tsx`
- Create: `src/styles/portfolio/planner.css`
- Modify: `src/styles/app.css`
- Modify: `src/shared/i18n.ts`
- Modify: `src/features/portfolio/shell/PortfolioControls.tsx` (view toggle, after the Calendar button)
- Modify: `src/app/App.tsx`
- Test: `tests/e2e/planner.test.ts`

**Interfaces:**
- Consumes: `buildPortfolioPlannerViewModel` and `PlannerViewModel` (Task 5); planner controls (Task 4).
- Produces:
  - `PortfolioPlanner({ hidden }: { hidden: boolean })`: the element with `id="portfolioPlannerView"`.
  - `PlannerTray({ groups, statuses, onToggleStatus })`: tray cards use `.planner-tray-card` with `data-task-id`.
  - `plannerGeometry.ts`: `PLANNER_SLOT_PX = 24`, `plannerMinutesToPx(minutes: number): number`, `PLANNER_GRID_HEIGHT_PX`.
  - `formatPlannerDateLabel(language: Language, isoDate: string, short?: boolean): string` in `@/shared/i18n`.
  - Toolbar button `data-view-mode="planner"`, label "Day Planner".

- [ ] **Step 1: Write the failing e2e test**

Create `tests/e2e/planner.test.ts`:

```ts
import { test, expect } from '@playwright/test';
import { gotoApp, seedPortfolioBoards } from '../support/portfolio';

test.describe('day planner', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('opens from the toolbar, lists tasks by status and keeps the view in the URL', async ({ page }) => {
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [
        { id: 1, title: 'Write spec', status: 'to-do' },
        { id: 2, title: 'Ship build', status: 'doing' },
        { id: 3, title: 'Someday idea', status: 'backlog' }
      ]
    }]);

    await page.getByRole('button', { name: 'Day Planner' }).click();

    const planner = page.locator('#portfolioPlannerView');
    await expect(planner).toBeVisible();
    await expect(page).toHaveURL(/pv=planner/);
    const tray = planner.locator('.planner-tray');
    await expect(tray.locator('.planner-tray-card')).toHaveText([/Write spec/, /Ship build/]);

    await tray.getByRole('button', { name: 'Backlog' }).click();
    await expect(tray.locator('.planner-tray-card')).toHaveCount(3);
  });

  test('switches between day and week and navigates dates', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();
    const planner = page.locator('#portfolioPlannerView');
    const label = planner.locator('#portfolioPlannerPeriod');
    const todayLabel = await label.textContent();

    await planner.getByRole('button', { name: 'Next day' }).click();
    await expect(label).not.toHaveText(todayLabel!);
    await planner.getByRole('button', { name: 'Today' }).click();
    await expect(label).toHaveText(todayLabel!);

    await planner.getByRole('button', { name: 'Week', exact: true }).click();
    await expect(planner.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(planner.getByRole('button', { name: 'Next week' })).toBeVisible();
    await planner.getByRole('button', { name: 'Today' }).click();
    await expect(planner.getByRole('button', { name: 'Week', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: FAIL — cannot find the `Day Planner` button.

- [ ] **Step 3: Add the strings and date formatter**

In `src/shared/i18n.ts`, add to `en` (next to the `planner.block*` keys from Task 6):

```ts
    'toolbar.planner': 'Day Planner',
    'planner.today': 'Today',
    'planner.previousDay': 'Previous day',
    'planner.nextDay': 'Next day',
    'planner.previousWeek': 'Previous week',
    'planner.nextWeek': 'Next week',
    'planner.day': 'Day',
    'planner.week': 'Week',
    'planner.rangeLabel': 'Planner range',
    'planner.summary': '{planned} planned of {capacity}',
    'planner.trayLabel': 'Tasks to plan',
    'planner.statusFilterLabel': 'Show statuses',
    'planner.planned': 'planned',
    'planner.noTasks': 'No tasks match the current filters.',
    'planner.readOnlyTask': 'Read-only project',
    'planner.dayColumn': 'Schedule for {date}',
    'planner.blockLabel': '{title}, {start} to {end}, {project}',
    'planner.removeBlock': 'Remove {title} from the plan',
    'planner.dragHint': 'Drag a task onto the day. Drag a block to move it, or its edges to resize. Delete removes a selected block.',
```

and to `pt`:

```ts
    'toolbar.planner': 'Planeador',
    'planner.today': 'Hoje',
    'planner.previousDay': 'Dia anterior',
    'planner.nextDay': 'Dia seguinte',
    'planner.previousWeek': 'Semana anterior',
    'planner.nextWeek': 'Semana seguinte',
    'planner.day': 'Dia',
    'planner.week': 'Semana',
    'planner.rangeLabel': 'Intervalo do planeador',
    'planner.summary': '{planned} planeadas de {capacity}',
    'planner.trayLabel': 'Tarefas para planear',
    'planner.statusFilterLabel': 'Mostrar estados',
    'planner.planned': 'planeada',
    'planner.noTasks': 'Nenhuma tarefa corresponde aos filtros atuais.',
    'planner.readOnlyTask': 'Projeto só de leitura',
    'planner.dayColumn': 'Agenda de {date}',
    'planner.blockLabel': '{title}, {start} a {end}, {project}',
    'planner.removeBlock': 'Remover {title} do plano',
    'planner.dragHint': 'Arraste uma tarefa para o dia. Arraste um bloco para o mover ou as suas margens para o redimensionar. Delete remove o bloco selecionado.',
```

After `getCalendarMonthLabel` in the same file, add:

```ts
// "Friday, 25 Sep 2026" (long) or "Fri 25" (short) for a YYYY-MM-DD date.
export function formatPlannerDateLabel(language: Language, isoDate: string, short = false): string {
    const [year, month, day] = isoDate.split('-').map(Number);
    if (!year || !month || !day) return isoDate;
    const options: Intl.DateTimeFormatOptions = short
        ? { weekday: 'short', day: 'numeric', timeZone: 'UTC' }
        : { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' };
    return new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en-GB', options).format(new Date(Date.UTC(year, month - 1, day)));
}
```

- [ ] **Step 4: Add the geometry helpers**

Create `src/features/portfolio/planner/plannerGeometry.ts`:

```ts
// Pixel geometry of the planner grid. One 15-minute slot is PLANNER_SLOT_PX tall.
import { PLANNER_DAY_END, PLANNER_DAY_START, PLANNER_SLOT_MINUTES } from '@/domain/dayPlanner';

export const PLANNER_SLOT_PX = 24;
export const PLANNER_GRID_HEIGHT_PX = ((PLANNER_DAY_END - PLANNER_DAY_START) / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_PX;

export function plannerMinutesToPx(minutes: number): number {
    return ((minutes - PLANNER_DAY_START) / PLANNER_SLOT_MINUTES) * PLANNER_SLOT_PX;
}
```

- [ ] **Step 5: Build the tray**

Create `src/features/portfolio/planner/PlannerTray.tsx`. Cards are plain elements for now; Task 9 makes them draggable.

```tsx
import type { CSSProperties, ReactNode } from 'react';
import type { TaskStatus } from '@/domain/types';
import type { PlannerTrayGroup, PlannerTrayItem } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';

export const PLANNER_TRAY_STATUSES: readonly TaskStatus[] = ['backlog', 'to-do', 'doing', 'done'];

const STATUS_LABEL_KEYS = {
    backlog: 'board.backlog',
    'to-do': 'board.toDo',
    doing: 'board.doing',
    done: 'board.done'
} as const;

export function PlannerTrayCardBody({ item }: { item: PlannerTrayItem }) {
    const { t } = useI18n();
    return (
        <>
            <span className="planner-tray-card-title">{item.title}</span>
            <span className="planner-tray-card-meta">
                {item.priority && <span className={`planner-pill priority-${item.priority}`}>{item.priority.charAt(0).toUpperCase()}</span>}
                <span>#{item.taskId}</span>
                {item.effort && <span>{item.effort}</span>}
                {!item.canDrag && <span>{t('planner.readOnlyTask')}</span>}
                {item.planned && <span className="planner-tray-card-planned">✓ {t('planner.planned')}</span>}
            </span>
        </>
    );
}

export function PlannerTray({ groups, statuses, onToggleStatus, renderCard }: {
    groups: PlannerTrayGroup[];
    statuses: readonly TaskStatus[];
    onToggleStatus: (status: TaskStatus) => void;
    renderCard?: (item: PlannerTrayItem) => ReactNode;
}) {
    const { t } = useI18n();
    return (
        <aside className="planner-tray" aria-label={t('planner.trayLabel')}>
            <div className="planner-tray-filters" role="group" aria-label={t('planner.statusFilterLabel')}>
                {PLANNER_TRAY_STATUSES.map((status) => (
                    <button
                        key={status}
                        type="button"
                        className={`planner-chip${statuses.includes(status) ? ' active' : ''}`}
                        aria-pressed={statuses.includes(status)}
                        onClick={() => onToggleStatus(status)}
                    >{t(STATUS_LABEL_KEYS[status])}</button>
                ))}
            </div>
            <div className="planner-tray-list">
                {groups.length === 0 && <p className="empty-state-text">{t('planner.noTasks')}</p>}
                {groups.map((group) => (
                    <section className="planner-tray-group" key={group.boardId} aria-label={group.boardTitle}>
                        <h3 className="planner-tray-group-title">{group.boardTitle}</h3>
                        {group.items.map((item) => renderCard ? renderCard(item) : (
                            <div
                                key={`${item.boardId}:${item.taskId}`}
                                className={`planner-tray-card${item.planned ? ' planned' : ''}`}
                                data-task-id={item.taskId}
                                style={{ '--planner-project': item.color.border } as CSSProperties}
                            >
                                <PlannerTrayCardBody item={item} />
                            </div>
                        ))}
                    </section>
                ))}
            </div>
        </aside>
    );
}
```

- [ ] **Step 6: Build the view shell**

Create `src/features/portfolio/planner/PortfolioPlanner.tsx`. The grid placeholder is replaced in Task 8.

```tsx
import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { TaskStatus } from '@/domain/types';
import { formatPlannerDuration } from '@/domain/dayPlanner';
import { todayLocalIsoDate } from '@/domain/util';
import { useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioPlannerViewModel, type PlannerViewModel } from '@/features/portfolio/queries';
import {
    setPortfolioPlannerMode,
    shiftPortfolioPlannerDate,
    showPortfolioPlannerToday
} from '@/features/portfolio/commands/portfolioControls';
import { formatPlannerDateLabel, useI18n } from '@/shared/i18n';
import { PlannerTray } from './PlannerTray';

const DEFAULT_TRAY_STATUSES: TaskStatus[] = ['to-do', 'doing'];

// Re-renders once a minute so the "now" line and today's date stay current.
function useNow(): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

function PlannerHeader({ model }: { model: PlannerViewModel }) {
    const { language, t } = useI18n();
    const week = model.mode === 'week';
    const label = week
        ? `${formatPlannerDateLabel(language, model.days[0]?.date || model.date)} – ${formatPlannerDateLabel(language, model.days[model.days.length - 1]?.date || model.date)}`
        : formatPlannerDateLabel(language, model.date);
    const ratio = model.capacityMinutes > 0 ? Math.min(1, model.plannedMinutes / model.capacityMinutes) : 0;
    return (
        <header className="planner-header">
            <div className="planner-nav">
                <button className="btn" type="button" aria-label={week ? t('planner.previousWeek') : t('planner.previousDay')} onClick={() => shiftPortfolioPlannerDate(-1)}>‹</button>
                <button className="btn" type="button" onClick={() => showPortfolioPlannerToday()}>{t('planner.today')}</button>
                <button className="btn" type="button" aria-label={week ? t('planner.nextWeek') : t('planner.nextDay')} onClick={() => shiftPortfolioPlannerDate(1)}>›</button>
            </div>
            <h2 className="planner-period" id="portfolioPlannerPeriod" aria-live="polite">{label}</h2>
            <div className="planner-mode-toggle" role="group" aria-label={t('planner.rangeLabel')}>
                <button className={`btn${week ? '' : ' active'}`} type="button" aria-pressed={!week} onClick={() => setPortfolioPlannerMode('day')}>{t('planner.day')}</button>
                <button className={`btn${week ? ' active' : ''}`} type="button" aria-pressed={week} onClick={() => setPortfolioPlannerMode('week')}>{t('planner.week')}</button>
            </div>
            <div className="planner-summary">
                <span>{t('planner.summary', { planned: formatPlannerDuration(model.plannedMinutes), capacity: formatPlannerDuration(model.capacityMinutes) })}</span>
                <span className="planner-summary-bar" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /></span>
            </div>
        </header>
    );
}

function ConnectedPlanner() {
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards,
        portfolioVisibleRows: s.portfolioVisibleRows,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId,
        portfolioTimelineSelection: s.portfolioTimelineSelection,
        portfolioPlannerDate: s.portfolioPlannerDate,
        portfolioPlannerMode: s.portfolioPlannerMode,
        activeLanguage: s.activeLanguage
    })));
    const [trayStatuses, setTrayStatuses] = useState<TaskStatus[]>(DEFAULT_TRAY_STATUSES);
    useNow();
    const model = buildPortfolioPlannerViewModel(state, { today: todayLocalIsoDate(), trayStatuses });
    const toggleStatus = (status: TaskStatus) => setTrayStatuses((current) => (
        current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
    ));
    return (
        <>
            <PlannerHeader model={model} />
            <div className="planner-body">
                <PlannerTray groups={model.trayGroups} statuses={trayStatuses} onToggleStatus={toggleStatus} />
                <section className="planner-grid-panel" />
            </div>
        </>
    );
}

export function PortfolioPlanner({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-planner-view${hidden ? ' hidden' : ''}`} id="portfolioPlannerView">
            {!hidden && <ConnectedPlanner />}
        </div>
    );
}
```

- [ ] **Step 7: Mount it and add the toolbar button**

In `src/app/App.tsx`:
- Import: `import { PortfolioPlanner } from '@/features/portfolio/planner/PortfolioPlanner';`
- After `const calendarActive = ...` add: `const plannerActive = hasBoards && viewMode === 'planner';`
- Change the board line to `<PortfolioBoard hidden={roadmapActive || calendarActive || plannerActive} />`
- After `<PortfolioCalendar ... />` add `<PortfolioPlanner hidden={!plannerActive} />`

In `src/features/portfolio/shell/PortfolioControls.tsx`, after the Calendar button in `#portfolioViewModeToggle`:

```tsx
                    <button
                        className={`btn${viewMode === 'planner' ? ' active' : ''}`}
                        type="button"
                        data-view-mode="planner"
                        aria-pressed={viewMode === 'planner'}
                        onClick={() => setPortfolioViewMode('planner')}
                    >{t('toolbar.planner')}</button>
```

- [ ] **Step 8: Add the styles**

Create `src/styles/portfolio/planner.css`:

```css
/* Day planner: header, task tray, time grid and blocks. */
.portfolio-planner-view {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    background-color: var(--bg-card);
    border: 1px solid var(--border-light);
}

.planner-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-light);
}

.planner-nav,
.planner-mode-toggle {
    display: flex;
    gap: 4px;
}

.planner-period {
    font-size: 14px;
    font-weight: 700;
    margin-right: auto;
}

.planner-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-secondary);
}

.planner-summary-bar {
    width: 120px;
    height: 6px;
    border-radius: 3px;
    overflow: hidden;
    background-color: var(--bg-secondary);
}

.planner-summary-bar i {
    display: block;
    height: 100%;
    background-color: var(--accent);
}

.planner-body {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    min-height: 0;
    flex: 1;
}

.planner-tray {
    display: flex;
    flex-direction: column;
    min-width: 0;
    border-right: 1px solid var(--border-light);
    background-color: var(--bg-primary);
}

.planner-tray-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light);
}

.planner-chip {
    font: inherit;
    font-size: 11px;
    padding: 2px 8px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background-color: var(--bg-card);
    color: var(--text-secondary);
    cursor: pointer;
}

.planner-chip.active {
    border-color: var(--accent);
    color: var(--accent);
}

.planner-tray-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    overflow-y: auto;
    max-height: 70vh;
}

.planner-tray-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.planner-tray-group-title {
    margin-top: 6px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
}

.planner-tray-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 7px 9px;
    border: 1px solid var(--border-light);
    border-left: 3px solid var(--planner-project, var(--accent));
    border-radius: 4px;
    background-color: var(--bg-card);
    cursor: grab;
    user-select: none;
    touch-action: none;
}

.planner-tray-card.planned {
    opacity: 0.6;
}

.planner-tray-card.dragging {
    opacity: 0.4;
}

.planner-tray-card[aria-disabled="true"] {
    cursor: not-allowed;
}

.planner-tray-card-title {
    font-size: 12px;
    font-weight: 600;
}

.planner-tray-card-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--text-muted);
}

.planner-tray-card-planned {
    margin-left: auto;
    color: var(--accent);
    font-weight: 600;
}

.planner-pill {
    padding: 0 5px;
    border: 1px solid currentColor;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
}

.planner-pill.priority-high { color: var(--priority-high); }
.planner-pill.priority-medium { color: var(--priority-medium); }
.planner-pill.priority-low { color: var(--priority-low); }

.planner-grid-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

@media (max-width: 820px) {
    .planner-body {
        grid-template-columns: minmax(0, 1fr);
    }

    .planner-tray {
        border-right: none;
        border-bottom: 1px solid var(--border-light);
    }

    .planner-tray-list {
        max-height: 220px;
    }
}
```

In `src/styles/app.css`, add `@import './portfolio/planner.css';` after the `calendar.css` import.

- [ ] **Step 9: Run the e2e test and confirm it passes**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: PASS (2 tests).

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/features/portfolio/planner src/styles/portfolio/planner.css src/styles/app.css src/shared/i18n.ts src/features/portfolio/shell/PortfolioControls.tsx src/app/App.tsx tests/e2e/planner.test.ts
git commit -m "feat(planner): add the Day Planner view with header and task tray"
```

---

### Task 8: Time grid with blocks and the now line

**Files:**
- Create: `src/features/portfolio/planner/PlannerGrid.tsx`
- Create: `src/features/portfolio/planner/PlannerBlock.tsx`
- Modify: `src/features/portfolio/planner/PortfolioPlanner.tsx`
- Modify: `src/styles/portfolio/planner.css` (append)
- Test: `tests/e2e/planner.test.ts` (append)

**Interfaces:**
- Consumes: `PlannerViewModel`, `PlannerBlockView`, `PlannerDayView` (Task 5); `plannerGeometry.ts` (Task 7); domain constants.
- Produces:
  - `PlannerGrid({ model, nowMinutes, renderBlock, preview })`. Each day column is `.planner-day[data-planner-date="YYYY-MM-DD"]` and registers itself as a dnd-kit droppable with id `day:<date>` and data `{ date }`. dnd-kit hooks fall back to a default context, so this is harmless before Task 9 adds the `DndContext`. `preview` is `{ date: string; startMinutes: number } | null` (used by Task 9).
  - `PlannerBlock({ block, selected, dragging, onSelect, onOpen, onRemove, onKeyDown, onGestureStart })`: a `.planner-block[data-block-id]` element with `role="button"`. Task 10 supplies the handlers; until then they are no-ops.

- [ ] **Step 1: Append the failing e2e test**

Add this helper below the imports in `tests/e2e/planner.test.ts` (the browser and Node share the machine's time zone):

```ts
function localIsoDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
```

Then add inside `test.describe('day planner', ...)`:

```ts
  test('renders stored blocks at their times, side by side when they overlap', async ({ page }) => {
    const today = localIsoDate();
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }, { id: 2, title: 'Review', status: 'doing' }],
      extensions: { dayPlanner: { version: 1, blocks: [
        { id: 'b1', taskId: 1, date: today, start: '09:00', end: '10:30' },
        { id: 'b2', taskId: 2, date: today, start: '10:00', end: '11:00' }
      ] } }
    }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();

    const day = page.locator(`.planner-day[data-planner-date="${today}"]`);
    const first = day.locator('[data-block-id="b1"]');
    const second = day.locator('[data-block-id="b2"]');
    await expect(first).toContainText('Write spec');
    await expect(first).toContainText('09:00–10:30');

    const dayBox = (await day.boundingBox())!;
    const firstBox = (await first.boundingBox())!;
    const secondBox = (await second.boundingBox())!;
    // 09:00 is 8 slots of 24px below 07:00; 90 minutes is 6 slots.
    expect(Math.round(firstBox.y - dayBox.y)).toBeGreaterThanOrEqual(8 * 24);
    expect(Math.round(firstBox.y - dayBox.y)).toBeLessThanOrEqual(8 * 24 + 2);
    expect(Math.round(firstBox.height)).toBeGreaterThanOrEqual(6 * 24 - 4);
    expect(secondBox.x).toBeGreaterThan(firstBox.x + firstBox.width / 2);
    await expect(day.locator('.planner-now')).toHaveCount(1);
  });

  test('shows five weekday columns in week mode', async ({ page }) => {
    await seedPortfolioBoards(page, [{ id: 'alpha', hasHandle: true, title: 'Alpha', tasks: [] }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();
    await page.locator('#portfolioPlannerView').getByRole('button', { name: 'Week', exact: true }).click();
    await expect(page.locator('.planner-day')).toHaveCount(5);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: the two new tests FAIL (no `.planner-day`).

- [ ] **Step 3: Build the block**

Create `src/features/portfolio/planner/PlannerBlock.tsx`:

```tsx
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import type { PlannerGestureMode } from '@/domain/dayPlanner';
import { formatPlannerDuration, PLANNER_SLOT_MINUTES } from '@/domain/dayPlanner';
import type { PlannerBlockView } from '@/features/portfolio/queries';
import { useI18n } from '@/shared/i18n';
import { plannerMinutesToPx } from './plannerGeometry';

export type PlannerBlockHandlers = {
    onSelect: (block: PlannerBlockView) => void;
    onOpen: (block: PlannerBlockView) => void;
    onRemove: (block: PlannerBlockView) => void;
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>, block: PlannerBlockView) => void;
    onGestureStart: (event: PointerEvent<HTMLElement>, block: PlannerBlockView, mode: PlannerGestureMode) => void;
};

export function PlannerBlock({ block, selected, dragging, handlers }: {
    block: PlannerBlockView;
    selected: boolean;
    dragging: boolean;
    handlers: PlannerBlockHandlers;
}) {
    const { t } = useI18n();
    const top = plannerMinutesToPx(block.startMinutes);
    const height = plannerMinutesToPx(block.endMinutes) - top;
    const compact = block.endMinutes - block.startMinutes <= PLANNER_SLOT_MINUTES;
    const style = {
        top: `${top + 1}px`,
        height: `${height - 2}px`,
        left: `calc(${(block.column / block.columns) * 100}% + 4px)`,
        width: `calc(${100 / block.columns}% - 8px)`,
        '--planner-block-bg': block.color.bg,
        '--planner-block-border': block.color.border,
        '--planner-block-text': block.color.text
    } as CSSProperties;
    const className = ['planner-block',
        selected && 'selected', dragging && 'dragging', block.done && 'done',
        block.archived && 'archived', !block.canEdit && 'read-only'].filter(Boolean).join(' ');

    return (
        <div
            className={className}
            style={style}
            role="button"
            tabIndex={0}
            data-block-id={block.id}
            aria-label={t('planner.blockLabel', { title: block.title, start: block.start, end: block.end, project: block.boardTitle })}
            onClick={() => handlers.onSelect(block)}
            onDoubleClick={() => handlers.onOpen(block)}
            onKeyDown={(event) => handlers.onKeyDown(event, block)}
            onPointerDown={(event) => block.canEdit && handlers.onGestureStart(event, block, 'move')}
        >
            {block.canEdit && <span className="planner-block-handle top" aria-hidden="true" onPointerDown={(event) => handlers.onGestureStart(event, block, 'resize-start')} />}
            <span className="planner-block-title">
                {block.title}
                {compact && <span className="planner-block-meta"> {block.start}</span>}
            </span>
            {!compact && (
                <span className="planner-block-meta">
                    {block.start}–{block.end} · {formatPlannerDuration(block.endMinutes - block.startMinutes)} · {block.boardTitle}
                </span>
            )}
            {block.canEdit && (
                <button
                    className="planner-block-remove"
                    type="button"
                    aria-label={t('planner.removeBlock', { title: block.title })}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); handlers.onRemove(block); }}
                >×</button>
            )}
            {block.canEdit && <span className="planner-block-handle bottom" aria-hidden="true" onPointerDown={(event) => handlers.onGestureStart(event, block, 'resize-end')} />}
        </div>
    );
}
```

- [ ] **Step 4: Build the grid**

Create `src/features/portfolio/planner/PlannerGrid.tsx`:

```tsx
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useDroppable } from '@dnd-kit/core';
import {
    PLANNER_DAY_END,
    PLANNER_DAY_START,
    PLANNER_DEFAULT_BLOCK_MINUTES,
    PLANNER_WORK_END,
    PLANNER_WORK_START,
    formatPlannerTime
} from '@/domain/dayPlanner';
import type { PlannerBlockView, PlannerDayView, PlannerViewModel } from '@/features/portfolio/queries';
import { formatPlannerDateLabel, useI18n } from '@/shared/i18n';
import { PLANNER_GRID_HEIGHT_PX, PLANNER_SLOT_PX, plannerMinutesToPx } from './plannerGeometry';

export type PlannerDropPreview = { date: string; startMinutes: number };

const HOURS = Array.from({ length: (PLANNER_DAY_END - PLANNER_DAY_START) / 60 }, (_, index) => PLANNER_DAY_START + index * 60);
const INITIAL_SCROLL_MINUTES = 8 * 60 + 30;

function PlannerDayColumn({ day, nowMinutes, preview, renderBlock }: {
    day: PlannerDayView;
    nowMinutes: number;
    preview: PlannerDropPreview | null;
    renderBlock: (block: PlannerBlockView) => ReactNode;
}) {
    const { language, t } = useI18n();
    const { setNodeRef } = useDroppable({ id: `day:${day.date}`, data: { date: day.date } });
    const showNow = day.isToday && nowMinutes >= PLANNER_DAY_START && nowMinutes <= PLANNER_DAY_END;
    const previewHere = preview?.date === day.date ? preview : null;
    return (
        <div
            ref={setNodeRef}
            className={`planner-day${previewHere ? ' drop-target' : ''}`}
            data-planner-date={day.date}
            role="group"
            aria-label={t('planner.dayColumn', { date: formatPlannerDateLabel(language, day.date) })}
        >
            <div className="planner-offhours" style={{ top: 0, height: `${plannerMinutesToPx(PLANNER_WORK_START)}px` }} />
            <div className="planner-offhours" style={{ top: `${plannerMinutesToPx(PLANNER_WORK_END)}px`, bottom: 0 }} />
            {previewHere && (
                <div
                    className="planner-drop-preview"
                    style={{
                        top: `${plannerMinutesToPx(previewHere.startMinutes)}px`,
                        height: `${(PLANNER_DEFAULT_BLOCK_MINUTES / 15) * PLANNER_SLOT_PX}px`
                    }}
                >
                    {formatPlannerTime(previewHere.startMinutes)}–{formatPlannerTime(previewHere.startMinutes + PLANNER_DEFAULT_BLOCK_MINUTES)}
                </div>
            )}
            {day.blocks.map(renderBlock)}
            {showNow && <div className="planner-now" style={{ top: `${plannerMinutesToPx(nowMinutes)}px` }} aria-hidden="true" />}
        </div>
    );
}

export function PlannerGrid({ model, nowMinutes, preview = null, renderBlock }: {
    model: PlannerViewModel;
    nowMinutes: number;
    preview?: PlannerDropPreview | null;
    renderBlock: (block: PlannerBlockView) => ReactNode;
}) {
    const { language, t } = useI18n();
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = plannerMinutesToPx(INITIAL_SCROLL_MINUTES);
    }, []);
    const week = model.mode === 'week';
    const style = { '--planner-slot': `${PLANNER_SLOT_PX}px`, '--planner-days': model.days.length } as CSSProperties;
    return (
        <div className="planner-grid-panel">
            {week && (
                <div className="planner-day-headers" style={style}>
                    <span />
                    {model.days.map((day) => (
                        <span key={day.date} className={`planner-day-header${day.isToday ? ' today' : ''}`}>
                            {formatPlannerDateLabel(language, day.date, true)}
                        </span>
                    ))}
                </div>
            )}
            <div className="planner-grid-scroll" ref={scrollRef}>
                <div className="planner-grid" style={{ ...style, height: `${PLANNER_GRID_HEIGHT_PX}px` }}>
                    <div className="planner-hours" aria-hidden="true">
                        {HOURS.map((minutes) => (
                            <span key={minutes} style={{ top: `${plannerMinutesToPx(minutes)}px` }}>{formatPlannerTime(minutes)}</span>
                        ))}
                    </div>
                    {model.days.map((day) => (
                        <PlannerDayColumn key={day.date} day={day} nowMinutes={nowMinutes} preview={preview} renderBlock={renderBlock} />
                    ))}
                </div>
            </div>
            <p className="planner-hint">{t('planner.dragHint')}</p>
        </div>
    );
}
```

- [ ] **Step 5: Render the grid in the view**

In `src/features/portfolio/planner/PortfolioPlanner.tsx`:
- Add imports: `import { PlannerGrid } from './PlannerGrid';` and `import { PlannerBlock, type PlannerBlockHandlers } from './PlannerBlock';`
- In `ConnectedPlanner`, replace `useNow();` with `const now = useNow();` and add `const nowMinutes = now.getHours() * 60 + now.getMinutes();`
- Add placeholder handlers inside `ConnectedPlanner` (replaced in Task 10):

```tsx
    const noop = () => {};
    const blockHandlers: PlannerBlockHandlers = { onSelect: noop, onOpen: noop, onRemove: noop, onKeyDown: noop, onGestureStart: noop };
```

- Replace `<section className="planner-grid-panel" />` with:

```tsx
                <PlannerGrid
                    model={model}
                    nowMinutes={nowMinutes}
                    renderBlock={(block) => (
                        <PlannerBlock key={block.id} block={block} selected={false} dragging={false} handlers={blockHandlers} />
                    )}
                />
```

- [ ] **Step 6: Append the grid styles**

Append to `src/styles/portfolio/planner.css`:

```css
.planner-day-headers,
.planner-grid {
    display: grid;
    grid-template-columns: 56px repeat(var(--planner-days, 1), minmax(0, 1fr));
}

.planner-day-headers {
    border-bottom: 1px solid var(--border-light);
}

.planner-day-header {
    padding: 6px 0;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
}

.planner-day-header.today {
    color: var(--accent);
}

.planner-grid-scroll {
    position: relative;
    overflow-y: auto;
    max-height: 70vh;
}

.planner-grid {
    position: relative;
}

.planner-hours {
    position: relative;
}

.planner-hours span {
    position: absolute;
    right: 8px;
    transform: translateY(-6px);
    font-size: 10px;
    color: var(--text-muted);
}

.planner-day {
    position: relative;
    border-left: 1px solid var(--border-light);
    background-image:
        linear-gradient(to bottom, var(--border) 1px, transparent 1px),
        linear-gradient(to bottom, var(--border-light) 1px, transparent 1px);
    background-size: 100% calc(var(--planner-slot) * 4), 100% var(--planner-slot);
}

.planner-day.drop-target {
    background-color: var(--bg-primary);
}

.planner-offhours {
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
    background: repeating-linear-gradient(45deg, transparent 0 6px, var(--bg-secondary) 6px 7px);
}

.planner-drop-preview {
    position: absolute;
    left: 4px;
    right: 4px;
    z-index: 3;
    padding: 2px 6px;
    border: 2px dashed var(--accent);
    border-radius: 4px;
    color: var(--accent);
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
}

.planner-block {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 3px 8px;
    border: 1px solid var(--planner-block-border);
    border-left-width: 4px;
    border-radius: 4px;
    background-color: var(--planner-block-bg);
    color: var(--planner-block-text);
    cursor: grab;
    user-select: none;
    touch-action: none;
}

.planner-block:focus-visible,
.planner-block.selected {
    outline: 2px solid var(--focus-ring);
    outline-offset: 1px;
}

.planner-block.dragging {
    z-index: 4;
    cursor: grabbing;
    opacity: 0.85;
}

.planner-block.done .planner-block-title {
    text-decoration: line-through;
}

.planner-block.done,
.planner-block.archived {
    opacity: 0.6;
}

.planner-block.read-only {
    cursor: default;
}

.planner-block-title {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.planner-block-meta {
    font-size: 11px;
    opacity: 0.85;
}

.planner-block-handle {
    position: absolute;
    left: 0;
    right: 0;
    height: 7px;
    cursor: ns-resize;
}

.planner-block-handle.top { top: 0; }
.planner-block-handle.bottom { bottom: 0; }

.planner-block-remove {
    position: absolute;
    top: 2px;
    right: 4px;
    display: none;
    padding: 0 4px;
    border: none;
    background: none;
    color: inherit;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
}

.planner-block:hover .planner-block-remove,
.planner-block:focus-within .planner-block-remove {
    display: block;
}

.planner-now {
    position: absolute;
    left: -4px;
    right: 0;
    z-index: 5;
    height: 2px;
    background-color: var(--priority-high);
    pointer-events: none;
}

.planner-now::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background-color: var(--priority-high);
}

.planner-hint {
    padding: 8px 14px;
    border-top: 1px solid var(--border-light);
    font-size: 11px;
    color: var(--text-muted);
}
```

- [ ] **Step 7: Run the e2e tests and confirm they pass**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: PASS (4 tests).

If the `.planner-now` assertion fails because the test runs outside 07:00–21:00, the line is correctly hidden. In that case, make the assertion conditional: `const hour = new Date().getHours(); if (hour >= 7 && hour < 21) await expect(...).toHaveCount(1);`.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 8: Check it visually**

Start the dev server (`preview_start` name `kanban-dev`), create a project in the UI, open Day Planner, and screenshot the page in light and dark themes. Check that working-hour shading, hour labels, and blocks line up.

- [ ] **Step 9: Commit**

```bash
git add src/features/portfolio/planner src/styles/portfolio/planner.css tests/e2e/planner.test.ts
git commit -m "feat(planner): render the time grid, blocks and now line"
```

---

### Task 9: Drag tasks from the tray onto the grid

**Files:**
- Modify: `src/features/portfolio/planner/PortfolioPlanner.tsx`
- Modify: `src/features/portfolio/planner/PlannerTray.tsx`
- Test: `tests/e2e/planner.test.ts` (append)

**Interfaces:**
- Consumes: `addPlannerBlock` (Task 6); `minutesAtPlannerOffset`, `clampPlannerStart`, `PLANNER_DEFAULT_BLOCK_MINUTES`, `PLANNER_WORK_START` (Task 1); the `PlannerGrid` `preview` prop and the `day:<date>` droppables (Task 8); the `PlannerTray` `renderCard` prop (Task 7).
- Produces: draggable tray cards with dnd id `tray:<boardId>:<taskId>` and data `{ boardId, taskId, title }`.

- [ ] **Step 1: Append the failing e2e test**

Add `readSavedBoard`, `waitForBoardWrites`, `dragWithMouse` to the support import at the top of `tests/e2e/planner.test.ts`, then add:

```ts
  test('dragging a task onto the day creates a 1-hour block and saves it without changing the task', async ({ page }) => {
    const today = localIsoDate();
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }]
    }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();

    const card = page.locator('.planner-tray-card').filter({ hasText: 'Write spec' });
    const day = page.locator(`.planner-day[data-planner-date="${today}"]`);
    // 10:00 is 12 slots of 24px below 07:00; aim inside that slot.
    await dragWithMouse(page, card, day, { targetPosition: { x: 40, y: 12 * 24 + 6 } });

    await expect(day.locator('.planner-block')).toContainText('10:00–11:00');
    await waitForBoardWrites(page);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.dayPlanner.blocks).toEqual([
      expect.objectContaining({ taskId: 1, date: today, start: '10:00', end: '11:00' })
    ]);
    expect(saved.board.tasks[0].status).toBe('to-do');
    await expect(card).toContainText('planned');
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx playwright test tests/e2e/planner.test.ts -g "dragging a task"`
Expected: FAIL — no `.planner-block` appears.

- [ ] **Step 3: Make the tray cards draggable**

Add to `src/features/portfolio/planner/PlannerTray.tsx`:

```tsx
import { useDraggable } from '@dnd-kit/core';

export const trayDragId = (item: PlannerTrayItem) => `tray:${item.boardId}:${item.taskId}`;

export function DraggablePlannerTrayCard({ item }: { item: PlannerTrayItem }) {
    const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
        id: trayDragId(item),
        data: { boardId: item.boardId, taskId: item.taskId, title: item.title },
        attributes: { roleDescription: 'draggable task' },
        disabled: !item.canDrag
    });
    return (
        <div
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className={`planner-tray-card${item.planned ? ' planned' : ''}${isDragging ? ' dragging' : ''}`}
            data-task-id={item.taskId}
            aria-disabled={!item.canDrag}
            style={{ '--planner-project': item.color.border } as CSSProperties}
        >
            <PlannerTrayCardBody item={item} />
        </div>
    );
}
```

(Merge the `@dnd-kit/core` import with the file's existing imports.)

- [ ] **Step 4: Add the DnD context and drop handling**

In `src/features/portfolio/planner/PortfolioPlanner.tsx`, add imports:

```tsx
import { createPortal } from 'react-dom';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type DragEndEvent,
    type DragMoveEvent
} from '@dnd-kit/core';
import {
    PLANNER_DEFAULT_BLOCK_MINUTES,
    PLANNER_WORK_START,
    clampPlannerStart,
    minutesAtPlannerOffset
} from '@/domain/dayPlanner';
import type { PlannerTrayItem } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { PLANNER_SLOT_PX } from './plannerGeometry';
import type { PlannerDropPreview } from './PlannerGrid';
import { DraggablePlannerTrayCard, PlannerTrayCardBody, trayDragId } from './PlannerTray';
```

Add these helpers above `ConnectedPlanner`:

```tsx
type TrayDragData = { boardId: string; taskId: number; title: string };

// The slot under the pointer, for the day column being hovered. Keyboard drags
// have no pointer position, so they start at the beginning of the working day.
function dropStartMinutes(event: DragMoveEvent | DragEndEvent, date: string): number {
    const activator = event.activatorEvent as Partial<MouseEvent & TouchEvent>;
    const startY = typeof activator.clientY === 'number' ? activator.clientY : activator.touches?.[0]?.clientY;
    const column = document.querySelector<HTMLElement>(`.planner-day[data-planner-date="${date}"]`);
    if (typeof startY !== 'number' || !column) return PLANNER_WORK_START;
    const offset = startY + event.delta.y - column.getBoundingClientRect().top;
    return clampPlannerStart(minutesAtPlannerOffset(offset, PLANNER_SLOT_PX), PLANNER_DEFAULT_BLOCK_MINUTES);
}
```

Replace the body of `ConnectedPlanner` from `const toggleStatus` onward:

```tsx
    const actions = usePortfolioActions();
    const [preview, setPreview] = useState<PlannerDropPreview | null>(null);
    const [activeItem, setActiveItem] = useState<PlannerTrayItem | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor)
    );
    const toggleStatus = (status: TaskStatus) => setTrayStatuses((current) => (
        current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
    ));
    const findTrayItem = (id: unknown) => model.trayGroups.flatMap((group) => group.items).find((item) => trayDragId(item) === id) || null;

    const onDragMove = (event: DragMoveEvent) => {
        const date = event.over?.data.current?.date as string | undefined;
        setPreview(date ? { date, startMinutes: dropStartMinutes(event, date) } : null);
    };
    const onDragEnd = (event: DragEndEvent) => {
        setPreview(null);
        setActiveItem(null);
        const data = event.active.data.current as TrayDragData | undefined;
        const date = event.over?.data.current?.date as string | undefined;
        if (!data || !date) return;
        void actions.addPlannerBlock(data.boardId, data.taskId, date, dropStartMinutes(event, date));
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={({ active }) => setActiveItem(findTrayItem(active.id))}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={() => { setPreview(null); setActiveItem(null); }}
        >
            <PlannerHeader model={model} />
            <div className="planner-body">
                <PlannerTray
                    groups={model.trayGroups}
                    statuses={trayStatuses}
                    onToggleStatus={toggleStatus}
                    renderCard={(item) => <DraggablePlannerTrayCard key={trayDragId(item)} item={item} />}
                />
                <PlannerGrid
                    model={model}
                    nowMinutes={nowMinutes}
                    preview={preview}
                    renderBlock={(block) => (
                        <PlannerBlock key={block.id} block={block} selected={false} dragging={false} handlers={blockHandlers} />
                    )}
                />
            </div>
            {createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeItem && (
                        <div className="planner-tray-card" style={{ '--planner-project': activeItem.color.border } as CSSProperties}>
                            <PlannerTrayCardBody item={activeItem} />
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
```

Add `type CSSProperties` to the `react` import.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: PASS (5 tests).

If the new block lands one slot off, check that `dropStartMinutes` uses the column's `getBoundingClientRect().top`. That value already includes the scroll offset, so don't add `scrollTop`.

Run: `npm run typecheck && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/portfolio/planner tests/e2e/planner.test.ts
git commit -m "feat(planner): drag tasks from the tray onto the day"
```

---

### Task 10: Move, resize, remove, open and keyboard control of blocks

**Files:**
- Create: `src/features/portfolio/planner/usePlannerBlockGesture.ts`
- Modify: `src/features/portfolio/planner/PortfolioPlanner.tsx`
- Test: `tests/e2e/planner.test.ts` (append)

**Interfaces:**
- Consumes: `applyPlannerGesture`, `PLANNER_SLOT_MINUTES` (domain); `updatePlannerBlock`, `removePlannerBlock`, `openPortfolioTaskDetailsForCalendar` (actions); `PlannerBlockHandlers` (Task 8).
- Produces:
  - `type PlannerGestureDraft = { boardId: string; blockId: string } & PlannerBlockTimes`
  - `usePlannerBlockGesture(onCommit: (draft: PlannerGestureDraft) => void): { draft: PlannerGestureDraft | null; begin: (event, block, mode) => void }`

- [ ] **Step 1: Append the failing e2e tests**

```ts
  async function openPlannerWithBlock(page: import('@playwright/test').Page) {
    const today = localIsoDate();
    await seedPortfolioBoards(page, [{
      id: 'alpha', hasHandle: true, title: 'Alpha',
      tasks: [{ id: 1, title: 'Write spec', status: 'to-do' }],
      extensions: { dayPlanner: { version: 1, blocks: [{ id: 'b1', taskId: 1, date: today, start: '09:00', end: '10:00' }] } }
    }]);
    await page.getByRole('button', { name: 'Day Planner' }).click();
    return { today, block: page.locator('[data-block-id="b1"]') };
  }

  test('drags a block to move it and its bottom edge to resize it', async ({ page }) => {
    const { today, block } = await openPlannerWithBlock(page);
    const box = (await block.boundingBox())!;

    // Move down 4 slots (1 hour).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4 * 24, { steps: 8 });
    await page.mouse.up();
    await expect(block).toContainText('10:00–11:00');

    // Resize the bottom edge down 2 slots (30 minutes).
    const moved = (await block.boundingBox())!;
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3 + 2 * 24, { steps: 6 });
    await page.mouse.up();
    await expect(block).toContainText('10:00–11:30');

    await waitForBoardWrites(page, 2);
    const saved = await readSavedBoard(page, 'alpha');
    expect(saved.extensions.dayPlanner.blocks[0]).toMatchObject({ date: today, start: '10:00', end: '11:30' });
  });

  test('keyboard moves, resizes and deletes a block, and undo restores it', async ({ page }) => {
    const { block } = await openPlannerWithBlock(page);
    await block.focus();
    await page.keyboard.press('ArrowDown');
    await expect(block).toContainText('09:15–10:15');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(block).toContainText('09:15–10:30');
    await page.keyboard.press('Delete');
    await expect(page.locator('[data-block-id="b1"]')).toHaveCount(0);

    await page.locator('#undoBtn').click();
    await expect(page.locator('[data-block-id="b1"]')).toContainText('09:15–10:30');
  });

  test('double-clicking a block opens the task details', async ({ page }) => {
    const { block } = await openPlannerWithBlock(page);
    await block.dblclick();
    await expect(page.getByRole('dialog')).toContainText('Write spec');
  });
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: the three new tests FAIL (blocks don't respond).

- [ ] **Step 3: Implement the gesture hook**

Create `src/features/portfolio/planner/usePlannerBlockGesture.ts`:

```ts
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
    PLANNER_SLOT_MINUTES,
    applyPlannerGesture,
    type PlannerBlockTimes,
    type PlannerGestureMode
} from '@/domain/dayPlanner';
import type { PlannerBlockView } from '@/features/portfolio/queries';
import { PLANNER_SLOT_PX } from './plannerGeometry';

export type PlannerGestureDraft = { boardId: string; blockId: string } & PlannerBlockTimes;

// Pixels the pointer must travel before a press becomes a drag, so clicks
// and double-clicks still reach the block.
const DRAG_THRESHOLD_PX = 4;

function dateAtPoint(x: number, y: number): string | null {
    const column = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-planner-date]');
    return column?.dataset.plannerDate || null;
}

// Pointer-driven move and resize. While dragging, `draft` holds the block's
// would-be times; `onCommit` runs once on release, only if the pointer moved.
export function usePlannerBlockGesture(onCommit: (draft: PlannerGestureDraft) => void) {
    const [draft, setDraft] = useState<PlannerGestureDraft | null>(null);
    const cleanupRef = useRef<(() => void) | null>(null);
    useEffect(() => () => cleanupRef.current?.(), []);

    function begin(event: ReactPointerEvent<HTMLElement>, block: PlannerBlockView, mode: PlannerGestureMode) {
        if (event.button !== 0 || !block.canEdit) return;
        event.stopPropagation();
        const startX = event.clientX;
        const startY = event.clientY;
        let dragging = false;

        const compute = (moveEvent: PointerEvent): PlannerGestureDraft => {
            const deltaMinutes = ((moveEvent.clientY - startY) / PLANNER_SLOT_PX) * PLANNER_SLOT_MINUTES;
            const targetDate = mode === 'move' ? dateAtPoint(moveEvent.clientX, moveEvent.clientY) || block.date : block.date;
            return { boardId: block.boardId, blockId: block.id, ...applyPlannerGesture(block, mode, deltaMinutes, targetDate) };
        };
        const onMove = (moveEvent: PointerEvent) => {
            if (!dragging && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;
            dragging = true;
            moveEvent.preventDefault();
            setDraft(compute(moveEvent));
        };
        const onUp = (upEvent: PointerEvent) => {
            cleanup();
            setDraft(null);
            if (dragging) onCommit(compute(upEvent));
        };
        const onCancel = () => {
            cleanup();
            setDraft(null);
        };
        const cleanup = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            cleanupRef.current = null;
        };
        cleanupRef.current?.();
        cleanupRef.current = cleanup;
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    }

    return { draft, begin };
}
```

- [ ] **Step 4: Wire the handlers and the drafted rendering**

In `src/features/portfolio/planner/PortfolioPlanner.tsx`:
- Imports: add `type KeyboardEvent` to the `react` import; add `import { applyPlannerGesture, PLANNER_SLOT_MINUTES, plannerMinutes } from '@/domain/dayPlanner';` (merge with the existing domain import); add `import { usePlannerBlockGesture, type PlannerGestureDraft } from './usePlannerBlockGesture';`; add `type PlannerBlockView, type PlannerViewModel` to the queries import if not already there.
- Add this pure helper above `ConnectedPlanner`:

```tsx
// While a block is being dragged, show it at its drafted time and day,
// full width, on top of the others.
function withDraft(model: PlannerViewModel, draft: PlannerGestureDraft | null): PlannerViewModel {
    if (!draft) return model;
    const original = model.days.flatMap((day) => day.blocks).find((block) => block.id === draft.blockId && block.boardId === draft.boardId);
    if (!original) return model;
    const moved: PlannerBlockView = {
        ...original,
        date: draft.date,
        start: draft.start,
        end: draft.end,
        startMinutes: plannerMinutes(draft.start),
        endMinutes: plannerMinutes(draft.end),
        column: 0,
        columns: 1
    };
    return {
        ...model,
        days: model.days.map((day) => ({
            ...day,
            blocks: [...day.blocks.filter((block) => block !== original), ...(day.date === draft.date ? [moved] : [])]
        }))
    };
}
```

- In `ConnectedPlanner`, delete the `noop`/`blockHandlers` placeholder from Task 8. Then insert the following right after `const actions = usePortfolioActions();` (added in Task 9), so every value it uses is already declared:

```tsx
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const gesture = usePlannerBlockGesture((next) => {
        void actions.updatePlannerBlock(next.boardId, next.blockId, { date: next.date, start: next.start, end: next.end });
    });
    const onBlockKeyDown = (event: KeyboardEvent<HTMLDivElement>, block: PlannerBlockView) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            actions.openPortfolioTaskDetailsForCalendar(block.boardId, block.taskId);
            return;
        }
        if (!block.canEdit) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            void actions.removePlannerBlock(block.boardId, block.id);
            return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === 'ArrowUp' ? -PLANNER_SLOT_MINUTES : PLANNER_SLOT_MINUTES;
        const next = applyPlannerGesture(block, event.shiftKey ? 'resize-end' : 'move', delta);
        void actions.updatePlannerBlock(block.boardId, block.id, next);
    };
    const blockHandlers: PlannerBlockHandlers = {
        onSelect: (block) => setSelectedBlockId(block.id),
        onOpen: (block) => actions.openPortfolioTaskDetailsForCalendar(block.boardId, block.taskId),
        onRemove: (block) => { void actions.removePlannerBlock(block.boardId, block.id); },
        onKeyDown: onBlockKeyDown,
        onGestureStart: gesture.begin
    };
    const gridModel = withDraft(model, gesture.draft);
```

- In the JSX, give `PlannerGrid` `model={gridModel}` and change `renderBlock` to:

```tsx
                    renderBlock={(block) => (
                        <PlannerBlock
                            key={block.id}
                            block={block}
                            selected={selectedBlockId === block.id}
                            dragging={gesture.draft?.blockId === block.id}
                            handlers={blockHandlers}
                        />
                    )}
```

Keyboard focus survives the update because each `PlannerBlock` is keyed by the stable block id.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `npx playwright test tests/e2e/planner.test.ts`
Expected: PASS (8 tests).

Run: `npm run test:unit && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Check it by hand in the browser**

Using the `kanban-dev` preview, switch to Week mode and drag a block to another weekday. Confirm it lands on that day at the snapped time, and that Undo moves it back. Take a screenshot.

- [ ] **Step 7: Commit**

```bash
git add src/features/portfolio/planner tests/e2e/planner.test.ts
git commit -m "feat(planner): move, resize, remove and open blocks by pointer and keyboard"
```

---

### Task 12: Planner keyboard shortcuts in the Shortcuts dialog

**Files:**
- Modify: `src/features/portfolio/commands/portfolioShortcuts.ts`
- Modify: `src/app/overlays/ShortcutsDialog.tsx`
- Modify: `src/shared/i18n.ts`
- Test: `tests/e2e/planner.test.ts` (append)

**Shortcuts** (single-key, so they respect the "Enable single-key shortcuts" preference):

| Keys | Action | When |
| --- | --- | --- |
| `P` | Open the Day Planner | projects loaded |
| `T` | Jump to today | planner view |
| `D` / `W` | Day / Week mode | planner view |
| `,` / `.` | Previous / next day or week | planner view |
| `↑` / `↓` | Move focused block 15 min | reference only (handled by the block) |
| `Shift` + `↑` / `↓` | Resize focused block end by 15 min | reference only |
| `Delete` | Remove focused block | reference only |
| `Enter` | Open the focused block's task | reference only |

- Section keys: `'Day Planner'` for active shortcuts, `'Planner Blocks'` for reference-only entries (`match: () => false`).
- The dialog gets a new group "Day Planner" with both sections, localized via `shortcuts.*` keys (EN + PT).
- E2E: pressing `P` opens the planner; `W` switches to week (5 columns); `T` returns to today; the Shortcuts dialog lists "Day Planner".

---

### Task 11: Final verification and docs

**Files:**
- Modify: `ARCHITECTURE.md` (folder map)
- Modify: `README.md` (only if it lists views or the file format; check with `grep -n "Calendar\|extensions" README.md`)

- [ ] **Step 1: Update the folder map**

In `ARCHITECTURE.md`, under `features/portfolio/`, add after the `calendar/` line:

```text
│   ├── planner/                 # day planner view, tray, time grid, block gestures
```

If `README.md` documents the project JSON `extensions`, add a short `dayPlanner` entry with the stored shape from Global Constraints.

- [ ] **Step 2: Run the full suite**

Run: `npm run lint && npm run typecheck && npm run test:unit && npm test`
Expected: everything passes.

If `tests/visual.test.ts` snapshots fail only because the toolbar now has a "Day Planner" button, review the diff images. If the only change is the new button, update the snapshots with `npx playwright test tests/visual.test.ts --update-snapshots`, and mention this in the commit message.

- [ ] **Step 3: Commit**

```bash
git add ARCHITECTURE.md README.md tests/visual.test.ts-snapshots
git commit -m "docs(planner): document the day planner module"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| New `'planner'` view mode and toolbar tab, available when ≥1 project loaded | 4, 7 |
| Tray + grid layout, stacks on narrow screens | 7, 8 |
| Header: ‹ Today ›, date label, Day/Week toggle, planned-of-capacity bar | 7 |
| 07:00–21:00 grid, 15-min slots, shading outside 09:00–17:00 | 1, 8 |
| Now line; scroll to ~08:30 on open | 8 |
| Week = Mon–Fri, today highlighted; ‹ › step by day/week; Today keeps mode | 1, 4, 7, 8 |
| Planner date/mode are view state, not saved to files | 4 |
| Drop task → 1-hour block at the snapped slot, clamped to 21:00 | 1, 6, 9 |
| Move (including across weekdays), resize edges, 15-min snap, min 15 min | 1, 10 |
| Remove via Delete/Backspace or hover × | 8, 10 |
| Double-click opens task details | 10 |
| Overlaps side by side | 3, 5 |
| Same task in many blocks | 6 |
| Undo for add/move/resize/remove | 6, 10 |
| Keyboard: arrows move, Shift+arrows resize end | 10 |
| Tray uses toolbar filters + project chips + own status chips (default To do + Doing) | 5, 7 |
| "✓ planned" in tray | 5, 7, 9 |
| Grid limited to the selected project's blocks when a project chip is active | 5 |
| Project colors; done struck through; archived faded | 5, 8 |
| `extensions.dayPlanner` v1 shape; key removed when empty | 2, 6 |
| Normalization drops invalid blocks and blocks of missing tasks | 2 |
| Writes via save queue; no timeline events; task never modified | 6 |
| EN + PT strings | 6, 7 |
| Vitest domain/query/command tests; Playwright flow | 1–10 |
