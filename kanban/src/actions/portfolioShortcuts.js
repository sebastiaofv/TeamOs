// Keyboard shortcuts: the shortcut list shown in the Shortcuts dialog, the
// keydown dispatcher, and the card/project navigation actions they trigger.

import { createNewProject, importPortfolioProjects } from './portfolioFiles.js';
import { closeDialog, openDialog } from './dialogs.js';
import {
    closeRoadmapEntity,
    closeTaskDetail,
    closeTaskEditor,
    editPortfolioTask,
    movePortfolioTaskToStatus,
    openPortfolioTaskDetails,
    togglePortfolioArchiveTask
} from './portfolioMutations.js';
import { resetPortfolioFilters, selectPortfolioBoard } from './portfolioControls.js';
import { useAppStore } from '../state/store.js';

const getState = () => useAppStore.getState();

function sameCard(left, right) {
    return Boolean(left && right)
        && left.boardId === right.boardId
        && Number(left.taskId) === Number(right.taskId);
}

function findVisibleRow(state, ref) {
    return (state.portfolioVisibleRows || []).find((row) => sameCard(row, ref)) || null;
}

// Card shortcuts act on the hovered card, falling back to the selected one.
function getShortcutTargetRow(state = getState()) {
    return findVisibleRow(state, state.hoveredPortfolioCardRef)
        || findVisibleRow(state, state.selectedPortfolioCardRef);
}

