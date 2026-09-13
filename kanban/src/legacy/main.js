import '../styles/legacy.css';
import { isAbortError, formatErrorMessage, isFileDrag, nowIso, escapeRegExp, formatFileSize, assigneesToInput, checklistToInput, hasRequiredExtension, normalizeTheme, assertRequiredExtension } from '../domain/util.js';
import { normalizeAssignee, normalizeAssignees, parseAssigneesInput, formatAssignees, taskAssignees, taskHasAssignee, normalizeTags, buildTaskFieldsFromDraft, normalizeBlockerReason, normalizeChecklist, normalizeEffort, normalizePortfolioBlockedFilter, normalizePriority, parseChecklistInput, getBoardTagSuggestions, nextTaskIdForBoard, touchTask, isTaskOverdue, normalizeTaskStatus, formatTaskStatusAge, resolveCreateTaskStatus, normalizeTask } from '../domain/task.js';
import { addRoadmapDays, createEmptyRoadmapExtension, formatRoadmapDateRange, getRoadmapEntityConfig, normalizeRoadmapDate, normalizeRoadmapRef, slugifyRoadmapEntityId, getRoadmapItemDateBounds, getRoadmapItemTitle, getRoadmapTaskFieldTasks, compareRoadmapItemsByDate, getRoadmapAxisTicks, getRoadmapTimelinePlacement, getRoadmapTodayMarker, getVisibleRoadmapDateRange, getRoadmapExtension, getRoadmapExtensionObject } from '../domain/roadmap.js';
import { normalizePortfolioSortDir, normalizePortfolioSortKey, normalizePortfolioViewMode, portfolioProjectColorKey, slugifyColumnName, createPortfolioProjectColor, createEmptyProjectData, comparePortfolioRows } from '../domain/board.js';
import { normalizeAttachmentRecord, removeLegacyTaskAttachmentsFromExtensions, calculateBoardAttachmentBytes, getTaskAttachments, setTaskAttachments } from '../domain/attachments.js';
import { comparePortfolioCalendarItems, createUtcDate, formatUtcIsoDate, getPortfolioCalendarHeatColor, getPortfolioCalendarItemLabel, getUtcMonthLabel, normalizeDueDate, buildPortfolioCalendarItemStyle, buildPortfolioCalendarMiniMarkerStyle, comparePortfolioCalendarDayItems, doesPortfolioCalendarItemOccurOnDay, formatDateTime, formatDueDateForUi, getPortfolioCalendarMiniDayMarkers, getPortfolioCalendarMiniMonthCellCount, getPortfolioCalendarMonthHeatStats, getPortfolioCalendarTaskCountsByDay, getPortfolioCalendarYearHeatStats, todayLocalIsoDate, buildPortfolioCalendarRoadmapSpanStyle, doesPortfolioCalendarItemIntersectMonth, shouldShowPortfolioCalendarRoadmapLabel } from '../domain/calendar.js';
import { cloneSerializable, getBoardExtensionsObject, createBoardStateSnapshot, serializeBoardDataFromObject } from '../domain/serialize.js';
import { captureTaskTimelineSnapshot, getBoardTimelineData, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline, appendTimelineEvent, recordBoardRestoreTimelineEvent, recordTaskTimelineEvent } from '../domain/timeline.js';
import { formatTaskScore } from '../domain/scoring.js';
import { writeJsonToFileHandle } from '../persistence/fileSystem.js';
import { appState, getPortfolioBoardRecord } from '../state/store.js';
import { Logger } from '../logger.js';
import { BoardRepository } from '../persistence/boardRepository.js';
import { setPersistenceHost, getProjectSaveState, syncProjectSaveStates, primeProjectFileBaselines, checkProjectFilesNow, stopProjectFileWatcher, enqueueProjectSave, retryProjectSave, createPortfolioRecord } from '../persistence/projectFiles.js';
import { notifyAppStateChanged } from '../bridge/appStore.js';
import { openDialog, closeDialog } from '../actions/dialogs.js';
import { setLegacyHost } from '../actions/legacyHost.js';
        import {
            BOARD_FILE_EXTENSION, TASK_TITLE_MAX_LENGTH, EFFORT_BUCKETS, TIMELINE_EXTENSION_KEY,
            ATTACHMENT_MAX_COUNT, ATTACHMENT_HARD_MAX_BYTES, ATTACHMENT_SOFT_WARN_BYTES,
            ATTACHMENT_TASK_SOFT_TOTAL_BYTES, ATTACHMENT_PROJECT_SOFT_TOTAL_BYTES,
            PROJECT_FILE_WATCH_INTERVAL_MS, THEME_STORAGE_KEY, CALENDAR_MONTH_NAMES,
            CALENDAR_WEEKDAY_NAMES, defaultColumns
        } from '../domain/constants.js';
        const Refs = {};
        const DEFAULT_PORTFOLIO_FILTERS = Object.freeze({
            search: '',
            archive: 'active',
            blocked: 'all',
            assignee: '',
            priority: '',
            effort: ''
        });


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

            const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(appState.portfolioFilters || {}) };
            const portfolioSearch = filters.search || '';
            const portfolioPriority = filters.priority || '';
            const portfolioAssignee = filters.assignee || '';
            const portfolioBlocked = normalizePortfolioBlockedFilter(filters.blocked || 'all');
            const portfolioEffort = filters.effort || '';
            const portfolioArchive = filters.archive || 'active';
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

            appState.portfolioFilters = {
                search: portfolioSearch,
                priority: ['', 'high', 'medium', 'low'].includes(portfolioPriority) ? portfolioPriority : '',
                assignee: normalizeAssignee(portfolioAssignee),
                blocked: normalizePortfolioBlockedFilter(portfolioBlocked),
                effort: ['', ...EFFORT_BUCKETS].includes(portfolioEffort) ? portfolioEffort : '',
                archive: ['active', 'all', 'archived'].includes(portfolioArchive) ? portfolioArchive : 'active'
            };
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

        function buildRoadmapEntityOptions(items) {
            return (Array.isArray(items) ? items : []).map((item) => ({ value: item.id, label: item.title }));
        }

        function buildRoadmapSprintOptions(items) {
            return (Array.isArray(items) ? items : []).map((item) => {
                const range = formatRoadmapDateRange(item);
                return { value: item.id, label: range ? `${item.title} • ${range}` : item.title };
            });
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
                closeTaskEditor();
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
            closeTaskEditor();
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
            closeTaskEditor();
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
                closeTaskEditor();
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
            const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(appState.portfolioFilters || {}) };
            const search = String(filters.search || '').trim().toLowerCase();
            const priorityFilter = filters.priority || '';
            const assigneeFilter = normalizeAssignee(filters.assignee || '');
            const blockedFilter = normalizePortfolioBlockedFilter(filters.blocked || 'all');
            const effortFilter = filters.effort || '';
            const archiveFilter = filters.archive || 'active';
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
            closeTaskEditor();

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

        function createPortfolioRoadmapTaskCard(item, searchTerm = '') {
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

        function canUsePortfolioViewMode(mode) {
            const normalized = normalizePortfolioViewMode(mode);
            if (normalized === 'calendar') return appState.portfolioBoards.length > 0;
            if (normalized === 'roadmap') return Boolean(appState.selectedPortfolioBoardId);
            return appState.portfolioBoards.length > 0;
        }

        function normalizePortfolioViewModeState() {
            if (appState.portfolioBoards.length === 0) {
                appState.selectedPortfolioViewMode = 'board';
                return;
            }

            appState.selectedPortfolioViewMode = normalizePortfolioViewMode(appState.selectedPortfolioViewMode);
            if (!canUsePortfolioViewMode(appState.selectedPortfolioViewMode)) {
                appState.selectedPortfolioViewMode = 'board';
            }
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
                track.replaceChildren(...tasks.map((task, taskIndex) => createPortfolioRoadmapTaskCard({
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

            cachePortfolioTimelineListScrollPosition();
            syncSelectedPortfolioBoardSelection();
            normalizePortfolioFilterState();
            const timelineView = getSelectedBoardTimelineViewState();
            appState.portfolioTimelineView = timelineView?.boardRecord
                ? {
                    boardId: timelineView.boardRecord.id,
                    boardTitle: timelineView.boardRecord.title || timelineView.boardRecord.fileName || 'Selected Project',
                    boardFileName: timelineView.boardRecord.fileName || '',
                    hasHandle: Boolean(timelineView.boardRecord.handle),
                    timeline: timelineView.timeline,
                    selectedIndex: timelineView.selectedIndex,
                    selectedEvent: timelineView.selectedEvent,
                    isPreview: timelineView.isPreview,
                    isExpanded: isPortfolioTimelineExpanded(timelineView.boardRecord.id)
                }
                : null;
            const rows = getFilteredSortedPortfolioRows();
            appState.portfolioVisibleRows = rows;
            syncSelectedPortfolioCardWithVisibleRows(rows);
            syncHoveredPortfolioCardWithVisibleRows(rows);
            boardWrap.classList.remove('hidden');
            normalizePortfolioViewModeState();

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
            }

            updateUrlState();
            notifyAppStateChanged();
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


        let taskEditorOpenCount = 0;

        // View model for TaskEditorDialog. `task` is null when creating.
        function buildTaskEditorViewModel(boardRecord, task, options = {}) {
            taskEditorOpenCount += 1;
            const roadmap = getRoadmapExtension(boardRecord.data) || createEmptyRoadmapExtension();
            const phaseOptions = buildRoadmapEntityOptions(roadmap.phases);
            const milestoneOptions = buildRoadmapEntityOptions(roadmap.milestones);
            const knownRef = (optionList, value) => {
                const ref = normalizeRoadmapRef(value);
                return optionList.some((option) => option.value === ref) ? ref : '';
            };
            const normalized = task ? normalizeTask(task) : null;
            const initial = normalized
                ? {
                    title: normalized.title || '',
                    description: normalized.description || '',
                    blocked: Boolean(normalized.blocked),
                    blockerReason: normalized.blocked ? normalizeBlockerReason(normalized.blockerReason) : '',
                    assignees: parseAssigneesInput(assigneesToInput(normalized.assignees)),
                    tags: normalizeTags(normalized.tags),
                    checklist: parseChecklistInput(checklistToInput(normalized.checklist || [])),
                    attachments: getTaskAttachments(boardRecord.data, options.taskId).map(normalizeAttachmentRecord).filter(Boolean),
                    dueDate: normalizeDueDate(normalized.dueDate) || '',
                    priority: normalizePriority(normalized.priority) || '',
                    effort: normalizeEffort(normalized.effort) || '',
                    phaseId: knownRef(phaseOptions, normalized.phaseId),
                    milestoneId: knownRef(milestoneOptions, normalized.milestoneId)
                }
                : {
                    title: '',
                    description: '',
                    blocked: false,
                    blockerReason: '',
                    assignees: [],
                    tags: [],
                    checklist: [],
                    attachments: [],
                    dueDate: normalizeDueDate(options.preferredDueDate || '') || '',
                    priority: '',
                    effort: '',
                    phaseId: '',
                    milestoneId: ''
                };
            return {
                openId: taskEditorOpenCount,
                heading: normalized ? 'Edit Task' : 'New Task',
                initial,
                phaseOptions,
                milestoneOptions,
                assigneePool: getTaskAssigneeSuggestions([]),
                tagSuggestions: getBoardTagSuggestions(boardRecord.data),
                otherAttachmentBytes: calculateBoardAttachmentBytes(boardRecord.data, { excludeTaskId: normalized ? options.taskId : null })
            };
        }

        function buildTaskDetailViewModel(source, taskId, readOnly) {
            const task = normalizeTask(source.task);
            const statusMap = Object.fromEntries((source.boardData.board.columns || []).map(col => [col.status, col.title]));
            const roadmap = getRoadmapExtension(source.boardData);
            return {
                readOnly,
                fields: {
                    title: task.title || '-',
                    description: task.description || '-',
                    assignees: formatAssignees(task.assignees) || '-',
                    tags: normalizeTags(task.tags).join(', ') || '-',
                    blocked: task.blocked ? 'Yes' : 'No',
                    blockerReason: task.blocked ? (normalizeBlockerReason(task.blockerReason) || '-') : '-',
                    priority: task.priority ? (task.priority.charAt(0).toUpperCase() + task.priority.slice(1)) : '-',
                    effort: task.effort || '-',
                    status: (statusMap[task.status] || task.status) || '-',
                    createdAt: formatDateTime(task.createdAt),
                    updatedAt: formatDateTime(task.updatedAt),
                    dueDate: formatDueDateForUi(task.dueDate) || '-',
                    phase: getRoadmapItemTitle(roadmap, 'phases', task.phaseId) || '-',
                    milestone: getRoadmapItemTitle(roadmap, 'milestones', task.milestoneId) || '-',
                    sprint: getRoadmapItemTitle(roadmap, 'sprints', task.sprintId) || '-'
                },
                checklist: normalizeChecklist(task.checklist).map((item) => ({ text: item.text, done: Boolean(item.done) })),
                attachments: getTaskAttachments(source.boardData, taskId)
                    .map(normalizeAttachmentRecord)
                    .filter(Boolean)
                    .map((item) => ({
                        id: item.id,
                        name: item.name,
                        isImage: item.kind === 'image',
                        dataUrl: item.dataUrl,
                        subLabel: `${formatFileSize(item.sizeBytes)}${item.mime ? ` • ${item.mime}` : ''}`
                    }))
            };
        }

        function openPortfolioTaskDetails(boardId, taskId, options = {}) {
            const source = findPortfolioTaskDetailSource(boardId, taskId, options);
            if (!source) return;
            setSelectedPortfolioCard(boardId, taskId);
            const readOnly = options.readOnly === true || !canUsePortfolioTaskMutations(boardId);

            appState.portfolioDetailContext = { boardId, taskId, readOnly };
            openDialog('taskDetail', buildTaskDetailViewModel(source, taskId, readOnly));
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
            appState.portfolioEditContext = { boardId, taskId };
            appState.portfolioCreateContext = null;
            appState.pendingNewTaskStatus = null;
            openDialog('taskEditor', buildTaskEditorViewModel(source.boardRecord, source.task, { taskId }));
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
            openDialog('taskEditor', buildTaskEditorViewModel(boardRecord, null, { preferredDueDate: options.preferredDueDate }));
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

        function normalizePortfolioFilterState() {
            const current = { ...DEFAULT_PORTFOLIO_FILTERS, ...(appState.portfolioFilters || {}) };
            const next = {
                search: String(current.search || ''),
                archive: ['active', 'all', 'archived'].includes(current.archive) ? current.archive : 'active',
                blocked: normalizePortfolioBlockedFilter(current.blocked || 'all'),
                assignee: normalizeAssignee(current.assignee || ''),
                priority: ['', 'high', 'medium', 'low'].includes(current.priority) ? current.priority : '',
                effort: ['', ...EFFORT_BUCKETS].includes(current.effort) ? current.effort : ''
            };
            if (appState.portfolioBoards.length > 0 && next.assignee && !getPortfolioAssigneeNames().some(name => name === next.assignee)) {
                next.assignee = '';
            }
            if (Object.keys(next).some(key => next[key] !== appState.portfolioFilters?.[key])) {
                appState.portfolioFilters = next;
            }
        }

        function setPortfolioFilter(name, value) {
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_PORTFOLIO_FILTERS, name)) return;
            const next = { ...DEFAULT_PORTFOLIO_FILTERS, ...(appState.portfolioFilters || {}) };
            if (name === 'search') next.search = String(value ?? '');
            if (name === 'archive') next.archive = ['active', 'all', 'archived'].includes(value) ? value : 'active';
            if (name === 'blocked') next.blocked = normalizePortfolioBlockedFilter(value);
            if (name === 'assignee') next.assignee = normalizeAssignee(value);
            if (name === 'priority') next.priority = ['', 'high', 'medium', 'low'].includes(value) ? value : '';
            if (name === 'effort') next.effort = ['', ...EFFORT_BUCKETS].includes(value) ? value : '';
            appState.portfolioFilters = next;
            renderPortfolio();
        }

        function setPortfolioSort(value) {
            const nextKey = value === 'name' ? 'task' : normalizePortfolioSortKey(value);
            if (nextKey === appState.portfolioSortKey && appState.portfolioSortDir === 'asc') return;
            appState.portfolioSortKey = nextKey;
            appState.portfolioSortDir = 'asc';
            renderPortfolio();
        }

        function setPortfolioViewMode(mode) {
            const nextMode = normalizePortfolioViewMode(mode);
            if (!canUsePortfolioViewMode(nextMode) || nextMode === appState.selectedPortfolioViewMode) return;
            appState.selectedPortfolioViewMode = nextMode;
            renderPortfolio();
        }

        function showUndo(message, undoFn) {
            appState.undoAction = undoFn;
            appState.undoToast = { message };
            notifyAppStateChanged();
            if (appState.undoTimer) clearTimeout(appState.undoTimer);
            appState.undoTimer = setTimeout(() => hideUndo(), 5000);
        }

        function hideUndo() {
            if (appState.undoTimer) {
                clearTimeout(appState.undoTimer);
                appState.undoTimer = null;
            }
            appState.undoAction = null;
            appState.undoToast = null;
            notifyAppStateChanged();
        }

        function performUndo() {
            if (!appState.undoAction) return;
            const fn = appState.undoAction;
            hideUndo();
            fn();
        }








        // Legacy import compatibility: older boards may still carry
        // pre-v1 settings shapes or a single assignee field.

























        // Legacy import compatibility: older boards stored attachments in
        // extensions.teamOsKanban.taskAttachments instead of task.attachments.































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

        // Every close path, React or legacy, goes through here so the edit and
        // create contexts never outlive the dialog.
        function closeTaskEditor() {
            appState.pendingNewTaskStatus = null;
            appState.portfolioEditContext = null;
            appState.portfolioCreateContext = null;
            closeDialog('taskEditor');
        }

        async function toggleChecklistItem(itemIndex, checked) {
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
            appState.portfolioDetailContext = null;
            closeDialog('taskDetail');
        }

        function closeRoadmapEntityModal() {
            appState.roadmapEntityContext = null;
            closeDialog('roadmapEntity');
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
            const mode = options.mode || 'default';
            const assignExistingMode = mode === 'assign-sprint-from-selection';

            appState.roadmapEntityContext = {
                boardId,
                kind,
                itemId: item?.id || '',
                mode
            };

            openDialog('roadmapEntity', {
                kind,
                itemId: item?.id || '',
                mode,
                heading: mode === 'create-sprint-from-selection'
                    ? 'Create Sprint'
                    : assignExistingMode
                        ? 'Add to Existing Sprint'
                        : `${item ? 'Edit' : 'New'} ${config.label}`,
                saveLabel: assignExistingMode ? 'Add to Sprint' : 'Save Item',
                dateMode: config.dateMode,
                dateLabel: config.dateLabel || 'Date',
                showExistingSprint: assignExistingMode,
                initial: {
                    title: item?.title || '',
                    dueDate: item?.dueDate || '',
                    startDate: item?.startDate || '',
                    endDate: item?.endDate || ''
                },
                sprintOptions: buildRoadmapSprintOptions(roadmap.sprints || []),
                initialFocus: assignExistingMode ? 'existingSprint' : 'title'
            });
        }

        async function saveRoadmapEntity(input = {}) {
            const draft = {
                kind: input.kind,
                itemId: normalizeRoadmapRef(input.itemId),
                title: String(input.title || '').trim(),
                existingSprintId: normalizeRoadmapRef(input.existingSprintId),
                dueDate: normalizeRoadmapDate(input.dueDate),
                startDate: normalizeRoadmapDate(input.startDate),
                endDate: normalizeRoadmapDate(input.endDate)
            };
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
            openDialog('shortcuts');
        }

        function openHelpModal() {
            openDialog('help');
        }

        function focusFieldById(fieldId) {
            if (!fieldId) return;
            document.getElementById(fieldId)?.focus();
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
                        focusFieldId: 'taskBlockerReason'
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




        async function saveTask(draft) {
            const validation = TaskFormValidator.validate(draft);
            if (!validation.ok) {
                if (validation.silent) return;
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
                closeTaskEditor();

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
                closeTaskEditor();
                appState.pendingNewTaskStatus = null;
                return;
            }

            closeTaskEditor();
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
            appState.portfolioFilters = { ...DEFAULT_PORTFOLIO_FILTERS };
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
            const taskModalOpen = appState.activeDialog === 'taskEditor';
            const detailModalOpen = appState.activeDialog === 'taskDetail';
            const roadmapEntityModalOpen = appState.activeDialog === 'roadmapEntity';
            const shortcutsModalOpen = appState.activeDialog === 'shortcuts';
            const helpModalOpen = appState.activeDialog === 'help';
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
                    // TaskEditorDialog owns the draft and handles this key; the
                    // entry stays so the Shortcuts dialog lists it.
                    handler: () => {}
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
                        closeTaskEditor();
                        closeDetailModal();
                        closeRoadmapEntityModal();
                        closeDialog();
                    }
                }
            ];
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
            Refs.portfolioBoard = document.getElementById('portfolioBoard');
            Refs.portfolioRoadmapView = document.getElementById('portfolioRoadmapView');
            Refs.portfolioCalendarView = document.getElementById('portfolioCalendarView');
            Refs.portfolioTimelinePanel = document.getElementById('portfolioTimelinePanel');
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

        function beginPortfolioTimelineSliderDrag(boardId) {
            appState.portfolioTimelineDragState = {
                active: true,
                boardId: boardId || ''
            };
        }

        function handleTimelineSliderPointerCommit() {
            if (!appState.portfolioTimelineDragState.active) return;
            appState.portfolioTimelineDragState = { active: false, boardId: '' };
            renderPortfolio();
        }

        function handlePortfolioBoardClick(event) {
            if (event.target.closest('.portfolio-task-card-select')) {
                return;
            }
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

        function bindStaticUiEvents() {
            Refs.themeToggleBtn?.addEventListener('click', toggleTheme);
            document.getElementById('openShortcutsBtn')?.addEventListener('click', openShortcutsModal);
            document.getElementById('openHelpBtn')?.addEventListener('click', openHelpModal);
            document.getElementById('newProjectBtn')?.addEventListener('click', newProject);
            document.getElementById('importProjectsBtn')?.addEventListener('click', importProjects);
            Refs.portfolioBoard?.addEventListener('click', handlePortfolioBoardClick);
            Refs.portfolioRoadmapView?.addEventListener('click', handlePortfolioRoadmapViewClick);
            Refs.portfolioCalendarView?.addEventListener('click', handlePortfolioCalendarViewClick);
            Refs.portfolioBoard?.addEventListener('pointerover', handlePortfolioBoardPointerOver);
            Refs.portfolioBoard?.addEventListener('pointerout', handlePortfolioBoardPointerOut);
            Refs.portfolioRoadmapView?.addEventListener('pointerover', handlePortfolioBoardPointerOver);
            Refs.portfolioRoadmapView?.addEventListener('pointerout', handlePortfolioBoardPointerOut);
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
            onStatusChanged: () => notifyAppStateChanged(),
            applySnapshot: applySnapshotToBoardRecord
        });

        // React components call back into legacy behaviour through these seams;
        // see src/actions/legacyHost.js.
        setLegacyHost({
            closeTaskDetail: closeDetailModal,
            toggleTaskDetailChecklistItem: toggleChecklistItem,
            closeRoadmapEntity: closeRoadmapEntityModal,
            saveRoadmapEntity,
            performUndo,
            closeTaskEditor,
            saveTask,
            setPortfolioFilter,
            setPortfolioSort,
            setPortfolioViewMode,
            resetPortfolioFilters: resetPortfolioViewFiltersAndSort,
            selectPortfolioBoard,
            removePortfolioBoard: removeProjectFromPortfolio,
            retryPortfolioSave: retryProjectSave,
            clearPortfolioBulkSelection: (boardId) => {
                clearPortfolioBulkSelection(boardId);
                renderPortfolio();
            },
            openCreateSprintFromSelection: () => openCreateSprintFromSelectionModal(),
            openAssignSprintFromSelection: () => openAssignExistingSprintFromSelectionModal(),
            togglePortfolioTaskBulkSelection: (boardId, taskId, checked) => {
                togglePortfolioTaskBulkSelection(boardId, taskId, checked);
                notifyAppStateChanged();
            },
            onPortfolioTaskDragStart,
            onPortfolioTaskDragEnd,
            onPortfolioColumnDragOver,
            onPortfolioColumnDragLeave,
            onPortfolioColumnDrop,
            setPortfolioTimelineSelection: (boardId, eventIndex) => setPortfolioTimelineSelection(boardId, eventIndex, {
                skipTimelinePanel: appState.portfolioTimelineDragState.active
                    && appState.portfolioTimelineDragState.boardId === (boardId || '')
            }),
            movePortfolioTimelineToLatest,
            setPortfolioTimelineExpanded,
            restorePortfolioTimelineSelection,
            beginPortfolioTimelineSliderDrag
        });

        cacheRefs();
        bindStaticUiEvents();
        init();
