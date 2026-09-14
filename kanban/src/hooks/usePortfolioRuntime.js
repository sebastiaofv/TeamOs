import { useLayoutEffect } from 'react';
import { applyPortfolioUrlState } from '../actions/portfolioNavigation.js';
import {
    createNewProject,
    importPortfolioProjects
} from '../actions/portfolioFiles.js';
import {
    cyclePortfolioProjectChip,
    focusPortfolioSearch,
    focusPortfolioSortControl,
    selectAdjacentPortfolioCard
} from '../actions/portfolioShortcuts.js';
import {
    closeDialog,
    openDialog
} from '../actions/dialogs.js';
import {
    closeRoadmapEntity,
    closeTaskDetail,
    closeTaskEditor,
    editPortfolioTask,
    handleTimelineSliderPointerCommit,
    movePortfolioTaskToStatus,
    openPortfolioTaskDetails,
    setSelectedPortfolioCard,
    togglePortfolioArchiveTask
} from '../actions/portfolioMutations.js';
import { resetPortfolioFilters } from '../actions/portfolioControls.js';
import { notifyAppStateChanged, useAppStore } from '../state/store.js';
import { applyPortfolioViewVisibility } from './portfolioViewVisibility.js';

function isTyping() {
    const tagName = document.activeElement?.tagName || '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function getModalContext(state) {
    const names = {
        taskEditor: 'taskModal',
        taskDetail: 'detailModal',
        roadmapEntity: 'roadmapEntityModal',
        shortcuts: 'shortcutsModal',
        help: 'helpModal'
    };
    const modal = names[state.activeDialog] || null;
    return { modal, isTyping: isTyping(), noModal: !modal };
}

function getSelectedRow(state) {
    const ref = state.selectedPortfolioCardRef;
    if (!ref) return null;
    return (state.portfolioVisibleRows || []).find((row) => (
        row.boardId === ref.boardId && Number(row.taskId) === Number(ref.taskId)
    )) || null;
}

function getHoveredRow(state) {
    const ref = state.hoveredPortfolioCardRef;
    if (!ref) return null;
    return (state.portfolioVisibleRows || []).find((row) => (
        row.boardId === ref.boardId && Number(row.taskId) === Number(ref.taskId)
    )) || null;
}

function getTargetRow(state) {
    return getHoveredRow(state) || getSelectedRow(state);
}

function clearSelectionWhenClickingOutsideCards(event) {
    const state = useAppStore.getState();
    if (!state.selectedPortfolioCardRef) return;
    if (event.target?.closest?.('.portfolio-task-card')) return;
    setSelectedPortfolioCard(null, null);
}

function buildShortcutRegistry() {
    const getState = () => useAppStore.getState();
    const targetRow = () => getTargetRow(getState());
    return [
        {
            id: 'focus-search', section: 'Global', keys: ['/'], description: 'Focus project search', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.key === '/',
            handler: () => focusPortfolioSearch()
        },
        {
            id: 'new-project', section: 'Global', keys: ['N'], description: 'Create a new project', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[nN]$/.test(event.key),
            handler: () => { void createNewProject(); }
        },
        {
            id: 'import-projects', section: 'Global', keys: ['I'], description: 'Import projects', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[iI]$/.test(event.key),
            handler: () => { void importPortfolioProjects(); }
        },
        {
            id: 'open-shortcuts', section: 'Global', keys: ['?'], description: 'Open keyboard shortcuts', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === '?' || (event.key === '/' && event.shiftKey)),
            handler: () => openDialog('shortcuts')
        },
        {
            id: 'open-help', section: 'Global', keys: ['H'], description: 'Open help manual', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[hH]$/.test(event.key),
            handler: () => openDialog('help')
        },
        {
            id: 'reset-filters', section: 'Global', keys: ['R'], description: 'Reset filters and sort', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[rR]$/.test(event.key),
            handler: () => resetPortfolioFilters()
        },
        {
            id: 'focus-sort', section: 'Global', keys: ['S'], description: 'Focus sort control', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[sS]$/.test(event.key),
            handler: () => focusPortfolioSortControl()
        },
        {
            id: 'project-prev', section: 'Global', keys: ['['], description: 'Select previous project chip', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === '[',
            handler: () => cyclePortfolioProjectChip(-1)
        },
        {
            id: 'project-next', section: 'Global', keys: [']'], description: 'Select next project chip', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === ']',
            handler: () => cyclePortfolioProjectChip(1)
        },
        {
            id: 'card-next', section: 'Cards', keys: ['J'], description: 'Select next visible card', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[jJ]$/.test(event.key),
            handler: () => selectAdjacentPortfolioCard(1)
        },
        {
            id: 'card-prev', section: 'Cards', keys: ['K'], description: 'Select previous visible card', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[kK]$/.test(event.key),
            handler: () => selectAdjacentPortfolioCard(-1)
        },
        {
            id: 'card-open', section: 'Cards', keys: ['Enter'], description: 'Open hovered or selected card details', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Enter',
            when: () => Boolean(targetRow() && !targetRow().historical),
            handler: () => {
                const row = targetRow();
                if (row) openPortfolioTaskDetails(row.boardId, row.taskId);
            }
        },
        {
            id: 'card-edit', section: 'Cards', keys: ['E'], description: 'Edit hovered or selected card', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[eE]$/.test(event.key),
            when: () => Boolean(targetRow()?.canMutate),
            handler: () => {
                const row = targetRow();
                if (row) editPortfolioTask(row.boardId, row.taskId);
            }
        },
        {
            id: 'card-archive', section: 'Cards', keys: ['X'], description: 'Archive/restore hovered or selected card', contexts: ['global'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[xX]$/.test(event.key),
            when: () => Boolean(targetRow()?.canMutate),
            handler: () => {
                const row = targetRow();
                if (row) void togglePortfolioArchiveTask(row.boardId, row.taskId);
            }
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
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key === key,
            when: () => Boolean(targetRow()?.canMutate),
            handler: () => {
                const row = targetRow();
                if (row) void movePortfolioTaskToStatus(row.boardId, row.taskId, status);
            }
        })),
        {
            id: 'save-task-modal', section: 'Task Modal', keys: ['Ctrl', 'Enter'], description: 'Save task', contexts: ['taskModal'], allowWhileTyping: true,
            match: (event) => (event.ctrlKey || event.metaKey) && !event.altKey && event.key === 'Enter',
            handler: () => {}
        },
        {
            id: 'detail-edit', section: 'Task Detail', keys: ['E'], description: 'Edit open task', contexts: ['detailModal'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[eE]$/.test(event.key),
            when: () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext.readOnly),
            handler: () => {
                const context = getState().portfolioDetailContext;
                if (context) editPortfolioTask(context.boardId, context.taskId);
            }
        },
        {
            id: 'detail-archive', section: 'Task Detail', keys: ['X'], description: 'Archive/restore open task', contexts: ['detailModal'],
            match: (event) => !event.ctrlKey && !event.metaKey && !event.altKey && /^[xX]$/.test(event.key),
            when: () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext.readOnly),
            handler: () => {
                const context = getState().portfolioDetailContext;
                if (context) void togglePortfolioArchiveTask(context.boardId, context.taskId);
            }
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
}