function escapeCssSelectorValue(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(String(value));
    return String(value).replace(/([\\"])/g, '\\$1');
}

export function selectAdjacentPortfolioCard(step) {
    const state = getState();
    const rows = Array.isArray(state.portfolioVisibleRows) ? state.portfolioVisibleRows : [];
    if (rows.length === 0) {
        useAppStore.setState({ selectedPortfolioCardRef: null });
        return;
    }

    const currentIndex = state.selectedPortfolioCardRef
        ? rows.findIndex((row) => sameCard(row, state.selectedPortfolioCardRef))
        : -1;
    const nextIndex = currentIndex < 0
        ? (step > 0 ? 0 : rows.length - 1)
        : Math.min(rows.length - 1, Math.max(0, currentIndex + step));
    const row = rows[nextIndex];
    if (!row) return;
    useAppStore.setState({ selectedPortfolioCardRef: { boardId: row.boardId, taskId: Number(row.taskId) } });

    requestAnimationFrame(() => {
        const selector = `.portfolio-task-card[data-board-id="${escapeCssSelectorValue(row.boardId)}"][data-task-id="${escapeCssSelectorValue(row.taskId)}"]`;
        document.querySelector(selector)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
}

export function focusPortfolioSearch() {
    document.getElementById('portfolioSearchInput')?.focus();
}

export function focusPortfolioSortControl() {
    document.getElementById('portfolioSortSelect')?.focus();
}

export function cyclePortfolioProjectChip(step) {
    const state = getState();
    const ids = [''].concat((state.portfolioBoards || []).map((board) => board.id));
    if (ids.length === 0) return;
    const currentIndex = Math.max(0, ids.indexOf(state.selectedPortfolioBoardId || ''));
    const next = (currentIndex + step + ids.length) % ids.length;
    selectPortfolioBoard(ids[next]);
}

const noModifiers = (event) => !event.ctrlKey && !event.metaKey && !event.altKey;
const isKey = (event, letter) => event.key.toLowerCase() === letter;

function withTargetRow(action) {
    return () => {
        const row = getShortcutTargetRow();
        if (row) action(row);
    };
}

function withOpenDetail(action) {
    return () => {
        const context = getState().portfolioDetailContext;
        if (context) action(context);
    };
}

const canMutateTargetRow = () => Boolean(getShortcutTargetRow()?.canMutate);
const canEditOpenDetail = () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext.readOnly);

export const SHORTCUTS = [
    {
        id: 'focus-search', section: 'Global', keys: ['/'], description: 'Focus project search', contexts: ['global'],
        match: (event) => noModifiers(event) && !event.shiftKey && event.key === '/',
        handler: () => focusPortfolioSearch()
    },
    {
        id: 'new-project', section: 'Global', keys: ['N'], description: 'Create a new project', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'n'),
        handler: () => { void createNewProject(); }
    },
    {
        id: 'import-projects', section: 'Global', keys: ['I'], description: 'Import projects', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'i'),
        handler: () => { void importPortfolioProjects(); }
    },
    {
        id: 'open-shortcuts', section: 'Global', keys: ['?'], description: 'Open keyboard shortcuts', contexts: ['global'],
        match: (event) => noModifiers(event) && (event.key === '?' || (event.key === '/' && event.shiftKey)),
        handler: () => openDialog('shortcuts')
    },
    {
        id: 'open-help', section: 'Global', keys: ['H'], description: 'Open help manual', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'h'),
        handler: () => openDialog('help')
    },
    {
        id: 'reset-filters', section: 'Global', keys: ['R'], description: 'Reset filters and sort', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'r'),
        handler: () => resetPortfolioFilters()
    },
    {
        id: 'focus-sort', section: 'Global', keys: ['S'], description: 'Focus sort control', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 's'),
        handler: () => focusPortfolioSortControl()
    },
    {
        id: 'project-prev', section: 'Global', keys: ['['], description: 'Select previous project chip', contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === '[',
        handler: () => cyclePortfolioProjectChip(-1)
    },
    {
        id: 'project-next', section: 'Global', keys: [']'], description: 'Select next project chip', contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === ']',
        handler: () => cyclePortfolioProjectChip(1)
    },
    {
        id: 'card-next', section: 'Cards', keys: ['J'], description: 'Select next visible card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'j'),
        handler: () => selectAdjacentPortfolioCard(1)
    },
    {
        id: 'card-prev', section: 'Cards', keys: ['K'], description: 'Select previous visible card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'k'),
        handler: () => selectAdjacentPortfolioCard(-1)
    },
    {
        id: 'card-open', section: 'Cards', keys: ['Enter'], description: 'Open hovered or selected card details', contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === 'Enter',
        when: () => Boolean(getShortcutTargetRow() && !getShortcutTargetRow().historical),
        handler: withTargetRow((row) => openPortfolioTaskDetails(row.boardId, row.taskId))
    },
    {
        id: 'card-edit', section: 'Cards', keys: ['E'], description: 'Edit hovered or selected card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'e'),
        when: canMutateTargetRow,
        handler: withTargetRow((row) => editPortfolioTask(row.boardId, row.taskId))
    },
    {
        id: 'card-archive', section: 'Cards', keys: ['X'], description: 'Archive/restore hovered or selected card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'x'),
        when: canMutateTargetRow,
        handler: withTargetRow((row) => { void togglePortfolioArchiveTask(row.boardId, row.taskId); })
    },
    ...[
        ['1', 'backlog', 'Backlog'],
        ['2', 'to-do', 'To Do'],
        ['3', 'doing', 'In Progress'],
        ['4', 'done', 'Done']
    ].map(([key, status, label]) => ({
        id: `move-${status}`,
        section: 'Cards',
        keys: [key],
        description: `Move hovered or selected card to ${label}`,
        contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === key,
        when: canMutateTargetRow,
        handler: withTargetRow((row) => { void movePortfolioTaskToStatus(row.boardId, row.taskId, status); })
    })),
    {
        // Listed for reference; the task editor handles Ctrl/Cmd+Enter itself.
        id: 'save-task-modal', section: 'Task Modal', keys: ['Ctrl', 'Enter'], description: 'Save task', contexts: ['taskModal'], allowWhileTyping: true,
        match: (event) => (event.ctrlKey || event.metaKey) && !event.altKey && event.key === 'Enter',
        handler: () => {}
    },
    {
        id: 'detail-edit', section: 'Task Detail', keys: ['E'], description: 'Edit open task', contexts: ['detailModal'],
        match: (event) => noModifiers(event) && isKey(event, 'e'),
        when: canEditOpenDetail,
        handler: withOpenDetail((context) => editPortfolioTask(context.boardId, context.taskId))
    },
    {
        id: 'detail-archive', section: 'Task Detail', keys: ['X'], description: 'Archive/restore open task', contexts: ['detailModal'],
        match: (event) => noModifiers(event) && isKey(event, 'x'),
        when: canEditOpenDetail,
        handler: withOpenDetail((context) => { void togglePortfolioArchiveTask(context.boardId, context.taskId); })
    },
    {
        id: 'close-modal', section: 'Modal', keys: ['Esc'], description: 'Close open modal',
        contexts: ['taskModal', 'detailModal', 'roadmapEntityModal', 'shortcutsModal', 'helpModal'], allowWhileTyping: true,
        match: (event) => event.key === 'Escape',
        handler: () => {
            closeTaskEditor();
            closeTaskDetail();
            closeRoadmapEntity();
            closeDialog();
        }
    }
];

const SHORTCUT_CONTEXT_BY_DIALOG = {
    taskEditor: 'taskModal',
    taskDetail: 'detailModal',
    roadmapEntity: 'roadmapEntityModal',
    shortcuts: 'shortcutsModal',
    help: 'helpModal'
};

function isTyping() {
    const tagName = document.activeElement?.tagName || '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function handleShortcutKeydown(event) {
    const contextName = SHORTCUT_CONTEXT_BY_DIALOG[getState().activeDialog] || 'global';
    const typing = isTyping();
    for (const entry of SHORTCUTS) {
        if (!entry.contexts.includes(contextName)) continue;
        if (typing && !entry.allowWhileTyping) continue;
        if (!entry.match(event)) continue;
        if (entry.when && !entry.when()) continue;
        event.preventDefault();
        entry.handler();
        return;
    }
}
