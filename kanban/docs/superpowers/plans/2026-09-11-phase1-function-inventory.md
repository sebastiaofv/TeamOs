# Phase 1 Function Inventory

Generated from `kanban.html` (11,078 lines) on 2026-09-11. The complete list of the
253 pure functions Phase 1 extracts, grouped by target module. Tasks 3-12 of
`2026-09-11-phase1-domain-extraction.md` reference this file for their exact function
lists, so no task needs the phrase "and the remaining N".

Classification rule: a function is *pure* here if its body references none of
`document`, `Refs`, `window`, `querySelector`, `addEventListener`, `innerHTML`,
`classList`, and none of the ~40 module-level mutable globals.

Module assignment within this list is a name-based clustering heuristic. A few are
misfiled — `validateBoardData` sits under `board.js` because its name matched "board"
first, and `handleTaskAttachmentsEditorClick` / `clearPortfolioTimelineSelection` are
named like handlers. Verify each before extracting; the task notes flag the known ones.

Per-module counts here differ from the table in the design spec because that table used
a coarser clustering rule and was labelled a planning estimate. **This file is the
authoritative list for execution.** Both total 253.

## `scoring.js` — 6 functions
- `priorityRank`
- `effortRank`
- `priorityScoreValue`
- `effortScoreValue`
- `taskScore`
- `formatTaskScore`

## `attachments.js` — 16 functions
- `normalizeTaskAttachments`
- `attachmentTaskKey`
- `getTaskAttachmentsMap`
- `createAttachmentId`
- `classifyAttachmentKind`
- `estimateAttachmentDataUrlSizeBytes`
- `attachmentDuplicateKey`
- `normalizeAttachmentRecord`
- `getLegacyTaskAttachmentsFromExtensions`
- `getTaskAttachments`
- `setTaskAttachments`
- `removeLegacyTaskAttachmentsFromExtensions`
- `stripLegacyTaskAttachmentsFromExtensions`
- `calculateBoardAttachmentBytes`
- `getTaskModalAttachmentDerivedMessages`
- `handleTaskAttachmentsEditorClick`

## `roadmap.js` — 40 functions
- `normalizeRoadmapRef`
- `normalizeRoadmapDate`
- `normalizeRoadmapItems`
- `normalizeRoadmapExtension`
- `createEmptyRoadmapExtension`
- `getRoadmapExtensionObject`
- `formatRoadmapDateRange`
- `parseRoadmapIsoDate`
- `addRoadmapDays`
- `getRoadmapDayDiff`
- `getRoadmapItemDateBounds`
- `compareRoadmapItemsByDate`
- `getVisibleRoadmapDateRange`
- `formatRoadmapAxisDate`
- `getRoadmapDatePosition`
- `getRoadmapAxisTicks`
- `getRoadmapTodayMarker`
- `renderRoadmapTodayMarker`
- `getRoadmapTimelinePlacement`
- `comparePortfolioCalendarRoadmapItems`
- `buildPortfolioCalendarRoadmapSpanStyle`
- `buildPortfolioCalendarWeekRoadmapSegments`
- `assignPortfolioCalendarWeekRoadmapLanes`
- `renderPortfolioCalendarRoadmapSpan`
- `renderPortfolioCalendarWeekRoadmap`
- `shouldShowPortfolioCalendarRoadmapLabel`
- `renderPortfolioCalendarDayRoadmapItem`
- `getPortfolioRoadmapExpandedRows`
- `isPortfolioRoadmapRowExpanded`
- `togglePortfolioRoadmapRowExpanded`
- `buildRoadmapEntityOptionMarkup`
- `buildRoadmapSprintSelectionOptionMarkup`
- `slugifyRoadmapEntityId`
- `getRoadmapEntityConfig`
- `clearInvalidRoadmapTaskRefs`
- `renderRoadmapGridGuides`
- `renderRoadmapSection`
- `getRoadmapItemTitle`
- `getRoadmapExtension`
- `getRoadmapTaskFieldTasks`