function dispatchShortcutKeydown(event) {
    const state = useAppStore.getState();
    const context = getModalContext(state);
    const contextName = context.noModal ? 'global' : context.modal;
    const registry = state.ShortcutRegistry?.length ? state.ShortcutRegistry : buildShortcutRegistry();
    if (!state.ShortcutRegistry?.length) {
        useAppStore.setState({ ShortcutRegistry: registry });
        notifyAppStateChanged();
    }
    for (const entry of registry) {
        if (!entry.contexts.includes(contextName)) continue;
        if (context.isTyping && !entry.allowWhileTyping) continue;
        if (!entry.match(event, context)) continue;
        if (typeof entry.when === 'function' && !entry.when(context)) continue;
        event.preventDefault();
        entry.handler(event, context);
        return;
    }
}

export function usePortfolioRuntime() {
    useLayoutEffect(() => {
        document.title = 'TeamOS → Kanban';
        const registry = buildShortcutRegistry();
        useAppStore.setState({ ShortcutRegistry: registry });
        notifyAppStateChanged();
        applyPortfolioUrlState();

        const handleShortcuts = () => openDialog('shortcuts');
        const handleHelp = () => openDialog('help');
        const handlePopState = () => applyPortfolioUrlState();
        const shortcutsButton = document.getElementById('openShortcutsBtn');
        const helpButton = document.getElementById('openHelpBtn');

        shortcutsButton?.addEventListener('click', handleShortcuts);
        helpButton?.addEventListener('click', handleHelp);
        document.addEventListener('keydown', dispatchShortcutKeydown);
        document.addEventListener('click', clearSelectionWhenClickingOutsideCards);
        document.addEventListener('pointerup', handleTimelineSliderPointerCommit);
        document.addEventListener('pointercancel', handleTimelineSliderPointerCommit);
        window.addEventListener('popstate', handlePopState);

        return () => {
            shortcutsButton?.removeEventListener('click', handleShortcuts);
            helpButton?.removeEventListener('click', handleHelp);
            document.removeEventListener('keydown', dispatchShortcutKeydown);
            document.removeEventListener('click', clearSelectionWhenClickingOutsideCards);
            document.removeEventListener('pointerup', handleTimelineSliderPointerCommit);
            document.removeEventListener('pointercancel', handleTimelineSliderPointerCommit);
            window.removeEventListener('popstate', handlePopState);
        };
    }, []);
}

export function PortfolioRuntime() {
    usePortfolioRuntime();
    return null;
}

export function PortfolioViewVisibility() {
    const viewMode = useAppStore((state) => state.selectedPortfolioViewMode);
    const boardCount = useAppStore((state) => state.portfolioBoards.length);
    const selectedBoardId = useAppStore((state) => state.selectedPortfolioBoardId);

    useLayoutEffect(() => {
        applyPortfolioViewVisibility({ viewMode, boardCount, selectedBoardId });
    }, [viewMode, boardCount, selectedBoardId]);

    return null;
}
