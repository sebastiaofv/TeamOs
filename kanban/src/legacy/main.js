import '../styles/tailwind.css';
import '../styles/legacy.css';
import { escapeRegExp, formatFileSize, assigneesToInput, checklistToInput } from '../domain/util.js';
import { normalizeAssignee, normalizeAssignees, parseAssigneesInput, formatAssignees, taskAssignees, taskHasAssignee, normalizeTags, normalizeBlockerReason, normalizeChecklist, normalizeEffort, normalizePortfolioBlockedFilter, normalizePriority, parseChecklistInput, getBoardTagSuggestions, isTaskOverdue, normalizeTaskStatus, formatTaskStatusAge, normalizeTask } from '../domain/task.js';
import { createEmptyRoadmapExtension, formatRoadmapDateRange, getRoadmapEntityConfig, normalizeRoadmapRef, getRoadmapItemTitle, getRoadmapExtension } from '../domain/roadmap.js';
import { normalizePortfolioSortDir, normalizePortfolioSortKey, normalizePortfolioViewMode, portfolioProjectColorKey, createPortfolioProjectColor, comparePortfolioRows } from '../domain/board.js';
import { normalizeAttachmentRecord, calculateBoardAttachmentBytes, getTaskAttachments } from '../domain/attachments.js';
import { createUtcDate, normalizeDueDate, formatDateTime, formatDueDateForUi } from '../domain/calendar.js';
import { createBoardStateSnapshot } from '../domain/serialize.js';
import { getBoardTimelineData, reconstructBoardStateFromTimeline } from '../domain/timeline.js';
import { getPortfolioBoardRecord, notifyAppStateChanged, useAppStore } from '../state/store.js';
import { Logger } from '../logger.js';
import { setPersistenceHost, syncProjectSaveStates, primeProjectFileBaselines } from '../persistence/projectFiles.js';
import { openDialog, closeDialog } from '../actions/dialogs.js';
import { buildPortfolioCalendarViewModel } from '../selectors/portfolioViews.js';
import {
            applySnapshotToBoardRecord,
            canUsePortfolioTaskMutations,
            clearPortfolioBulkSelection,
            closeRoadmapEntity as closeRoadmapEntityModal,
            closeTaskDetail as closeDetailModal,
            closeTaskEditor,
            configurePortfolioMutationActions,
            deletePortfolioTask,
            deleteRoadmapEntity,
            getSelectedPortfolioBulkTaskIds,
            handleTimelineSliderPointerCommit,
            movePortfolioTaskToStatus,
            notifyPortfolioMutationUnavailable,
            togglePortfolioArchiveTask
        } from '../actions/portfolioMutations.js';
        import {
            appendPortfolioRecords,
            configurePortfolioControlActions,
            DEFAULT_PORTFOLIO_FILTERS,
            resetPortfolioFilters,
            selectPortfolioBoard,
            setSelectedPortfolioBoardId
        } from '../actions/portfolioControls.js';
        import {
            configurePortfolioFileActions,
            createNewProject,
            importPortfolioProjects
        } from '../actions/portfolioFiles.js';
        import {
            EFFORT_BUCKETS,
            defaultColumns
        } from '../domain/constants.js';
        const Refs = {};
        const getState = () => useAppStore.getState();


        function readQueryParam(key, fallback = '') {
            const params = new URLSearchParams(window.location.search);
            return params.get(key) ?? fallback;
        }






        function updateUrlState() {
            const params = new URLSearchParams();

            const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(getState().portfolioFilters || {}) };
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
            if (getState().portfolioSortKey !== 'priority') params.set('ps', getState().portfolioSortKey);
            if (getState().portfolioSortDir === 'desc') params.set('pd', getState().portfolioSortDir);
            if (getState().selectedPortfolioBoardId) params.set('pb', getState().selectedPortfolioBoardId);
            if (getState().selectedPortfolioViewMode === 'calendar' && getState().portfolioBoards.length > 0) {
                params.set('pv', getState().selectedPortfolioViewMode);
            } else if (getState().selectedPortfolioBoardId && getState().selectedPortfolioViewMode === 'roadmap') {
                params.set('pv', getState().selectedPortfolioViewMode);
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

            getState().portfolioFilters = {
                search: portfolioSearch,
                priority: ['', 'high', 'medium', 'low'].includes(portfolioPriority) ? portfolioPriority : '',
                assignee: normalizeAssignee(portfolioAssignee),
                blocked: normalizePortfolioBlockedFilter(portfolioBlocked),
                effort: ['', ...EFFORT_BUCKETS].includes(portfolioEffort) ? portfolioEffort : '',
                archive: ['active', 'all', 'archived'].includes(portfolioArchive) ? portfolioArchive : 'active'
            };
            getState().portfolioSortKey = normalizePortfolioSortKey(portfolioSort);
            getState().portfolioSortDir = normalizePortfolioSortDir(portfolioSortDirParam);
            setSelectedPortfolioBoardId(portfolioBoard);
            getState().selectedPortfolioViewMode = normalizePortfolioViewMode(portfolioViewMode);
            if (!getState().selectedPortfolioBoardId && getState().selectedPortfolioViewMode !== 'calendar') {
                getState().selectedPortfolioViewMode = 'board';
            }
            renderPortfolio();
        }

        function updateDocumentTitle() {
            document.title = 'TeamOS → Kanban';
        }












































        function getPortfolioRoadmapExpandedRows(boardId) {
            if (!boardId) return {};
            const expandedRows = getState().portfolioRoadmapExpandedRowsByBoardId[boardId];
            if (expandedRows && typeof expandedRows === 'object' && !Array.isArray(expandedRows)) return expandedRows;
            getState().portfolioRoadmapExpandedRowsByBoardId[boardId] = {};
            return getState().portfolioRoadmapExpandedRowsByBoardId[boardId];
        }

        function isPortfolioRoadmapRowExpanded(boardId, key) {
            return Boolean(getPortfolioRoadmapExpandedRows(boardId)[key]);
        }

        function togglePortfolioRoadmapRowExpanded(boardId, key) {
            if (!boardId || !key) return;
            const next = { ...getPortfolioRoadmapExpandedRows(boardId) };
            next[key] = !next[key];
            getState().portfolioRoadmapExpandedRowsByBoardId[boardId] = next;
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

















        function syncPortfolioProjectColors() {
            const usedSeeds = new Set();
            let nextSeed = 0;

            getState().portfolioBoards.forEach((board) => {
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

            getState().portfolioBoards.forEach((board) => {
                if (!board || Number.isInteger(board.colorSeed)) return;
                while (usedSeeds.has(nextSeed)) {
                    nextSeed += 1;
                }
                board.colorSeed = nextSeed;
                usedSeeds.add(nextSeed);
                nextSeed += 1;
            });

            getState().nextPortfolioProjectColorSeed = nextSeed;

            const usedColorKeys = new Set();
            getState().portfolioBoards
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
            getState().portfolioTasks = getState().portfolioBoards.flatMap((board, boardIndex) => {
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
            if (getState().portfolioTimelineSelection.boardId !== boardId || !Number.isInteger(getState().portfolioTimelineSelection.eventIndex)) {
                return maxIndex;
            }
            return Math.max(0, Math.min(maxIndex, getState().portfolioTimelineSelection.eventIndex));
        }

        function isPortfolioTimelineExpanded(boardId) {
            return Boolean(boardId && getState().portfolioTimelineExpandedByBoardId[boardId] === true);
        }

        function cachePortfolioTimelineListScrollPosition(panel = document.getElementById('portfolioTimelinePanel')) {
            if (!panel) return;
            const boardId = panel.dataset.boardId || '';
            const list = panel.querySelector('.timeline-event-list');
            if (!boardId || !list) return;
            getState().portfolioTimelineListScrollTopByBoardId[boardId] = list.scrollTop;
        }

        function restorePortfolioTimelineListScrollPosition(boardId, panel = document.getElementById('portfolioTimelinePanel')) {
            if (!boardId || !panel) return;
            const list = panel.querySelector('.timeline-event-list');
            if (!list) return;
            const scrollTop = getState().portfolioTimelineListScrollTopByBoardId[boardId];
            if (!Number.isFinite(scrollTop)) return;
            list.scrollTop = scrollTop;
        }

        function buildPortfolioRowsFromBoardData(boardRecord, boardData, options = {}) {
            if (!boardRecord || !boardData) return [];
            const normalizedBoard = createBoardStateSnapshot(boardData);
            const statusMap = Object.fromEntries((normalizedBoard.board.columns || []).map((col) => [col.status, col.title]));
            const canMutate = Boolean(boardRecord.handle) && options.canMutate !== false;
            const historical = Boolean(options.historical);
            return (normalizedBoard.board.tasks || []).map((task, taskIndex) => ({
                boardIndex: getState().portfolioBoards.findIndex((board) => board.id === boardRecord.id),
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
            if (!getState().selectedPortfolioBoardId) return null;
            const boardRecord = getPortfolioBoardRecord(getState().selectedPortfolioBoardId);
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

        function getFilteredSortedPortfolioRows() {
            const filters = { ...DEFAULT_PORTFOLIO_FILTERS, ...(getState().portfolioFilters || {}) };
            const search = String(filters.search || '').trim().toLowerCase();
            const priorityFilter = filters.priority || '';
            const assigneeFilter = normalizeAssignee(filters.assignee || '');
            const blockedFilter = normalizePortfolioBlockedFilter(filters.blocked || 'all');
            const effortFilter = filters.effort || '';
            const archiveFilter = filters.archive || 'active';
            const sortBy = normalizePortfolioSortKey(getState().portfolioSortKey);
            const sortDir = normalizePortfolioSortDir(getState().portfolioSortDir);
            const timelineView = getSelectedBoardTimelineViewState();
            const sourceRows = (timelineView && timelineView.isPreview && timelineView.projectedBoard)
                ? buildPortfolioRowsFromBoardData(timelineView.boardRecord, timelineView.projectedBoard, {
                    canMutate: false,
                    historical: true
                })
                : getState().portfolioTasks;

            return sourceRows
                .filter(item => {
                    const task = item.task;
                    if (getState().selectedPortfolioBoardId && item.boardId !== getState().selectedPortfolioBoardId) return false;
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

        function canUsePortfolioViewMode(mode) {
            const normalized = normalizePortfolioViewMode(mode);
            if (normalized === 'calendar') return getState().portfolioBoards.length > 0;
            if (normalized === 'roadmap') return Boolean(getState().selectedPortfolioBoardId);
            return getState().portfolioBoards.length > 0;
        }

        function normalizePortfolioViewModeState() {
            if (getState().portfolioBoards.length === 0) {
                getState().selectedPortfolioViewMode = 'board';
                return;
            }

            getState().selectedPortfolioViewMode = normalizePortfolioViewMode(getState().selectedPortfolioViewMode);
            if (!canUsePortfolioViewMode(getState().selectedPortfolioViewMode)) {
                getState().selectedPortfolioViewMode = 'board';
            }
        }

        function syncSelectedPortfolioBoardSelection() {
            if (!getState().selectedPortfolioBoardId) {
                clearPortfolioBulkSelection();
                if (getState().portfolioBoards.length === 0) {
                    getState().selectedPortfolioViewMode = 'board';
                } else if (getState().selectedPortfolioViewMode === 'roadmap') {
                    getState().selectedPortfolioViewMode = 'board';
                } else {
                    getState().selectedPortfolioViewMode = normalizePortfolioViewMode(getState().selectedPortfolioViewMode);
                }
                return;
            }
            if (!getPortfolioBoardRecord(getState().selectedPortfolioBoardId)) {
                setSelectedPortfolioBoardId('', { resetViewModeWhenEmpty: false });
                clearPortfolioBulkSelection();
                if (getState().selectedPortfolioViewMode !== 'calendar') {
                    getState().selectedPortfolioViewMode = 'board';
                }
                return;
            }
            getState().selectedPortfolioViewMode = normalizePortfolioViewMode(getState().selectedPortfolioViewMode);
        }

        function renderPortfolio(options = {}) {
            const boardWrap = document.getElementById('portfolioBoardWrap');
            if (!boardWrap) return;

            cachePortfolioTimelineListScrollPosition();
            syncSelectedPortfolioBoardSelection();
            normalizePortfolioFilterState();
            const timelineView = getSelectedBoardTimelineViewState();
            getState().portfolioTimelineView = timelineView?.boardRecord
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
            getState().portfolioVisibleRows = rows;
            syncSelectedPortfolioCardWithVisibleRows(rows);
            syncHoveredPortfolioCardWithVisibleRows(rows);
            boardWrap.classList.remove('hidden');
            normalizePortfolioViewModeState();

            const boardGrid = document.getElementById('portfolioBoard');
            const roadmapView = document.getElementById('portfolioRoadmapView');
            const calendarView = document.getElementById('portfolioCalendarView');
            const roadmapActive = Boolean(getState().selectedPortfolioBoardId) && getState().selectedPortfolioViewMode === 'roadmap';
            const calendarActive = getState().portfolioBoards.length > 0 && getState().selectedPortfolioViewMode === 'calendar';
            if (boardGrid) boardGrid.classList.toggle('hidden', roadmapActive || calendarActive);
            if (roadmapView) roadmapView.classList.toggle('hidden', !roadmapActive);
            if (calendarView) calendarView.classList.toggle('hidden', !calendarActive);

            updateUrlState();
            notifyAppStateChanged();
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

            getState().portfolioDetailContext = { boardId, taskId, readOnly };
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
            getState().portfolioEditContext = { boardId, taskId };
            getState().portfolioCreateContext = null;
            getState().pendingNewTaskStatus = null;
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

            getState().portfolioCreateContext = { boardId, status };
            getState().portfolioEditContext = null;
            getState().pendingNewTaskStatus = null;
            openDialog('taskEditor', buildTaskEditorViewModel(boardRecord, null, { preferredDueDate: options.preferredDueDate }));
        }


        function getPortfolioAssigneeNames() {
            const seen = new Set();
            const values = [];
            getState().portfolioTasks.forEach((item) => {
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

            getState().portfolioTasks.forEach((item) => {
                taskAssignees(item?.task).forEach(addName);
            });

            return values.sort((a, b) => a.localeCompare(b));
        }

        function normalizePortfolioFilterState() {
            const current = { ...DEFAULT_PORTFOLIO_FILTERS, ...(getState().portfolioFilters || {}) };
            const next = {
                search: String(current.search || ''),
                archive: ['active', 'all', 'archived'].includes(current.archive) ? current.archive : 'active',
                blocked: normalizePortfolioBlockedFilter(current.blocked || 'all'),
                assignee: normalizeAssignee(current.assignee || ''),
                priority: ['', 'high', 'medium', 'low'].includes(current.priority) ? current.priority : '',
                effort: ['', ...EFFORT_BUCKETS].includes(current.effort) ? current.effort : ''
            };
            if (getState().portfolioBoards.length > 0 && next.assignee && !getPortfolioAssigneeNames().some(name => name === next.assignee)) {
                next.assignee = '';
            }
            if (Object.keys(next).some(key => next[key] !== getState().portfolioFilters?.[key])) {
                getState().portfolioFilters = next;
            }
        }

        // Legacy import compatibility: older boards may still carry
        // pre-v1 settings shapes or a single assignee field.

























        // Legacy import compatibility: older boards stored attachments in
        // extensions.teamOsKanban.taskAttachments instead of task.attachments.































        function init() {
            if (typeof cacheRefs === 'function') {
                cacheRefs();
            }
            buildShortcutRegistry();
            updateDocumentTitle();
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

        function openRoadmapEntityModal(kind, itemId = '', options = {}) {
            const boardId = getState().selectedPortfolioBoardId;
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

            getState().roadmapEntityContext = {
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

        function isSelectedPortfolioCard(boardId, taskId) {
            if (!getState().selectedPortfolioCardRef) return false;
            return getState().selectedPortfolioCardRef.boardId === boardId && Number(getState().selectedPortfolioCardRef.taskId) === Number(taskId);
        }

        function setHoveredPortfolioCard(boardId, taskId) {
            if (!boardId || taskId === null || taskId === undefined) {
                getState().hoveredPortfolioCardRef = null;
                return;
            }
            getState().hoveredPortfolioCardRef = { boardId, taskId: Number(taskId) };
        }

        function setSelectedPortfolioCard(boardId, taskId) {
            if (!boardId || taskId === null || taskId === undefined) {
                getState().selectedPortfolioCardRef = null;
                return;
            }
            getState().selectedPortfolioCardRef = { boardId, taskId: Number(taskId) };
        }

        function syncSelectedPortfolioCardWithVisibleRows(rows) {
            if (!getState().selectedPortfolioCardRef) return;
            const visible = Array.isArray(rows) ? rows : [];
            const exists = visible.some(
                (row) => row.boardId === getState().selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(getState().selectedPortfolioCardRef.taskId)
            );
            if (!exists) {
                getState().selectedPortfolioCardRef = null;
            }
        }

        function syncHoveredPortfolioCardWithVisibleRows(rows) {
            if (!getState().hoveredPortfolioCardRef) return;
            const visible = Array.isArray(rows) ? rows : [];
            const exists = visible.some(
                (row) => row.boardId === getState().hoveredPortfolioCardRef.boardId && Number(row.taskId) === Number(getState().hoveredPortfolioCardRef.taskId)
            );
            if (!exists) {
                getState().hoveredPortfolioCardRef = null;
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
            if (!getState().selectedPortfolioCardRef) return;
            const selector = `.portfolio-task-card[data-board-id="${cssEscapeValue(getState().selectedPortfolioCardRef.boardId)}"][data-task-id="${cssEscapeValue(getState().selectedPortfolioCardRef.taskId)}"]`;
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
                getState().selectedPortfolioCardRef = null;
                renderPortfolio();
                return;
            }

            const currentIndex = getState().selectedPortfolioCardRef
                ? rows.findIndex((row) => row.boardId === getState().selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(getState().selectedPortfolioCardRef.taskId))
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
            if (!getState().selectedPortfolioCardRef) return null;
            return getVisiblePortfolioRowsForShortcuts().find(
                (row) => row.boardId === getState().selectedPortfolioCardRef.boardId && Number(row.taskId) === Number(getState().selectedPortfolioCardRef.taskId)
            ) || null;
        }

        function getHoveredPortfolioRow() {
            if (!getState().hoveredPortfolioCardRef) return null;
            return getVisiblePortfolioRowsForShortcuts().find(
                (row) => row.boardId === getState().hoveredPortfolioCardRef.boardId && Number(row.taskId) === Number(getState().hoveredPortfolioCardRef.taskId)
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

        function cyclePortfolioProjectChip(step) {
            const ids = [''].concat(getState().portfolioBoards.map((board) => board.id));
            if (ids.length === 0) return;
            let idx = ids.indexOf(getState().selectedPortfolioBoardId || '');
            if (idx < 0) idx = 0;
            const next = (idx + step + ids.length) % ids.length;
            selectPortfolioBoard(ids[next]);
        }

        function getShortcutModalContext() {
            const taskModalOpen = getState().activeDialog === 'taskEditor';
            const detailModalOpen = getState().activeDialog === 'taskDetail';
            const roadmapEntityModalOpen = getState().activeDialog === 'roadmapEntity';
            const shortcutsModalOpen = getState().activeDialog === 'shortcuts';
            const helpModalOpen = getState().activeDialog === 'help';
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
            getState().ShortcutRegistry = [
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
                    handler: () => createNewProject()
                },
                {
                    id: 'import-projects',
                    section: 'Global',
                    keys: ['I'],
                    description: 'Import projects',
                    contexts: ['global'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'i' || e.key === 'I'),
                    handler: () => importPortfolioProjects()
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
                    handler: () => resetPortfolioFilters()
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
                    when: () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext.readOnly),
                    handler: () => {
                        if (!getState().portfolioDetailContext) return;
                        editPortfolioTask(getState().portfolioDetailContext.boardId, getState().portfolioDetailContext.taskId);
                    }
                },
                {
                    id: 'detail-archive',
                    section: 'Task Detail',
                    keys: ['X'],
                    description: 'Archive/restore open task',
                    contexts: ['detailModal'],
                    match: (e) => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'x' || e.key === 'X'),
                    when: () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext.readOnly),
                    handler: () => {
                        if (!getState().portfolioDetailContext) return;
                        togglePortfolioArchiveTask(getState().portfolioDetailContext.boardId, getState().portfolioDetailContext.taskId);
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
            if (!getState().ShortcutRegistry || getState().ShortcutRegistry.length === 0) {
                buildShortcutRegistry();
            }
            const context = getShortcutModalContext();
            const contextName = context.noModal ? 'global' : context.modal;

            for (const entry of getState().ShortcutRegistry) {
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
                openPortfolioCreateTaskModal(getState().selectedPortfolioBoardId, addTaskCard.dataset.status || '');
                return;
            }

            const taskCard = event.target.closest('.portfolio-task-card');
            if (!taskCard) return;
            if (Date.now() < getState().suppressPortfolioCardClickUntil) return;
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
                    togglePortfolioRoadmapRowExpanded(getState().selectedPortfolioBoardId, `${kind}:${itemId}`);
                    renderPortfolio();
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
            if (row && getState().selectedPortfolioBoardId) {
                togglePortfolioRoadmapRowExpanded(getState().selectedPortfolioBoardId, `${row.dataset.roadmapKind}:${row.dataset.roadmapId}`);
                renderPortfolio();
            }
        }

        function shiftPortfolioCalendarMonth(step) {
            const period = buildPortfolioCalendarViewModel(getState());
            const current = createUtcDate(period.year, period.month, 1);
            const next = createUtcDate(current.getUTCFullYear(), current.getUTCMonth() + step, 1);
            getState().portfolioCalendarYear = next.getUTCFullYear();
            getState().portfolioCalendarMonth = next.getUTCMonth();
            getState().portfolioCalendarView = 'month';
        }

        function openPortfolioCalendarTaskDetails(boardId, taskId) {
            const viewState = getState().selectedPortfolioBoardId === boardId ? getSelectedBoardTimelineViewState() : null;
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
                    getState().portfolioCalendarYear = Number(button.dataset.year);
                    getState().portfolioCalendarMonth = Number(button.dataset.month);
                    getState().portfolioCalendarView = 'month';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-back-to-year') {
                    getState().portfolioCalendarView = 'year';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-toggle-mode') {
                    getState().portfolioCalendarDisplayMode = getState().portfolioCalendarDisplayMode === 'heatmap' ? 'calendar' : 'heatmap';
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-prev-year') {
                    getState().portfolioCalendarYear = buildPortfolioCalendarViewModel(getState()).year - 1;
                    renderPortfolio();
                    return;
                }
                if (action === 'calendar-next-year') {
                    getState().portfolioCalendarYear = buildPortfolioCalendarViewModel(getState()).year + 1;
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
            if (createCell && getState().selectedPortfolioBoardId) {
                openPortfolioCreateTaskModal(getState().selectedPortfolioBoardId, '', {
                    preferredDueDate: createCell.dataset.dueDate || ''
                });
            }
        }

        function openCreateSprintFromSelectionModal() {
            const boardId = getState().selectedPortfolioBoardId;
            if (!boardId) return;
            if (getSelectedPortfolioBulkTaskIds(boardId).length === 0) return;
            openRoadmapEntityModal('sprints', '', { mode: 'create-sprint-from-selection' });
        }

        function openAssignExistingSprintFromSelectionModal() {
            const boardId = getState().selectedPortfolioBoardId;
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
                getState().hoveredPortfolioCardRef
                && getState().hoveredPortfolioCardRef.boardId === (taskCard.dataset.boardId || '')
                && Number(getState().hoveredPortfolioCardRef.taskId) === Number(taskCard.dataset.taskId)
            ) {
                getState().hoveredPortfolioCardRef = null;
            }
        }

        function handleDocumentClickForSelection(event) {
            if (!getState().selectedPortfolioCardRef) return;
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
            document.getElementById('openShortcutsBtn')?.addEventListener('click', openShortcutsModal);
            document.getElementById('openHelpBtn')?.addEventListener('click', openHelpModal);
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

        // Configure the store-backed mutation module with the two legacy
        // derived-state callbacks it still needs while the board view remains
        // hosted in this runtime. React action callers use the same instance.
        configurePortfolioMutationActions({
            buildPortfolioTasks,
            renderPortfolio,
            openPortfolioTaskDetails
        });

        // Persistence calls back into the mutation module only when an
        // external file snapshot must replace a board.
        setPersistenceHost({
            applySnapshot: applySnapshotToBoardRecord
        });

        configurePortfolioControlActions({
            buildPortfolioTasks,
            renderPortfolio,
            updateUrlState,
            primeProjectFiles: primeProjectFileBaselines,
            openCreateSprintModal: () => openCreateSprintFromSelectionModal(),
            openAssignSprintModal: () => openAssignExistingSprintFromSelectionModal()
        });
        configurePortfolioFileActions({
            appendPortfolioRecords
        });

        cacheRefs();
        bindStaticUiEvents();
        init();