## `timeline.js` — 32 functions
- `getBoardTimelineData`
- `getTimelineSelectionIndex`
- `clearPortfolioTimelineSelection`
- `setPortfolioTimelineSelection`
- `isPortfolioTimelineExpanded`
- `setPortfolioTimelineExpanded`
- `applyTimelineEventToState`
- `reconstructBoardStateFromTimeline`
- `formatTimelineValue`
- `renderTimelineEventChanges`
- `renderPortfolioTimelineSummaryRow`
- `renderPortfolioTimelineEventItems`
- `renderPortfolioTimelineEventDetail`
- `renderPortfolioTimelineBody`
- `notifyTimelinePreviewReadOnly`
- `createTimelineEventId`
- `createEmptyTimelineData`
- `normalizeTimelineChanges`
- `normalizeTimelineEvent`
- `normalizeTimelineExtension`
- `getTimelineExtensionObject`
- `captureTaskTimelineSnapshot`
- `ensureBoardTimelineBaseline`
- `appendTimelineEvent`
- `buildTaskTimelineChanges`
- `buildTaskTimelineEvent`
- `recordTaskTimelineEvent`
- `recordBoardRestoreTimelineEvent`
- `handleTimelinePanelClick`
- `handleTimelinePanelInput`
- `handleTimelinePanelPointerDown`
- `handleTimelineSliderPointerCommit`

## `calendar.js` — 36 functions
- `formatLocalIsoDate`
- `todayLocalIsoDate`
- `formatDueDateForUi`
- `updateTaskAssigneeEditor`
- `updateTaskAssigneeEditorItemText`
- `formatUtcIsoDate`
- `createUtcDate`
- `getUtcMonthLabel`
- `createPortfolioCalendarItem`
- `getPortfolioCalendarItemPriority`
- `comparePortfolioCalendarItems`
- `comparePortfolioCalendarDayItems`
- `buildPortfolioCalendarItems`
- `getPortfolioCalendarMonthRange`
- `doesPortfolioCalendarItemIntersectMonth`
- `doesPortfolioCalendarItemOccurOnDay`
- `buildPortfolioCalendarItemStyle`
- `getPortfolioCalendarItemLabel`
- `renderPortfolioCalendarStaticItem`
- `renderPortfolioCalendarTaskButton`
- `getPortfolioCalendarDayOffset`
- `renderPortfolioCalendarWeekDateCell`
- `buildPortfolioCalendarMiniMarkerStyle`
- `getPortfolioCalendarMiniMonthCellCount`
- `getPortfolioCalendarMiniDayMarkers`
- `getPortfolioCalendarTaskCountsByDay`
- `getPortfolioCalendarYearHeatStats`
- `getPortfolioCalendarMonthHeatStats`
- `getPortfolioCalendarHeatColor`
- `renderPortfolioCalendarMiniMonth`
- `comparePortfolioDueDateAsc`
- `formatDateTime`
- `normalizeDueDate`
- `validateBoardData`
- `updateTaskChecklistEditor`
- `updateTaskChecklistEditorItemText`

## `serialize.js` — 7 functions
- `hashTextContent`
- `serializeBoardDataFromObject`
- `getBoardExtensionsObject`
- `getTeamOsExtensionsObject`
- `cloneSerializable`
- `areSerializableValuesEqual`
- `normalizeBoardExtensionsValue`

