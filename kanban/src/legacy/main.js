import '../styles/legacy.css';
import { isAbortError, formatErrorMessage, isFileDrag, nowIso, escapeRegExp, readFileAsDataUrl, formatFileSize, assigneesToInput, checklistToInput, hasRequiredExtension, normalizeTheme, assertRequiredExtension, portfolioSortSelectValueFromKey } from '../domain/util.js';
import { normalizeAssignee, normalizeAssignees, parseAssigneesInput, formatAssignees, taskAssignees, taskHasAssignee, normalizeTags, buildTaskFieldsFromDraft, normalizeBlockerReason, normalizeChecklist, normalizeEffort, normalizePortfolioBlockedFilter, normalizePriority, parseChecklistInput, getBoardTagSuggestions, getTaskChecklistDropPlacement, nextTaskIdForBoard, touchTask, isTaskOverdue, normalizeTaskStatus, formatTaskStatusAge, resolveCreateTaskStatus, normalizeTask } from '../domain/task.js';
import { addRoadmapDays, createEmptyRoadmapExtension, formatRoadmapDateRange, getRoadmapEntityConfig, normalizeRoadmapDate, normalizeRoadmapRef, parseRoadmapIsoDate, slugifyRoadmapEntityId, getRoadmapDatePosition, getRoadmapItemDateBounds, getRoadmapItemTitle, getRoadmapTaskFieldTasks, compareRoadmapItemsByDate, getRoadmapAxisTicks, getRoadmapTimelinePlacement, getRoadmapTodayMarker, getVisibleRoadmapDateRange, getRoadmapExtension, getRoadmapExtensionObject } from '../domain/roadmap.js';
import { normalizePortfolioSortDir, normalizePortfolioSortKey, normalizePortfolioViewMode, portfolioProjectColorKey, slugifyColumnName, createPortfolioProjectColor, createEmptyProjectData, comparePortfolioRows } from '../domain/board.js';
import { attachmentDuplicateKey, classifyAttachmentKind, createAttachmentId, estimateAttachmentDataUrlSizeBytes, normalizeAttachmentRecord, removeLegacyTaskAttachmentsFromExtensions, calculateBoardAttachmentBytes, getTaskAttachments, setTaskAttachments } from '../domain/attachments.js';
import { comparePortfolioCalendarItems, createUtcDate, formatUtcIsoDate, getPortfolioCalendarHeatColor, getPortfolioCalendarItemLabel, getUtcMonthLabel, normalizeDueDate, buildPortfolioCalendarItemStyle, buildPortfolioCalendarMiniMarkerStyle, comparePortfolioCalendarDayItems, doesPortfolioCalendarItemOccurOnDay, formatDateTime, formatDueDateForUi, getPortfolioCalendarMiniDayMarkers, getPortfolioCalendarMiniMonthCellCount, getPortfolioCalendarMonthHeatStats, getPortfolioCalendarTaskCountsByDay, getPortfolioCalendarYearHeatStats, todayLocalIsoDate, buildPortfolioCalendarRoadmapSpanStyle, doesPortfolioCalendarItemIntersectMonth, shouldShowPortfolioCalendarRoadmapLabel } from '../domain/calendar.js';
import { cloneSerializable, getBoardExtensionsObject, createBoardStateSnapshot, serializeBoardDataFromObject } from '../domain/serialize.js';
import { formatTimelineValue, captureTaskTimelineSnapshot, getBoardTimelineData, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline, appendTimelineEvent, recordBoardRestoreTimelineEvent, recordTaskTimelineEvent } from '../domain/timeline.js';
import { formatTaskScore } from '../domain/scoring.js';
import { writeJsonToFileHandle } from '../persistence/fileSystem.js';
import { appState, getPortfolioBoardRecord } from '../state/store.js';
import { Logger } from '../logger.js';
import { BoardRepository } from '../persistence/boardRepository.js';
import { setPersistenceHost, getProjectSaveState, syncProjectSaveStates, primeProjectFileBaselines, checkProjectFilesNow, stopProjectFileWatcher, enqueueProjectSave, retryProjectSave, createPortfolioRecord, projectHasUnsavedChanges } from '../persistence/projectFiles.js';
        import {
            BOARD_FILE_EXTENSION, TASK_TITLE_MAX_LENGTH, EFFORT_BUCKETS, TIMELINE_EXTENSION_KEY,
            ATTACHMENT_MAX_COUNT, ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_SOFT_WARN_BYTES,
            ATTACHMENT_TASK_SOFT_TOTAL_BYTES, ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES,
            PROJECT_FILE_WATCH_INTERVAL_MS, THEME_STORAGE_KEY, CALENDAR_MONTH_NAMES,
            CALENDAR_WEEKDAY_NAMES, defaultColumns
        } from '../domain/constants.js';
        const Refs = {};


        function readQueryParam(key, fallback = '') {
            const params = new URLSearchParams(window.location.search);
            return params.get(key) ?? fallback;
        }






        function setFileDropActive(active) {
            const view = document.getElementById('portfolioView');
            if (view) {
                view.classList.toggle('file-drop-active', active);
            }
        }

        function updateUrlState() {
            const params = new URLSearchParams();

            const portfolioSearch = document.getElementById('portfolioSearchInput')?.value || '';
            const portfolioPriority = document.getElementById('portfolioPriorityFilter')?.value || '';
            const portfolioAssignee = document.getElementById('portfolioAssigneeFilter')?.value || '';
            const portfolioBlocked = normalizePortfolioBlockedFilter(document.getElementById('portfolioBlockedFilter')?.value || 'all');
            const portfolioEffort = document.getElementById('portfolioEffortFilter')?.value || '';
            const portfolioArchive = document.getElementById('portfolioArchiveFilter')?.value || 'active';
            if (portfolioSearch) params.set('pq', portfolioSearch);
            if (portfolioPriority) params.set('pp', portfolioPriority);
            if (portfolioAssignee) params.set('pu', portfolioAssignee);
            if (portfolioBlocked !== 'all') params.set('pbk', portfolioBlocked);
            if (portfolioEffort) params.set('pe', portfolioEffort);
            if (portfolioArchive !== 'active') params.set('pa', portfolioArchive);
            if (appState.portfolioSortKey !== 'priority') params.set('ps', appState.portfolioSortKey);
            if (appState.portfolioSortDir === 'desc') params.set('pd', appState.portfolioSortDir);
            if (appState.selectedPortfolioBoardId) params.set('pb', appState.selectedPortfolioBoardId);
            if (appState.selectedPortfolioViewMode === 'calendar' && appState.portfolioBoards.length > 0) {
                params.set('pv', appState.selectedPortfolioViewMode);
            } else if (appState.selectedPortfolioBoardId && appState.selectedPortfolioViewMode === 'roadmap') {
                params.set('pv', appState.selectedPortfolioViewMode);
            }
            const query = params.toString();
            const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
            window.history.replaceState(null, '', nextUrl);
        }

        function applyUrlState() {
            const portfolioSearch = readQueryParam('pq', '');
            const portfolioPriority = readQueryParam('pp', '');
            const portfolioAssignee = readQueryParam('pu', '');
            const portfolioBlocked = readQueryParam('pbk', 'all');
            const portfolioEffort = readQueryParam('pe', '');
            const portfolioArchive = readQueryParam('pa', 'active');
            const portfolioSort = readQueryParam('ps', 'priority');
            const portfolioSortDirParam = readQueryParam('pd', 'asc');
            const portfolioBoard = readQueryParam('pb', '');
            const portfolioViewMode = readQueryParam('pv', 'board');

            const pSearch = document.getElementById('portfolioSearchInput');
            const pPriority = document.getElementById('portfolioPriorityFilter');
            const pAssignee = document.getElementById('portfolioAssigneeFilter');
            const pBlocked = document.getElementById('portfolioBlockedFilter');
            const pEffort = document.getElementById('portfolioEffortFilter');
            const pArchive = document.getElementById('portfolioArchiveFilter');
            if (pSearch) pSearch.value = portfolioSearch;
            if (pPriority && ['', 'high', 'medium', 'low'].includes(portfolioPriority)) {
                pPriority.value = portfolioPriority;
            }
            if (pAssignee) {
                pAssignee.value = portfolioAssignee;
            }
            if (pBlocked) {
                pBlocked.value = normalizePortfolioBlockedFilter(portfolioBlocked);
            }
            if (pEffort && ['', ...EFFORT_BUCKETS].includes(portfolioEffort)) {
                pEffort.value = portfolioEffort;
            }
            if (pArchive && ['active', 'all', 'archived'].includes(portfolioArchive)) {
                pArchive.value = portfolioArchive;
            }
            appState.portfolioSortKey = normalizePortfolioSortKey(portfolioSort);
            appState.portfolioSortDir = normalizePortfolioSortDir(portfolioSortDirParam);
            setSelectedPortfolioBoardId(portfolioBoard);
            appState.selectedPortfolioViewMode = normalizePortfolioViewMode(portfolioViewMode);
            if (!appState.selectedPortfolioBoardId && appState.selectedPortfolioViewMode !== 'calendar') {
                appState.selectedPortfolioViewMode = 'board';
            }
            renderPortfolio();
        }

        function updateDocumentTitle() {
            document.title = 'TeamOS → Kanban';
        }





















        function getTaskAssigneeEditorRowsContainer() {
            return document.getElementById('taskAssigneeItems');
        }

        function getTaskAssigneeTextarea() {
            return document.getElementById('taskAssignee');
        }

        function readTaskAssigneeEditorItems() {
            const container = getTaskAssigneeEditorRowsContainer();
            if (!container) return [];
            const rows = Array.from(container.querySelectorAll('.assignee-editor-row'));
            return normalizeAssignees(rows.map((row) => {
                const textInput = row.querySelector('input[type="text"]');
                return textInput?.value || '';
            }));
        }

        function syncTaskAssigneeTextareaFromEditor() {
            const textarea = getTaskAssigneeTextarea();
            if (!textarea) return;
            textarea.value = assigneesToInput(readTaskAssigneeEditorItems());
            renderTaskAssigneeSuggestions();
        }

        function renderTaskAssigneeEditor(items = []) {
            const container = getTaskAssigneeEditorRowsContainer();
            if (!container) return;
            const normalized = normalizeAssignees(items);

            if (normalized.length === 0) {
                container.innerHTML = '<div class="assignee-editor-empty">No assignees yet.</div>';
                syncTaskAssigneeTextareaFromEditor();
                return;
            }

            container.innerHTML = normalized.map((name, index) => `
                <div class="assignee-editor-row" data-index="${index}">
                    <input type="text" value="${escapeHtml(name)}" list="taskAssigneeSuggestions" aria-label="Assignee name" data-index="${index}">
                    <button type="button" class="assignee-editor-remove" aria-label="Remove assignee" title="Remove" data-index="${index}">×</button>
                </div>
            `).join('');

            syncTaskAssigneeTextareaFromEditor();
        }

        function loadTaskAssigneeEditorFromTextarea() {
            const textarea = getTaskAssigneeTextarea();
            renderTaskAssigneeEditor(parseAssigneesInput(textarea?.value || ''));
            const composer = document.getElementById('taskAssigneeNewItem');
            if (composer) {
                composer.value = '';
            }
        }

        function updateTaskAssigneeEditor(items) {
            renderTaskAssigneeEditor(items);
        }

        function addTaskAssignee(name = '', options = {}) {
            const trimmed = normalizeAssignee(name);
            if (!trimmed) return;
            const items = readTaskAssigneeEditorItems();
            if (items.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
                if (options.focusComposer !== false) {
                    document.getElementById('taskAssigneeNewItem')?.focus();
                }
                return;
            }
            items.push(trimmed);
            updateTaskAssigneeEditor(items);

            if (options.focusComposer !== false) {
                document.getElementById('taskAssigneeNewItem')?.focus();
            }
        }

        function addTaskAssigneeFromComposer() {
            const composer = document.getElementById('taskAssigneeNewItem');
            if (!composer) return;
            const value = composer.value.trim();
            if (!value) return;
            addTaskAssignee(value);
            composer.value = '';
            syncTaskAssigneeTextareaFromEditor();
            composer.focus();
        }

        function updateTaskAssigneeEditorItemText(index, value) {
            void index;
            void value;
            syncTaskAssigneeTextareaFromEditor();
        }

        function removeTaskAssigneeEditorItem(index) {
            const items = readTaskAssigneeEditorItems();
            if (!items[index]) return;
            items.splice(index, 1);
            updateTaskAssigneeEditor(items);
        }


        function renderTagEditor(container, tags, suggestions) {
            const list = container.querySelector('.tag-editor-list');
            const datalist = document.getElementById('taskTagSuggestions');
            if (datalist) {
                datalist.innerHTML = (suggestions || []).map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
            }
            if (!tags || tags.length === 0) {
                list.innerHTML = '<div class="tag-editor-empty">No tags yet.</div>';
                const textarea = document.getElementById('taskTags');
                if (textarea) textarea.value = '[]';
                return;
            }
            list.innerHTML = tags.map((tag, index) => `
                <div class="tag-editor-row" data-index="${index}">
                    <span>${escapeHtml(tag)}</span>
                    <button type="button" class="tag-editor-remove" aria-label="Remove tag" title="Remove" data-index="${index}">&times;</button>
                </div>
            `).join('');
            const textarea = document.getElementById('taskTags');
            if (textarea) textarea.value = JSON.stringify(tags);
        }

        function readTagEditorItems() {
            const container = document.getElementById('taskTagItems');
            if (!container) return [];
            const rows = Array.from(container.querySelectorAll('.tag-editor-row'));
            return rows.map((row) => {
                const span = row.querySelector('span');
                return span ? span.textContent.trim().toLowerCase() : '';
            }).filter(Boolean);
        }

        function addTaskTagFromComposer() {
            const input = document.getElementById('taskTagNewItem');
            const container = document.getElementById('taskTagEditor');
            const raw = input ? input.value.trim() : '';
            if (!raw) return;
            const tag = raw.toLowerCase();
            if (tag.length > 30) {
                alert('Tags must be 30 characters or fewer.');
                return;
            }
            const items = readTagEditorItems();
            if (items.includes(tag)) {
                alert('This tag is already added.');
                return;
            }
            if (items.length >= 10) {
                alert('A task can have at most 10 tags.');
                return;
            }
            items.push(tag);
            const boardData = appState.portfolioEditContext
                ? getPortfolioBoardRecord(appState.portfolioEditContext.boardId)?.data
                : (appState.portfolioCreateContext
                    ? getPortfolioBoardRecord(appState.portfolioCreateContext.boardId)?.data
                    : currentBoard);
            renderTagEditor(container, items, getBoardTagSuggestions(boardData));
            if (input) input.value = '';
            input?.focus();
        }

        function handleTagEditorClick(event) {
            const button = event.target.closest('.tag-editor-remove[data-index]');
            if (!button) return;
            const index = Number(button.dataset.index);
            const container = document.getElementById('taskTagEditor');
            const items = readTagEditorItems();
            if (!items[index]) return;
            items.splice(index, 1);
            const boardData = appState.portfolioEditContext
                ? getPortfolioBoardRecord(appState.portfolioEditContext.boardId)?.data
                : (appState.portfolioCreateContext
                    ? getPortfolioBoardRecord(appState.portfolioCreateContext.boardId)?.data
                    : currentBoard);
            renderTagEditor(container, items, getBoardTagSuggestions(boardData));
        }




















        function renderRoadmapTodayMarker(range) {
            const marker = getRoadmapTodayMarker(range);
            if (!marker || !Number.isFinite(marker.position)) return '';
            return `
                <span class="roadmap-today-marker" aria-label="Today (${escapeHtml(marker.iso)})" style="left:${marker.position}%">
                    <span class="roadmap-today-marker-label">Today</span>
                </span>
            `;
        }





        function normalizePortfolioCalendarYear(items) {
            const years = (Array.isArray(items) ? items : [])
                .flatMap((item) => [item?.bounds?.start?.getUTCFullYear(), item?.bounds?.end?.getUTCFullYear()])
                .filter(Number.isFinite);
            const fallbackYear = years.length > 0 ? Math.min(...years) : new Date().getUTCFullYear();
            if (!Number.isInteger(appState.portfolioCalendarYear)) {
                appState.portfolioCalendarYear = fallbackYear;
            }
        }

        function normalizePortfolioCalendarMonth(items) {
            const defaultDate = (Array.isArray(items) ? items : []).find((item) => item?.bounds?.start)?.bounds?.start || new Date();
            if (!Number.isInteger(appState.portfolioCalendarMonth) || appState.portfolioCalendarMonth < 0 || appState.portfolioCalendarMonth > 11) {
                appState.portfolioCalendarMonth = defaultDate.getUTCMonth();
            }
        }

        function ensurePortfolioCalendarState(items) {
            if (!['year', 'month'].includes(appState.portfolioCalendarView)) {
                appState.portfolioCalendarView = 'year';
            }
            if (!['calendar', 'heatmap'].includes(appState.portfolioCalendarDisplayMode)) {
                appState.portfolioCalendarDisplayMode = 'calendar';
            }
            normalizePortfolioCalendarYear(items);
            normalizePortfolioCalendarMonth(items);
        }

        function getPortfolioCalendarBoardSources() {
            if (appState.selectedPortfolioBoardId) {
                const viewState = getSelectedBoardTimelineViewState();
                const boardRecord = viewState?.boardRecord || getPortfolioBoardRecord(appState.selectedPortfolioBoardId);
                const boardData = viewState?.isPreview
                    ? (viewState.projectedBoard || boardRecord?.data || null)
                    : (boardRecord?.data || viewState?.projectedBoard || null);
                return boardRecord && boardData ? [{
                    boardRecord,
                    boardData,
                    historical: Boolean(viewState?.isPreview)
                }] : [];
            }
            return appState.portfolioBoards
                .filter((board) => board?.data)
                .map((boardRecord) => ({
                    boardRecord,
                    boardData: boardRecord.data,
                    historical: false
                }));
        }

        function createPortfolioCalendarItem(input) {
            const bounds = getRoadmapItemDateBounds(input) || null;
            if (!bounds) return null;
            const boardTitle = input.boardTitle || input.boardFileName || 'Project';
            return {
                id: input.id,
                kind: input.kind,
                boardId: input.boardId,
                boardTitle,
                title: input.title || '',
                subtitle: input.subtitle || '',
                taskId: input.taskId || null,
                roadmapKind: input.roadmapKind || '',
                projectColor: portfolioProjectColor(input.boardId),
                historical: Boolean(input.historical),
                isRange: bounds.start.getTime() !== bounds.end.getTime(),
                bounds
            };
        }





        function buildPortfolioCalendarItems(rows) {
            const items = [];
            const visibleRows = Array.isArray(rows) ? rows : [];

            visibleRows.forEach((row) => {
                const dueDate = normalizeDueDate(row?.task?.dueDate);
                if (!dueDate) return;
                const item = createPortfolioCalendarItem({
                    id: `task:${row.boardId}:${row.taskId}`,
                    kind: 'task',
                    boardId: row.boardId,
                    boardTitle: row.boardTitle,
                    boardFileName: row.boardFileName,
                    title: row.task?.title || `Task ${row.taskId}`,
                    subtitle: dueDate,
                    taskId: row.taskId,
                    dueDate,
                    historical: Boolean(row.historical)
                });
                if (item) items.push(item);
            });

            getPortfolioCalendarBoardSources().forEach(({ boardRecord, boardData, historical }) => {
                const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
                ['milestones', 'phases', 'sprints'].forEach((kind) => {
                    const config = getRoadmapEntityConfig(kind);
                    const records = Array.isArray(roadmap?.[kind]) ? roadmap[kind] : [];
                    records.forEach((entry) => {
                        const item = createPortfolioCalendarItem({
                            id: `${kind}:${boardRecord.id}:${entry.id}`,
                            kind: config?.singular || kind,
                            roadmapKind: kind,
                            boardId: boardRecord.id,
                            boardTitle: boardRecord.title,
                            boardFileName: boardRecord.fileName,
                            title: entry.title || '',
                            subtitle: formatRoadmapDateRange(entry),
                            dueDate: entry.dueDate,
                            startDate: entry.startDate,
                            endDate: entry.endDate,
                            historical
                        });
                        if (item) items.push(item);
                    });
                });
            });

            return items.sort(comparePortfolioCalendarItems);
        }




        function renderPortfolioCalendarTaskButton(item, options = {}) {
            const classes = ['portfolio-calendar-item', 'portfolio-calendar-item-task'];
            if (item?.isRange) classes.push('portfolio-calendar-item-range');
            const style = buildPortfolioCalendarItemStyle(item, options);
            const title = getPortfolioCalendarItemLabel(item);
            return `
                <button
                    class="${classes.join(' ')}"
                    type="button"
                    data-action="open-calendar-task"
                    data-board-id="${escapeHtml(item?.boardId || '')}"
                    data-task-id="${escapeHtml(String(item?.taskId || ''))}"
                    data-calendar-item-title="${escapeHtml(item?.title || '')}"
                    style="${style}"
                    title="${escapeHtml(title)}"
                >${escapeHtml(title)}</button>
            `;
        }




        function renderPortfolioCalendarDayRoadmapItem(item, date, options = {}) {
            if (!item) return '';
            const classes = ['portfolio-calendar-roadmap-span'];
            if (item?.kind) classes.push(`portfolio-calendar-roadmap-span-${item.kind}`);
            if (item?.isRange && item.bounds.start < date) classes.push('portfolio-calendar-roadmap-span-continues-before');
            if (item?.isRange && item.bounds.end > date) classes.push('portfolio-calendar-roadmap-span-continues-after');
            const style = buildPortfolioCalendarRoadmapSpanStyle(item, options);
            const title = getPortfolioCalendarItemLabel(item);
            const content = shouldShowPortfolioCalendarRoadmapLabel(item, date)
                ? escapeHtml(title)
                : '&nbsp;';
            return `
                <div
                    class="${classes.join(' ')}"
                    data-calendar-roadmap-title="${escapeHtml(item?.title || '')}"
                    data-calendar-roadmap-kind="${escapeHtml(item?.kind || '')}"
                    style="${style}"
                    title="${escapeHtml(title)}"
                >${content}</div>
            `;
        }

        function renderPortfolioCalendarMiniMonth(items, year, month, options = {}) {
            const firstOfMonth = createUtcDate(year, month, 1);
            const leadingDays = firstOfMonth.getUTCDay();
            const gridStart = addRoadmapDays(firstOfMonth, -leadingDays);
            const cellCount = getPortfolioCalendarMiniMonthCellCount(year, month);
            const dayMarkup = Array.from({ length: cellCount }, (_, index) => {
                const date = addRoadmapDays(gridStart, index);
                const isoDate = formatUtcIsoDate(date);
                const inCurrentMonth = date.getUTCMonth() === month;
                const markers = inCurrentMonth
                    ? getPortfolioCalendarMiniDayMarkers(items.filter((item) => doesPortfolioCalendarItemOccurOnDay(item, isoDate)), isoDate)
                    : [];
                const classes = ['portfolio-calendar-mini-day'];
                if (inCurrentMonth) classes.push('portfolio-calendar-mini-day-current');
                else classes.push('portfolio-calendar-mini-day-outside');
                if (isoDate === todayLocalIsoDate()) classes.push('portfolio-calendar-mini-day-today');
                const taskCount = inCurrentMonth && options.taskCounts instanceof Map
                    ? (options.taskCounts.get(isoDate) || 0)
                    : 0;
                const heatStyle = options.heatmap && inCurrentMonth
                    ? `background:${getPortfolioCalendarHeatColor(taskCount, options.heatStats)};`
                    : '';

                return `
                    <div class="${classes.join(' ')}" data-calendar-mini-day="${escapeHtml(isoDate)}" ${heatStyle ? `style="${heatStyle}"` : ''}>
                        <div class="portfolio-calendar-mini-day-number">${date.getUTCDate()}</div>
                        <div class="portfolio-calendar-mini-markers">
                            ${markers.map((marker) => {
                                const markerClasses = ['portfolio-calendar-mini-marker'];
                                if (marker.kind === 'task') markerClasses.push('portfolio-calendar-mini-marker-task');
                                if (marker.kind === 'range-end') markerClasses.push('portfolio-calendar-mini-marker-range-end');
                                return `<span class="${markerClasses.join(' ')}" style="${buildPortfolioCalendarMiniMarkerStyle(marker.item, options)}" title="${escapeHtml(marker.item.title || '')}"></span>`;
                            }).join('')}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="portfolio-calendar-mini-month-grid">
                    <div class="portfolio-calendar-mini-weekdays">
                        ${CALENDAR_WEEKDAY_NAMES.map((name) => `<div class="portfolio-calendar-mini-weekday">${escapeHtml(name.charAt(0))}</div>`).join('')}
                    </div>
                    <div class="portfolio-calendar-mini-day-grid">
                        ${dayMarkup}
                    </div>
                </div>
            `;
        }

        function renderPortfolioCalendarYearView(items, options = {}) {
            const year = appState.portfolioCalendarYear;
            const heatmap = Boolean(options.heatmap);
            const taskCounts = heatmap ? getPortfolioCalendarTaskCountsByDay(items) : null;
            const heatStats = heatmap ? getPortfolioCalendarYearHeatStats(taskCounts, year) : null;
            const quarterMarkup = Array.from({ length: 4 }, (_, quarterIndex) => {
                const baseMonth = quarterIndex * 3;
                const monthButtons = Array.from({ length: 3 }, (_, monthOffset) => {
                    const month = baseMonth + monthOffset;
                    const monthItems = items.filter((item) => doesPortfolioCalendarItemIntersectMonth(item, year, month));
                    return `
                        <button
                            class="portfolio-calendar-month-card"
                            type="button"
                            data-action="open-calendar-month"
                            data-year="${year}"
                            data-month="${month}"
                            aria-label="Open ${escapeHtml(getUtcMonthLabel(year, month))}"
                        >
                            <div class="portfolio-calendar-month-card-header">
                                <span class="portfolio-calendar-month-name">${escapeHtml(CALENDAR_MONTH_NAMES[month])}</span>
                                <span class="portfolio-calendar-month-count">${monthItems.length} item${monthItems.length === 1 ? '' : 's'}</span>
                            </div>
                            ${renderPortfolioCalendarMiniMonth(monthItems, year, month, {
                                aggregate: options.aggregate,
                                heatmap,
                                taskCounts,
                                heatStats
                            })}
                        </button>
                    `;
                }).join('');

                return `
                    <section class="portfolio-calendar-quarter">
                        <div class="portfolio-calendar-quarter-months">${monthButtons}</div>
                    </section>
                `;
            }).join('');

            return `
                <div class="portfolio-calendar-year">
                    ${quarterMarkup}
                </div>
            `;
        }

        function renderPortfolioCalendarMonthView(items, options = {}) {
            const year = appState.portfolioCalendarYear;
            const month = appState.portfolioCalendarMonth;
            const firstOfMonth = createUtcDate(year, month, 1);
            const leadingDays = firstOfMonth.getUTCDay();
            const gridStart = addRoadmapDays(firstOfMonth, -leadingDays);
            const heatmap = Boolean(options.heatmap);
            const taskCounts = heatmap ? getPortfolioCalendarTaskCountsByDay(items) : null;
            const heatStats = heatmap ? getPortfolioCalendarMonthHeatStats(taskCounts, year, month) : null;
            const canCreateTasks = Boolean(appState.selectedPortfolioBoardId) && canUsePortfolioTaskMutations(appState.selectedPortfolioBoardId);
            const weekMarkup = Array.from({ length: 6 }, (_, weekIndex) => {
                const weekStart = addRoadmapDays(gridStart, weekIndex * 7);
                const weekStartIso = formatUtcIsoDate(weekStart);
                const cellMarkup = Array.from({ length: 7 }, (_, dayIndex) => {
                    const date = addRoadmapDays(weekStart, dayIndex);
                    const isoDate = formatUtcIsoDate(date);
                    const dayItems = items
                        .filter((item) => doesPortfolioCalendarItemOccurOnDay(item, isoDate))
                        .sort(comparePortfolioCalendarDayItems);
                    const visibleItems = dayItems.slice(0, 4);
                    const roadmapItems = visibleItems.filter((item) => item?.kind !== 'task');
                    const taskItems = visibleItems.filter((item) => item?.kind === 'task');
                    const overflow = Math.max(0, dayItems.length - visibleItems.length);
                    const classes = ['portfolio-calendar-day-cell'];
                    const inCurrentMonth = date.getUTCMonth() === month;
                    if (inCurrentMonth) classes.push('portfolio-calendar-day-cell-current');
                    else classes.push('portfolio-calendar-day-cell-outside');
                    if (isoDate === todayLocalIsoDate()) classes.push('portfolio-calendar-day-cell-today');
                    if (canCreateTasks && inCurrentMonth) classes.push('portfolio-calendar-day-cell-actionable');
                    const taskCount = inCurrentMonth && taskCounts instanceof Map
                        ? (taskCounts.get(isoDate) || 0)
                        : 0;
                    const heatStyle = heatmap && inCurrentMonth
                        ? `background:${getPortfolioCalendarHeatColor(taskCount, heatStats)};`
                        : '';
                    return `
                        <div
                            class="${classes.join(' ')}"
                            data-calendar-day="${escapeHtml(isoDate)}"
                            ${heatStyle ? `style="${heatStyle}"` : ''}
                        ${canCreateTasks && inCurrentMonth ? `data-action="create-calendar-task" data-due-date="${escapeHtml(isoDate)}"` : ''}
                    >
                        <div class="portfolio-calendar-day-number">${date.getUTCDate()}</div>
                        ${roadmapItems.length > 0 ? `
                            <div class="portfolio-calendar-day-roadmap">
                                ${roadmapItems.map((item) => renderPortfolioCalendarDayRoadmapItem(item, date, { aggregate: options.aggregate })).join('')}
                            </div>
                        ` : ''}
                        <div class="portfolio-calendar-day-items">
                                ${taskItems.map((item) => renderPortfolioCalendarTaskButton(item, { aggregate: options.aggregate })).join('')}
                                ${overflow > 0 ? `<div class="portfolio-calendar-item-overflow">+${overflow} more</div>` : ''}
                        </div>
                    </div>
                `;
                }).join('');

                return `
                    <div class="portfolio-calendar-week-row" data-calendar-week-start="${escapeHtml(weekStartIso)}">
                        <div class="portfolio-calendar-week-days">
                            ${cellMarkup}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="portfolio-calendar-month-grid">
                    <div class="portfolio-calendar-month-grid-track">
                        <div class="portfolio-calendar-weekdays">
                            ${CALENDAR_WEEKDAY_NAMES.map((name) => `<div class="portfolio-calendar-weekday">${escapeHtml(name)}</div>`).join('')}
                        </div>
                        <div class="portfolio-calendar-day-grid">
                            ${weekMarkup}
                        </div>
                    </div>
                </div>
            `;
        }

        function renderPortfolioCalendarView(rows) {
            const calendarViewNode = document.getElementById('portfolioCalendarView');
            if (!calendarViewNode) return;

            const items = buildPortfolioCalendarItems(rows);
            const aggregate = !appState.selectedPortfolioBoardId;
            ensurePortfolioCalendarState(items);
            const heatmap = appState.portfolioCalendarDisplayMode === 'heatmap';

            const periodLabel = appState.portfolioCalendarView === 'month'
                ? getUtcMonthLabel(appState.portfolioCalendarYear, appState.portfolioCalendarMonth)
                : String(appState.portfolioCalendarYear);
            const bodyMarkup = appState.portfolioCalendarView === 'month'
                ? renderPortfolioCalendarMonthView(items, { aggregate, heatmap })
                : renderPortfolioCalendarYearView(items, { aggregate, heatmap });
            const toggleLabel = appState.portfolioCalendarDisplayMode === 'heatmap' ? 'Calendar' : 'Heat Map';

            calendarViewNode.innerHTML = `
                <div class="portfolio-calendar-header">
                    <div class="portfolio-calendar-controls">
                        ${appState.portfolioCalendarView === 'month' ? '<button class="btn" type="button" data-action="calendar-back-to-year" aria-label="Back to year">Back to year</button>' : ''}
                        <button class="btn" type="button" data-action="${appState.portfolioCalendarView === 'month' ? 'calendar-prev-month' : 'calendar-prev-year'}" aria-label="${appState.portfolioCalendarView === 'month' ? 'Previous month' : 'Previous year'}">Prev</button>
                        <div class="portfolio-calendar-period-group">
                            <div class="portfolio-calendar-period">${escapeHtml(periodLabel)}</div>
                            <button class="btn" type="button" data-action="calendar-toggle-mode">${escapeHtml(toggleLabel)}</button>
                        </div>
                        <button class="btn" type="button" data-action="${appState.portfolioCalendarView === 'month' ? 'calendar-next-month' : 'calendar-next-year'}" aria-label="${appState.portfolioCalendarView === 'month' ? 'Next month' : 'Next year'}">Next</button>
                    </div>
                </div>
                <div class="portfolio-calendar-shell" data-calendar-scope="${aggregate ? 'aggregate' : 'selected'}" data-calendar-view="${escapeHtml(appState.portfolioCalendarView)}" data-calendar-display-mode="${appState.portfolioCalendarDisplayMode}">
                    ${bodyMarkup}
                </div>
            `;
        }

        function getPortfolioRoadmapExpandedRows(boardId) {
            if (!boardId) return {};
            const expandedRows = appState.portfolioRoadmapExpandedRowsByBoardId[boardId];
            if (expandedRows && typeof expandedRows === 'object' && !Array.isArray(expandedRows)) return expandedRows;
            appState.portfolioRoadmapExpandedRowsByBoardId[boardId] = {};
            return appState.portfolioRoadmapExpandedRowsByBoardId[boardId];
        }

        function isPortfolioRoadmapRowExpanded(boardId, key) {
            return Boolean(getPortfolioRoadmapExpandedRows(boardId)[key]);
        }

        function togglePortfolioRoadmapRowExpanded(boardId, key) {
            if (!boardId || !key) return;
            const next = { ...getPortfolioRoadmapExpandedRows(boardId) };
            next[key] = !next[key];
            appState.portfolioRoadmapExpandedRowsByBoardId[boardId] = next;
        }

        function buildRoadmapEntityOptionMarkup(items, selectedId) {
            const normalizedSelected = normalizeRoadmapRef(selectedId);
            return [
                '<option value="">None</option>',
                ...items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === normalizedSelected ? 'selected' : ''}>${escapeHtml(item.title)}</option>`)
            ].join('');
        }

        function buildRoadmapSprintSelectionOptionMarkup(items, selectedId) {
            const normalizedSelected = normalizeRoadmapRef(selectedId);
            return [
                '<option value="">Select sprint</option>',
                ...(Array.isArray(items) ? items : []).map((item) => {
                    const label = formatRoadmapDateRange(item)
                        ? `${item.title} • ${formatRoadmapDateRange(item)}`
                        : item.title;
                    return `<option value="${escapeHtml(item.id)}" ${item.id === normalizedSelected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
                })
            ].join('');
        }





        function getPortfolioBulkSelection(boardId) {
            return Array.isArray(appState.portfolioBulkSelectionByBoardId[boardId]) ? appState.portfolioBulkSelectionByBoardId[boardId] : [];
        }

        function isPortfolioTaskBulkSelected(boardId, taskId) {
            return getPortfolioBulkSelection(boardId).includes(Number(taskId));
        }

        function clearPortfolioBulkSelection(boardId = '') {
            if (boardId) {
                delete appState.portfolioBulkSelectionByBoardId[boardId];
                return;
            }
            appState.portfolioBulkSelectionByBoardId = {};
        }

        function syncPortfolioBulkSelection(boardId, boardData) {
            const normalizedBoardId = String(boardId || '');
            if (!normalizedBoardId) return;
            const taskIds = new Set(Array.isArray(boardData?.board?.tasks) ? boardData.board.tasks.map((task) => Number(task.id)) : []);
            const nextIds = getPortfolioBulkSelection(normalizedBoardId).filter((taskId) => taskIds.has(Number(taskId)));
            if (nextIds.length > 0) {
                appState.portfolioBulkSelectionByBoardId[normalizedBoardId] = nextIds;
                return;
            }
            delete appState.portfolioBulkSelectionByBoardId[normalizedBoardId];
        }

        function togglePortfolioTaskBulkSelection(boardId, taskId, checked) {
            const normalizedBoardId = String(boardId || '');
            if (!normalizedBoardId) return;
            const ids = new Set(getPortfolioBulkSelection(normalizedBoardId).map((value) => Number(value)));
            if (checked) {
                ids.add(Number(taskId));
            } else {
                ids.delete(Number(taskId));
            }
            const nextIds = [...ids];
            if (nextIds.length > 0) {
                appState.portfolioBulkSelectionByBoardId[normalizedBoardId] = nextIds;
                return;
            }
            delete appState.portfolioBulkSelectionByBoardId[normalizedBoardId];
        }

        function getSelectedPortfolioBulkTaskIds(boardId) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return [];
            syncPortfolioBulkSelection(boardId, boardRecord.data);
            return getPortfolioBulkSelection(boardId);
        }

        function setSelectedPortfolioBoardId(boardId, options = {}) {
            const nextBoardId = boardId || '';
            if (nextBoardId !== appState.selectedPortfolioBoardId) {
                clearPortfolioBulkSelection();
            }
            appState.selectedPortfolioBoardId = nextBoardId;
            if (options.resetViewModeWhenEmpty !== false && !appState.selectedPortfolioBoardId) {
                appState.selectedPortfolioViewMode = 'board';
            }
        }







        function markProjectDirty(boardId) {
            const state = getProjectSaveState(boardId);
            if (!state) return null;
            state.revision += 1;
            if (state.inFlight) {
                state.queued = true;
            } else if (state.status !== 'error') {
                state.status = 'dirty';
            }
            if (state.watchStatus === 'external' || state.watchStatus === 'conflict') {
                state.watchStatus = 'idle';
                state.watchMessage = '';
                state.watchStatusUntil = 0;
            }
            return state;
        }


        function getProjectChipSaveUiState(boardId) {
            const state = getProjectSaveState(boardId, { create: false });
            if (!state) return { status: 'idle', text: '', title: '', canRetry: false };
            if (state.status === 'error') {
                return {
                    status: 'error',
                    text: 'Save failed',
                    title: state.lastErrorMessage || 'Save failed.',
                    canRetry: true
                };
            }
            if (state.inFlight) {
                return { status: 'saving', text: 'Saving', title: 'Saving changes…', canRetry: false };
            }
            if (state.watchStatus === 'conflict') {
                return {
                    status: 'conflict',
                    text: 'Conflict',
                    title: state.watchMessage || 'External changes detected while local edits are unsaved.',
                    canRetry: false
                };
            }
            if (projectHasUnsavedChanges(boardId)) {
                return { status: 'dirty', text: 'Unsaved', title: 'Unsaved changes.', canRetry: false };
            }
            if (state.watchStatus === 'watch-error') {
                return {
                    status: 'warning',
                    text: 'Watch error',
                    title: state.watchMessage || 'Could not read project file for external changes.',
                    canRetry: false
                };
            }
            if (state.watchStatus === 'external') {
                if (state.watchStatusUntil && Date.now() > state.watchStatusUntil) {
                    return { status: 'idle', text: '', title: '', canRetry: false };
                }
                return {
                    status: 'external',
                    text: 'External update',
                    title: state.watchMessage || 'Project reloaded from disk.',
                    canRetry: false
                };
            }
            return { status: 'idle', text: '', title: '', canRetry: false };
        }

        function findPortfolioTaskSource(boardId, taskId) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord || !boardRecord.data || !boardRecord.data.board || !Array.isArray(boardRecord.data.board.tasks)) {
                return null;
            }
            const index = boardRecord.data.board.tasks.findIndex(task => task && task.id === taskId);
            if (index < 0) return null;
            return {
                boardRecord,
                task: boardRecord.data.board.tasks[index],
                taskIndex: index
            };
        }

        function findPortfolioTaskDetailSource(boardId, taskId, options = {}) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return null;
            const sourceBoardData = options.boardData ? createBoardStateSnapshot(options.boardData) : boardRecord.data;
            if (!sourceBoardData || !sourceBoardData.board || !Array.isArray(sourceBoardData.board.tasks)) {
                return null;
            }
            const index = sourceBoardData.board.tasks.findIndex(task => task && task.id === taskId);
            if (index < 0) return null;
            return {
                boardRecord,
                boardData: sourceBoardData,
                task: sourceBoardData.board.tasks[index],
                taskIndex: index
            };
        }

        function isPortfolioBoardMutable(boardId) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            return Boolean(boardRecord && boardRecord.handle);
        }

        function isPortfolioTaskMutable(boardId) {
            return isPortfolioBoardMutable(boardId);
        }







        function applySnapshotToBoardRecord(boardRecord, parsed, options = {}) {
            if (!boardRecord || !parsed) return false;
            const boardId = boardRecord.id;
            closePortfolioContextsForProject(boardId);
            const payload = serializeBoardDataFromObject(parsed);
            boardRecord.data = payload;
            boardRecord.title = payload.board.settings.title;
            if (options.discardLocalChanges) {
                const saveState = getProjectSaveState(boardId, { create: false });
                if (saveState) {
                    saveState.revision = saveState.savedRevision;
                    saveState.status = 'idle';
                    saveState.lastErrorMessage = '';
                    saveState.queued = false;
                }
            }
            buildPortfolioTasks();
            renderPortfolio();
            return true;
        }





        function startProjectFileWatcher() {
            stopProjectFileWatcher();
            appState.projectWatchTimerId = setInterval(() => {
                if (document.hidden) return;
                void checkProjectFilesNow();
            }, PROJECT_FILE_WATCH_INTERVAL_MS);
            void checkProjectFilesNow();
        }







        function syncPortfolioProjectColors() {
            const usedSeeds = new Set();
            let nextSeed = 0;

            appState.portfolioBoards.forEach((board) => {
                if (!board) return;
                const seed = Number.isInteger(board.colorSeed) && board.colorSeed >= 0
                    ? board.colorSeed
                    : null;
                if (seed === null || usedSeeds.has(seed)) {
                    board.colorSeed = null;
                    return;
                }
                usedSeeds.add(seed);
                nextSeed = Math.max(nextSeed, seed + 1);
            });

            appState.portfolioBoards.forEach((board) => {
                if (!board || Number.isInteger(board.colorSeed)) return;
                while (usedSeeds.has(nextSeed)) {
                    nextSeed += 1;
                }
                board.colorSeed = nextSeed;
                usedSeeds.add(nextSeed);
                nextSeed += 1;
            });

            appState.nextPortfolioProjectColorSeed = nextSeed;

            const usedColorKeys = new Set();
            appState.portfolioBoards
                .filter(Boolean)
                .slice()
                .sort((a, b) => a.colorSeed - b.colorSeed)
                .forEach((board) => {
                    let offset = 0;
                    let color = createPortfolioProjectColor(board.colorSeed, offset);
                    let key = portfolioProjectColorKey(color);
                    while (usedColorKeys.has(key)) {
                        offset += 1;
                        color = createPortfolioProjectColor(board.colorSeed, offset);
                        key = portfolioProjectColorKey(color);
                    }
                    board.projectColor = color;
                    usedColorKeys.add(key);
                });
        }

        function buildPortfolioTasks() {
            syncPortfolioProjectColors();
            syncProjectSaveStates();
            appState.portfolioTasks = appState.portfolioBoards.flatMap((board, boardIndex) => {
                const statusMap = Object.fromEntries(board.data.board.columns.map(col => [col.status, col.title]));
                return board.data.board.tasks.map((task, taskIndex) => ({
                    boardIndex,
                    boardId: board.id,
                    taskId: task.id,
                    taskIndex,
                    boardTitle: board.title,
                    boardFileName: board.fileName,
                    columnTitle: statusMap[task.status] || task.status,
                    canMutate: Boolean(board.handle),
                    task: normalizeTask(task)
                }));
            });
        }





        function getTimelineSelectionIndex(boardId, timeline) {
            if (!boardId || !timeline || !Array.isArray(timeline.events) || timeline.events.length === 0) return null;
            const maxIndex = timeline.events.length - 1;
            if (appState.portfolioTimelineSelection.boardId !== boardId || !Number.isInteger(appState.portfolioTimelineSelection.eventIndex)) {
                return maxIndex;
            }
            return Math.max(0, Math.min(maxIndex, appState.portfolioTimelineSelection.eventIndex));
        }

        function isHistoricalPreviewActiveForBoard(boardId) {
            if (!boardId) return false;
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return false;
            const timeline = getBoardTimelineData(boardRecord.data);
            if (!timeline || timeline.events.length === 0) return false;
            const selectedIndex = getTimelineSelectionIndex(boardId, timeline);
            return Number.isInteger(selectedIndex) && selectedIndex < timeline.events.length - 1;
        }

        function clearPortfolioTimelineSelection(options = {}) {
            appState.portfolioTimelineSelection = { boardId: '', eventIndex: null };
            if (options.keepModals !== true) {
                closeDetailModal();
                closeModal();
            }
        }

        function setPortfolioTimelineSelection(boardId, eventIndex, options = {}) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) {
                clearPortfolioTimelineSelection();
                renderPortfolio();
                return;
            }
            const timeline = getBoardTimelineData(boardRecord.data);
            if (!timeline || timeline.events.length === 0) {
                clearPortfolioTimelineSelection();
                renderPortfolio();
                return;
            }
            const maxIndex = timeline.events.length - 1;
            const nextIndex = Math.max(0, Math.min(maxIndex, Number(eventIndex)));
            appState.portfolioTimelineSelection = { boardId, eventIndex: nextIndex };
            closeDetailModal();
            closeModal();
            renderPortfolio(options);
        }

        function movePortfolioTimelineToLatest(boardId = appState.selectedPortfolioBoardId) {
            if (!boardId) {
                clearPortfolioTimelineSelection();
                renderPortfolio();
                return;
            }
            const boardRecord = getPortfolioBoardRecord(boardId);
            const timeline = boardRecord ? getBoardTimelineData(boardRecord.data) : null;
            if (!timeline || timeline.events.length === 0) {
                clearPortfolioTimelineSelection();
                renderPortfolio();
                return;
            }
            appState.portfolioTimelineSelection = { boardId, eventIndex: timeline.events.length - 1 };
            closeDetailModal();
            closeModal();
            renderPortfolio();
        }

        function syncPortfolioTimelineSelectionToLatest(boardId, boardData = null) {
            if (!boardId) return;
            if (appState.selectedPortfolioBoardId !== boardId && appState.portfolioTimelineSelection.boardId !== boardId) {
                return;
            }

            const resolvedBoardData = boardData || getPortfolioBoardRecord(boardId)?.data;
            const timeline = resolvedBoardData ? getBoardTimelineData(resolvedBoardData) : null;
            if (!timeline || timeline.events.length === 0) {
                if (appState.portfolioTimelineSelection.boardId === boardId) {
                    appState.portfolioTimelineSelection = { boardId: '', eventIndex: null };
                }
                return;
            }

            appState.portfolioTimelineSelection = { boardId, eventIndex: timeline.events.length - 1 };
        }

        function isPortfolioTimelineExpanded(boardId) {
            return Boolean(boardId && appState.portfolioTimelineExpandedByBoardId[boardId] === true);
        }

        function cachePortfolioTimelineListScrollPosition(panel = document.getElementById('portfolioTimelinePanel')) {
            if (!panel) return;
            const boardId = panel.dataset.boardId || '';
            const list = panel.querySelector('.timeline-event-list');
            if (!boardId || !list) return;
            appState.portfolioTimelineListScrollTopByBoardId[boardId] = list.scrollTop;
        }

        function restorePortfolioTimelineListScrollPosition(boardId, panel = document.getElementById('portfolioTimelinePanel')) {
            if (!boardId || !panel) return;
            const list = panel.querySelector('.timeline-event-list');
            if (!list) return;
            const scrollTop = appState.portfolioTimelineListScrollTopByBoardId[boardId];
            if (!Number.isFinite(scrollTop)) return;
            list.scrollTop = scrollTop;
        }

        function setPortfolioTimelineExpanded(boardId, expanded) {
            if (!boardId) return;
            appState.portfolioTimelineExpandedByBoardId[boardId] = Boolean(expanded);
            renderPortfolio();
        }

        function togglePortfolioTimelineExpanded(boardId = appState.selectedPortfolioBoardId) {
            if (!boardId) return;
            setPortfolioTimelineExpanded(boardId, !isPortfolioTimelineExpanded(boardId));
        }



        function buildPortfolioRowsFromBoardData(boardRecord, boardData, options = {}) {
            if (!boardRecord || !boardData) return [];
            const normalizedBoard = createBoardStateSnapshot(boardData);
            const statusMap = Object.fromEntries((normalizedBoard.board.columns || []).map((col) => [col.status, col.title]));
            const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
            const historical = Boolean(options.historical);
            return (normalizedBoard.board.tasks || []).map((task, taskIndex) => ({
                boardIndex: appState.portfolioBoards.findIndex((board) => board.id === boardRecord.id),
                boardId: boardRecord.id,
                taskId: task.id,
                taskIndex,
                boardTitle: boardRecord.title,
                boardFileName: boardRecord.fileName,
                columnTitle: statusMap[task.status] || task.status,
                canMutate,
                historical,
                task: normalizeTask(task)
            }));
        }

        function getSelectedBoardTimelineViewState() {
            if (!appState.selectedPortfolioBoardId) return null;
            const boardRecord = getPortfolioBoardRecord(appState.selectedPortfolioBoardId);
            if (!boardRecord) return null;
            const timeline = getBoardTimelineData(boardRecord.data);
            if (!timeline || timeline.events.length === 0) {
                return {
                    boardRecord,
                    timeline: null,
                    selectedIndex: null,
                    selectedEvent: null,
                    isPreview: false,
                    projectedBoard: null
                };
            }

            const selectedIndex = getTimelineSelectionIndex(boardRecord.id, timeline);
            const selectedEvent = timeline.events[selectedIndex] || null;
            const projectedBoard = reconstructBoardStateFromTimeline(boardRecord.data, selectedIndex);
            return {
                boardRecord,
                timeline,
                selectedIndex,
                selectedEvent,
                isPreview: selectedIndex < timeline.events.length - 1,
                projectedBoard
            };
        }

        function closePortfolioContextsForProject(boardId) {
            if (!boardId) return;
            if (appState.portfolioDetailContext && appState.portfolioDetailContext.boardId === boardId) {
                closeDetailModal();
            }
            if (
                (appState.portfolioEditContext && appState.portfolioEditContext.boardId === boardId) ||
                (appState.portfolioCreateContext && appState.portfolioCreateContext.boardId === boardId)
            ) {
                closeModal();
            }
        }

        function sortPortfolioBoardsAlphabetically() {
            appState.portfolioBoards.sort((a, b) => {
                const aLabel = String(a.title || a.fileName || '').toLowerCase();
                const bLabel = String(b.title || b.fileName || '').toLowerCase();
                return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
            });
        }

        function appendPortfolioRecords(records, options = {}) {
            const list = Array.isArray(records) ? records.filter(Boolean) : [];
            if (list.length === 0) return;
            appState.portfolioBoards = [...appState.portfolioBoards, ...list];
            sortPortfolioBoardsAlphabetically();
            if (typeof options.selectBoardId === 'string') {
                setSelectedPortfolioBoardId(options.selectBoardId, { resetViewModeWhenEmpty: false });
            }
            if (appState.selectedPortfolioBoardId && !appState.portfolioBoards.some(board => board.id === appState.selectedPortfolioBoardId)) {
                setSelectedPortfolioBoardId('', { resetViewModeWhenEmpty: false });
            }
            buildPortfolioTasks();
            renderPortfolio();
            primeProjectFileBaselines(list);
        }

        function renderPortfolioBoardChips() {
            const chips = document.getElementById('portfolioBoardsChips');
            if (!chips) return;

            if (appState.portfolioBoards.length === 0) {
                chips.innerHTML = '<span class="empty-state-text">No projects loaded</span>';
                return;
            }

            const allActiveClass = appState.selectedPortfolioBoardId ? '' : 'active';
            const allChip = `
                <span class="portfolio-chip ${allActiveClass}">
                    <button class="chip-link" type="button" data-action="select-board" data-board-id="">All</button>
                </span>
            `;

            const boardChips = appState.portfolioBoards.map(board => {
                const activeClass = appState.selectedPortfolioBoardId === board.id ? 'active' : '';
                const color = portfolioProjectColor(board.id);
                const chipStyle = `--chip-bg:${color.bg};--chip-border:${color.border};--chip-text:${color.text};`;
                const saveUi = getProjectChipSaveUiState(board.id);
                const saveStateLabel = saveUi.text
                    ? `<span class="chip-save-state ${saveUi.status}" title="${escapeHtml(saveUi.title)}"> • ${escapeHtml(saveUi.text)}</span>`
                    : '';
                const retryButton = (board.handle && saveUi.canRetry)
                    ? `<button class="chip-link" type="button" title="Retry save" data-action="retry-save" data-board-id="${escapeHtml(board.id)}">Retry</button>`
                    : '';
                return `
                    <span class="portfolio-chip ${activeClass}" style="${chipStyle}">
                        <button class="chip-link" type="button" data-action="select-board" data-board-id="${escapeHtml(board.id)}">
                            ${escapeHtml(board.title || board.fileName)}
                            ${board.handle ? '' : '<span class="chip-readonly-label"> (Read-only)</span>'}
                            ${saveStateLabel}
                        </button>
                        ${retryButton}
                        <button class="chip-link chip-link-danger" type="button" aria-label="Remove project" title="Remove project" data-action="remove-board" data-board-id="${escapeHtml(board.id)}">Remove</button>
                    </span>
                `;
            }).join('');

            chips.innerHTML = allChip + boardChips;
        }

        function selectPortfolioBoard(boardId) {
            if ((boardId || '') !== appState.selectedPortfolioBoardId) {
                clearPortfolioTimelineSelection();
            }
            setSelectedPortfolioBoardId(boardId, {
                resetViewModeWhenEmpty: !(!boardId && appState.selectedPortfolioViewMode === 'calendar')
            });
            renderPortfolio();
            updateUrlState();
        }

        function removeProjectFromPortfolio(boardId) {
            const index = appState.portfolioBoards.findIndex(board => board.id === boardId);
            if (index < 0) return;
            closePortfolioContextsForProject(boardId);
            if (appState.selectedPortfolioCardRef && appState.selectedPortfolioCardRef.boardId === boardId) {
                appState.selectedPortfolioCardRef = null;
            }
            if (appState.hoveredPortfolioCardRef && appState.hoveredPortfolioCardRef.boardId === boardId) {
                appState.hoveredPortfolioCardRef = null;
            }
            appState.portfolioBoards.splice(index, 1);
            if (appState.selectedPortfolioBoardId === boardId) {
                setSelectedPortfolioBoardId('', { resetViewModeWhenEmpty: false });
            }
            if (appState.portfolioTimelineSelection.boardId === boardId) {
                clearPortfolioTimelineSelection();
            }
            clearPortfolioBulkSelection(boardId);
            appState.projectSaveStateById.delete(boardId);
            appState.projectFileStateById.delete(boardId);
            buildPortfolioTasks();
            renderPortfolio();
        }

        async function newProject() {
            try {
                const handle = await window.showSaveFilePicker({
                    suggestedName: `new-project${BOARD_FILE_EXTENSION}`,
                    types: [{ description: 'Project JSON', accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
                });
                assertRequiredExtension(handle.name, BOARD_FILE_EXTENSION, 'Project file');

                const defaultTitle = String(handle.name || 'New Project')
                    .replace(new RegExp(`${BOARD_FILE_EXTENSION.replace('.', '\\.')}$`, 'i'), '')
                    .replace(/[-_]+/g, ' ')
                    .trim() || 'New Project';
                const requestedName = prompt('Project name:', defaultTitle);
                if (requestedName === null) return;
                const title = requestedName.trim();
                if (!title) return;
                const suggestedStem = slugifyColumnName(title) || 'project';

                const data = createEmptyProjectData(title);
                await writeJsonToFileHandle(handle, BoardRepository.serialize(data));
                const record = createPortfolioRecord({
                    handle,
                    fileName: handle.name || `${suggestedStem}${BOARD_FILE_EXTENSION}`,
                    data
                });
                appendPortfolioRecords([record], { selectBoardId: record.id });
            } catch (error) {
                if (!isAbortError(error)) {
                    Logger.error('New project failed', error);
                    alert(`New project failed: ${formatErrorMessage(error)}`);
                }
            }
        }

        async function importProjects() {
            try {
                const handles = await window.showOpenFilePicker({
                    multiple: true,
                    types: [{ description: 'Project JSON', accept: { 'application/json': [BOARD_FILE_EXTENSION] } }]
                });

                const { loaded, errors } = await BoardRepository.importFromHandles(handles);

                appendPortfolioRecords(loaded);
                if (errors.length > 0) {
                    alert(`Some projects were not imported:\n${errors.join('\n')}`);
                }
            } catch (error) {
                if (!isAbortError(error)) {
                    Logger.error('Import from picker failed', error);
                    alert(`Import failed: ${formatErrorMessage(error)}`);
                }
            }
        }

        async function openPortfolioFromFiles(files) {
            try {
                const list = Array.from(files || []);
                const boardFiles = list.filter(file => hasRequiredExtension(file.name, BOARD_FILE_EXTENSION));
                if (boardFiles.length === 0) {
                    alert(`No ${BOARD_FILE_EXTENSION} files found.`);
                    return;
                }

                const { loaded, errors } = await BoardRepository.importFromLooseFiles(boardFiles);

                appendPortfolioRecords(loaded);
                if (errors.length > 0) {
                    alert(`Some projects were not imported:\n${errors.join('\n')}`);
                }
            } catch (error) {
                Logger.error('Import from drop failed', error);
                alert(`Import failed: ${formatErrorMessage(error)}`);
            }
        }

        function setupFileDrop() {
            let fileDragDepth = 0;

            window.addEventListener('dragenter', (ev) => {
                if (!isFileDrag(ev)) return;
                fileDragDepth += 1;
                setFileDropActive(true);
            });

            window.addEventListener('dragover', (ev) => {
                if (!isFileDrag(ev)) return;
                ev.preventDefault();
                setFileDropActive(true);
            });

            window.addEventListener('dragleave', (ev) => {
                if (!isFileDrag(ev)) return;
                fileDragDepth = Math.max(0, fileDragDepth - 1);
                if (fileDragDepth === 0) {
                    setFileDropActive(false);
                }
            });

            window.addEventListener('drop', (ev) => {
                if (!isFileDrag(ev)) return;
                ev.preventDefault();
                fileDragDepth = 0;
                setFileDropActive(false);
                const files = ev.dataTransfer ? ev.dataTransfer.files : null;
                if (!files || files.length === 0) return;

                openPortfolioFromFiles(files);
            });
        }

        function getFilteredSortedPortfolioRows() {
            const search = (document.getElementById('portfolioSearchInput')?.value || '').trim().toLowerCase();
            const priorityFilter = document.getElementById('portfolioPriorityFilter')?.value || '';
            const assigneeFilter = normalizeAssignee(document.getElementById('portfolioAssigneeFilter')?.value || '');
            const blockedFilter = normalizePortfolioBlockedFilter(document.getElementById('portfolioBlockedFilter')?.value || 'all');
            const effortFilter = document.getElementById('portfolioEffortFilter')?.value || '';
            const archiveFilter = document.getElementById('portfolioArchiveFilter')?.value || 'active';
            const sortBy = normalizePortfolioSortKey(appState.portfolioSortKey);
            const sortDir = normalizePortfolioSortDir(appState.portfolioSortDir);
            const timelineView = getSelectedBoardTimelineViewState();
            const sourceRows = (timelineView && timelineView.isPreview && timelineView.projectedBoard)
                ? buildPortfolioRowsFromBoardData(timelineView.boardRecord, timelineView.projectedBoard, {
                    canMutate: false,
                    historical: true
                })
                : appState.portfolioTasks;

            return sourceRows
                .filter(item => {
                    const task = item.task;
                    if (appState.selectedPortfolioBoardId && item.boardId !== appState.selectedPortfolioBoardId) return false;
                    if (archiveFilter === 'active' && task.archived) return false;
                    if (archiveFilter === 'archived' && !task.archived) return false;
                    if (priorityFilter && task.priority !== priorityFilter) return false;
                    if (assigneeFilter && !taskHasAssignee(task, assigneeFilter)) return false;
                    if (blockedFilter === 'blocked' && !task.blocked) return false;
                    if (blockedFilter === 'unblocked' && task.blocked) return false;
                    if (effortFilter && task.effort !== effortFilter) return false;
                    if (search && !String(task.title || '').toLowerCase().includes(search)) return false;
                    return true;
                })
                .sort((a, b) => comparePortfolioRows(a, b, sortBy, sortDir));
        }

        function portfolioProjectColor(boardId) {
            const board = getPortfolioBoardRecord(boardId);
            if (!board) {
                return createPortfolioProjectColor(0);
            }
            if (!board.projectColor) {
                syncPortfolioProjectColors();
            }
            return board.projectColor || createPortfolioProjectColor(board.colorSeed || 0);
        }


        function renderTimelineEventChanges(event) {
            const changeEntries = Object.entries(event?.changes || {});
            if (changeEntries.length === 0) {
                if (event?.snapshot) {
                    return '<div class="timeline-empty">This event stores a full snapshot for replay/restoration.</div>';
                }
                return '<div class="timeline-empty">No field diff stored for this event.</div>';
            }

            return `
                <div class="timeline-diff-list">
                    ${changeEntries.map(([field, change]) => `
                        <div class="timeline-diff-item">
                            <div class="timeline-diff-field">${escapeHtml(field)}</div>
                            <div class="timeline-diff-values">
                                <div class="timeline-diff-box">
                                    <div class="timeline-diff-label">Before</div>
                                    <pre class="timeline-diff-value">${escapeHtml(formatTimelineValue(change.before))}</pre>
                                </div>
                                <div class="timeline-diff-box">
                                    <div class="timeline-diff-label">After</div>
                                    <pre class="timeline-diff-value">${escapeHtml(formatTimelineValue(change.after))}</pre>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        function renderPortfolioTimelinePanel() {
            const panel = document.getElementById('portfolioTimelinePanel');
            if (!panel) return;

            cachePortfolioTimelineListScrollPosition(panel);
            const viewState = getSelectedBoardTimelineViewState();
            if (!viewState || !viewState.boardRecord) {
                panel.dataset.boardId = '';
                panel.classList.remove('active');
                panel.innerHTML = '';
                return;
            }

            const boardTitle = viewState.boardRecord.title || viewState.boardRecord.fileName || 'Selected Project';
            const isExpanded = isPortfolioTimelineExpanded(viewState.boardRecord.id);
            const panelClasses = ['timeline-panel', 'active'];
            if (!isExpanded) {
                panelClasses.push('collapsed');
            }
            if (!viewState.timeline || viewState.timeline.events.length === 0) {
                panel.dataset.boardId = viewState.boardRecord.id;
                panel.className = panelClasses.join(' ');
                panel.innerHTML = `
                    <div class="timeline-panel-header">
                        <div>
                            <div class="timeline-panel-title">Timeline</div>
                            <div class="timeline-panel-subtitle">${escapeHtml(boardTitle)} does not have tracked events yet. The timeline starts on the first saved change.</div>
                        </div>
                    </div>
                `;
                return;
            }

            const timeline = viewState.timeline;
            const selectedIndex = viewState.selectedIndex;
            const selectedEvent = viewState.selectedEvent;
            const latestIndex = timeline.events.length - 1;
            const latestEvent = timeline.events[latestIndex];
            const subtitleText = `${boardTitle} has ${timeline.events.length} tracked event${timeline.events.length === 1 ? '' : 's'}. Latest event: ${latestEvent?.summary || 'Unknown event'} at ${formatDateTime(latestEvent?.at || '')}.`;
            const latestButtonHtml = `<button class="btn" type="button" data-action="timeline-latest" data-board-id="${escapeHtml(viewState.boardRecord.id)}">Latest</button>`;
            const previewBannerClass = viewState.isPreview ? 'timeline-preview-banner active' : 'timeline-preview-banner';
            const restoreButtonHtml = viewState.boardRecord.handle
                ? '<button class="btn btn-primary" type="button" data-action="timeline-restore">Restore this state</button>'
                : '';

            panel.dataset.boardId = viewState.boardRecord.id;
            panel.className = panelClasses.join(' ');
            panel.innerHTML = `
                <div class="timeline-panel-header">
                    <div>
                        <div class="timeline-panel-title">Timeline</div>
                        <div class="timeline-panel-subtitle">${escapeHtml(subtitleText)}</div>
                    </div>
                    <div class="timeline-panel-actions">
                        <div class="${previewBannerClass}">Historical preview active</div>
                        <button class="btn timeline-toggle-btn" type="button" data-action="timeline-toggle-expanded" data-board-id="${escapeHtml(viewState.boardRecord.id)}">${isExpanded ? 'Collapse' : 'Expand'}</button>
                    </div>
                </div>
                <div class="timeline-controls">
                    ${renderPortfolioTimelineSummaryRow(viewState)}
                    <div class="timeline-slider-row">
                        <input class="timeline-slider" type="range" min="0" max="${latestIndex}" step="1" value="${selectedIndex}" data-action="timeline-slider" data-board-id="${escapeHtml(viewState.boardRecord.id)}">
                        ${latestButtonHtml}
                        ${restoreButtonHtml}
                    </div>
                </div>
                ${renderPortfolioTimelineBody(viewState)}
            `;
            restorePortfolioTimelineListScrollPosition(viewState.boardRecord.id, panel);
        }

        function renderPortfolioTimelineSummaryRow(viewState) {
            if (!viewState?.boardRecord || !viewState?.timeline || !isPortfolioTimelineExpanded(viewState.boardRecord.id)) return '';
            return `
                <div class="timeline-summary-row">
                    <span class="timeline-pill">${escapeHtml(formatDateTime(viewState.selectedEvent?.at || ''))}</span>
                    <span class="timeline-pill">Event ${viewState.selectedIndex + 1} / ${viewState.timeline.events.length}</span>
                    <span class="timeline-pill">${escapeHtml(viewState.selectedEvent?.kind || '')}</span>
                    ${viewState.boardRecord.handle ? '' : '<span class="timeline-pill">Read-only project</span>'}
                </div>
            `;
        }

        function renderPortfolioTimelineEventItems(viewState) {
            if (!viewState?.boardRecord || !viewState?.timeline) return '';
            return viewState.timeline.events.map((event, index) => `
                <button class="timeline-event-item ${index === viewState.selectedIndex ? 'active' : ''}" type="button" data-action="timeline-select-event" data-board-id="${escapeHtml(viewState.boardRecord.id)}" data-event-index="${index}">
                    <span class="timeline-event-kind">${escapeHtml(event.kind)}</span>
                    <span class="timeline-event-summary">${escapeHtml(event.summary)}</span>
                    <span class="timeline-event-time">${escapeHtml(formatDateTime(event.at))}</span>
                </button>
            `).reverse().join('');
        }

        function renderPortfolioTimelineEventDetail(viewState) {
            return `
                <div class="timeline-event-detail">
                    <div class="timeline-event-detail-title">${escapeHtml(viewState?.selectedEvent?.summary || 'Timeline event')}</div>
                    ${renderTimelineEventChanges(viewState?.selectedEvent)}
                </div>
            `;
        }

        function renderPortfolioTimelineBody(viewState) {
            return `
                <div class="timeline-body">
                    <div class="timeline-event-list">${renderPortfolioTimelineEventItems(viewState)}</div>
                    ${renderPortfolioTimelineEventDetail(viewState)}
                </div>
            `;
        }

        function syncPortfolioTimelinePanelSelection(panel = document.getElementById('portfolioTimelinePanel')) {
            const viewState = getSelectedBoardTimelineViewState();
            if (!panel || !viewState || !viewState.boardRecord || !viewState.timeline) {
                renderPortfolioTimelinePanel();
                return;
            }
            if (panel.dataset.boardId !== viewState.boardRecord.id) {
                renderPortfolioTimelinePanel();
                return;
            }

            const previewBanner = panel.querySelector('.timeline-preview-banner');
            if (previewBanner) {
                previewBanner.classList.toggle('active', viewState.isPreview);
            }

            const slider = panel.querySelector('.timeline-slider');
            if (!slider) {
                renderPortfolioTimelinePanel();
                return;
            }
            slider.max = String(Math.max(0, viewState.timeline.events.length - 1));
            slider.value = String(viewState.selectedIndex);

            const controls = panel.querySelector('.timeline-controls');
            const summaryRow = panel.querySelector('.timeline-summary-row');
            const shouldShowSummary = isPortfolioTimelineExpanded(viewState.boardRecord.id);
            if (controls) {
                if (shouldShowSummary) {
                    const summaryMarkup = renderPortfolioTimelineSummaryRow(viewState);
                    if (summaryRow) {
                        summaryRow.outerHTML = summaryMarkup;
                    } else {
                        controls.insertAdjacentHTML('afterbegin', summaryMarkup);
                    }
                } else if (summaryRow) {
                    summaryRow.remove();
                }
            }

            const eventList = panel.querySelector('.timeline-event-list');
            if (eventList) {
                const scrollTop = eventList.scrollTop;
                eventList.innerHTML = renderPortfolioTimelineEventItems(viewState);
                eventList.scrollTop = scrollTop;
            }

            const eventDetail = panel.querySelector('.timeline-event-detail');
            if (eventDetail) {
                eventDetail.outerHTML = renderPortfolioTimelineEventDetail(viewState);
            }
        }

        async function restorePortfolioTimelineSelection() {
            const viewState = getSelectedBoardTimelineViewState();
            if (!viewState || !viewState.boardRecord || !viewState.projectedBoard) return false;
            if (!viewState.boardRecord.handle) {
                notifyPortfolioMutationUnavailable(viewState.boardRecord.id);
                return false;
            }

            const currentTimeline = getBoardTimelineData(viewState.boardRecord.data);
            if (!currentTimeline) return false;

            closeDetailModal();
            closeModal();

            const restoredData = createBoardStateSnapshot(viewState.projectedBoard);
            const nextTimeline = cloneSerializable(currentTimeline);
            const extensions = getBoardExtensionsObject(restoredData, { create: true });
            extensions[TIMELINE_EXTENSION_KEY] = nextTimeline;
            viewState.boardRecord.data = restoredData;
            recordBoardRestoreTimelineEvent(viewState.boardRecord.data, viewState.selectedEvent);
            viewState.boardRecord.title = viewState.boardRecord.data.board.settings.title;

            const refreshedTimeline = getBoardTimelineData(viewState.boardRecord.data);
            appState.portfolioTimelineSelection = {
                boardId: viewState.boardRecord.id,
                eventIndex: Math.max(0, (refreshedTimeline?.events?.length || 1) - 1)
            };

            markProjectDirty(viewState.boardRecord.id);
            buildPortfolioTasks();
            renderPortfolio();
            await enqueueProjectSave(viewState.boardRecord);
            return true;
        }

        function createPortfolioTaskCard(item, searchTerm = '') {
            const task = item.task;
            const div = document.createElement('div');
            div.className = 'task-card portfolio-task-card';
            if (isSelectedPortfolioCard(item.boardId, task.id)) {
                div.classList.add('selected');
            }
            const canMutate = Boolean(item.canMutate) && !item.historical;
            const canDrag = canMutate;
            div.draggable = canDrag;
            div.dataset.boardId = item.boardId;
            div.dataset.taskId = String(item.taskId ?? task.id);
            div.dataset.status = normalizeTaskStatus(task.status);
            div.dataset.historical = item.historical ? 'true' : 'false';
            if (canDrag) {
                div.addEventListener('dragstart', (ev) => {
                    onPortfolioTaskDragStart(ev, {
                        boardId: item.boardId,
                        taskId: task.id,
                        status: normalizeTaskStatus(task.status)
                    });
                });
                div.addEventListener('dragend', (ev) => {
                    onPortfolioTaskDragEnd(ev);
                });
            }

            const priority = normalizePriority(task.priority);
            const effort = normalizeEffort(task.effort);
            const score = formatTaskScore(task);
            const highlightedTitle = highlightSearchMatch(task.title || '', searchTerm);
            const projectLabel = item.boardTitle || item.boardFileName || 'Project';
            const showProjectBadge = !appState.selectedPortfolioBoardId;
            const color = portfolioProjectColor(item.boardId);
            const badgeStyle = `background:${color.bg};border-color:${color.border};color:${color.text};`;
            const editButtonLabel = '&#9998;';
            const archiveButtonLabel = task.archived ? '&#8634;' : '&#128452;&#65038;';
            const deleteButtonLabel = '&#128465;&#65038;';
            const archiveButtonTitle = task.archived ? 'Restore' : 'Archive';
            const readOnlyTitle = item.historical ? 'Historical preview (read-only)' : 'Read-only (no file handle)';
            const assignees = taskAssignees(task);
            const statusAge = formatTaskStatusAge(task);
            const showBulkSelect = Boolean(appState.selectedPortfolioBoardId)
                && appState.selectedPortfolioBoardId === item.boardId
                && canMutate;
            const metaParts = [
                showProjectBadge ? `<span class="portfolio-project-badge" style="${badgeStyle}" title="${escapeHtml(projectLabel)}">${escapeHtml(projectLabel)}</span>` : '',
                ...assignees.map((name) => `<span class="task-tag task-tag-assignee" title="Assignee">${escapeHtml(name)}</span>`),
                ...normalizeTags(task.tags).map((tag) => `<span class="task-tag task-tag-label">${escapeHtml(tag)}</span>`),
                task.blocked ? '<span class="task-tag task-tag-blocked" title="Blocked">Blocked</span>' : '',
                statusAge ? `<span class="task-tag task-tag-age" title="Time in current status">${escapeHtml(statusAge)}</span>` : '',
                isTaskOverdue(task) ? '<span class="task-tag" title="Overdue"><span class="due-dot"></span>Overdue</span>' : '',
                priority ? `<span class="task-tag"><span class="priority-dot priority-${task.priority}"></span>${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}</span>` : '',
                effort ? `<span class="task-tag" title="Effort"><span class="effort-dot effort-${effort.toLowerCase()}"></span>${escapeHtml(effort)}</span>` : '',
                score !== '-' ? `<span class="task-tag task-tag-score" title="Score (Priority / Effort)">Score ${score}</span>` : '',
                task.dueDate ? `<span class="task-tag">${escapeHtml(formatDueDateForUi(task.dueDate))}</span>` : '',
                task.checklist && task.checklist.length ? `<span class="task-tag">${task.checklist.filter(entry => entry.done).length}/${task.checklist.length} done</span>` : ''
            ].filter(Boolean);
            const taskMetaHtml = metaParts.length ? `<div class="task-meta">${metaParts.join('')}</div>` : '';
            const bulkSelectHtml = showBulkSelect
                ? `
                    <label class="portfolio-task-card-select">
                        <input
                            type="checkbox"
                            data-action="toggle-bulk-task-selection"
                            data-board-id="${escapeHtml(item.boardId)}"
                            data-task-id="${escapeHtml(String(item.taskId ?? task.id))}"
                            ${isPortfolioTaskBulkSelected(item.boardId, task.id) ? 'checked' : ''}
                        >
                        <span class="portfolio-task-card-select-label">Select ${escapeHtml(task.title || `Task ${task.id}`)}</span>
                    </label>
                `
                : '';

            div.innerHTML = `
                <div class="task-header">
                    <div style="display:flex;align-items:flex-start;min-width:0;flex:1;">
                        ${bulkSelectHtml}
                        <span class="task-title">${highlightedTitle}</span>
                    </div>
                    <div class="task-actions">
                        <button class="task-action-btn" type="button" ${canMutate ? '' : 'disabled'} title="${canMutate ? 'Edit' : readOnlyTitle}" data-action="edit-task">${editButtonLabel}</button>
                        <button class="task-action-btn" type="button" ${canMutate ? '' : 'disabled'} title="${canMutate ? archiveButtonTitle : readOnlyTitle}" data-action="archive-task">${archiveButtonLabel}</button>
                        <button class="task-action-btn task-action-danger" type="button" ${canMutate ? '' : 'disabled'} title="${canMutate ? 'Delete' : readOnlyTitle}" aria-label="${canMutate ? 'Delete' : readOnlyTitle}" data-action="delete-task">${deleteButtonLabel}</button>
                    </div>
                </div>
                ${taskMetaHtml}
            `;

            const bulkCheckbox = div.querySelector('input[data-action="toggle-bulk-task-selection"]');
            if (bulkCheckbox) {
                bulkCheckbox.addEventListener('click', (event) => {
                    event.stopPropagation();
                });
            }

            return div;
        }

        function renderPortfolioBulkActions() {
            const actions = document.getElementById('portfolioBulkActions');
            const summary = document.getElementById('portfolioBulkActionsSummary');
            const createButton = document.getElementById('portfolioBulkCreateSprintBtn');
            const assignButton = document.getElementById('portfolioBulkAssignSprintBtn');
            if (!actions || !summary || !createButton || !assignButton) return;

            const canShow = Boolean(appState.selectedPortfolioBoardId)
                && appState.selectedPortfolioViewMode === 'board'
                && canUsePortfolioTaskMutations(appState.selectedPortfolioBoardId);
            const selectedCount = canShow ? getSelectedPortfolioBulkTaskIds(appState.selectedPortfolioBoardId).length : 0;
            const showActions = canShow && selectedCount > 0;
            const roadmap = canShow ? getRoadmapExtension(getPortfolioBoardRecord(appState.selectedPortfolioBoardId)?.data) : null;
            const hasExistingSprints = Array.isArray(roadmap?.sprints) && roadmap.sprints.length > 0;

            actions.classList.toggle('active', showActions);
            summary.textContent = `${selectedCount} ${selectedCount === 1 ? 'task' : 'tasks'} selected`;
            createButton.disabled = selectedCount === 0;
            assignButton.classList.toggle('hidden', !showActions || !hasExistingSprints);
            assignButton.disabled = selectedCount === 0 || !hasExistingSprints;
        }

        function renderPortfolioBoardView(rows) {
            const boardWrap = document.getElementById('portfolioBoardWrap');
            const boardGrid = document.getElementById('portfolioBoard');
            const banner = document.getElementById('portfolioBoardEmptyBanner');
            if (!boardWrap || !boardGrid || !banner) return;
            const searchTerm = (document.getElementById('portfolioSearchInput')?.value || '').trim().toLowerCase();
            const canAddTasks = Boolean(appState.selectedPortfolioBoardId)
                && isPortfolioBoardMutable(appState.selectedPortfolioBoardId)
                && !isHistoricalPreviewActiveForBoard(appState.selectedPortfolioBoardId);
            const buckets = Object.fromEntries(defaultColumns.map(col => [col.status, []]));
            rows.forEach((item) => {
                const status = normalizeTaskStatus(item.task.status);
                if (!buckets[status]) buckets[status] = [];
                buckets[status].push(item);
            });

            const hasBoards = appState.portfolioBoards.length > 0;
            if (!hasBoards) {
                banner.classList.add('hidden');
                banner.textContent = '';
            } else {
                banner.classList.add('hidden');
                banner.textContent = '';
            }

            boardGrid.innerHTML = defaultColumns.map(col => {
                const items = buckets[col.status] || [];
                return `
                    <div class="portfolio-column" data-status="${escapeHtml(col.status)}">
                        <div class="portfolio-column-header">
                            <span class="column-title">${escapeHtml(col.title)}</span>
                            <span class="column-count">${items.length}</span>
                        </div>
                        <div class="portfolio-column-body" id="portfolio-${escapeHtml(col.status)}-column"></div>
                    </div>
                `;
            }).join('');

            defaultColumns.forEach((col) => {
                const node = document.getElementById(`portfolio-${col.status}-column`);
                if (!node) return;
                node.dataset.status = col.status;
                node.addEventListener('dragover', (ev) => onPortfolioColumnDragOver(ev, col.status));
                node.addEventListener('dragleave', onPortfolioColumnDragLeave);
                node.addEventListener('drop', (ev) => onPortfolioColumnDrop(ev, col.status));
                const items = buckets[col.status] || [];
                if (canAddTasks) {
                    const addTaskCard = document.createElement('div');
                    addTaskCard.className = 'add-task-card';
                    addTaskCard.textContent = '+ Add Task';
                    addTaskCard.dataset.action = 'add-task';
                    addTaskCard.dataset.status = col.status;
                    node.appendChild(addTaskCard);
                }
                if (items.length === 0) {
                    node.insertAdjacentHTML('beforeend', '<div class="empty-state"><span class="empty-state-text">No tasks</span></div>');
                    return;
                }
                items.forEach((item) => node.appendChild(createPortfolioTaskCard(item, searchTerm)));
            });
        }


        function canUsePortfolioViewMode(mode) {
            const normalized = normalizePortfolioViewMode(mode);
            if (normalized === 'calendar') return appState.portfolioBoards.length > 0;
            if (normalized === 'roadmap') return Boolean(appState.selectedPortfolioBoardId);
            return appState.portfolioBoards.length > 0;
        }

        function renderSelectedBoardViewToggle() {
            const toggle = document.getElementById('portfolioViewModeToggle');
            if (!toggle) return;

            const hasBoards = appState.portfolioBoards.length > 0;
            const hasSelectedBoard = Boolean(appState.selectedPortfolioBoardId);
            toggle.classList.toggle('hidden', !hasBoards);
            if (!hasBoards) {
                appState.selectedPortfolioViewMode = 'board';
                return;
            }

            appState.selectedPortfolioViewMode = normalizePortfolioViewMode(appState.selectedPortfolioViewMode);
            if (!canUsePortfolioViewMode(appState.selectedPortfolioViewMode)) {
                appState.selectedPortfolioViewMode = 'board';
            }
            toggle.querySelectorAll('button[data-view-mode]').forEach((button) => {
                const mode = normalizePortfolioViewMode(button.dataset.viewMode || '');
                const isVisible = mode === 'roadmap' ? hasSelectedBoard : hasBoards;
                button.classList.toggle('hidden', !isVisible);
                if (!isVisible) {
                    button.classList.remove('active');
                    button.setAttribute('aria-pressed', 'false');
                    return;
                }
                const isActive = button.dataset.viewMode === appState.selectedPortfolioViewMode;
                button.classList.toggle('active', isActive);
                button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            });
        }

        function renderRoadmapGridGuides(axisTicks) {
            const ticks = Array.isArray(axisTicks) ? axisTicks : [];
            return ticks
                .filter((tick) => Number.isFinite(tick?.position) && tick.position > 0 && tick.position < 100)
                .map((tick) => `<span class="roadmap-grid-guide" aria-hidden="true" style="left:${tick.position}%"></span>`)
                .join('');
        }

        function renderRoadmapSection(boardData, boardId, kind, items, range, axisTicks) {
            const config = getRoadmapEntityConfig(kind);
            if (!config) return '';
            const sortedItems = Array.isArray(items) ? [...items].sort(compareRoadmapItemsByDate) : [];
            const hasItems = sortedItems.length > 0;
            const guideMarkup = renderRoadmapGridGuides(axisTicks);
            const taskCountLabel = (item) => {
                const count = getRoadmapTaskFieldTasks(boardData, config.taskField, item.id).length;
                return count === 1 ? '1 linked task' : `${count} linked tasks`;
            };
            const rowMarkup = hasItems
                ? sortedItems.map((item) => {
                    const placement = getRoadmapTimelinePlacement(item, range);
                    const expandKey = `${config.singular}:${item.id}`;
                    const expanded = isPortfolioRoadmapRowExpanded(boardId, expandKey);
                    return `
                    <div
                        class="roadmap-row"
                        data-roadmap-kind="${config.singular}"
                        data-roadmap-id="${escapeHtml(item.id)}"
                        aria-expanded="${expanded ? 'true' : 'false'}"
                    >
                        <div class="roadmap-row-main">
                            <div class="roadmap-row-labels">
                                <div class="roadmap-row-actions">
                                    <button class="roadmap-action-btn" type="button" aria-label="Edit ${escapeHtml(item.title)}" title="Edit" data-action="edit-roadmap-item" data-roadmap-kind="${kind}" data-roadmap-id="${escapeHtml(item.id)}">&#9998;</button>
                                    <button class="roadmap-action-btn" type="button" aria-label="Delete ${escapeHtml(item.title)}" title="Delete" data-action="delete-roadmap-item" data-roadmap-kind="${kind}" data-roadmap-id="${escapeHtml(item.id)}">&#128465;</button>
                                </div>
                                <h3 class="roadmap-row-title">${escapeHtml(item.title)}</h3>
                                <div class="roadmap-row-meta">${escapeHtml(formatRoadmapDateRange(item) || 'No dates')}</div>
                                <div class="roadmap-row-usage">
                                    <span>${taskCountLabel(item)}</span>
                                    <button
                                        class="roadmap-disclosure-btn"
                                        type="button"
                                        aria-expanded="${expanded ? 'true' : 'false'}"
                                        aria-label="${expanded ? 'Hide tasks for' : 'Show tasks for'} ${escapeHtml(item.title)}"
                                        data-action="toggle-roadmap-row"
                                        data-roadmap-kind="${config.singular}"
                                        data-roadmap-id="${escapeHtml(item.id)}"
                                    >${expanded ? 'Hide tasks' : 'Show tasks'}</button>
                                </div>
                            </div>
                            <div class="roadmap-row-track">
                                ${guideMarkup}
                                ${config.dateMode === 'single'
                                    ? `
                                        <div class="roadmap-row-timeline-stem" style="left:${placement?.point ?? 50}%"></div>
                                        <div class="roadmap-row-timeline-point" style="left:${placement?.point ?? 50}%"></div>
                                    `
                                    : `<div class="roadmap-row-timeline-bar" style="left:${placement?.left ?? 0}%;width:${placement?.width ?? 0}%"></div>`}
                            </div>
                        </div>
                        <div class="roadmap-expand-icon">${expanded ? 'Collapse' : 'Expand'}</div>
                        ${expanded
                            ? `<div class="roadmap-task-list" data-roadmap-task-list="${config.singular}:${escapeHtml(item.id)}"></div>`
                            : ''}
                    </div>
                `;
                }).join('')
                : `<div class="roadmap-empty">No ${config.singular}s yet. Use the add button to create the first ${config.singular}.</div>`;

            return `
                <section class="roadmap-section" data-roadmap-kind="${kind}">
                    <div class="roadmap-section-header">
                        <div>
                            <h3 class="roadmap-section-title">${config.label}s</h3>
                            <div class="roadmap-section-subtitle">Assigned ${config.singular}s on the shared roadmap.</div>
                        </div>
                        <button class="roadmap-section-btn" type="button" aria-label="Add ${config.label}" data-action="add-roadmap-item" data-roadmap-kind="${kind}">+ ${config.label}</button>
                    </div>
                    <div class="roadmap-list">${rowMarkup}</div>
                </section>
            `;
        }

        function renderPortfolioRoadmapView() {
            const roadmapView = document.getElementById('portfolioRoadmapView');
            if (!roadmapView) return;

            const viewState = getSelectedBoardTimelineViewState();
            const board = viewState?.boardRecord || (appState.selectedPortfolioBoardId ? getPortfolioBoardRecord(appState.selectedPortfolioBoardId) : null);
            const boardData = viewState?.isPreview ? (viewState.projectedBoard || board?.data || null) : (board?.data || viewState?.projectedBoard || null);
            const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
            const range = getVisibleRoadmapDateRange(roadmap);
            const axisTicks = getRoadmapAxisTicks(range);
            roadmapView.innerHTML = `
                <div class="portfolio-roadmap-timeline">
                    <div class="roadmap-axis-shell">
                        <div class="roadmap-axis-label">Timeline</div>
                        <div class="roadmap-axis" data-roadmap-axis="shared">
                            <div class="roadmap-axis-line">${renderRoadmapGridGuides(axisTicks)}${renderRoadmapTodayMarker(range)}</div>
                            <div class="roadmap-axis-ticks">
                                ${axisTicks.map((tick) => `<div class="roadmap-axis-tick" style="left:${tick.position}%">${escapeHtml(tick.label)}</div>`).join('')}
                            </div>
                        </div>
                    </div>
                    ${renderRoadmapSection(boardData, board?.id || '', 'milestones', roadmap.milestones, range, axisTicks)}
                    ${renderRoadmapSection(boardData, board?.id || '', 'phases', roadmap.phases, range, axisTicks)}
                    ${renderRoadmapSection(boardData, board?.id || '', 'sprints', roadmap.sprints, range, axisTicks)}
                </div>
            `;
            if (board && boardData) {
                populatePortfolioRoadmapTaskLists(board, boardData, { historical: Boolean(viewState?.isPreview) });
            }
        }

        function populatePortfolioRoadmapTaskLists(boardRecord, boardData, options = {}) {
            if (!boardRecord || !boardData) return;
            document.querySelectorAll('#portfolioRoadmapView [data-roadmap-task-list]').forEach((container) => {
                const descriptor = container.getAttribute('data-roadmap-task-list') || '';
                const [singularKind, itemId] = descriptor.split(':');
                const config = getRoadmapEntityConfig(`${singularKind}s`);
                if (!config || !itemId) return;
                const tasks = getRoadmapTaskFieldTasks(boardData, config.taskField, itemId);
                if (tasks.length === 0) {
                    container.innerHTML = `
                        <div class="roadmap-task-list-gutter" aria-hidden="true"></div>
                        <div class="roadmap-task-list-track">
                            <div class="roadmap-task-empty">No tasks assigned.</div>
                        </div>
                    `;
                    return;
                }
                const gutter = document.createElement('div');
                gutter.className = 'roadmap-task-list-gutter';
                gutter.setAttribute('aria-hidden', 'true');
                const track = document.createElement('div');
                track.className = 'roadmap-task-list-track';
                track.replaceChildren(...tasks.map((task, taskIndex) => createPortfolioTaskCard({
                    boardIndex: appState.portfolioBoards.findIndex((board) => board.id === boardRecord.id),
                    boardId: boardRecord.id,
                    taskId: task.id,
                    taskIndex,
                    boardTitle: boardRecord.title,
                    boardFileName: boardRecord.fileName,
                    canMutate: false,
                    historical: Boolean(options.historical),
                    task: normalizeTask(task)
                })));
                container.replaceChildren(gutter, track);
            });
        }

        function syncSelectedPortfolioBoardSelection() {
            if (!appState.selectedPortfolioBoardId) {
                clearPortfolioBulkSelection();
                if (appState.portfolioBoards.length === 0) {
                    appState.selectedPortfolioViewMode = 'board';
                } else if (appState.selectedPortfolioViewMode === 'roadmap') {
                    appState.selectedPortfolioViewMode = 'board';
                } else {
                    appState.selectedPortfolioViewMode = normalizePortfolioViewMode(appState.selectedPortfolioViewMode);
                }
                return;
            }
            if (!getPortfolioBoardRecord(appState.selectedPortfolioBoardId)) {
                setSelectedPortfolioBoardId('', { resetViewModeWhenEmpty: false });
                clearPortfolioBulkSelection();
                if (appState.selectedPortfolioViewMode !== 'calendar') {
                    appState.selectedPortfolioViewMode = 'board';
                }
                return;
            }
            appState.selectedPortfolioViewMode = normalizePortfolioViewMode(appState.selectedPortfolioViewMode);
        }

        function renderPortfolio(options = {}) {
            const boardWrap = document.getElementById('portfolioBoardWrap');
            if (!boardWrap) return;

            syncSelectedPortfolioBoardSelection();
            renderPortfolioAssigneeFilterOptions();
            renderTaskAssigneeSuggestions();
            const rows = getFilteredSortedPortfolioRows();
            syncSelectedPortfolioCardWithVisibleRows(rows);
            syncHoveredPortfolioCardWithVisibleRows(rows);
            boardWrap.classList.remove('hidden');
            applyPortfolioSortSelect();
            if (options.skipTimelinePanel !== true) {
                renderPortfolioTimelinePanel();
            } else {
                syncPortfolioTimelinePanelSelection();
            }
            renderSelectedBoardViewToggle();

            const boardGrid = document.getElementById('portfolioBoard');
            const roadmapView = document.getElementById('portfolioRoadmapView');
            const calendarView = document.getElementById('portfolioCalendarView');
            const roadmapActive = Boolean(appState.selectedPortfolioBoardId) && appState.selectedPortfolioViewMode === 'roadmap';
            const calendarActive = appState.portfolioBoards.length > 0 && appState.selectedPortfolioViewMode === 'calendar';
            if (boardGrid) boardGrid.classList.toggle('hidden', roadmapActive || calendarActive);
            if (roadmapView) roadmapView.classList.toggle('hidden', !roadmapActive);
            if (calendarView) calendarView.classList.toggle('hidden', !calendarActive);

            if (roadmapActive) {
                renderPortfolioRoadmapView();
            } else if (calendarActive) {
                renderPortfolioCalendarView(rows);
            } else {
                renderPortfolioBoardView(rows);
            }

            renderPortfolioBulkActions();
            renderPortfolioBoardChips();
            updateUrlState();
        }

        function canUsePortfolioTaskMutations(boardId) {
            return isPortfolioTaskMutable(boardId) && !isHistoricalPreviewActiveForBoard(boardId);
        }

        function notifyPortfolioReadOnly() {
            alert('This project is read-only because it was loaded without a file handle.');
        }

        function notifyTimelinePreviewReadOnly() {
            alert('Historical preview is read-only. Click Latest to resume editing.');
        }

        function notifyPortfolioMutationUnavailable(boardId) {
            if (isHistoricalPreviewActiveForBoard(boardId)) {
                notifyTimelinePreviewReadOnly();
                return;
            }
            notifyPortfolioReadOnly();
        }

        async function runPortfolioTaskMutation(boardId, taskId, mutator) {
            const source = findPortfolioTaskSource(boardId, taskId);
            if (!source) return false;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return false;
            }

            ensureBoardTimelineBaseline(source.boardRecord.data);
            const beforeTask = captureTaskTimelineSnapshot(source.boardRecord.data, taskId);
            let changed = false;
            try {
                changed = mutator(source.task, source.boardRecord) !== false;
            } catch (error) {
                alert(`Portfolio task update failed: ${error.message}`);
                return false;
            }

            if (!changed) return false;
            touchTask(source.task);
            recordTaskTimelineEvent(source.boardRecord.data, beforeTask, captureTaskTimelineSnapshot(source.boardRecord.data, taskId));
            syncPortfolioTimelineSelectionToLatest(boardId, source.boardRecord.data);
            markProjectDirty(boardId);

            buildPortfolioTasks();
            renderPortfolio();

            if (appState.portfolioDetailContext && appState.portfolioDetailContext.boardId === boardId && appState.portfolioDetailContext.taskId === taskId) {
                openPortfolioTaskDetails(boardId, taskId);
            }

            await enqueueProjectSave(source.boardRecord);

            return true;
        }

        async function runPortfolioBoardMutation(boardId, mutator) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return false;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return false;
            }

            ensureBoardTimelineBaseline(boardRecord.data);
            let changed = false;
            try {
                changed = mutator(boardRecord.data, boardRecord) !== false;
            } catch (error) {
                alert(`Portfolio update failed: ${error.message}`);
                return false;
            }
            if (!changed) return false;

            syncPortfolioTimelineSelectionToLatest(boardId, boardRecord.data);
            markProjectDirty(boardId);
            buildPortfolioTasks();
            renderPortfolio();

            if (appState.portfolioDetailContext && appState.portfolioDetailContext.boardId === boardId) {
                openPortfolioTaskDetails(boardId, appState.portfolioDetailContext.taskId);
            }

            await enqueueProjectSave(boardRecord);
            return true;
        }

        function createSprintFromSelection(boardId, draft) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return false;
            const selectedTaskIds = getSelectedPortfolioBulkTaskIds(boardId);
            if (selectedTaskIds.length === 0) return false;
            const sprintConfig = getRoadmapEntityConfig('sprints');
            if (!sprintConfig) return false;

            return runPortfolioBoardMutation(boardId, (boardData) => {
                const roadmap = getRoadmapExtensionObject(boardData, { create: true });
                const items = roadmap[sprintConfig.itemsKey];
                const nextSprint = {
                    id: slugifyRoadmapEntityId(draft.title, items),
                    title: draft.title,
                    startDate: draft.startDate,
                    endDate: draft.endDate
                };
                const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
                let assignedCount = 0;
                const timestamp = nowIso();

                boardData.board.tasks.forEach((task) => {
                    if (!taskIdSet.has(Number(task?.id))) return;
                    assignedCount += 1;
                    task.sprintId = nextSprint.id;
                    task.updatedAt = timestamp;
                });

                if (assignedCount === 0) {
                    return false;
                }

                items.push(nextSprint);
                appendTimelineEvent(boardData, {
                    kind: 'roadmap.bulk-assigned',
                    entityType: 'board',
                    entityId: 'board',
                    summary: `Sprint created from ${assignedCount} selected ${assignedCount === 1 ? 'task' : 'tasks'}: ${nextSprint.title}`,
                    meta: {
                        roadmapKind: 'sprints',
                        roadmapItemId: nextSprint.id,
                        action: 'create-from-selection',
                        sprint: cloneSerializable(nextSprint),
                        taskIds: [...taskIdSet]
                    }
                });
                return true;
            });
        }

        function assignSelectionToExistingSprint(boardId, sprintId) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return false;
            const normalizedSprintId = normalizeRoadmapRef(sprintId);
            const selectedTaskIds = getSelectedPortfolioBulkTaskIds(boardId);
            if (!normalizedSprintId || selectedTaskIds.length === 0) return false;

            return runPortfolioBoardMutation(boardId, (boardData) => {
                const roadmap = getRoadmapExtension(boardData) || createEmptyRoadmapExtension();
                const sprint = Array.isArray(roadmap.sprints)
                    ? roadmap.sprints.find((entry) => entry.id === normalizedSprintId)
                    : null;
                if (!sprint) return false;

                const taskIdSet = new Set(selectedTaskIds.map((taskId) => Number(taskId)));
                let assignedCount = 0;
                const timestamp = nowIso();

                boardData.board.tasks.forEach((task) => {
                    if (!taskIdSet.has(Number(task?.id))) return;
                    assignedCount += 1;
                    task.sprintId = sprint.id;
                    task.updatedAt = timestamp;
                });

                if (assignedCount === 0) {
                    return false;
                }

                appendTimelineEvent(boardData, {
                    kind: 'roadmap.bulk-assigned',
                    entityType: 'board',
                    entityId: 'board',
                    summary: `Added ${assignedCount} selected ${assignedCount === 1 ? 'task' : 'tasks'} to sprint: ${sprint.title}`,
                    meta: {
                        roadmapKind: 'sprints',
                        roadmapItemId: sprint.id,
                        action: 'assign-existing',
                        sprint: cloneSerializable(sprint),
                        taskIds: [...taskIdSet]
                    }
                });
                return true;
            });
        }


        function getTaskModalBoardRecord() {
            if (appState.portfolioEditContext?.boardId) {
                return getPortfolioBoardRecord(appState.portfolioEditContext.boardId);
            }
            if (appState.portfolioCreateContext?.boardId) {
                return getPortfolioBoardRecord(appState.portfolioCreateContext.boardId);
            }
            return null;
        }

        function populateTaskRoadmapSelectors(task = {}) {
            const boardRecord = getTaskModalBoardRecord();
            const roadmap = getRoadmapExtension(boardRecord?.data) || createEmptyRoadmapExtension();
            const phaseSelect = document.getElementById('taskPhase');
            const milestoneSelect = document.getElementById('taskMilestone');
            if (phaseSelect) {
                phaseSelect.innerHTML = buildRoadmapEntityOptionMarkup(roadmap.phases, task.phaseId);
            }
            if (milestoneSelect) {
                milestoneSelect.innerHTML = buildRoadmapEntityOptionMarkup(roadmap.milestones, task.milestoneId);
            }
        }

        function openPortfolioTaskDetails(boardId, taskId, options = {}) {
            const source = findPortfolioTaskDetailSource(boardId, taskId, options);
            if (!source) return;
            setSelectedPortfolioCard(boardId, taskId);
            const task = normalizeTask(source.task);
            const statusMap = Object.fromEntries((source.boardData.board.columns || []).map(col => [col.status, col.title]));
            const statusTitle = statusMap[task.status] || task.status;
            const readOnly = options.readOnly === true || !canUsePortfolioTaskMutations(boardId);
            const roadmap = getRoadmapExtension(source.boardData);

            appState.portfolioDetailContext = { boardId, taskId, readOnly };
            document.getElementById('detailTitle').textContent = task.title || '-';
            document.getElementById('detailDescription').textContent = task.description || '-';
            document.getElementById('detailAssignees').textContent = formatAssignees(task.assignees) || '-';
            document.getElementById('detailTags').textContent = normalizeTags(task.tags).join(', ') || '-';
            document.getElementById('detailBlocked').textContent = task.blocked ? 'Yes' : 'No';
            document.getElementById('detailBlockerReason').textContent = task.blocked ? (normalizeBlockerReason(task.blockerReason) || '-') : '-';
            document.getElementById('detailPriority').textContent = task.priority ? (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : '-';
            document.getElementById('detailEffort').textContent = task.effort || '-';
            document.getElementById('detailStatus').textContent = statusTitle || '-';
            document.getElementById('detailCreatedAt').textContent = formatDateTime(task.createdAt);
            document.getElementById('detailUpdatedAt').textContent = formatDateTime(task.updatedAt);
            document.getElementById('detailDueDate').textContent = formatDueDateForUi(task.dueDate) || '-';
            document.getElementById('detailPhase').textContent = getRoadmapItemTitle(roadmap, 'phases', task.phaseId) || '-';
            document.getElementById('detailMilestone').textContent = getRoadmapItemTitle(roadmap, 'milestones', task.milestoneId) || '-';
            document.getElementById('detailSprint').textContent = getRoadmapItemTitle(roadmap, 'sprints', task.sprintId) || '-';
            renderDetailChecklist(task, { readOnly });
            renderDetailAttachments(getTaskAttachments(source.boardData, taskId));
            document.getElementById('taskDetailModal').classList.add('active');
        }

        function editPortfolioTask(boardId, taskId) {
            const source = findPortfolioTaskSource(boardId, taskId);
            if (!source) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            closeDetailModal();

            setSelectedPortfolioCard(boardId, taskId);
            const task = normalizeTask(source.task);
            appState.portfolioEditContext = { boardId, taskId };
            appState.portfolioCreateContext = null;
            renderTaskAssigneeSuggestions();

            document.getElementById('taskModal').classList.add('active');
            document.getElementById('taskForm').reset();
            document.getElementById('taskId').value = '';
            document.getElementById('modalTitle').textContent = 'Edit Task';
            document.getElementById('taskName').value = task.title || '';
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskAssignee').value = assigneesToInput(task.assignees);
            loadTaskAssigneeEditorFromTextarea();
            const tagSuggestions = getBoardTagSuggestions(source.boardRecord.data);
            renderTagEditor(document.getElementById('taskTagEditor'), normalizeTags(task.tags), tagSuggestions);
            document.getElementById('taskBlocked').checked = Boolean(task.blocked);
            document.getElementById('taskBlockerReason').value = normalizeBlockerReason(task.blockerReason);
            syncTaskBlockedReasonVisibility();
            document.getElementById('taskChecklist').value = checklistToInput(task.checklist || []);
            loadTaskChecklistEditorFromTextarea();
            setTaskModalAttachmentDraft(getTaskAttachments(source.boardRecord.data, taskId), { messages: [] });
            document.getElementById('taskDueDate').value = normalizeDueDate(task.dueDate) || '';
            document.getElementById('taskPriority').value = normalizePriority(task.priority) || '';
            document.getElementById('taskEffort').value = normalizeEffort(task.effort) || '';
            populateTaskRoadmapSelectors(task);
            appState.pendingNewTaskStatus = null;

            focusAndSelectTaskNameInput();
        }

        function openPortfolioCreateTaskModal(boardId, preferredStatus, options = {}) {
            const boardRecord = getPortfolioBoardRecord(boardId);
            if (!boardRecord) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            closeDetailModal();

            const allowedStatuses = new Set((boardRecord.data.board.columns || []).map(col => normalizeTaskStatus(col.status)));
            const fallbackStatus = normalizeTaskStatus((boardRecord.data.board.columns || [defaultColumns[0]])[0]?.status);
            const status = allowedStatuses.has(normalizeTaskStatus(preferredStatus))
                ? normalizeTaskStatus(preferredStatus)
                : fallbackStatus;

            appState.portfolioCreateContext = { boardId, status };
            appState.portfolioEditContext = null;
            appState.pendingNewTaskStatus = null;
            renderTaskAssigneeSuggestions();

            document.getElementById('taskModal').classList.add('active');
            document.getElementById('taskForm').reset();
            document.getElementById('taskId').value = '';
            document.getElementById('modalTitle').textContent = 'New Task';
            document.getElementById('taskAssignee').value = '';
            loadTaskAssigneeEditorFromTextarea();
            renderTagEditor(document.getElementById('taskTagEditor'), [], []);
            document.getElementById('taskBlocked').checked = false;
            document.getElementById('taskBlockerReason').value = '';
            syncTaskBlockedReasonVisibility();
            document.getElementById('taskChecklist').value = '';
            loadTaskChecklistEditorFromTextarea();
            resetTaskModalAttachmentDraft();
            document.getElementById('taskDueDate').value = normalizeDueDate(options.preferredDueDate || '') || '';
            document.getElementById('taskPriority').value = '';
            document.getElementById('taskEffort').value = '';
            populateTaskRoadmapSelectors();

            focusAndSelectTaskNameInput();
        }

        async function togglePortfolioArchiveTask(boardId, taskId) {
            const source = findPortfolioTaskSource(boardId, taskId);
            if (!source) return;
            const wasArchived = Boolean(source.task.archived);
            if (!wasArchived) {
                const title = String(source.task.title || '').trim() || 'this task';
                const confirmed = window.confirm(`Archive "${title}"?`);
                if (!confirmed) return;
            }

            const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
                task.archived = !task.archived;
                return true;
            });
            if (!changed) return;

            if (!wasArchived) {
                showUndo('Task archived', async () => {
                    await runPortfolioTaskMutation(boardId, taskId, (task) => {
                        if (!task.archived) return false;
                        task.archived = false;
                        return true;
                    });
                });
            }
        }

        async function deletePortfolioTask(boardId, taskId) {
            const source = findPortfolioTaskSource(boardId, taskId);
            if (!source) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const title = String(source.task.title || '').trim() || 'this task';
            const confirmed = window.confirm(`Delete "${title}" permanently? This cannot be undone.`);
            if (!confirmed) return;

            const beforeTask = captureTaskTimelineSnapshot(source.boardRecord.data, taskId);
            ensureBoardTimelineBaseline(source.boardRecord.data);
            source.boardRecord.data.board.tasks.splice(source.taskIndex, 1);
            removeLegacyTaskAttachmentsFromExtensions(source.boardRecord.data, taskId);
            recordTaskTimelineEvent(source.boardRecord.data, beforeTask, null);
            syncPortfolioTimelineSelectionToLatest(boardId, source.boardRecord.data);
            markProjectDirty(boardId);

            if (appState.portfolioDetailContext && appState.portfolioDetailContext.boardId === boardId && appState.portfolioDetailContext.taskId === taskId) {
                closeDetailModal();
            }
            if (appState.selectedPortfolioCardRef && appState.selectedPortfolioCardRef.boardId === boardId && Number(appState.selectedPortfolioCardRef.taskId) === Number(taskId)) {
                appState.selectedPortfolioCardRef = null;
            }
            if (appState.hoveredPortfolioCardRef && appState.hoveredPortfolioCardRef.boardId === boardId && Number(appState.hoveredPortfolioCardRef.taskId) === Number(taskId)) {
                appState.hoveredPortfolioCardRef = null;
            }

            buildPortfolioTasks();
            renderPortfolio();
            await enqueueProjectSave(source.boardRecord);
        }


        function getPortfolioAssigneeNames() {
            const seen = new Set();
            const values = [];
            appState.portfolioTasks.forEach((item) => {
                taskAssignees(item?.task).forEach((name) => {
                    const key = name.toLowerCase();
                    if (seen.has(key)) return;
                    seen.add(key);
                    values.push(name);
                });
            });
            return values.sort((a, b) => a.localeCompare(b));
        }

        function getTaskAssigneeSuggestions(excludeNames = []) {
            const seen = new Set();
            const values = [];
            const excluded = new Set(normalizeAssignees(excludeNames).map((name) => name.toLowerCase()));
            const addName = (value) => {
                const name = normalizeAssignee(value);
                if (!name) return;
                const key = name.toLowerCase();
                if (excluded.has(key)) return;
                if (seen.has(key)) return;
                seen.add(key);
                values.push(name);
            };

            appState.portfolioTasks.forEach((item) => {
                taskAssignees(item?.task).forEach(addName);
            });

            return values.sort((a, b) => a.localeCompare(b));
        }

        function renderPortfolioAssigneeFilterOptions() {
            const select = document.getElementById('portfolioAssigneeFilter');
            if (!select) return;
            const previousValue = select.value || '';
            const options = getPortfolioAssigneeNames();
            const hasPrevious = previousValue && options.some(name => name === previousValue);

            select.innerHTML = `<option value="">All</option>${options.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')
                }`;

            if (previousValue) {
                if (hasPrevious) {
                    select.value = previousValue;
                } else {
                    select.value = '';
                }
            }
        }

        function renderTaskAssigneeSuggestions() {
            const datalist = document.getElementById('taskAssigneeSuggestions');
            if (!datalist) return;
            const options = getTaskAssigneeSuggestions(readTaskAssigneeEditorItems());
            datalist.innerHTML = options.map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
        }



        function handlePortfolioViewModeToggleClick(event) {
            const button = event.target.closest('button[data-view-mode]');
            if (!button) return;

            const nextMode = normalizePortfolioViewMode(button.dataset.viewMode || '');
            if (!canUsePortfolioViewMode(nextMode)) return;
            if (nextMode === appState.selectedPortfolioViewMode) return;
            appState.selectedPortfolioViewMode = nextMode;
            renderPortfolio();
        }


        function applyPortfolioSortSelect() {
            const select = document.getElementById('portfolioSortSelect');
            if (!select) return;
            select.value = portfolioSortSelectValueFromKey(appState.portfolioSortKey);
        }

        function onPortfolioSortSelectChange() {
            const select = document.getElementById('portfolioSortSelect');
            if (!select) return;
            const nextKey = select.value === 'name' ? 'task' : normalizePortfolioSortKey(select.value);
            appState.portfolioSortKey = nextKey;
            appState.portfolioSortDir = 'asc';
            renderPortfolio();
        }

        function setPortfolioSort(sortKey) {
            const nextKey = normalizePortfolioSortKey(sortKey);
            if (appState.portfolioSortKey === nextKey) {
                appState.portfolioSortDir = appState.portfolioSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                appState.portfolioSortKey = nextKey;
                appState.portfolioSortDir = 'asc';
            }
            renderPortfolio();
        }








        function showUndo(message, undoFn) {
            const toast = document.getElementById('undoToast');
            const text = document.getElementById('undoToastText');
            if (!toast || !text) return;
            appState.undoAction = undoFn;
            text.textContent = message;
            toast.classList.add('active');
            if (appState.undoTimer) clearTimeout(appState.undoTimer);
            appState.undoTimer = setTimeout(() => hideUndo(), 5000);
        }

        function hideUndo() {
            const toast = document.getElementById('undoToast');
            if (toast) {
                toast.classList.remove('active');
            }
            if (appState.undoTimer) {
                clearTimeout(appState.undoTimer);
                appState.undoTimer = null;
            }
            appState.undoAction = null;
        }

        function performUndo() {
            if (!appState.undoAction) return;
            const fn = appState.undoAction;
            hideUndo();
            fn();
        }








        // Legacy import compatibility: older boards may still carry
        // pre-v1 settings shapes or a single assignee field.













        function getTaskChecklistEditorRowsContainer() {
            return document.getElementById('taskChecklistItems');
        }

        function getTaskChecklistTextarea() {
            return document.getElementById('taskChecklist');
        }

        function readTaskChecklistEditorItems() {
            const container = getTaskChecklistEditorRowsContainer();
            if (!container) return [];
            const rows = Array.from(container.querySelectorAll('.checklist-editor-row'));
            return rows
                .map((row) => {
                    const textInput = row.querySelector('input[type="text"]');
                    const checkbox = row.querySelector('input[type="checkbox"]');
                    const text = (textInput?.value || '').trim();
                    if (!text) return null;
                    return { text, done: Boolean(checkbox?.checked) };
                })
                .filter(Boolean);
        }

        function syncTaskChecklistTextareaFromEditor() {
            const textarea = getTaskChecklistTextarea();
            if (!textarea) return;
            textarea.value = checklistToInput(readTaskChecklistEditorItems());
        }

        function resetTaskChecklistDragState() {
            appState.taskChecklistDragState = { activeIndex: -1, targetIndex: -1, targetPlacement: '' };
            const container = getTaskChecklistEditorRowsContainer();
            if (!container) return;
            container.querySelectorAll('.checklist-editor-row').forEach((row) => {
                row.classList.remove('dragging', 'drag-over-before', 'drag-over-after');
            });
        }

        function renderTaskChecklistDragState() {
            const container = getTaskChecklistEditorRowsContainer();
            if (!container) return;
            container.querySelectorAll('.checklist-editor-row').forEach((row) => {
                const rowIndex = Number(row.dataset.index);
                row.classList.toggle('dragging', rowIndex === appState.taskChecklistDragState.activeIndex);
                row.classList.toggle(
                    'drag-over-before',
                    rowIndex === appState.taskChecklistDragState.targetIndex
                        && rowIndex !== appState.taskChecklistDragState.activeIndex
                        && appState.taskChecklistDragState.targetPlacement === 'before'
                );
                row.classList.toggle(
                    'drag-over-after',
                    rowIndex === appState.taskChecklistDragState.targetIndex
                        && rowIndex !== appState.taskChecklistDragState.activeIndex
                        && appState.taskChecklistDragState.targetPlacement === 'after'
                );
            });
        }


        function moveTaskChecklistEditorItem(fromIndex, toIndex, placement = 'before') {
            const items = readTaskChecklistEditorItems();
            if (!items[fromIndex] || !items[toIndex]) return false;
            if (fromIndex === toIndex) return false;

            const [movedItem] = items.splice(fromIndex, 1);
            let insertIndex = toIndex;
            if (placement === 'after') insertIndex += 1;
            if (fromIndex < toIndex) insertIndex -= 1;
            insertIndex = Math.max(0, Math.min(items.length, insertIndex));
            items.splice(insertIndex, 0, movedItem);
            updateTaskChecklistEditor(items);
            return true;
        }

        function renderTaskChecklistEditor(items = []) {
            const container = getTaskChecklistEditorRowsContainer();
            if (!container) return;
            const normalized = normalizeChecklist(items);
            resetTaskChecklistDragState();

            if (normalized.length === 0) {
                container.innerHTML = '<div class="checklist-editor-empty">No todo items yet.</div>';
                syncTaskChecklistTextareaFromEditor();
                return;
            }

            container.innerHTML = normalized.map((item, index) => `
                <div class="checklist-editor-row ${item.done ? 'done' : ''}" data-index="${index}">
                    <button type="button" class="checklist-editor-drag-handle" aria-label="Drag to reorder todo item" title="Drag to reorder" data-index="${index}" draggable="true">::</button>
                    <input type="checkbox" ${item.done ? 'checked' : ''} aria-label="Mark todo as done" data-index="${index}">
                    <input type="text" value="${escapeHtml(item.text)}" aria-label="Todo item text" data-index="${index}">
                    <button type="button" class="checklist-editor-remove" aria-label="Remove todo item" title="Remove" data-index="${index}">×</button>
                </div>
            `).join('');

            syncTaskChecklistTextareaFromEditor();
        }

        function loadTaskChecklistEditorFromTextarea() {
            const textarea = getTaskChecklistTextarea();
            renderTaskChecklistEditor(parseChecklistInput(textarea?.value || ''));
            const composer = document.getElementById('taskChecklistNewItem');
            if (composer) {
                composer.value = '';
            }
        }

        function updateTaskChecklistEditor(items) {
            renderTaskChecklistEditor(items);
        }

        function addTaskChecklistItem(text = '', done = false, options = {}) {
            const trimmed = String(text || '').trim();
            if (!trimmed) return;
            const items = readTaskChecklistEditorItems();
            items.push({ text: trimmed, done: Boolean(done) });
            updateTaskChecklistEditor(items);

            if (options.focusComposer !== false) {
                const composer = document.getElementById('taskChecklistNewItem');
                if (composer) {
                    composer.focus();
                }
            }
        }

        function addTaskChecklistItemFromComposer() {
            const composer = document.getElementById('taskChecklistNewItem');
            if (!composer) return;
            const value = composer.value.trim();
            if (!value) return;
            addTaskChecklistItem(value, false);
            composer.value = '';
            syncTaskChecklistTextareaFromEditor();
            composer.focus();
        }

        function toggleTaskChecklistEditorItem(index, checked) {
            const items = readTaskChecklistEditorItems();
            if (!items[index]) return;
            items[index].done = Boolean(checked);
            updateTaskChecklistEditor(items);
        }

        function updateTaskChecklistEditorItemText(index, value) {
            void index;
            void value;
            syncTaskChecklistTextareaFromEditor();
        }

        function removeTaskChecklistEditorItem(index) {
            const items = readTaskChecklistEditorItems();
            if (!items[index]) return;
            items.splice(index, 1);
            updateTaskChecklistEditor(items);
        }

        function syncTaskBlockedReasonVisibility() {
            const checkbox = document.getElementById('taskBlocked');
            const wrap = document.getElementById('taskBlockerReasonWrap');
            const input = document.getElementById('taskBlockerReason');
            if (!checkbox || !wrap || !input) return;
            const blocked = Boolean(checkbox.checked);
            wrap.classList.toggle('hidden', !blocked);
            if (!blocked) {
                input.value = '';
            }
        }

        function onTaskBlockedChange() {
            syncTaskBlockedReasonVisibility();
            if (document.getElementById('taskBlocked')?.checked) {
                requestAnimationFrame(() => {
                    document.getElementById('taskBlockerReason')?.focus();
                });
            }
        }











        // Legacy import compatibility: older boards stored attachments in
        // extensions.teamOsKanban.taskAttachments instead of task.attachments.





























        function getTaskModalAttachmentsDraft() {
            return appState.taskModalAttachmentDraft.map(normalizeAttachmentRecord).filter(Boolean);
        }

        function getTaskModalAttachmentContext() {
            if (appState.portfolioEditContext && appState.portfolioEditContext.boardId) {
                const boardRecord = getPortfolioBoardRecord(appState.portfolioEditContext.boardId);
                return {
                    boardData: boardRecord ? boardRecord.data : null,
                    taskId: appState.portfolioEditContext.taskId,
                    mode: 'portfolio-edit'
                };
            }
            if (appState.portfolioCreateContext && appState.portfolioCreateContext.boardId) {
                const boardRecord = getPortfolioBoardRecord(appState.portfolioCreateContext.boardId);
                return {
                    boardData: boardRecord ? boardRecord.data : null,
                    taskId: null,
                    mode: 'portfolio-create'
                };
            }
            return { boardData: null, taskId: null, mode: 'unknown' };
        }


        function getTaskModalAttachmentDerivedMessages() {
            const draft = getTaskModalAttachmentsDraft();
            const messages = [];
            const totalBytes = draft.reduce((sum, item) => sum + Math.max(0, Number(item.sizeBytes) || 0), 0);

            draft.forEach((item) => {
                if ((Number(item.sizeBytes) || 0) > ATTACHMENT_SOFT_WARN_BYTES) {
                    messages.push({
                        type: 'warning',
                        text: `${item.name} is large (${formatFileSize(item.sizeBytes)}). Embedded files can slow saves.`
                    });
                }
            });

            if (totalBytes > ATTACHMENT_TASK_SOFT_TOTAL_BYTES) {
                messages.push({
                    type: 'warning',
                    text: `This task has ${formatFileSize(totalBytes)} of attachments. Saving may feel slower.`
                });
            }

            const ctx = getTaskModalAttachmentContext();
            if (ctx.boardData) {
                const existingBytes = calculateBoardAttachmentBytes(ctx.boardData, { excludeTaskId: ctx.taskId });
                const projectEstimate = existingBytes + totalBytes;
                if (projectEstimate > ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES) {
                    messages.push({
                        type: 'warning',
                        text: `This project is estimated at ${formatFileSize(projectEstimate)} of embedded attachments.`
                    });
                }
            }

            return messages;
        }

        function setTaskModalAttachmentDraft(attachments, options = {}) {
            appState.taskModalAttachmentDraft = (Array.isArray(attachments) ? attachments : [])
                .map(normalizeAttachmentRecord)
                .filter(Boolean);
            appState.taskModalAttachmentMessages = Array.isArray(options.messages) ? options.messages.filter(Boolean) : [];
            renderTaskAttachmentsEditor();
        }

        function resetTaskModalAttachmentDraft() {
            setTaskModalAttachmentDraft([], { messages: [] });
            const input = document.getElementById('taskAttachmentsInput');
            if (input) {
                input.value = '';
            }
        }

        function renderTaskAttachmentsEditor() {
            const listEl = document.getElementById('taskAttachmentsList');
            const summaryEl = document.getElementById('taskAttachmentsSummary');
            const warningsEl = document.getElementById('taskAttachmentsWarnings');
            if (!listEl || !summaryEl || !warningsEl) return;

            const items = getTaskModalAttachmentsDraft();
            const totalBytes = items.reduce((sum, item) => sum + (Number(item.sizeBytes) || 0), 0);
            summaryEl.textContent = items.length === 0
                ? 'No attachments'
                : `${items.length} / ${ATTACHMENT_MAX_COUNT} • ${formatFileSize(totalBytes)}`;

            const derived = getTaskModalAttachmentDerivedMessages();
            const allMessages = [...appState.taskModalAttachmentMessages, ...derived];
            warningsEl.innerHTML = '';
            allMessages.forEach((msg) => {
                if (!msg || typeof msg.text !== 'string' || !msg.text.trim()) return;
                const div = document.createElement('div');
                div.className = msg.type === 'error' ? 'attachment-editor-error' : 'attachment-editor-warning';
                div.textContent = msg.text;
                warningsEl.appendChild(div);
            });

            listEl.innerHTML = '';
            if (items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'attachment-editor-empty';
                empty.textContent = 'No attachments yet.';
                listEl.appendChild(empty);
                return;
            }

            items.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'attachment-editor-item';

                if (item.kind === 'image') {
                    const img = document.createElement('img');
                    img.className = 'attachment-editor-thumb';
                    img.alt = '';
                    img.src = item.dataUrl;
                    row.appendChild(img);
                } else {
                    const icon = document.createElement('span');
                    icon.className = 'attachment-editor-icon';
                    icon.textContent = 'FILE';
                    row.appendChild(icon);
                }

                const meta = document.createElement('div');
                meta.className = 'attachment-editor-meta';
                const name = document.createElement('div');
                name.className = 'attachment-editor-name';
                name.textContent = item.name;
                const sub = document.createElement('div');
                sub.className = 'attachment-editor-sub';
                sub.textContent = `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`;
                meta.appendChild(name);
                meta.appendChild(sub);
                row.appendChild(meta);

                const actions = document.createElement('div');
                actions.className = 'attachment-editor-actions';

                const downloadLink = document.createElement('a');
                downloadLink.className = 'attachment-editor-download';
                downloadLink.href = item.dataUrl;
                downloadLink.download = item.name || 'attachment';
                downloadLink.textContent = 'Download';
                actions.appendChild(downloadLink);

                const removeBtn = document.createElement('button');
                removeBtn.type = 'button';
                removeBtn.className = 'attachment-remove-btn';
                removeBtn.setAttribute('aria-label', `Remove attachment ${item.name}`);
                removeBtn.title = 'Remove';
                removeBtn.textContent = '×';
                removeBtn.dataset.attachmentId = item.id;
                actions.appendChild(removeBtn);

                row.appendChild(actions);

                listEl.appendChild(row);
            });
        }

        function renderDetailAttachments(attachments) {
            const container = document.getElementById('detailAttachments');
            if (!container) return;
            const items = (Array.isArray(attachments) ? attachments : []).map(normalizeAttachmentRecord).filter(Boolean);
            container.innerHTML = '';

            if (items.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'detail-attachments-empty';
                empty.textContent = '-';
                container.appendChild(empty);
                return;
            }

            items.forEach((item) => {
                const row = document.createElement('div');
                row.className = 'detail-attachment-item';

                if (item.kind === 'image') {
                    const img = document.createElement('img');
                    img.className = 'detail-attachment-thumb';
                    img.alt = '';
                    img.src = item.dataUrl;
                    row.appendChild(img);
                } else {
                    const icon = document.createElement('span');
                    icon.className = 'attachment-editor-icon';
                    icon.textContent = 'FILE';
                    row.appendChild(icon);
                }

                const meta = document.createElement('div');
                meta.className = 'detail-attachment-meta';
                const name = document.createElement('div');
                name.className = 'detail-attachment-name';
                name.textContent = item.name;
                const sub = document.createElement('div');
                sub.className = 'detail-attachment-sub';
                sub.textContent = `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`;
                meta.appendChild(name);
                meta.appendChild(sub);
                row.appendChild(meta);

                const link = document.createElement('a');
                link.className = 'detail-attachment-download';
                link.href = item.dataUrl;
                link.download = item.name || 'attachment';
                link.textContent = 'Download';
                row.appendChild(link);

                container.appendChild(row);
            });
        }

        function triggerTaskAttachmentsPicker() {
            const input = document.getElementById('taskAttachmentsInput');
            if (!input) return;
            input.click();
        }

        function removeTaskModalAttachment(attachmentId) {
            appState.taskModalAttachmentDraft = getTaskModalAttachmentsDraft().filter(item => item.id !== attachmentId);
            appState.taskModalAttachmentMessages = [];
            renderTaskAttachmentsEditor();
        }

        async function handleTaskAttachmentsInputChange(event) {
            const input = event?.target;
            const files = Array.from(input?.files || []);
            if (input) {
                input.value = '';
            }
            if (files.length === 0) return;

            const next = getTaskModalAttachmentsDraft();
            const messages = [];
            const seenAttachmentKeys = new Set(next.map((item) => attachmentDuplicateKey(item)).filter(Boolean));

            for (const file of files) {
                if (next.length >= ATTACHMENT_MAX_COUNT) {
                    messages.push({
                        type: 'error',
                        text: `Attachment limit reached (${ATTACHMENT_MAX_COUNT} per task).`
                    });
                    break;
                }

                const fileSize = Number(file.size) || 0;
                if (fileSize > ATTACHMENT_HARD_MAX_BYTES) {
                    messages.push({
                        type: 'error',
                        text: `${file.name} exceeds the ${formatFileSize(ATTACHMENT_HARD_MAX_BYTES)} limit.`
                    });
                    continue;
                }

                const duplicateKey = attachmentDuplicateKey({
                    name: file.name || 'Attachment',
                    mime: file.type || '',
                    sizeBytes: fileSize
                });
                if (duplicateKey && seenAttachmentKeys.has(duplicateKey)) {
                    messages.push({
                        type: 'warning',
                        text: `${file.name} is already attached and was skipped.`
                    });
                    continue;
                }

                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    const nextAttachment = {
                        id: createAttachmentId(),
                        name: file.name || 'Attachment',
                        mime: file.type || '',
                        sizeBytes: fileSize || estimateAttachmentDataUrlSizeBytes(dataUrl),
                        kind: classifyAttachmentKind(file.type, file.name),
                        dataUrl,
                        createdAt: nowIso()
                    };
                    next.push(nextAttachment);
                    if (duplicateKey) {
                        seenAttachmentKeys.add(duplicateKey);
                    }
                } catch (error) {
                    messages.push({
                        type: 'error',
                        text: `${file.name}: ${error.message || 'Failed to read file.'}`
                    });
                }
            }

            setTaskModalAttachmentDraft(next, { messages });
        }


        function readStoredTheme() {
            try {
                return normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY));
            } catch (_) {
                return 'light';
            }
        }

        function persistTheme(theme) {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, normalizeTheme(theme));
            } catch (_) { }
        }

        function applyTheme(theme, options = {}) {
            appState.activeTheme = normalizeTheme(theme);
            document.documentElement.setAttribute('data-theme', appState.activeTheme);

            const label = appState.activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
            const toggle = Refs.themeToggleBtn || document.getElementById('themeToggleBtn');
            if (toggle) {
                toggle.setAttribute('aria-label', label);
                toggle.setAttribute('title', label);
                toggle.setAttribute('aria-pressed', appState.activeTheme === 'dark' ? 'true' : 'false');
            }

            if (options.persist) {
                persistTheme(appState.activeTheme);
            }
        }

        function initializeTheme() {
            applyTheme(readStoredTheme());
        }

        function toggleTheme() {
            applyTheme(appState.activeTheme === 'dark' ? 'light' : 'dark', { persist: true });
        }

        function init() {
            if (typeof cacheRefs === 'function') {
                cacheRefs();
            }
            initializeTheme();
            buildShortcutRegistry();
            renderShortcutsModalContent();
            updateDocumentTitle();
            setupFileDrop();
            if (!appState.projectWatchListenersBound) {
                window.addEventListener('focus', () => {
                    void checkProjectFilesNow();
                });
                document.addEventListener('visibilitychange', () => {
                    if (!document.hidden) {
                        void checkProjectFilesNow();
                    }
                });
                appState.projectWatchListenersBound = true;
            }
            startProjectFileWatcher();
            applyUrlState();
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }


        function highlightSearchMatch(text, searchTerm) {
            const safeText = escapeHtml(text || '');
            const term = (searchTerm || '').trim();
            if (!term) return safeText;

            const regex = new RegExp(`(${escapeRegExp(term)})`, 'ig');
            return safeText.replace(regex, '<span class="search-highlight">$1</span>');
        }

        function closeModal() {
            document.getElementById('taskModal').classList.remove('active');
            const checklistTextarea = document.getElementById('taskChecklist');
            if (checklistTextarea) {
                checklistTextarea.value = '';
            }
            renderTaskChecklistEditor([]);
            resetTaskModalAttachmentDraft();
            document.getElementById('taskAssignee').value = '';
            renderTaskAssigneeEditor([]);
            document.getElementById('taskAssigneeNewItem').value = '';
            document.getElementById('taskBlocked').checked = false;
            document.getElementById('taskBlockerReason').value = '';
            syncTaskBlockedReasonVisibility();
            appState.pendingNewTaskStatus = null;
            appState.portfolioEditContext = null;
            appState.portfolioCreateContext = null;
        }

        function renderDetailChecklist(task, options = {}) {
            const list = document.getElementById('detailChecklist');
            const checklist = normalizeChecklist(task.checklist);
            const readOnly = Boolean(options.readOnly);

            if (checklist.length === 0) {
                list.innerHTML = '<li class="detail-value">-</li>';
                return;
            }

            list.innerHTML = checklist.map((item, index) => `
                <li class="detail-checklist-item ${item.done ? 'done' : ''}">
                    <input type="checkbox" ${item.done ? 'checked' : ''} ${readOnly ? 'disabled' : ''} data-task-id="${task.id}" data-index="${index}">
                    <span class="detail-checklist-text">${escapeHtml(item.text)}</span>
                </li>
            `).join('');
        }

        async function toggleChecklistItem(taskId, itemIndex, checked) {
            if (appState.portfolioDetailContext && appState.portfolioDetailContext.boardId && appState.portfolioDetailContext.taskId) {
                if (appState.portfolioDetailContext.readOnly) {
                    notifyPortfolioMutationUnavailable(appState.portfolioDetailContext.boardId);
                    return;
                }
                await runPortfolioTaskMutation(appState.portfolioDetailContext.boardId, appState.portfolioDetailContext.taskId, (task) => {
                    if (!Array.isArray(task.checklist) || !task.checklist[itemIndex]) return false;
                    task.checklist[itemIndex].done = checked;
                    return true;
                });
                return;
            }
        }

        function closeDetailModal() {
            document.getElementById('taskDetailModal').classList.remove('active');
            appState.portfolioDetailContext = null;
        }

        function closeRoadmapEntityModal() {
            document.getElementById('roadmapEntityModal').classList.remove('active');
            document.getElementById('roadmapEntityForm').reset();
            appState.roadmapEntityContext = null;
        }

        function openRoadmapEntityModal(kind, itemId = '', options = {}) {
            const boardId = appState.selectedPortfolioBoardId;
            const boardRecord = boardId ? getPortfolioBoardRecord(boardId) : null;
            if (!boardRecord) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const config = getRoadmapEntityConfig(kind);
            if (!config) return;
            const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
            const items = Array.isArray(roadmap[config.itemsKey]) ? roadmap[config.itemsKey] : [];
            const item = itemId ? items.find((entry) => entry.id === itemId) : null;

            appState.roadmapEntityContext = {
                boardId,
                kind,
                itemId: item?.id || '',
                mode: options.mode || 'default'
            };

            document.getElementById('roadmapEntityForm').reset();
            document.getElementById('roadmapEntityKind').value = kind;
            document.getElementById('roadmapEntityId').value = item?.id || '';
            const existingSprintSelect = document.getElementById('roadmapEntityExistingSprint');
            const existingSprintRow = document.getElementById('roadmapEntityExistingSprintRow');
            const titleGroup = document.getElementById('roadmapEntityTitle')?.closest('.form-group');
            const modalTitle = document.getElementById('roadmapEntityModalTitle');
            const saveButton = document.getElementById('roadmapEntityModalSaveBtn');
            const assignExistingMode = options.mode === 'assign-sprint-from-selection';
            modalTitle.textContent = options.mode === 'create-sprint-from-selection'
                ? 'Create Sprint'
                : assignExistingMode
                    ? 'Add to Existing Sprint'
                    : `${item ? 'Edit' : 'New'} ${config.label}`;
            saveButton.textContent = assignExistingMode ? 'Add to Sprint' : 'Save Item';
            document.getElementById('roadmapEntityTitle').value = item?.title || '';
            document.getElementById('roadmapEntityDateLabel').textContent = config.dateLabel || 'Date';
            document.getElementById('roadmapEntityDate').value = item?.dueDate || '';
            document.getElementById('roadmapEntityStartDate').value = item?.startDate || '';
            document.getElementById('roadmapEntityEndDate').value = item?.endDate || '';
            if (existingSprintRow) {
                existingSprintRow.classList.toggle('hidden', !assignExistingMode);
            }
            if (existingSprintSelect) {
                existingSprintSelect.innerHTML = buildRoadmapSprintSelectionOptionMarkup(roadmap.sprints || [], '');
            }
            if (titleGroup) {
                titleGroup.classList.toggle('hidden', assignExistingMode);
            }
            document.getElementById('roadmapEntitySingleDateRow').classList.toggle('hidden', assignExistingMode || config.dateMode !== 'single');
            document.getElementById('roadmapEntityRangeRow').classList.toggle('hidden', assignExistingMode || config.dateMode !== 'range');
            document.getElementById('roadmapEntityModal').classList.add('active');
            if (assignExistingMode && existingSprintSelect) {
                existingSprintSelect.focus();
            } else {
                document.getElementById('roadmapEntityTitle').focus();
            }
        }

        function buildRoadmapEntityDraftFromForm() {
            return {
                kind: document.getElementById('roadmapEntityKind').value,
                itemId: normalizeRoadmapRef(document.getElementById('roadmapEntityId').value),
                title: document.getElementById('roadmapEntityTitle').value.trim(),
                existingSprintId: normalizeRoadmapRef(document.getElementById('roadmapEntityExistingSprint').value),
                dueDate: normalizeRoadmapDate(document.getElementById('roadmapEntityDate').value),
                startDate: normalizeRoadmapDate(document.getElementById('roadmapEntityStartDate').value),
                endDate: normalizeRoadmapDate(document.getElementById('roadmapEntityEndDate').value)
            };
        }

        async function saveRoadmapEntity() {
            const draft = buildRoadmapEntityDraftFromForm();
            const context = appState.roadmapEntityContext;
            if (!context?.boardId) return;
            const config = getRoadmapEntityConfig(draft.kind);
            if (!config) return;
            if (context.mode === 'assign-sprint-from-selection') {
                if (!draft.existingSprintId) {
                    document.getElementById('roadmapEntityExistingSprint').focus();
                    return;
                }
                const changed = await assignSelectionToExistingSprint(context.boardId, draft.existingSprintId);
                if (!changed) return;
                closeRoadmapEntityModal();
                clearPortfolioBulkSelection(context.boardId);
                renderPortfolio();
                return;
            }
            if (!draft.title) {
                document.getElementById('roadmapEntityTitle').focus();
                return;
            }
            if (config.dateMode === 'single' && !draft.dueDate) {
                alert(`${config.label} requires a valid due date.`);
                document.getElementById('roadmapEntityDate').focus();
                return;
            }
            if (config.dateMode === 'range' && (!draft.startDate || !draft.endDate)) {
                alert(`${config.label} requires valid start and end dates.`);
                document.getElementById('roadmapEntityStartDate').focus();
                return;
            }
            if (context.mode === 'create-sprint-from-selection') {
                const changed = await createSprintFromSelection(context.boardId, draft);
                if (!changed) return;
                closeRoadmapEntityModal();
                clearPortfolioBulkSelection(context.boardId);
                renderPortfolio();
                return;
            }

            const changed = await runPortfolioBoardMutation(context.boardId, (boardData) => {
                const roadmap = getRoadmapExtensionObject(boardData, { create: true });
                const items = roadmap[config.itemsKey];
                const index = draft.itemId ? items.findIndex((item) => item.id === draft.itemId) : -1;
                const nextId = draft.itemId || slugifyRoadmapEntityId(draft.title, items);
                const previousItem = index >= 0 ? items[index] : null;
                const nextItem = config.dateMode === 'single'
                    ? { id: nextId, title: draft.title, dueDate: draft.dueDate }
                    : { id: nextId, title: draft.title, startDate: draft.startDate, endDate: draft.endDate };

                if (previousItem && JSON.stringify(previousItem) === JSON.stringify(nextItem)) {
                    return false;
                }

                if (index >= 0) {
                    items[index] = nextItem;
                } else {
                    items.push(nextItem);
                }

                appendTimelineEvent(boardData, {
                    kind: 'roadmap.updated',
                    entityType: 'board',
                    entityId: 'board',
                    summary: `${config.label} ${index >= 0 ? 'updated' : 'created'}: ${nextItem.title}`,
                    snapshot: createBoardStateSnapshot(boardData),
                    meta: {
                        roadmapKind: draft.kind,
                        roadmapItemId: nextItem.id,
                        action: index >= 0 ? 'update' : 'create'
                    }
                });
                return true;
            });

            if (!changed) return;
            closeRoadmapEntityModal();
        }

        async function deleteRoadmapEntity(kind, itemId) {
            const boardId = appState.selectedPortfolioBoardId;
            const boardRecord = boardId ? getPortfolioBoardRecord(boardId) : null;
            const config = getRoadmapEntityConfig(kind);
            if (!boardRecord || !config) return;
            if (!canUsePortfolioTaskMutations(boardId)) {
                notifyPortfolioMutationUnavailable(boardId);
                return;
            }

            const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
            const item = roadmap[config.itemsKey].find((entry) => entry.id === itemId);
            if (!item) return;
            const confirmed = window.confirm(`Delete "${item.title}"? Linked task references will be cleared.`);
            if (!confirmed) return;

            await runPortfolioBoardMutation(boardId, (boardData) => {
                const mutableRoadmap = getRoadmapExtensionObject(boardData, { create: true });
                const items = mutableRoadmap[config.itemsKey];
                const index = items.findIndex((entry) => entry.id === itemId);
                if (index === -1) return false;
                const [removed] = items.splice(index, 1);
                const tasks = Array.isArray(boardData.board?.tasks) ? boardData.board.tasks : [];
                tasks.forEach((task) => {
                    if (normalizeRoadmapRef(task[config.taskField]) !== removed.id) return;
                    task[config.taskField] = '';
                    touchTask(task);
                });
                appendTimelineEvent(boardData, {
                    kind: 'roadmap.updated',
                    entityType: 'board',
                    entityId: 'board',
                    summary: `${config.label} deleted: ${removed.title}`,
                    snapshot: createBoardStateSnapshot(boardData),
                    meta: {
                        roadmapKind: kind,
                        roadmapItemId: removed.id,
                        action: 'delete'
                    }
                });
                return true;
            });
        }

        function openShortcutsModal() {
            renderShortcutsModalContent();
            document.getElementById('shortcutsModal').classList.add('active');
        }

        function closeShortcutsModal() {
            document.getElementById('shortcutsModal').classList.remove('active');
        }

        function openHelpModal() {
            document.getElementById('helpModal').classList.add('active');
        }

        function closeHelpModal() {
            document.getElementById('helpModal').classList.remove('active');
        }

        function focusFieldById(fieldId) {
            if (!fieldId) return;
            document.getElementById(fieldId)?.focus();
        }

        function focusAndSelectTaskNameInput() {
            const taskNameInput = document.getElementById('taskName');
            if (!taskNameInput) return;
            taskNameInput.focus();
            taskNameInput.select();
        }

        function readTaskDraftFromForm() {
            syncTaskChecklistTextareaFromEditor();
            syncTaskAssigneeTextareaFromEditor();
            return {
                title: document.getElementById('taskName').value.trim(),
                description: document.getElementById('taskDescription').value.trim(),
                assignees: parseAssigneesInput(document.getElementById('taskAssignee').value),
                tags: readTagEditorItems(),
                blocked: Boolean(document.getElementById('taskBlocked').checked),
                blockerReason: normalizeBlockerReason(document.getElementById('taskBlockerReason').value),
                checklist: parseChecklistInput(document.getElementById('taskChecklist').value),
                attachments: getTaskModalAttachmentsDraft(),
                rawDueDate: document.getElementById('taskDueDate').value.trim(),
                dueDate: normalizeDueDate(document.getElementById('taskDueDate').value),
                priority: normalizePriority(document.getElementById('taskPriority').value),
                effort: normalizeEffort(document.getElementById('taskEffort').value),
                phaseId: normalizeRoadmapRef(document.getElementById('taskPhase').value),
                milestoneId: normalizeRoadmapRef(document.getElementById('taskMilestone').value)
            };
        }

        const TaskFormValidator = {
            validate(draft) {
                if (!draft.title) {
                    return { ok: false, silent: true };
                }
                if (draft.title.length > TASK_TITLE_MAX_LENGTH) {
                    return {
                        ok: false,
                        message: `Task title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
                        focusFieldId: 'taskName'
                    };
                }
                if (draft.blocked && !draft.blockerReason) {
                    return {
                        ok: false,
                        message: 'Blocked tasks require a blocker reason.',
                        focusFieldId: 'taskBlockerReason',
                        beforeAlert: syncTaskBlockedReasonVisibility
                    };
                }
                if (draft.rawDueDate && !draft.dueDate) {
                    return {
                        ok: false,
                        message: 'Due date must be a valid date.',
                        focusFieldId: 'taskDueDate'
                    };
                }
                if (draft.attachments.length > ATTACHMENT_MAX_COUNT) {
                    return {
                        ok: false,
                        message: `Tasks can have up to ${ATTACHMENT_MAX_COUNT} attachments.`
                    };
                }
                if (draft.attachments.some(item => (Number(item.sizeBytes) || 0) > ATTACHMENT_HARD_MAX_BYTES)) {
                    return {
                        ok: false,
                        message: `Attachments must be ${formatFileSize(ATTACHMENT_HARD_MAX_BYTES)} or smaller.`
                    };
                }
                return { ok: true };
            }
        };




        async function saveTask() {
            const draft = readTaskDraftFromForm();
            const validation = TaskFormValidator.validate(draft);
            if (!validation.ok) {
                if (validation.silent) return;
                if (typeof validation.beforeAlert === 'function') {
                    validation.beforeAlert();
                }
                alert(validation.message);
                focusFieldById(validation.focusFieldId);
                return;
            }
            const commonFields = buildTaskFieldsFromDraft(draft);

            if (appState.portfolioCreateContext && appState.portfolioCreateContext.boardId) {
                const { boardId } = appState.portfolioCreateContext;
                const boardRecord = getPortfolioBoardRecord(boardId);
                if (!boardRecord) return;
                if (!canUsePortfolioTaskMutations(boardId)) {
                    notifyPortfolioMutationUnavailable(boardId);
                    return;
                }

                const now = nowIso();
                const nextId = nextTaskIdForBoard(boardRecord);
                const status = resolveCreateTaskStatus(boardRecord, appState.portfolioCreateContext.status);

                ensureBoardTimelineBaseline(boardRecord.data);
                boardRecord.data.board.tasks.push({
                    id: nextId,
                    ...commonFields,
                    archived: false,
                    createdAt: now,
                    updatedAt: now,
                    status
                });
                setTaskAttachments(boardRecord.data, nextId, draft.attachments);
                recordTaskTimelineEvent(boardRecord.data, null, captureTaskTimelineSnapshot(boardRecord.data, nextId));
                syncPortfolioTimelineSelectionToLatest(boardId, boardRecord.data);
                markProjectDirty(boardId);

                setSelectedPortfolioBoardId(boardId, { resetViewModeWhenEmpty: false });
                buildPortfolioTasks();
                renderPortfolio();
                closeModal();

                await enqueueProjectSave(boardRecord);
                return;
            }

            if (appState.portfolioEditContext && appState.portfolioEditContext.boardId && appState.portfolioEditContext.taskId) {
                const { boardId, taskId } = appState.portfolioEditContext;
                const saved = await runPortfolioTaskMutation(boardId, taskId, (task, boardRecord) => {
                    Object.assign(task, commonFields);
                    if (boardRecord && boardRecord.data) {
                        setTaskAttachments(boardRecord.data, taskId, draft.attachments);
                    }
                    return true;
                });
                if (!saved) return;
                closeModal();
                appState.pendingNewTaskStatus = null;
                return;
            }

            closeModal();
            appState.pendingNewTaskStatus = null;
        }

        function isSelectedPortfolioCard(boardId, taskId) {
            if (!appState.selectedPortfolioCardRef) return false;
            return appState.selectedPortfolioCardRef.boardId === boardId && Number(appState.selectedPortfolioCardRef.taskId) === Number(taskId);
        }

        function setHoveredPortfolioCard(boardId, taskId) {
            if (!boardId || taskId === null || taskId === undefined) {
                appState.hoveredPortfolioCardRef = null;
                return;
            }
            appState.hoveredPortfolioCardRef = { boardId, taskId: Number(taskId) };
        }

        function setSelectedPortfolioCard(boardId, taskId) {
            if (!boardId || taskId === null || taskId === undefined) {
                appState.selectedPortfolioCardRef = null;
                return;
            }
            appState.selectedPortfolioCardRef = { boardId, taskId: Number(taskId) };
        }

        function syncSelectedPortfolioCardWithVisibleRows(rows) {
            if (!appState.selectedPortfolioCardRef) return;
            const visible = Array.isArray(rows) ? rows : [];
            const exists = visible.some(
                (row) => row.boardId === appState.selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(appState.selectedPortfolioCardRef.taskId)
            );
            if (!exists) {
                appState.selectedPortfolioCardRef = null;
            }
        }

        function syncHoveredPortfolioCardWithVisibleRows(rows) {
            if (!appState.hoveredPortfolioCardRef) return;
            const visible = Array.isArray(rows) ? rows : [];
            const exists = visible.some(
                (row) => row.boardId === appState.hoveredPortfolioCardRef.boardId && Number(row.taskId) === Number(appState.hoveredPortfolioCardRef.taskId)
            );
            if (!exists) {
                appState.hoveredPortfolioCardRef = null;
            }
        }

        function cssEscapeValue(value) {
            const raw = String(value ?? '');
            if (window.CSS && typeof window.CSS.escape === 'function') {
                return window.CSS.escape(raw);
            }
            return raw.replace(/["\\]/g, '\\$&');
        }

        function scrollSelectedPortfolioCardIntoView() {
            if (!appState.selectedPortfolioCardRef) return;
            const selector = `.portfolio-task-card[data-board-id="${cssEscapeValue(appState.selectedPortfolioCardRef.boardId)}"][data-task-id="${cssEscapeValue(appState.selectedPortfolioCardRef.taskId)}"]`;
            const node = document.querySelector(selector);
            if (node && typeof node.scrollIntoView === 'function') {
                node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }

        function getVisiblePortfolioRowsForShortcuts() {
            return getFilteredSortedPortfolioRows();
        }

        function selectAdjacentPortfolioCard(step) {
            const rows = getVisiblePortfolioRowsForShortcuts();
            if (rows.length === 0) {
                appState.selectedPortfolioCardRef = null;
                renderPortfolio();
                return;
            }

            const currentIndex = appState.selectedPortfolioCardRef
                ? rows.findIndex((row) => row.boardId === appState.selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(appState.selectedPortfolioCardRef.taskId))
                : -1;
            let nextIndex;
            if (currentIndex < 0) {
                nextIndex = step > 0 ? 0 : rows.length - 1;
            } else {
                nextIndex = Math.min(rows.length - 1, Math.max(0, currentIndex + step));
            }
            const row = rows[nextIndex];
            if (!row) return;
            setSelectedPortfolioCard(row.boardId, row.taskId);
            renderPortfolio();
            requestAnimationFrame(() => scrollSelectedPortfolioCardIntoView());
        }

        function getSelectedPortfolioRow() {
            if (!appState.selectedPortfolioCardRef) return null;
            return getVisiblePortfolioRowsForShortcuts().find(
                (row) => row.boardId === appState.selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(appState.selectedPortfolioCardRef.taskId)
            ) || null;
        }

        function getHoveredPortfolioRow() {
            if (!appState.hoveredPortfolioCardRef) return null;
            return getVisiblePortfolioRowsForShortcuts().find(
                (row) => row.boardId === appState.hoveredPortfolioCardRef.boardId && Number(row.taskId) === Number(appState.hoveredPortfolioCardRef.taskId)
            ) || null;
        }

        function getShortcutTargetPortfolioRow() {
            return getHoveredPortfolioRow() || getSelectedPortfolioRow();
        }

        function openSelectedPortfolioCardDetails() {
            const row = getShortcutTargetPortfolioRow();
            if (!row || row.historical) return;
            openPortfolioTaskDetails(row.boardId, row.taskId);
        }

        function editSelectedPortfolioCard() {
            const row = getShortcutTargetPortfolioRow();
            if (!row || !row.canMutate) return;
            editPortfolioTask(row.boardId, row.taskId);
        }

        async function toggleArchiveSelectedPortfolioCard() {
            const row = getShortcutTargetPortfolioRow();
            if (!row || !row.canMutate) return;
            await togglePortfolioArchiveTask(row.boardId, row.taskId);
        }

        async function moveSelectedPortfolioCardToShortcutStatus(targetStatus) {
            const row = getShortcutTargetPortfolioRow();
            if (!row || !row.canMutate) return;
            await movePortfolioTaskToStatus(row.boardId, row.taskId, targetStatus);
        }

        function focusPortfolioSearch() {
            const node = document.getElementById('portfolioSearchInput');
            if (node) node.focus();
        }

        function focusPortfolioSortControl() {
            const node = document.getElementById('portfolioSortSelect');
            if (node) node.focus();
        }

        function resetPortfolioViewFiltersAndSort() {
            const search = document.getElementById('portfolioSearchInput');
            const archive = document.getElementById('portfolioArchiveFilter');
            const priority = document.getElementById('portfolioPriorityFilter');
            const assignee = document.getElementById('portfolioAssigneeFilter');
            const blocked = document.getElementById('portfolioBlockedFilter');
            const effort = document.getElementById('portfolioEffortFilter');
            if (search) search.value = '';
            if (archive) archive.value = 'active';
            if (priority) priority.value = '';
            if (assignee) assignee.value = '';
            if (blocked) blocked.value = 'all';
            if (effort) effort.value = '';
            appState.portfolioSortKey = 'priority';
            appState.portfolioSortDir = 'asc';
            renderPortfolio();
        }

        function cyclePortfolioProjectChip(step) {
            const ids = [''].concat(appState.portfolioBoards.map((board) => board.id));
            if (ids.length === 0) return;
            let idx = ids.indexOf(appState.selectedPortfolioBoardId || '');
            if (idx < 0) idx = 0;
            const next = (idx + step + ids.length) % ids.length;
            selectPortfolioBoard(ids[next]);
        }

        function getShortcutModalContext() {
            const taskModalOpen = document.getElementById('taskModal').classList.contains('active');
            const detailModalOpen = document.getElementById('taskDetailModal').classList.contains('active');
            const roadmapEntityModalOpen = document.getElementById('roadmapEntityModal').classList.contains('active');
            const shortcutsModalOpen = document.getElementById('shortcutsModal').classList.contains('active');
            const helpModalOpen = document.getElementById('helpModal').classList.contains('active');
            const activeTag = document.activeElement ? document.activeElement.tagName : '';
            const isTyping = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';

            let modal = null;
            if (taskModalOpen) modal = 'taskModal';
            else if (detailModalOpen) modal = 'detailModal';
            else if (roadmapEntityModalOpen) modal = 'roadmapEntityModal';
            else if (shortcutsModalOpen) modal = 'shortcutsModal';
            else if (helpModalOpen) modal = 'helpModal';

            return {
                modal,
                isTyping,
                noModal: !modal
            };
        }

        function renderShortcutKeys(tokens) {
            return (tokens || [])
                .map((token) => `<kbd>${escapeHtml(token)}</kbd>`)
                .join('<span class="shortcut-plus">+</span>');
        }

        function buildShortcutRegistry() {
            appState.ShortcutRegistry = [
                {
                    id: 'focus-search',
                    section: 'Global',
                    keys: ['/'],
                    description: 'Focus project search',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key === '/',
                    handler: () => focusPortfolioSearch()
                },
                {
                    id: 'new-project',
                    section: 'Global',
                    keys: ['N'],
                    description: 'Create a new project',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N'),
                    handler: () => newProject()
                },
                {
                    id: 'import-projects',
                    section: 'Global',
                    keys: ['I'],
                    description: 'Import projects',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'i' || e.key === 'I'),
                    handler: () => importProjects()
                },
                {
                    id: 'open-shortcuts',
                    section: 'Global',
                    keys: ['?'],
                    description: 'Open keyboard shortcuts',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '?' || (e.key === '/' && e.shiftKey)),
                    handler: () => openShortcutsModal()
                },
                {
                    id: 'open-help',
                    section: 'Global',
                    keys: ['H'],
                    description: 'Open help manual',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'h' || e.key === 'H'),
                    handler: () => openHelpModal()
                },
                {
                    id: 'reset-filters',
                    section: 'Global',
                    keys: ['R'],
                    description: 'Reset filters and sort',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'r' || e.key === 'R'),
                    handler: () => resetPortfolioViewFiltersAndSort()
                },
                {
                    id: 'focus-sort',
                    section: 'Global',
                    keys: ['S'],
                    description: 'Focus sort control',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 's' || e.key === 'S'),
                    handler: () => focusPortfolioSortControl()
                },
                {
                    id: 'project-prev',
                    section: 'Global',
                    keys: ['['],
                    description: 'Select previous project chip',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '[',
                    handler: () => cyclePortfolioProjectChip(-1)
                },
                {
                    id: 'project-next',
                    section: 'Global',
                    keys: [']'],
                    description: 'Select next project chip',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === ']',
                    handler: () => cyclePortfolioProjectChip(1)
                },
                {
                    id: 'card-next',
                    section: 'Cards',
                    keys: ['J'],
                    description: 'Select next visible card',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'j' || e.key === 'J'),
                    handler: () => selectAdjacentPortfolioCard(1)
                },
                {
                    id: 'card-prev',
                    section: 'Cards',
                    keys: ['K'],
                    description: 'Select previous visible card',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'k' || e.key === 'K'),
                    handler: () => selectAdjacentPortfolioCard(-1)
                },
                {
                    id: 'card-open',
                    section: 'Cards',
                    keys: ['Enter'],
                    description: 'Open hovered or selected card details',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === 'Enter',
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && !row.historical);
                    },
                    handler: () => openSelectedPortfolioCardDetails()
                },
                {
                    id: 'card-edit',
                    section: 'Cards',
                    keys: ['E'],
                    description: 'Edit hovered or selected card',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'e' || e.key === 'E'),
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => editSelectedPortfolioCard()
                },
                {
                    id: 'card-archive',
                    section: 'Cards',
                    keys: ['X'],
                    description: 'Archive/restore hovered or selected card',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'x' || e.key === 'X'),
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => toggleArchiveSelectedPortfolioCard()
                },
                {
                    id: 'move-backlog',
                    section: 'Cards',
                    keys: ['1'],
                    description: 'Move hovered or selected card to Backlog',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '1',
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => moveSelectedPortfolioCardToShortcutStatus('backlog')
                },
                {
                    id: 'move-todo',
                    section: 'Cards',
                    keys: ['2'],
                    description: 'Move hovered or selected card to To Do',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '2',
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => moveSelectedPortfolioCardToShortcutStatus('to-do')
                },
                {
                    id: 'move-doing',
                    section: 'Cards',
                    keys: ['3'],
                    description: 'Move hovered or selected card to In Progress',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '3',
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => moveSelectedPortfolioCardToShortcutStatus('doing')
                },
                {
                    id: 'move-done',
                    section: 'Cards',
                    keys: ['4'],
                    description: 'Move hovered or selected card to Done',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '4',
                    when: () => {
                        const row = getShortcutTargetPortfolioRow();
                        return Boolean(row && row.canMutate);
                    },
                    handler: () => moveSelectedPortfolioCardToShortcutStatus('done')
                },
                {
                    id: 'save-task-modal',
                    section: 'Task Modal',
                    keys: ['Ctrl', 'Enter'],
                    description: 'Save task',
                    contexts: ['taskModal'],
                    allowWhileTyping: true,
                    match: (e) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key === 'Enter',
                    handler: () => saveTask()
                },
                {
                    id: 'detail-edit',
                    section: 'Task Detail',
                    keys: ['E'],
                    description: 'Edit open task',
                    contexts: ['detailModal'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'e' || e.key === 'E'),
                    when: () => Boolean(appState.portfolioDetailContext && !appState.portfolioDetailContext.readOnly),
                    handler: () => {
                        if (!appState.portfolioDetailContext) return;
                        editPortfolioTask(appState.portfolioDetailContext.boardId, appState.portfolioDetailContext.taskId);
                    }
                },
                {
                    id: 'detail-archive',
                    section: 'Task Detail',
                    keys: ['X'],
                    description: 'Archive/restore open task',
                    contexts: ['detailModal'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'x' || e.key === 'X'),
                    when: () => Boolean(appState.portfolioDetailContext && !appState.portfolioDetailContext.readOnly),
                    handler: () => {
                        if (!appState.portfolioDetailContext) return;
                        togglePortfolioArchiveTask(appState.portfolioDetailContext.boardId, appState.portfolioDetailContext.taskId);
                    }
                },
                {
                    id: 'close-modal',
                    section: 'Modal',
                    keys: ['Esc'],
                    description: 'Close open modal',
                    contexts: ['taskModal', 'detailModal', 'roadmapEntityModal', 'shortcutsModal', 'helpModal'],
                    allowWhileTyping: true,
                    match: (e) => e.key === 'Escape',
                    handler: () => {
                        closeModal();
                        closeDetailModal();
                        closeRoadmapEntityModal();
                        closeShortcutsModal();
                        closeHelpModal();
                    }
                }
            ];
        }

        function renderShortcutsModalContent() {
            const container = document.getElementById('shortcutsList');
            if (!container) return;
            if (!appState.ShortcutRegistry || appState.ShortcutRegistry.length === 0) {
                buildShortcutRegistry();
            }

            const displayGroups = [
                { title: 'Global', sections: ['Global'] },
                { title: 'Cards', sections: ['Cards'] },
                { title: 'Modals', sections: ['Task Modal', 'Task Detail', 'Modal'] }
            ];

            const sectionsHtml = displayGroups.map((group) => {
                const subgroups = group.sections
                    .map((section) => ({
                        section,
                        rows: appState.ShortcutRegistry.filter((entry) => entry.section === section)
                    }))
                    .filter((subgroup) => subgroup.rows.length > 0);

                if (subgroups.length === 0) return '';

                const rowsHtml = subgroups.map((subgroup, index) => {
                    const showSubheading = group.sections.length > 1;
                    const rows = subgroup.rows.map((entry) => `
                        <div class="shortcut-row">
                            <div class="shortcut-keys">${renderShortcutKeys(entry.keys)}</div>
                            <div class="shortcut-desc">${escapeHtml(entry.description)}</div>
                        </div>
                    `).join('');

                    return `
                        ${showSubheading ? `<div class="shortcut-section-title">${escapeHtml(subgroup.section)}</div>` : ''}
                        <div class="shortcuts-list">${rows}</div>
                    `;
                }).join('');

                return `
                    <section class="shortcut-section-card" aria-label="${escapeHtml(group.title)} shortcuts">
                        <h3 class="shortcut-section-card-title">${escapeHtml(group.title)}</h3>
                        ${rowsHtml}
                    </section>
                `;
            }).join('');

            container.innerHTML = `<div class="shortcut-sections-grid">${sectionsHtml}</div>`;
        }

        function dispatchShortcutKeydown(e) {
            if (!appState.ShortcutRegistry || appState.ShortcutRegistry.length === 0) {
                buildShortcutRegistry();
            }
            const context = getShortcutModalContext();
            const contextName = context.noModal ? 'global' : context.modal;

            for (const entry of appState.ShortcutRegistry) {
                if (!entry.contexts.includes(contextName)) continue;
                if (context.isTyping && !entry.allowWhileTyping) continue;
                if (!entry.match(e, context)) continue;
                if (typeof entry.when === 'function' && !entry.when(context)) continue;
                e.preventDefault();
                entry.handler(e, context);
                return true;
            }
            return false;
        }

        function cacheRefs() {
            Refs.themeToggleBtn = document.getElementById('themeToggleBtn');
            Refs.portfolioView = document.getElementById('portfolioView');
            Refs.portfolioViewModeToggle = document.getElementById('portfolioViewModeToggle');
            Refs.portfolioBoard = document.getElementById('portfolioBoard');
            Refs.portfolioRoadmapView = document.getElementById('portfolioRoadmapView');
            Refs.portfolioCalendarView = document.getElementById('portfolioCalendarView');
            Refs.portfolioBulkActions = document.getElementById('portfolioBulkActions');
            Refs.portfolioBoardsChips = document.getElementById('portfolioBoardsChips');
            Refs.portfolioTimelinePanel = document.getElementById('portfolioTimelinePanel');
            Refs.portfolioSearchInput = document.getElementById('portfolioSearchInput');
            Refs.portfolioArchiveFilter = document.getElementById('portfolioArchiveFilter');
            Refs.portfolioPriorityFilter = document.getElementById('portfolioPriorityFilter');
            Refs.portfolioAssigneeFilter = document.getElementById('portfolioAssigneeFilter');
            Refs.portfolioBlockedFilter = document.getElementById('portfolioBlockedFilter');
            Refs.portfolioEffortFilter = document.getElementById('portfolioEffortFilter');
            Refs.portfolioSortSelect = document.getElementById('portfolioSortSelect');
            Refs.taskModal = document.getElementById('taskModal');
            Refs.taskDetailModal = document.getElementById('taskDetailModal');
            Refs.shortcutsModal = document.getElementById('shortcutsModal');
            Refs.helpModal = document.getElementById('helpModal');
            Refs.shortcutsList = document.getElementById('shortcutsList');
            return Refs;
        }

        function setPortfolioDragContext(ctx) {
            appState.portfolioDragContext = ctx || null;
        }

        async function movePortfolioTaskToStatus(boardId, taskId, targetStatus) {
            if (!boardId || !taskId) return false;
            if (!isPortfolioBoardMutable(boardId)) return false;

            const source = findPortfolioTaskSource(boardId, taskId);
            if (!source) return false;

            const normalizedTargetStatus = normalizeTaskStatus(targetStatus);
            const validStatuses = new Set(
                (source.boardRecord.data.board.columns || defaultColumns).map(col => normalizeTaskStatus(col.status))
            );
            if (!validStatuses.has(normalizedTargetStatus)) return false;
            if (normalizeTaskStatus(source.task.status) === normalizedTargetStatus) return false;

            const changed = await runPortfolioTaskMutation(boardId, taskId, (task) => {
                if (normalizeTaskStatus(task.status) === normalizedTargetStatus) return false;
                task.status = normalizedTargetStatus;
                return true;
            });
            return Boolean(changed);
        }

        function clearPortfolioColumnDragHighlights() {
            const root = Refs.portfolioBoard || document.getElementById('portfolioBoard');
            if (!root) return;
            root.querySelectorAll('.portfolio-column-body.drag-over').forEach((node) => {
                node.classList.remove('drag-over');
            });
        }

        function readPortfolioDragContextFromEvent(ev) {
            if (appState.portfolioDragContext && appState.portfolioDragContext.boardId && appState.portfolioDragContext.taskId) {
                return appState.portfolioDragContext;
            }
            const raw = ev?.dataTransfer?.getData?.('application/x-kanban-task') || ev?.dataTransfer?.getData?.('text/plain');
            if (!raw) return null;
            try {
                const parsed = JSON.parse(raw);
                if (!parsed || !parsed.boardId || !parsed.taskId) return null;
                return parsed;
            } catch (_) {
                return null;
            }
        }

        function canDragPortfolioContext(ctx) {
            if (!ctx || !ctx.boardId || !ctx.taskId) return false;
            return isPortfolioBoardMutable(ctx.boardId);
        }

        function onPortfolioTaskDragStart(ev, ctx) {
            if (!canDragPortfolioContext(ctx)) {
                ev.preventDefault();
                return;
            }
            setPortfolioDragContext({
                boardId: ctx.boardId,
                taskId: Number(ctx.taskId),
                fromStatus: normalizeTaskStatus(ctx.status)
            });
            const payload = JSON.stringify(appState.portfolioDragContext);
            if (ev.dataTransfer) {
                ev.dataTransfer.effectAllowed = 'move';
                try {
                    ev.dataTransfer.setData('application/x-kanban-task', payload);
                } catch (_) { }
                try {
                    ev.dataTransfer.setData('text/plain', payload);
                } catch (_) { }
            }
            if (ev.currentTarget && ev.currentTarget.classList) {
                ev.currentTarget.classList.add('dragging');
            }
        }

        function onPortfolioTaskDragEnd(ev) {
            setPortfolioDragContext(null);
            appState.suppressPortfolioCardClickUntil = Date.now() + 120;
            if (ev.currentTarget && ev.currentTarget.classList) {
                ev.currentTarget.classList.remove('dragging');
            }
            clearPortfolioColumnDragHighlights();
        }

        function onPortfolioColumnDragOver(ev, targetStatus) {
            const ctx = readPortfolioDragContextFromEvent(ev);
            if (!canDragPortfolioContext(ctx)) return;
            const nextStatus = normalizeTaskStatus(targetStatus);
            if (normalizeTaskStatus(ctx.fromStatus) === nextStatus) return;
            ev.preventDefault();
            if (ev.dataTransfer) {
                ev.dataTransfer.dropEffect = 'move';
            }
            if (ev.currentTarget && ev.currentTarget.classList) {
                ev.currentTarget.classList.add('drag-over');
            }
        }

        function onPortfolioColumnDragLeave(ev) {
            const current = ev.currentTarget;
            if (!current || !current.classList) return;
            const related = ev.relatedTarget;
            if (related && current.contains(related)) return;
            current.classList.remove('drag-over');
        }

        async function onPortfolioColumnDrop(ev, targetStatus) {
            ev.preventDefault();
            const current = ev.currentTarget;
            if (current && current.classList) {
                current.classList.remove('drag-over');
            }
            const ctx = readPortfolioDragContextFromEvent(ev);
            if (!canDragPortfolioContext(ctx)) {
                clearPortfolioColumnDragHighlights();
                return;
            }

            try {
                await movePortfolioTaskToStatus(ctx.boardId, Number(ctx.taskId), targetStatus);
            } finally {
                setPortfolioDragContext(null);
                clearPortfolioColumnDragHighlights();
            }
        }

        function handlePortfolioBoardChipsClick(event) {
            const button = event.target.closest('button[data-action]');
            if (!button) return;
            const boardId = button.dataset.boardId || '';
            const action = button.dataset.action;
            if (action === 'select-board') {
                selectPortfolioBoard(boardId);
                return;
            }
            if (action === 'retry-save') {
                retryProjectSave(boardId);
                return;
            }
            if (action === 'remove-board') {
                removeProjectFromPortfolio(boardId);
            }
        }

        function handleTimelinePanelClick(event) {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const boardId = button.dataset.boardId || '';
            const action = button.dataset.action;
            if (action === 'timeline-latest') {
                movePortfolioTimelineToLatest(boardId);
                return;
            }
            if (action === 'timeline-restore') {
                restorePortfolioTimelineSelection();
                return;
            }
            if (action === 'timeline-select-event') {
                setPortfolioTimelineSelection(boardId, Number(button.dataset.eventIndex));
                return;
            }
            if (action === 'timeline-toggle-expanded') {
                togglePortfolioTimelineExpanded(boardId);
            }
        }

        function handleTimelinePanelInput(event) {
            const input = event.target.closest('input[data-action="timeline-slider"]');
            if (!input) return;
            setPortfolioTimelineSelection(input.dataset.boardId || '', Number(input.value), {
                skipTimelinePanel: appState.portfolioTimelineDragState.active && appState.portfolioTimelineDragState.boardId === (input.dataset.boardId || '')
            });
        }

        function handleTimelinePanelPointerDown(event) {
            const input = event.target.closest('input[data-action="timeline-slider"]');
            if (!input) return;
            appState.portfolioTimelineDragState = {
                active: true,
                boardId: input.dataset.boardId || ''
            };
        }

        function handleTimelineSliderPointerCommit() {
            if (!appState.portfolioTimelineDragState.active) return;
            appState.portfolioTimelineDragState = { active: false, boardId: '' };
            renderPortfolio();
        }

        function handlePortfolioBoardClick(event) {
            const actionButton = event.target.closest('button[data-action]');
            if (actionButton) {
                const taskCard = actionButton.closest('.portfolio-task-card');
                if (taskCard) {
                    event.stopPropagation();
                    const boardId = taskCard.dataset.boardId || '';
                    const taskId = Number(taskCard.dataset.taskId);
                    const action = actionButton.dataset.action;
                    if (action === 'edit-task') {
                        editPortfolioTask(boardId, taskId);
                        return;
                    }
                    if (action === 'archive-task') {
                        togglePortfolioArchiveTask(boardId, taskId);
                        return;
                    }
                    if (action === 'delete-task') {
                        deletePortfolioTask(boardId, taskId);
                        return;
                    }
                }
            }

            const addTaskCard = event.target.closest('.add-task-card[data-action="add-task"]');
            if (addTaskCard) {
                openPortfolioCreateTaskModal(appState.selectedPortfolioBoardId, addTaskCard.dataset.status || '');
                return;
            }

            const taskCard = event.target.closest('.portfolio-task-card');
            if (!taskCard) return;
            if (Date.now() < appState.suppressPortfolioCardClickUntil) return;
            const boardId = taskCard.dataset.boardId || '';
            const taskId = Number(taskCard.dataset.taskId);
            setSelectedPortfolioCard(boardId, taskId);
            if (taskCard.dataset.historical === 'true') {
                renderPortfolio();
                return;
            }
            openPortfolioTaskDetails(boardId, taskId);
        }

        function handlePortfolioBoardChange(event) {
            const checkbox = event.target.closest('input[data-action="toggle-bulk-task-selection"]');
            if (!checkbox) return;
            togglePortfolioTaskBulkSelection(checkbox.dataset.boardId || '', Number(checkbox.dataset.taskId), checkbox.checked);
            renderPortfolioBulkActions();
        }

        function handlePortfolioRoadmapViewClick(event) {
            const button = event.target.closest('button[data-action][data-roadmap-kind]');
            if (button) {
                const kind = button.dataset.roadmapKind || '';
                const itemId = button.dataset.roadmapId || '';
                const action = button.dataset.action;
                if (action === 'add-roadmap-item') {
                    openRoadmapEntityModal(kind);
                    return;
                }
                if (action === 'edit-roadmap-item') {
                    openRoadmapEntityModal(kind, itemId);
                    return;
                }
                if (action === 'delete-roadmap-item') {
                    deleteRoadmapEntity(kind, itemId);
                    return;
                }
                if (action === 'toggle-roadmap-row') {
                    togglePortfolioRoadmapRowExpanded(appState.selectedPortfolioBoardId, `${kind}:${itemId}`);
                    renderPortfolioRoadmapView();
                    return;
                }
            }

            const taskCard = event.target.closest('.portfolio-task-card');
            if (taskCard) {
                const boardId = taskCard.dataset.boardId || '';
                const taskId = Number(taskCard.dataset.taskId);
                setSelectedPortfolioCard(boardId, taskId);
                renderPortfolio();
                if (taskCard.dataset.historical === 'true') {
                    const viewState = getSelectedBoardTimelineViewState();
                    openPortfolioTaskDetails(boardId, taskId, {
                        boardData: viewState?.projectedBoard || null,
                        readOnly: true
                    });
                    return;
                }
                openPortfolioTaskDetails(boardId, taskId);
                return;
            }

            if (event.target.closest('.roadmap-task-list')) return;

            const row = event.target.closest('.roadmap-row[data-roadmap-kind][data-roadmap-id]');
            if (row && appState.selectedPortfolioBoardId) {
                togglePortfolioRoadmapRowExpanded(appState.selectedPortfolioBoardId, `${row.dataset.roadmapKind}:${row.dataset.roadmapId}`);
                renderPortfolioRoadmapView();
            }
        }

        function shiftPortfolioCalendarMonth(step) {
            const current = createUtcDate(appState.portfolioCalendarYear, appState.portfolioCalendarMonth, 1);
            const next = createUtcDate(current.getUTCFullYear(), current.getUTCMonth() + step, 1);
            appState.portfolioCalendarYear = next.getUTCFullYear();
            appState.portfolioCalendarMonth = next.getUTCMonth();
            appState.portfolioCalendarView = 'month';
        }

        function openPortfolioCalendarTaskDetails(boardId, taskId) {
            const viewState = appState.selectedPortfolioBoardId === boardId ? getSelectedBoardTimelineViewState() : null;
            if (viewState?.isPreview) {
                openPortfolioTaskDetails(boardId, taskId, {
                    boardData: viewState.projectedBoard || null,
                    readOnly: true
                });
                return;
            }
            openPortfolioTaskDetails(boardId, taskId);
        }

        function handlePortfolioCalendarViewClick(event) {
            const button = event.target.closest('button[data-action]');
            if (button) {
                const action = button.dataset.action || '';
                if (action === 'open-calendar-month') {
                    appState.portfolioCalendarYear = Number(button.dataset.year);
                    appState.portfolioCalendarMonth = Number(button.dataset.month);
                    appState.portfolioCalendarView = 'month';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-back-to-year') {
                    appState.portfolioCalendarView = 'year';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-toggle-mode') {
                    appState.portfolioCalendarDisplayMode = appState.portfolioCalendarDisplayMode === 'heatmap' ? 'calendar' : 'heatmap';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-prev-year') {
                    appState.portfolioCalendarYear -= 1;
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-next-year') {
                    appState.portfolioCalendarYear += 1;
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-prev-month') {
                    shiftPortfolioCalendarMonth(-1);
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-next-month') {
                    shiftPortfolioCalendarMonth(1);
                    renderPortfolio();
                    return;
                }
                if (action === 'open-calendar-task') {
                    const boardId = button.dataset.boardId || '';
                    const taskId = Number(button.dataset.taskId);
                    if (!boardId || !taskId) return;
                    openPortfolioCalendarTaskDetails(boardId, taskId);
                    return;
                }
            }
            const createCell = event.target.closest('.portfolio-calendar-day-cell[data-action="create-calendar-task"][data-due-date]');
            if (createCell && appState.selectedPortfolioBoardId) {
                openPortfolioCreateTaskModal(appState.selectedPortfolioBoardId, '', {
                    preferredDueDate: createCell.dataset.dueDate || ''
                });
            }
        }

        function openCreateSprintFromSelectionModal() {
            const boardId = appState.selectedPortfolioBoardId;
            if (!boardId) return;
            if (getSelectedPortfolioBulkTaskIds(boardId).length === 0) return;
            openRoadmapEntityModal('sprints', '', { mode: 'create-sprint-from-selection' });
        }

        function openAssignExistingSprintFromSelectionModal() {
            const boardId = appState.selectedPortfolioBoardId;
            if (!boardId) return;
            if (getSelectedPortfolioBulkTaskIds(boardId).length === 0) return;
            const boardRecord = getPortfolioBoardRecord(boardId);
            const roadmap = getRoadmapExtension(boardRecord?.data);
            if (!Array.isArray(roadmap?.sprints) || roadmap.sprints.length === 0) return;
            openRoadmapEntityModal('sprints', '', { mode: 'assign-sprint-from-selection' });
        }

        function handlePortfolioBulkActionsClick(event) {
            const button = event.target.closest('button');
            if (!button) return;
            if (button.id === 'portfolioBulkClearBtn') {
                clearPortfolioBulkSelection(appState.selectedPortfolioBoardId);
                renderPortfolio();
                return;
            }
            if (button.id === 'portfolioBulkCreateSprintBtn') {
                openCreateSprintFromSelectionModal();
                return;
            }
            if (button.id === 'portfolioBulkAssignSprintBtn') {
                openAssignExistingSprintFromSelectionModal();
            }
        }

        function handlePortfolioBoardPointerOver(event) {
            const taskCard = event.target.closest('.portfolio-task-card');
            if (!taskCard) return;
            setHoveredPortfolioCard(taskCard.dataset.boardId || '', Number(taskCard.dataset.taskId));
        }

        function handlePortfolioBoardPointerOut(event) {
            const taskCard = event.target.closest('.portfolio-task-card');
            if (!taskCard) return;
            const related = event.relatedTarget;
            if (related instanceof Node && taskCard.contains(related)) {
                return;
            }
            if (
                appState.hoveredPortfolioCardRef
                && appState.hoveredPortfolioCardRef.boardId === (taskCard.dataset.boardId || '')
                && Number(appState.hoveredPortfolioCardRef.taskId) === Number(taskCard.dataset.taskId)
            ) {
                appState.hoveredPortfolioCardRef = null;
            }
        }

        function handleDocumentClickForSelection(event) {
            if (!appState.selectedPortfolioCardRef) return;
            const taskCard = event.target.closest('.portfolio-task-card');
            if (taskCard && isSelectedPortfolioCard(taskCard.dataset.boardId || '', Number(taskCard.dataset.taskId))) {
                return;
            }
            if (taskCard) {
                return;
            }
            setSelectedPortfolioCard(null, null);
            renderPortfolio();
        }

        function handleTaskChecklistEditorClick(event) {
            const button = event.target.closest('.checklist-editor-remove[data-index]');
            if (!button) return;
            removeTaskChecklistEditorItem(Number(button.dataset.index));
        }

        function handleTaskChecklistEditorInput(event) {
            const textInput = event.target.closest('.checklist-editor-row input[type="text"][data-index]');
            if (!textInput) return;
            updateTaskChecklistEditorItemText(Number(textInput.dataset.index), textInput.value);
        }

        function handleTaskChecklistEditorChange(event) {
            const checkbox = event.target.closest('.checklist-editor-row input[type="checkbox"][data-index]');
            if (!checkbox) return;
            toggleTaskChecklistEditorItem(Number(checkbox.dataset.index), checkbox.checked);
        }

        function handleTaskChecklistEditorDragStart(event) {
            const handle = event.target.closest('.checklist-editor-drag-handle[data-index]');
            if (!handle) return;
            const activeIndex = Number(handle.dataset.index);
            if (!Number.isInteger(activeIndex) || activeIndex < 0) return;
            appState.taskChecklistDragState = { activeIndex, targetIndex: -1, targetPlacement: '' };
            if (event.dataTransfer) {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', String(activeIndex));
            }
            renderTaskChecklistDragState();
        }

        function handleTaskChecklistEditorDragOver(event) {
            if (appState.taskChecklistDragState.activeIndex < 0) return;
            const row = event.target.closest('.checklist-editor-row[data-index]');
            if (!row) return;
            const targetIndex = Number(row.dataset.index);
            if (!Number.isInteger(targetIndex) || targetIndex < 0) return;
            event.preventDefault();
            if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'move';
            }
            appState.taskChecklistDragState.targetIndex = targetIndex;
            appState.taskChecklistDragState.targetPlacement = getTaskChecklistDropPlacement(row, event.clientY);
            renderTaskChecklistDragState();
        }

        function handleTaskChecklistEditorDrop(event) {
            if (appState.taskChecklistDragState.activeIndex < 0) return;
            const row = event.target.closest('.checklist-editor-row[data-index]');
            if (!row) {
                resetTaskChecklistDragState();
                return;
            }
            const targetIndex = Number(row.dataset.index);
            if (!Number.isInteger(targetIndex) || targetIndex < 0) {
                resetTaskChecklistDragState();
                return;
            }
            event.preventDefault();
            const placement = getTaskChecklistDropPlacement(row, event.clientY);
            moveTaskChecklistEditorItem(appState.taskChecklistDragState.activeIndex, targetIndex, placement);
            resetTaskChecklistDragState();
        }

        function handleTaskChecklistEditorDragEnd() {
            resetTaskChecklistDragState();
        }

        function handleTaskAssigneeEditorClick(event) {
            const button = event.target.closest('.assignee-editor-remove[data-index]');
            if (!button) return;
            removeTaskAssigneeEditorItem(Number(button.dataset.index));
        }

        function handleTaskAssigneeEditorInput(event) {
            const textInput = event.target.closest('.assignee-editor-row input[type="text"][data-index]');
            if (!textInput) return;
            updateTaskAssigneeEditorItemText(Number(textInput.dataset.index), textInput.value);
        }

        function handleTaskAttachmentsEditorClick(event) {
            const button = event.target.closest('.attachment-remove-btn[data-attachment-id]');
            if (!button) return;
            removeTaskModalAttachment(button.dataset.attachmentId);
        }

        function handleDetailChecklistChange(event) {
            const checkbox = event.target.closest('#detailChecklist input[type="checkbox"][data-task-id][data-index]');
            if (!checkbox) return;
            toggleChecklistItem(Number(checkbox.dataset.taskId), Number(checkbox.dataset.index), checkbox.checked);
        }

        function bindStaticUiEvents() {
            Refs.themeToggleBtn?.addEventListener('click', toggleTheme);
            document.getElementById('openShortcutsBtn')?.addEventListener('click', openShortcutsModal);
            document.getElementById('openHelpBtn')?.addEventListener('click', openHelpModal);
            document.getElementById('newProjectBtn')?.addEventListener('click', newProject);
            document.getElementById('importProjectsBtn')?.addEventListener('click', importProjects);
            document.getElementById('taskModalCloseBtn')?.addEventListener('click', closeModal);
            document.getElementById('taskModalCancelBtn')?.addEventListener('click', closeModal);
            document.getElementById('taskModalSaveBtn')?.addEventListener('click', saveTask);
            document.getElementById('taskDetailModalCloseBtn')?.addEventListener('click', closeDetailModal);
            document.getElementById('taskDetailModalFooterCloseBtn')?.addEventListener('click', closeDetailModal);
            document.getElementById('roadmapEntityModalCloseBtn')?.addEventListener('click', closeRoadmapEntityModal);
            document.getElementById('roadmapEntityModalCancelBtn')?.addEventListener('click', closeRoadmapEntityModal);
            document.getElementById('roadmapEntityModalSaveBtn')?.addEventListener('click', saveRoadmapEntity);
            document.getElementById('shortcutsModalCloseBtn')?.addEventListener('click', closeShortcutsModal);
            document.getElementById('shortcutsModalFooterCloseBtn')?.addEventListener('click', closeShortcutsModal);
            document.getElementById('helpModalCloseBtn')?.addEventListener('click', closeHelpModal);
            document.getElementById('helpModalFooterCloseBtn')?.addEventListener('click', closeHelpModal);
            document.getElementById('undoBtn')?.addEventListener('click', performUndo);
            document.getElementById('taskAssigneeAddBtn')?.addEventListener('click', addTaskAssigneeFromComposer);
            document.getElementById('taskTagAddBtn')?.addEventListener('click', addTaskTagFromComposer);
            document.getElementById('taskChecklistAddBtn')?.addEventListener('click', addTaskChecklistItemFromComposer);
            document.getElementById('taskAttachmentsAddBtn')?.addEventListener('click', triggerTaskAttachmentsPicker);
            document.getElementById('resetPortfolioFiltersBtn')?.addEventListener('click', resetPortfolioViewFiltersAndSort);
            document.getElementById('taskBlocked')?.addEventListener('change', onTaskBlockedChange);
            document.getElementById('portfolioSearchInput')?.addEventListener('input', renderPortfolio);
            document.getElementById('portfolioArchiveFilter')?.addEventListener('change', renderPortfolio);
            document.getElementById('portfolioBlockedFilter')?.addEventListener('change', renderPortfolio);
            document.getElementById('portfolioAssigneeFilter')?.addEventListener('change', renderPortfolio);
            document.getElementById('portfolioPriorityFilter')?.addEventListener('change', renderPortfolio);
            document.getElementById('portfolioEffortFilter')?.addEventListener('change', renderPortfolio);
            document.getElementById('portfolioSortSelect')?.addEventListener('change', onPortfolioSortSelectChange);
            document.getElementById('taskChecklistNewItem')?.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addTaskChecklistItemFromComposer();
            });
            document.getElementById('taskAssigneeNewItem')?.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addTaskAssigneeFromComposer();
            });
            document.getElementById('taskTagNewItem')?.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                addTaskTagFromComposer();
            });
            document.getElementById('taskTagItems')?.addEventListener('click', handleTagEditorClick);
            document.getElementById('taskAttachmentsInput')?.addEventListener('change', handleTaskAttachmentsInputChange);
            document.getElementById('taskModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('taskModal')) {
                    closeModal();
                }
            });
            document.getElementById('taskDetailModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('taskDetailModal')) {
                    closeDetailModal();
                }
            });
            document.getElementById('roadmapEntityModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('roadmapEntityModal')) {
                    closeRoadmapEntityModal();
                }
            });
            document.getElementById('shortcutsModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('shortcutsModal')) {
                    closeShortcutsModal();
                }
            });
            document.getElementById('helpModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('helpModal')) {
                    closeHelpModal();
                }
            });
            Refs.portfolioBoardsChips?.addEventListener('click', handlePortfolioBoardChipsClick);
            Refs.portfolioViewModeToggle?.addEventListener('click', handlePortfolioViewModeToggleClick);
            Refs.portfolioTimelinePanel?.addEventListener('click', handleTimelinePanelClick);
            Refs.portfolioTimelinePanel?.addEventListener('input', handleTimelinePanelInput);
            Refs.portfolioTimelinePanel?.addEventListener('pointerdown', handleTimelinePanelPointerDown);
            Refs.portfolioBoard?.addEventListener('click', handlePortfolioBoardClick);
            Refs.portfolioBoard?.addEventListener('change', handlePortfolioBoardChange);
            Refs.portfolioRoadmapView?.addEventListener('click', handlePortfolioRoadmapViewClick);
            Refs.portfolioCalendarView?.addEventListener('click', handlePortfolioCalendarViewClick);
            Refs.portfolioBulkActions?.addEventListener('click', handlePortfolioBulkActionsClick);
            Refs.portfolioBoard?.addEventListener('pointerover', handlePortfolioBoardPointerOver);
            Refs.portfolioBoard?.addEventListener('pointerout', handlePortfolioBoardPointerOut);
            Refs.portfolioRoadmapView?.addEventListener('pointerover', handlePortfolioBoardPointerOver);
            Refs.portfolioRoadmapView?.addEventListener('pointerout', handlePortfolioBoardPointerOut);
            document.getElementById('taskChecklistItems')?.addEventListener('click', handleTaskChecklistEditorClick);
            document.getElementById('taskChecklistItems')?.addEventListener('input', handleTaskChecklistEditorInput);
            document.getElementById('taskChecklistItems')?.addEventListener('change', handleTaskChecklistEditorChange);
            document.getElementById('taskChecklistItems')?.addEventListener('dragstart', handleTaskChecklistEditorDragStart);
            document.getElementById('taskChecklistItems')?.addEventListener('dragover', handleTaskChecklistEditorDragOver);
            document.getElementById('taskChecklistItems')?.addEventListener('drop', handleTaskChecklistEditorDrop);
            document.getElementById('taskChecklistItems')?.addEventListener('dragend', handleTaskChecklistEditorDragEnd);
            document.getElementById('taskAssigneeItems')?.addEventListener('click', handleTaskAssigneeEditorClick);
            document.getElementById('taskAssigneeItems')?.addEventListener('input', handleTaskAssigneeEditorInput);
            document.getElementById('taskAttachmentsList')?.addEventListener('click', handleTaskAttachmentsEditorClick);
            document.getElementById('detailChecklist')?.addEventListener('change', handleDetailChecklistChange);
            document.addEventListener('keydown', dispatchShortcutKeydown);
            document.addEventListener('click', handleDocumentClickForSelection);
            document.addEventListener('pointerup', handleTimelineSliderPointerCommit);
            document.addEventListener('pointercancel', handleTimelineSliderPointerCommit);
            window.addEventListener('popstate', () => {
                applyUrlState();
                renderPortfolio();
            });
        }

        // Persistence calls back into the UI through these two seams; see
        // src/persistence/projectFiles.js.
        setPersistenceHost({
            onStatusChanged: renderPortfolioBoardChips,
            applySnapshot: applySnapshotToBoardRecord
        });

        cacheRefs();
        bindStaticUiEvents();
        init();


        // TEMPORARY: bridges the rest of the Playwright suite, which calls many
        // internal app functions and reads/writes internal app state directly via
        // page.evaluate (e.g. buildPortfolioTasks(), portfolioBoards). These were
        // implicit globals under the original classic <script> tag; type="module"
        // no longer exposes top-level declarations on window.
        //
        // 60 of the 90 Playwright tests depend on this bridge, so it cannot be
        // removed until those tests are rewritten. Unlike the pure domain functions
        // -- which are now real modules in src/domain/ and tested directly by
        // Vitest -- these are UI and stateful internals that become React
        // components and store actions in Phase 2. Retiring this bridge is part of
        // that work: each entry disappears when the test driving it is converted to
        // a locator-based assertion or a unit test against the store.
        Object.defineProperties(window, {
            portfolioBoards: {
                get: () => appState.portfolioBoards,
                set: (value) => { appState.portfolioBoards = value; },
                configurable: true
            },
            portfolioSortKey: {
                get: () => appState.portfolioSortKey,
                set: (value) => { appState.portfolioSortKey = value; },
                configurable: true
            },
            portfolioSortDir: {
                get: () => appState.portfolioSortDir,
                set: (value) => { appState.portfolioSortDir = value; },
                configurable: true
            },
            selectedPortfolioBoardId: {
                get: () => appState.selectedPortfolioBoardId,
                set: (value) => { appState.selectedPortfolioBoardId = value; },
                configurable: true
            },
            portfolioDetailContext: {
                get: () => appState.portfolioDetailContext,
                set: (value) => { appState.portfolioDetailContext = value; },
                configurable: true
            },
            portfolioTimelineSelection: {
                get: () => appState.portfolioTimelineSelection,
                set: (value) => { appState.portfolioTimelineSelection = value; },
                configurable: true
            },
            selectedPortfolioViewMode: {
                get: () => appState.selectedPortfolioViewMode,
                set: (value) => { appState.selectedPortfolioViewMode = value; },
                configurable: true
            }
        });

        Object.assign(window, {
            ATTACHMENT_HARD_MAX_BYTES,
            TaskFormValidator,
            applyUrlState,
            buildPortfolioTasks,
            captureTaskTimelineSnapshot,
            checkProjectFilesNow,
            editPortfolioTask,
            ensureBoardTimelineBaseline,
            getPortfolioBoardRecord,
            getProjectSaveState,
            getRoadmapDatePosition,
            getRoadmapExtension,
            getSelectedBoardTimelineViewState,
            getVisibleRoadmapDateRange,
            isHistoricalPreviewActiveForBoard,
            isTaskOverdue,
            parseRoadmapIsoDate,
            reconstructBoardStateFromTimeline,
            recordTaskTimelineEvent,
            renderPortfolio,
            runPortfolioTaskMutation,
            setPortfolioSort,
            setPortfolioTimelineSelection,
            setTaskModalAttachmentDraft,
            syncPortfolioTimelineSelectionToLatest,
            todayLocalIsoDate,
            touchTask
        });
