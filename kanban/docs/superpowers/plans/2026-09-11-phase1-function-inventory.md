# Phase 1 Function Inventory

**Regenerated 2026-09-11 (third revision) using transitive call-graph analysis.**
Supersedes both earlier versions, which used a body scan and were badly wrong.

## Why this revision exists

A body scan asks "does this function's own text touch the DOM?" That misses
delegation. `updateTaskAssigneeEditor` is three lines that call
`renderTaskAssigneeEditor(items)` — no `document` in its own body, yet it is pure UI.
Under the old inventory all 55 `task.js` candidates looked clean; **24 of them are
actually DOM-reachable or stateful.**

This revision marks a function impure if it, or anything it transitively calls, touches
the DOM (`document`, `Refs`, `window`, `localStorage`, `FileReader`, query/listener/
class APIs) or reads/writes any of the 36 module globals. Computed to fixpoint over the
call graph.

## Corrected totals

Against `src/legacy/main.js` as of Task 3 (419 top-level functions remaining, 9 already
extracted to `util.js`):

| Category | Count |
|---|---:|
| DOM-reachable (transitively) | 199 |
| Stateful (globals, not DOM) | 62 |
| **Genuinely pure** | **158** |

The design spec's figure of 249 pure functions is wrong. Including the 9 already
extracted, Phase 1's real extraction surface is about **167** functions, not 253.
Phase 2's rewrite surface is correspondingly larger.

## Still verify before extracting

This is far more accurate than the body scan, but it is still static analysis. It
resolves calls by bare identifier name, so it cannot see indirect dispatch
(callbacks stored in objects, dynamic lookup). Read a function before extracting it;
if it turns out to be UI or stateful, leave it in `main.js` and report it.


## `persistence.js` — 3 pure functions

- `createProjectSaveState`
- `ensureBoardTimelineBaseline`
- `writeJsonToFileHandle`

## `scoring.js` — 6 pure functions

- `effortRank`
- `effortScoreValue`
- `formatTaskScore`
- `priorityRank`
- `priorityScoreValue`
- `taskScore`

## `attachments.js` — 14 pure functions

- `attachmentDuplicateKey`
- `attachmentTaskKey`
- `calculateBoardAttachmentBytes`
- `classifyAttachmentKind`
- `createAttachmentId`
- `estimateAttachmentDataUrlSizeBytes`
- `getLegacyTaskAttachmentsFromExtensions`
- `getTaskAttachments`
- `getTaskAttachmentsMap`
- `normalizeAttachmentRecord`
- `normalizeTaskAttachments`
- `removeLegacyTaskAttachmentsFromExtensions`
- `setTaskAttachments`
- `stripLegacyTaskAttachmentsFromExtensions`

## `roadmap.js` — 30 pure functions

- `addRoadmapDays`
- `assignPortfolioCalendarWeekRoadmapLanes`
- `buildPortfolioCalendarRoadmapSpanStyle`
- `buildPortfolioCalendarWeekRoadmapSegments`
- `clearInvalidRoadmapTaskRefs`
- `comparePortfolioCalendarRoadmapItems`
- `compareRoadmapItemsByDate`
- `createEmptyRoadmapExtension`
- `formatRoadmapAxisDate`
- `formatRoadmapDateRange`
- `getRoadmapAxisTicks`
- `getRoadmapDatePosition`
- `getRoadmapDayDiff`
- `getRoadmapEntityConfig`
- `getRoadmapExtension`
- `getRoadmapExtensionObject`
- `getRoadmapItemDateBounds`
- `getRoadmapItemTitle`
- `getRoadmapTaskFieldTasks`
- `getRoadmapTimelinePlacement`
- `getRoadmapTodayMarker`
- `getVisibleRoadmapDateRange`
- `normalizeRoadmapDate`
- `normalizeRoadmapExtension`
- `normalizeRoadmapItems`
- `normalizeRoadmapRef`
- `parseRoadmapIsoDate`
- `renderRoadmapGridGuides`
- `shouldShowPortfolioCalendarRoadmapLabel`
- `slugifyRoadmapEntityId`

## `timeline.js` — 17 pure functions