## `task.js` — 52 functions
- `normalizeEffort`
- `normalizePriority`
- `normalizeAssignee`
- `normalizeAssignees`
- `parseAssigneesInput`
- `formatAssignees`
- `taskAssignees`
- `taskHasAssignee`
- `syncTaskAssigneeTextareaFromEditor`
- `removeTaskAssigneeEditorItem`
- `getBoardTagSuggestions`
- `normalizeTaskBlocked`
- `normalizeBlockerReason`
- `isPortfolioTaskBulkSelected`
- `getSelectedPortfolioBulkTaskIds`
- `findPortfolioTaskSource`
- `findPortfolioTaskDetailSource`
- `isPortfolioTaskMutable`
- `canUsePortfolioTaskMutations`
- `normalizePortfolioBlockedFilter`
- `getTaskStatusAgeBaseTimestamp`
- `formatTaskStatusAge`
- `touchTask`
- `normalizeTask`
- `isTaskOverdue`
- `isAcceptedLegacyAssigneeValue`
- `resolveKnownTaskStatus`
- `normalizeTaskStatus`
- `normalizeChecklist`
- `normalizeTags`
- `parseChecklistInput`
- `syncTaskChecklistTextareaFromEditor`
- `getTaskChecklistDropPlacement`
- `moveTaskChecklistEditorItem`
- `toggleTaskChecklistEditorItem`
- `removeTaskChecklistEditorItem`
- `findTaskInBoardData`
- `getTasksForMilestone`
- `getTasksForPhase`
- `getTasksForSprint`
- `buildTaskFieldsFromDraft`
- `nextTaskIdForBoard`
- `handleTaskChecklistEditorClick`
- `handleTaskChecklistEditorInput`
- `handleTaskChecklistEditorChange`
- `handleTaskChecklistEditorDragStart`
- `handleTaskChecklistEditorDragOver`
- `handleTaskChecklistEditorDrop`
- `handleTaskChecklistEditorDragEnd`
- `handleTaskAssigneeEditorClick`
- `handleTaskAssigneeEditorInput`
- `handleDetailChecklistChange`

## `board.js` — 39 functions
- `createProjectSaveState`
- `setProjectWatchStatus`
- `clearProjectWatchStatus`
- `markProjectDirty`
- `getProjectChipSaveUiState`
- `isPortfolioBoardMutable`
- `stopProjectFileWatcher`
- `retryProjectSave`
- `createPortfolioProjectColor`
- `portfolioProjectColorKey`
- `nextPortfolioProjectId`
- `createEmptyProjectData`
- `createPortfolioRecord`
- `isHistoricalPreviewActiveForBoard`
- `portfolioProjectColor`
- `normalizePortfolioViewMode`
- `notifyPortfolioReadOnly`
- `normalizePortfolioSortKey`
- `normalizePortfolioSortDir`
- `comparePortfolioRows`
- `normalizeBoardArchiveFilter`
- `hasTitleOnlyBoardSettings`
- `hasExtendedBoardSettings`
- `isAcceptedBoardSettingsShape`
- `slugifyColumnName`
- `normalizeColumns`
- `createBoardStateSnapshot`
- `setHoveredPortfolioCard`
- `syncHoveredPortfolioCardWithVisibleRows`
- `getVisiblePortfolioRowsForShortcuts`
- `getHoveredPortfolioRow`
- `getShortcutTargetPortfolioRow`
- `openSelectedPortfolioCardDetails`
- `editSelectedPortfolioCard`
- `canDragPortfolioContext`
- `handlePortfolioBoardChipsClick`
- `handlePortfolioBoardChange`
- `handlePortfolioBoardPointerOver`
- `handlePortfolioBoardPointerOut`

## `util.js` — 25 functions
- `hasRequiredExtension`
- `assertRequiredExtension`
- `isAbortError`
- `formatErrorMessage`
- `isFileDrag`
- `nowIso`
- `assigneesToInput`
- `projectHasUnsavedChanges`
- `createSprintFromSelection`
- `assignSelectionToExistingSprint`
- `portfolioSortSelectValueFromKey`
- `compareText`
- `performUndo`
- `hasExactKeys`
- `normalizeTimestamp`
- `checklistToInput`
- `formatFileSize`
- `readFileAsDataUrl`
- `normalizeTheme`
- `readStoredTheme`
- `persistTheme`
- `initializeTheme`
- `escapeRegExp`
- `highlightSearchMatch`
- `renderShortcutKeys`

