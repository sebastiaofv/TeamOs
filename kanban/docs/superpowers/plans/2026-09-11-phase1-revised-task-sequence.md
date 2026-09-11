# Phase 1 — Revised Task Sequence (supersedes Tasks 5-12)

**Created 2026-09-11 after Task 4.** The original Tasks 5-12 were organised one task per
module. That is unsafe: extracting a function whose callee is still in `main.js` leaves an
unresolved free identifier, and `vite build` does **not** catch it — the failure surfaces
only at runtime as `ReferenceError`, and only if a test exercises that path. Task 4 proved
this by extracting `isTaskOverdue`, which built cleanly then failed with
`ReferenceError: normalizeDueDate is not defined`.

Grouping by module also creates false circular dependencies (`serialize`<->`attachments`,
`board`<->`timeline`, and seven more). Those cycles are an artifact of name-based grouping.

**Revised again 2026-09-11** after Task 5 prep found two more classifier blind spots:
`alert()`/`confirm()`/`prompt()` are browser globals the DOM regex missed, and calls
dispatched through `const` objects (`BoardRepository.saveRecord`, `Logger.debug`) are
invisible to a function-only call graph. `notifyPortfolioReadOnly` (calls `alert`) and
`savePortfolioBoardRecord` (calls `BoardRepository`) were wrongly listed as pure.
Pure count corrected 136 -> 132.

**The pure call graph itself is a perfect DAG** — 136 remaining functions, 136
strongly-connected components, zero multi-function cycles. So a safe order exists. These
tasks follow a topological sort: no function is extracted before everything it calls.

Functions still land in their named module file; module assignment is organisation only.
Because modules may import each other cyclically, and ES modules resolve cycles correctly
between hoisted function declarations called at runtime, that is fine and expected.

## Rules for every task below

1. Extract with `node scripts/extract-domain.mjs <module> <names...>`.
2. The script now **refuses an extraction with unresolved references** and rolls back. If
   it refuses, do not use the escape hatch — stop and report; it means the order is wrong.
3. Do not pass `--force` (the template-literal guard). Stop and report instead.
4. Write Vitest tests for what you extract. Read each function first; derive assertions
   from the code, never by running it and recording output.
5. A failing assertion is investigated, not adjusted — compare against
   `git show e78741b:kanban/kanban.html` and fix whichever side is actually wrong.
6. `npm run test:unit` and `npm run build && npm test` must both pass (94 Playwright).
7. Stage explicit paths. Never `git add -A`.





---

## Revision 3 — 2026-09-11, after Task 6

Task 6 hit the unresolved-reference guard on `normalizeTaskAttachments`, which does
`.map(normalizeAttachmentRecord)`. The dependency is a **function reference passed as a
callback**, not a call with parentheses, and the classifier matched only `name(` syntax —
so it saw no edge and placed the function too early.

The guard caught what the analysis missed, which is the defense-in-depth working. But the
same blind spot affected purity: a function passing an impure function as a callback was
not tainted. The classifier now matches bare identifier references too, after stripping
comment and string-literal text so a name inside a string cannot create a false edge.

**Remaining pure corrected from 132 to 92** — 40 functions are reachable to impure code
through callbacks. Tasks below are renumbered from 7; Tasks 1-6 are complete and unaffected.



---

### Task 7 — layer 0, 14 functions


**`src/domain/calendar.js`** (14):

```
buildPortfolioCalendarItemStyle buildPortfolioCalendarMiniMarkerStyle comparePortfolioCalendarDayItems comparePortfolioDueDateAsc doesPortfolioCalendarItemOccurOnDay formatDateTime formatDueDateForUi getPortfolioCalendarMiniDayMarkers getPortfolioCalendarMiniMonthCellCount getPortfolioCalendarMonthHeatStats getPortfolioCalendarMonthRange getPortfolioCalendarTaskCountsByDay getPortfolioCalendarYearHeatStats todayLocalIsoDate
```

---

### Task 8 — layer 0, 17 functions


**`src/domain/roadmap.js`** (9):

```
comparePortfolioCalendarRoadmapItems getRoadmapDatePosition getRoadmapItemDateBounds getRoadmapItemTitle getRoadmapTaskFieldTasks normalizeRoadmapItems renderPortfolioCalendarDayRoadmapItem renderRoadmapGridGuides shouldShowPortfolioCalendarRoadmapLabel
```

**`src/domain/serialize.js`** (4):

