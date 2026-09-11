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

### Task 5 — layer 0, 22 functions


**`src/domain/board.js`** (11):

```
createPortfolioProjectColor hasExtendedBoardSettings hasTitleOnlyBoardSettings nextPortfolioProjectId normalizeBoardArchiveFilter normalizeColumns normalizePortfolioSortDir normalizePortfolioSortKey normalizePortfolioViewMode portfolioProjectColorKey slugifyColumnName
```

**`src/domain/roadmap.js`** (11):

```
addRoadmapDays createEmptyRoadmapExtension formatRoadmapAxisDate formatRoadmapDateRange getRoadmapDayDiff getRoadmapEntityConfig normalizeRoadmapDate normalizeRoadmapRef parseRoadmapIsoDate renderRoadmapGridGuides slugifyRoadmapEntityId
```

---

### Task 6 — layer 0, 22 functions


**`src/domain/attachments.js`** (7):

```
attachmentDuplicateKey attachmentTaskKey classifyAttachmentKind createAttachmentId estimateAttachmentDataUrlSizeBytes normalizeTaskAttachments stripLegacyTaskAttachmentsFromExtensions
```

**`src/domain/calendar.js`** (10):

```
comparePortfolioCalendarItems createUtcDate formatLocalIsoDate formatUtcIsoDate getPortfolioCalendarDayOffset getPortfolioCalendarHeatColor getPortfolioCalendarItemLabel getPortfolioCalendarItemPriority getUtcMonthLabel normalizeDueDate
```

**`src/domain/util.js`** (5):

```
assigneesToInput checklistToInput hasRequiredExtension normalizeTheme normalizeTimestamp
```

---

### Task 7 — layer 0, 14 functions


**`src/domain/persistence.js`** (1):

```
createProjectSaveState
```

**`src/domain/scoring.js`** (4):

```
effortRank effortScoreValue priorityRank priorityScoreValue
```

**`src/domain/serialize.js`** (4):

```
areSerializableValuesEqual cloneSerializable getBoardExtensionsObject hashTextContent
```

**`src/domain/task.js`** (1):

```
normalizeTaskStatus
```

**`src/domain/timeline.js`** (4):

```
createEmptyTimelineData createTimelineEventId formatTimelineValue normalizeTimelineExtension
```

---

### Task 8 — layer 1, 22 functions


**`src/domain/calendar.js`** (14):

```
buildPortfolioCalendarItemStyle buildPortfolioCalendarMiniMarkerStyle comparePortfolioCalendarDayItems comparePortfolioDueDateAsc doesPortfolioCalendarItemOccurOnDay formatDateTime formatDueDateForUi getPortfolioCalendarMiniDayMarkers getPortfolioCalendarMiniMonthCellCount getPortfolioCalendarMonthHeatStats getPortfolioCalendarMonthRange getPortfolioCalendarTaskCountsByDay getPortfolioCalendarYearHeatStats todayLocalIsoDate
```

**`src/domain/roadmap.js`** (8):

```
buildPortfolioCalendarWeekRoadmapSegments comparePortfolioCalendarRoadmapItems getRoadmapDatePosition getRoadmapItemDateBounds getRoadmapItemTitle getRoadmapTaskFieldTasks normalizeRoadmapItems shouldShowPortfolioCalendarRoadmapLabel
```

---

### Task 9 — layer 1, 12 functions


**`src/domain/attachments.js`** (1):

```
normalizeAttachmentRecord
```

**`src/domain/board.js`** (2):

```
createEmptyProjectData isAcceptedBoardSettingsShape
```

**`src/domain/scoring.js`** (1):

```
taskScore
```

**`src/domain/serialize.js`** (1):

```
getTeamOsExtensionsObject
```

**`src/domain/task.js`** (2):

```
getTaskStatusAgeBaseTimestamp resolveCreateTaskStatus
```

**`src/domain/timeline.js`** (3):

```
buildTaskTimelineChanges getTimelineExtensionObject normalizeTimelineChanges
```

**`src/domain/util.js`** (2):

```
assertRequiredExtension portfolioSortSelectValueFromKey
```

---

### Task 10 — layer 2, 20 functions


**`src/domain/attachments.js`** (1):

```
getTaskAttachmentsMap
```

**`src/domain/board.js`** (1):

```
comparePortfolioRows
```

**`src/domain/calendar.js`** (1):

```
doesPortfolioCalendarItemIntersectMonth
```

**`src/domain/roadmap.js`** (8):

```
assignPortfolioCalendarWeekRoadmapLanes buildPortfolioCalendarRoadmapSpanStyle compareRoadmapItemsByDate getRoadmapAxisTicks getRoadmapTimelinePlacement getRoadmapTodayMarker getVisibleRoadmapDateRange normalizeRoadmapExtension
```

**`src/domain/scoring.js`** (1):

```
formatTaskScore
```

**`src/domain/task.js`** (5):

```
formatTaskStatusAge getTasksForMilestone getTasksForPhase getTasksForSprint isTaskOverdue
```

**`src/domain/timeline.js`** (3):

```
buildTaskTimelineEvent getBoardTimelineData normalizeTimelineEvent
```

---

### Task 11 — layer 3, 8 functions


**`src/domain/attachments.js`** (2):

```
getLegacyTaskAttachmentsFromExtensions removeLegacyTaskAttachmentsFromExtensions
```

**`src/domain/board.js`** (1):

```
validateBoardData
```

**`src/domain/roadmap.js`** (3):

```
clearInvalidRoadmapTaskRefs getRoadmapExtension getRoadmapExtensionObject
```

**`src/domain/serialize.js`** (1):

```
normalizeBoardExtensionsValue
```

**`src/domain/timeline.js`** (1):

```
applyTimelineEventToState
```

---

### Task 12 — layers 4+, 12 functions

Strictly ordered: each batch depends on the one before. Extract in this order, running
`npm run build && npm test` between batches.


**Batch 1 (layer 4):**

- `src/domain/attachments.js`: `calculateBoardAttachmentBytes`, `getTaskAttachments`, `setTaskAttachments`
- `src/domain/task.js`: `normalizeTask`

**Batch 2 (layer 5):**

- `src/domain/board.js`: `createBoardStateSnapshot`
- `src/domain/serialize.js`: `serializeBoardDataFromObject`
- `src/domain/timeline.js`: `captureTaskTimelineSnapshot`

**Batch 3 (layer 6):**

- `src/domain/persistence.js`: `ensureBoardTimelineBaseline`
- `src/domain/timeline.js`: `reconstructBoardStateFromTimeline`

**Batch 4 (layer 7):**

- `src/domain/timeline.js`: `appendTimelineEvent`

**Batch 5 (layer 8):**

- `src/domain/timeline.js`: `recordBoardRestoreTimelineEvent`, `recordTaskTimelineEvent`

---

## After Task 12

**Task 13** persistence (`BoardRepository`, `fileSystem`, plus `savePortfolioBoardRecord`
and the other `BoardRepository` callers excluded above). **Task 14** Tailwind, README,
close-out.

`notifyPortfolioReadOnly` is UI (`alert`) and stays in `main.js` for Phase 2.