- `appendTimelineEvent`
- `applyTimelineEventToState`
- `buildTaskTimelineChanges`
- `buildTaskTimelineEvent`
- `captureTaskTimelineSnapshot`
- `createEmptyTimelineData`
- `createTimelineEventId`
- `formatTimelineValue`
- `getBoardTimelineData`
- `getTimelineExtensionObject`
- `normalizeTimelineChanges`
- `normalizeTimelineEvent`
- `normalizeTimelineExtension`
- `notifyTimelinePreviewReadOnly`
- `reconstructBoardStateFromTimeline`
- `recordBoardRestoreTimelineEvent`
- `recordTaskTimelineEvent`

## `calendar.js` — 25 pure functions

- `buildPortfolioCalendarItemStyle`
- `buildPortfolioCalendarMiniMarkerStyle`
- `comparePortfolioCalendarDayItems`
- `comparePortfolioCalendarItems`
- `comparePortfolioDueDateAsc`
- `createUtcDate`
- `doesPortfolioCalendarItemIntersectMonth`
- `doesPortfolioCalendarItemOccurOnDay`
- `formatDateTime`
- `formatDueDateForUi`
- `formatLocalIsoDate`
- `formatUtcIsoDate`
- `getPortfolioCalendarDayOffset`
- `getPortfolioCalendarHeatColor`
- `getPortfolioCalendarItemLabel`
- `getPortfolioCalendarItemPriority`
- `getPortfolioCalendarMiniDayMarkers`
- `getPortfolioCalendarMiniMonthCellCount`
- `getPortfolioCalendarMonthHeatStats`
- `getPortfolioCalendarMonthRange`
- `getPortfolioCalendarTaskCountsByDay`
- `getPortfolioCalendarYearHeatStats`
- `getUtcMonthLabel`
- `normalizeDueDate`
- `todayLocalIsoDate`

## `serialize.js` — 7 pure functions

- `areSerializableValuesEqual`
- `cloneSerializable`
- `getBoardExtensionsObject`
- `getTeamOsExtensionsObject`
- `hashTextContent`
- `normalizeBoardExtensionsValue`
- `serializeBoardDataFromObject`

## `task.js` — 31 pure functions

- `buildTaskFieldsFromDraft`
- `findTaskInBoardData`
- `formatAssignees`
- `formatTaskStatusAge`
- `getBoardTagSuggestions`
- `getTaskChecklistDropPlacement`
- `getTaskStatusAgeBaseTimestamp`
- `getTasksForMilestone`
- `getTasksForPhase`
- `getTasksForSprint`
- `isAcceptedLegacyAssigneeValue`
- `isTaskOverdue`
- `nextTaskIdForBoard`
- `normalizeAssignee`
- `normalizeAssignees`
- `normalizeBlockerReason`
- `normalizeChecklist`
- `normalizeEffort`
- `normalizePortfolioBlockedFilter`
- `normalizePriority`
- `normalizeTags`
- `normalizeTask`
- `normalizeTaskBlocked`
- `normalizeTaskStatus`
- `parseAssigneesInput`
- `parseChecklistInput`
- `resolveCreateTaskStatus`
- `resolveKnownTaskStatus`
- `taskAssignees`
- `taskHasAssignee`
- `touchTask`

## `board.js` — 18 pure functions

- `comparePortfolioRows`
- `createBoardStateSnapshot`
- `createEmptyProjectData`
- `createPortfolioProjectColor`
- `hasExtendedBoardSettings`
- `hasTitleOnlyBoardSettings`
- `isAcceptedBoardSettingsShape`
- `nextPortfolioProjectId`
- `normalizeBoardArchiveFilter`
- `normalizeColumns`
- `normalizePortfolioSortDir`
- `normalizePortfolioSortKey`
- `normalizePortfolioViewMode`
- `notifyPortfolioReadOnly`
- `portfolioProjectColorKey`
- `savePortfolioBoardRecord`
- `slugifyColumnName`
- `validateBoardData`

## `util.js` — 7 pure functions

- `assertRequiredExtension`
- `assigneesToInput`
- `checklistToInput`
- `hasRequiredExtension`
- `normalizeTheme`
- `normalizeTimestamp`
- `portfolioSortSelectValueFromKey`