```
areSerializableValuesEqual cloneSerializable getBoardExtensionsObject hashTextContent
```

**`src/domain/timeline.js`** (4):

```
buildTaskTimelineEvent createEmptyTimelineData createTimelineEventId formatTimelineValue
```

---

### Task 9 — layer 0, 13 functions


**`src/domain/attachments.js`** (1):

```
normalizeAttachmentRecord
```

**`src/domain/board.js`** (3):

```
createEmptyProjectData isAcceptedBoardSettingsShape validateBoardData
```

**`src/domain/persistence.js`** (1):

```
createProjectSaveState
```

**`src/domain/scoring.js`** (4):

```
effortRank effortScoreValue priorityRank priorityScoreValue
```

**`src/domain/task.js`** (2):

```
getTaskStatusAgeBaseTimestamp normalizeTaskStatus
```

**`src/domain/util.js`** (2):

```
assertRequiredExtension portfolioSortSelectValueFromKey
```

---

### Task 10 — layer 1, 20 functions


**`src/domain/attachments.js`** (1):

```
normalizeTaskAttachments
```

**`src/domain/calendar.js`** (1):

```
doesPortfolioCalendarItemIntersectMonth
```

**`src/domain/roadmap.js`** (8):

```
buildPortfolioCalendarRoadmapSpanStyle buildPortfolioCalendarWeekRoadmapSegments compareRoadmapItemsByDate getRoadmapAxisTicks getRoadmapTimelinePlacement getRoadmapTodayMarker getVisibleRoadmapDateRange normalizeRoadmapExtension
```

**`src/domain/scoring.js`** (1):

```
taskScore
```

**`src/domain/serialize.js`** (1):

```
getTeamOsExtensionsObject
```

**`src/domain/task.js`** (6):

```
formatTaskStatusAge getTasksForMilestone getTasksForPhase getTasksForSprint isTaskOverdue resolveCreateTaskStatus
```

**`src/domain/timeline.js`** (2):

```
buildTaskTimelineChanges normalizeTimelineChanges
```

---

### Task 11 — layer 2, 9 functions


**`src/domain/attachments.js`** (1):

```
getTaskAttachmentsMap
```

**`src/domain/board.js`** (1):

```
comparePortfolioRows
```

**`src/domain/roadmap.js`** (4):

```
assignPortfolioCalendarWeekRoadmapLanes clearInvalidRoadmapTaskRefs getRoadmapExtension getRoadmapExtensionObject
```

**`src/domain/scoring.js`** (1):

```
formatTaskScore
```

**`src/domain/timeline.js`** (2):

```
applyTimelineEventToState normalizeTimelineEvent
```

---

### Task 12 — layers 3+, 19 functions

Strictly ordered: each batch depends on the one before. Extract in this order, running
`npm run build && npm test` between batches.


**Batch 1 (layer 3):**

- `src/domain/attachments.js`: `getLegacyTaskAttachmentsFromExtensions`, `removeLegacyTaskAttachmentsFromExtensions`
- `src/domain/roadmap.js`: `renderPortfolioCalendarWeekRoadmap`
- `src/domain/task.js`: `normalizeTask`
- `src/domain/timeline.js`: `normalizeTimelineExtension`

**Batch 2 (layer 4):**

- `src/domain/attachments.js`: `calculateBoardAttachmentBytes`, `getTaskAttachments`, `setTaskAttachments`
- `src/domain/serialize.js`: `normalizeBoardExtensionsValue`
- `src/domain/timeline.js`: `getTimelineExtensionObject`

**Batch 3 (layer 5):**

- `src/domain/board.js`: `createBoardStateSnapshot`
- `src/domain/serialize.js`: `serializeBoardDataFromObject`
- `src/domain/timeline.js`: `captureTaskTimelineSnapshot`, `getBoardTimelineData`

**Batch 4 (layer 6):**

- `src/domain/persistence.js`: `ensureBoardTimelineBaseline`
- `src/domain/timeline.js`: `reconstructBoardStateFromTimeline`

**Batch 5 (layer 7):**

- `src/domain/timeline.js`: `appendTimelineEvent`

**Batch 6 (layer 8):**

- `src/domain/timeline.js`: `recordBoardRestoreTimelineEvent`, `recordTaskTimelineEvent`

---

## After Task 12

**Task 13** persistence (`BoardRepository`, `fileSystem`, `savePortfolioBoardRecord`).
**Task 14** Tailwind, README, close-out.

