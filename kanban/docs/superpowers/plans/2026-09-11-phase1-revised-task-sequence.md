# Phase 1 — Revised Task Sequence (supersedes Tasks 5-12)

**Created 2026-09-11 after Task 4.** The original Tasks 5-12 were organised one task per
module. That is unsafe: extracting a function whose callee is still in `main.js` leaves an
unresolved free identifier, and `vite build` does **not** catch it — the failure surfaces
only at runtime as `ReferenceError`, and only if a test exercises that path. Task 4 proved
this by extracting `isTaskOverdue`, which built cleanly then failed with
`ReferenceError: normalizeDueDate is not defined`.

Grouping by module also creates false circular dependencies (`serialize`<->`attachments`,
`board`<->`timeline`, and seven more). Those cycles are an artifact of name-based grouping.

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

### Task 5 — layer 0, 13 functions


**`src/domain/board.js`** (13):

```
createPortfolioProjectColor hasExtendedBoardSettings hasTitleOnlyBoardSettings nextPortfolioProjectId normalizeBoardArchiveFilter normalizeColumns normalizePortfolioSortDir normalizePortfolioSortKey normalizePortfolioViewMode notifyPortfolioReadOnly portfolioProjectColorKey savePortfolioBoardRecord slugifyColumnName
```

---

### Task 6 — layer 0, 21 functions


**`src/domain/calendar.js`** (10):

```
comparePortfolioCalendarItems createUtcDate formatLocalIsoDate formatUtcIsoDate getPortfolioCalendarDayOffset getPortfolioCalendarHeatColor getPortfolioCalendarItemLabel getPortfolioCalendarItemPriority getUtcMonthLabel normalizeDueDate
```

**`src/domain/roadmap.js`** (11):

```
addRoadmapDays createEmptyRoadmapExtension formatRoadmapAxisDate formatRoadmapDateRange getRoadmapDayDiff getRoadmapEntityConfig normalizeRoadmapDate normalizeRoadmapRef parseRoadmapIsoDate renderRoadmapGridGuides slugifyRoadmapEntityId
```

---

### Task 7 — layer 0, 21 functions


**`src/domain/attachments.js`** (7):

```
attachmentDuplicateKey attachmentTaskKey classifyAttachmentKind createAttachmentId estimateAttachmentDataUrlSizeBytes normalizeTaskAttachments stripLegacyTaskAttachmentsFromExtensions
```

**`src/domain/serialize.js`** (4):

```
areSerializableValuesEqual cloneSerializable getBoardExtensionsObject hashTextContent
```

**`src/domain/timeline.js`** (5):

```
createEmptyTimelineData createTimelineEventId formatTimelineValue normalizeTimelineExtension notifyTimelinePreviewReadOnly
```

**`src/domain/util.js`** (5):

```
assigneesToInput checklistToInput hasRequiredExtension normalizeTheme normalizeTimestamp
```

---

### Task 8 — layer 0, 7 functions


**`src/domain/persistence.js`** (2):

```
createProjectSaveState writeJsonToFileHandle
```

**`src/domain/scoring.js`** (4):

```
effortRank effortScoreValue priorityRank priorityScoreValue
```

**`src/domain/task.js`** (1):

```
normalizeTaskStatus
```

---

### Task 9 — layer 1, 22 functions


**`src/domain/calendar.js`** (14):

```
buildPortfolioCalendarItemStyle buildPortfolioCalendarMiniMarkerStyle comparePortfolioCalendarDayItems comparePortfolioDueDateAsc doesPortfolioCalendarItemOccurOnDay formatDateTime formatDueDateForUi getPortfolioCalendarMiniDayMarkers getPortfolioCalendarMiniMonthCellCount getPortfolioCalendarMonthHeatStats getPortfolioCalendarMonthRange getPortfolioCalendarTaskCountsByDay getPortfolioCalendarYearHeatStats todayLocalIsoDate
```

**`src/domain/roadmap.js`** (8):

```
buildPortfolioCalendarWeekRoadmapSegments comparePortfolioCalendarRoadmapItems getRoadmapDatePosition getRoadmapItemDateBounds getRoadmapItemTitle getRoadmapTaskFieldTasks normalizeRoadmapItems shouldShowPortfolioCalendarRoadmapLabel
```

---

### Task 10 — layer 1, 12 functions


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

### Task 11 — layer 2, 20 functions


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

### Task 12 — layer 3, 8 functions


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

### Task 13 — layers 4-8, 12 functions

These layers are small but strictly ordered: each depends on the one before. Extract them
as separate batches **in this order**, running `npm run build && npm test` between batches.


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

## After Task 13

Original **Task 12 (persistence: `BoardRepository`, `fileSystem`)** and **Task 13
(Tailwind, README, close-out)** still apply and run last, renumbered as Tasks 14 and 15.

Task 4 deferred 9 functions (`normalizeTask`, `isTaskOverdue`, `normalizeTaskStatus`,
`resolveCreateTaskStatus`, `formatTaskStatusAge`, `getTaskStatusAgeBaseTimestamp`,
`getTasksForMilestone`, `getTasksForPhase`, `getTasksForSprint`) because their dependencies
did not exist yet. All nine appear in the layers above and are covered by this sequence.

