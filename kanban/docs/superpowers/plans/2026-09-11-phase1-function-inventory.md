# Phase 1 Function Inventory

Regenerated 2026-09-11 against `src/legacy/main.js` after Task 1, **including the 26
`async` top-level functions the first version missed** (its regex matched only
`function NAME(`). Corrected totals: **428 top-level functions = 249 pure + 84 stateful
+ 95 UI**, superseding the 402 = 253/60/89 in the design spec.

Classification: a function is *pure* here if its body references none of `document`,
`Refs`, `window`, `querySelector`, `addEventListener`, `innerHTML`, `classList`, and
none of the 36 module-level mutable globals.

## Read this before trusting the list

**The heuristic overstates purity.** A function that delegates its DOM work to a callee
looks pure to a body scan. Several entries below — `movePortfolioTaskToStatus`,
`toggleArchiveSelectedPortfolioCard`, `handleTaskAttachmentsInputChange`,
`openPortfolioFromFiles` — are UI actions that call DOM-touching helpers. **Inspect
each function before extracting it.** If it turns out to be UI or stateful, leave it in
`main.js` for Phase 2 and note it in your report.

Module assignment is a name-clustering heuristic too. `async` functions are marked.
The extraction script handles `async` as of the Task 1 fix pass.


## `persistence.js` — 10 functions

- `createProjectSaveState`
- `writeJsonToFileHandle` *(async)*
- `refreshProjectFileBaseline` *(async)*
- `primeProjectFileBaselines` *(async)*
- `checkProjectFileForExternalChanges` *(async)*
- `runQueuedProjectSave` *(async)*
- `enqueueProjectSave` *(async)*
- `retryProjectSave`
- `openPortfolioFromFiles` *(async)*
- `ensureBoardTimelineBaseline`

## `scoring.js` — 6 functions

- `priorityRank`
- `effortRank`
- `priorityScoreValue`
- `effortScoreValue`
- `taskScore`
- `formatTaskScore`

## `attachments.js` — 17 functions

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
- `handleTaskAttachmentsInputChange` *(async)*
- `handleTaskAttachmentsEditorClick`

## `roadmap.js` — 38 functions

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
- `isPortfolioRoadmapRowExpanded`
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

## `timeline.js` — 23 functions

- `getBoardTimelineData`
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
- `appendTimelineEvent`
- `buildTaskTimelineChanges`
- `buildTaskTimelineEvent`
- `recordTaskTimelineEvent`
- `recordBoardRestoreTimelineEvent`
- `handleTimelinePanelClick`

## `calendar.js` — 31 functions

- `formatLocalIsoDate`
- `todayLocalIsoDate`
- `formatDueDateForUi`
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

## `serialize.js` — 7 functions

- `hashTextContent`
- `serializeBoardDataFromObject`
- `getBoardExtensionsObject`
- `getTeamOsExtensionsObject`
- `cloneSerializable`
- `areSerializableValuesEqual`
- `normalizeBoardExtensionsValue`

## `task.js` — 55 functions

- `normalizeEffort`
- `normalizePriority`
- `normalizeAssignee`
- `normalizeAssignees`
- `parseAssigneesInput`
- `formatAssignees`
- `taskAssignees`
- `taskHasAssignee`
- `syncTaskAssigneeTextareaFromEditor`
- `updateTaskAssigneeEditor`
- `updateTaskAssigneeEditorItemText`
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
- `updateTaskChecklistEditor`
- `toggleTaskChecklistEditorItem`
- `updateTaskChecklistEditorItemText`
- `removeTaskChecklistEditorItem`
- `findTaskInBoardData`
- `getTasksForMilestone`
- `getTasksForPhase`
- `getTasksForSprint`
- `buildTaskFieldsFromDraft`
- `nextTaskIdForBoard`
- `resolveCreateTaskStatus`
- `movePortfolioTaskToStatus` *(async)*
- `handleTaskChecklistEditorClick`
- `handleTaskChecklistEditorInput`
- `handleTaskChecklistEditorChange`
- `handleTaskChecklistEditorDragEnd`
- `handleTaskAssigneeEditorClick`
- `handleTaskAssigneeEditorInput`
- `handleDetailChecklistChange`

## `board.js` — 37 functions

- `setProjectWatchStatus`
- `clearProjectWatchStatus`
- `markProjectDirty`
- `getProjectChipSaveUiState`
- `isPortfolioBoardMutable`
- `applySnapshotToBoardRecord`
- `savePortfolioBoardRecord` *(async)*
- `createPortfolioProjectColor`
- `portfolioProjectColorKey`
- `nextPortfolioProjectId`
- `createEmptyProjectData`
- `isHistoricalPreviewActiveForBoard`
- `portfolioProjectColor`
- `normalizePortfolioViewMode`
- `notifyPortfolioReadOnly`
- `notifyPortfolioMutationUnavailable`
- `normalizePortfolioSortKey`
- `normalizePortfolioSortDir`
- `comparePortfolioRows`
- `normalizeBoardArchiveFilter`
- `hasTitleOnlyBoardSettings`
- `hasExtendedBoardSettings`
- `isAcceptedBoardSettingsShape`
- `validateBoardData`
- `slugifyColumnName`
- `normalizeColumns`
- `createBoardStateSnapshot`
- `getVisiblePortfolioRowsForShortcuts`
- `getShortcutTargetPortfolioRow`
- `openSelectedPortfolioCardDetails`
- `editSelectedPortfolioCard`
- `toggleArchiveSelectedPortfolioCard` *(async)*
- `moveSelectedPortfolioCardToShortcutStatus` *(async)*
- `canDragPortfolioContext`
- `handlePortfolioBoardChipsClick`
- `handlePortfolioBoardChange`
- `handlePortfolioBoardPointerOver`

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
