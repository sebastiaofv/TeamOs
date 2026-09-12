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

## Revision 4 — 2026-09-12, after Task 7

Task 8's generated list contained `renderRoadmapGridGuides` and
`renderPortfolioCalendarDayRoadmapItem`. Both return HTML strings. They classify as
"pure" because purity here means *no DOM access and no global state* — a function that
builds markup as a string touches neither, yet it is presentation logic that becomes a
React component in Phase 2, not domain logic.

`renderRoadmapGridGuides` had already been excluded by hand from Task 5; the generator
reintroduced it. Three such functions exist in the codebase and are now excluded
permanently:

- `renderPortfolioCalendarDayRoadmapItem`
- `renderPortfolioCalendarWeekRoadmap`
- `renderRoadmapGridGuides`

They stay in `main.js` for Phase 2. Tasks renumbered from 8; Tasks 1-7 are complete.



---

## Revision 5 — 2026-09-12, after Task 8a

Task 8a's extraction guard refused `buildTaskTimelineEvent`, which calls
`buildTaskTimelineChanges`. That dependency should have placed it in a later layer, and
did not — because of a bug in the classifier's literal-stripper, not in the app.

The stripper removes string and comment text before looking for identifiers, keeping
`${...}` substitution code. It entered substitution mode but never returned to template
mode at the closing brace, so after the first `${...}` the parity inverted and real code
was swallowed as literal text. `buildTaskTimelineEvent` appeared to call nothing at all.
Any function containing a template literal had its dependencies under-detected.

Fixed with an explicit mode stack and a brace counter. Corrected totals: **94 extracted,
68 pure remaining, 8 layers.**

Tasks are also capped at ~10 functions and at most 2 modules each — two agents stalled on
larger units of work. Tasks renumbered from 9; Tasks 1-8a are complete.




---

### Task 9 — layer 0, 10 functions


**`src/domain/attachments.js`** (1):

```
normalizeAttachmentRecord
```

**`src/domain/board.js`** (2):

```
createEmptyProjectData isAcceptedBoardSettingsShape
```

**`src/domain/calendar.js`** (4):

```
buildPortfolioCalendarRoadmapSpanStyle comparePortfolioCalendarRoadmapItems doesPortfolioCalendarItemIntersectMonth shouldShowPortfolioCalendarRoadmapLabel
```

**`src/domain/persistence.js`** (1):

```
createProjectSaveState
```

**`src/domain/roadmap.js`** (2):

```
getRoadmapDatePosition getRoadmapItemDateBounds
```

---

### Task 10 — layer 0, 10 functions


**`src/domain/roadmap.js`** (3):

```
getRoadmapItemTitle getRoadmapTaskFieldTasks normalizeRoadmapItems
```

**`src/domain/scoring.js`** (4):

```
effortRank effortScoreValue priorityRank priorityScoreValue
```

**`src/domain/serialize.js`** (1):

```
getTeamOsExtensionsObject
```

**`src/domain/task.js`** (2):

```
getTaskStatusAgeBaseTimestamp isTaskOverdue
```

---

### Task 11 — layer 0, 5 functions


**`src/domain/task.js`** (1):

```
normalizeTaskStatus
```

**`src/domain/timeline.js`** (2):

```
buildTaskTimelineChanges normalizeTimelineChanges
```

**`src/domain/util.js`** (2):

```
assertRequiredExtension portfolioSortSelectValueFromKey
```

---

### Task 12 — layer 1, 10 functions


**`src/domain/attachments.js`** (2):

```
getTaskAttachmentsMap normalizeTaskAttachments
```

**`src/domain/calendar.js`** (1):

```
buildPortfolioCalendarWeekRoadmapSegments
```

**`src/domain/roadmap.js`** (6):

```
compareRoadmapItemsByDate getRoadmapAxisTicks getRoadmapTimelinePlacement getRoadmapTodayMarker getVisibleRoadmapDateRange normalizeRoadmapExtension
```

**`src/domain/scoring.js`** (1):

```
taskScore
```

---

### Task 13 — layer 1, 7 functions


**`src/domain/task.js`** (5):

```
formatTaskStatusAge getTasksForMilestone getTasksForPhase getTasksForSprint resolveCreateTaskStatus
```

**`src/domain/timeline.js`** (2):

```
buildTaskTimelineEvent normalizeTimelineEvent
```

---

### Task 14 — layer 2, 10 functions


**`src/domain/attachments.js`** (2):

```
getLegacyTaskAttachmentsFromExtensions removeLegacyTaskAttachmentsFromExtensions
```

**`src/domain/board.js`** (1):

```
comparePortfolioRows
```

**`src/domain/calendar.js`** (1):

```
assignPortfolioCalendarWeekRoadmapLanes
```

**`src/domain/roadmap.js`** (3):

```
clearInvalidRoadmapTaskRefs getRoadmapExtension getRoadmapExtensionObject
```

**`src/domain/scoring.js`** (1):

```
formatTaskScore
```

**`src/domain/timeline.js`** (2):

```
applyTimelineEventToState normalizeTimelineExtension
```

---

### Task 15 — layer 3, 7 functions


**`src/domain/attachments.js`** (3):

```
calculateBoardAttachmentBytes getTaskAttachments setTaskAttachments
```

**`src/domain/board.js`** (1):

```
validateBoardData
```

**`src/domain/serialize.js`** (1):

```
normalizeBoardExtensionsValue
```

**`src/domain/task.js`** (1):

```
normalizeTask
```

**`src/domain/timeline.js`** (1):

```
getTimelineExtensionObject
```

---

### Task 16 — layers 4-7, 9 functions

Strictly ordered: each batch depends on the one before. Extract in this order, running
`npm run build && npm test` between batches.


**Batch 1 (layer 4):**

- `src/domain/serialize.js`: `createBoardStateSnapshot`, `serializeBoardDataFromObject`
- `src/domain/timeline.js`: `captureTaskTimelineSnapshot`, `getBoardTimelineData`

**Batch 2 (layer 5):**

- `src/domain/persistence.js`: `ensureBoardTimelineBaseline`
- `src/domain/timeline.js`: `reconstructBoardStateFromTimeline`

**Batch 3 (layer 6):**

- `src/domain/timeline.js`: `appendTimelineEvent`

**Batch 4 (layer 7):**

- `src/domain/timeline.js`: `recordBoardRestoreTimelineEvent`, `recordTaskTimelineEvent`

---

## After Task 16

**Task 17** persistence (`BoardRepository`, `fileSystem`, `savePortfolioBoardRecord`).
**Task 18** Tailwind, README, close-out.

