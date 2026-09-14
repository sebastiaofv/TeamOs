// Keyboard shortcuts: the shortcut list shown in the Shortcuts dialog, the
// keydown dispatcher, and the card/project navigation actions they trigger.

import type { CardRef, DialogName, PortfolioRow, TaskStatus } from '../types';
import type { DetailContext } from '../state/slices';
import { createNewProject, importPortfolioProjects } from './portfolioFiles';
import { closeDialog, openDialog } from './dialogs';
import {
    closeRoadmapEntity,
    closeTaskDetail,
    closeTaskEditor,
    editPortfolioTask,
    movePortfolioTaskToStatus,
    openPortfolioTaskDetails,
    togglePortfolioArchiveTask
} from './portfolioMutations';
import { resetPortfolioFilters, selectPortfolioBoard } from './portfolioControls';
import { focusTarget } from './focusTargets';
import { useAppStore, type AppState } from '../state/store';

export type ShortcutContext = 'global' | 'taskModal' | 'detailModal' | 'roadmapEntityModal' | 'shortcutsModal' | 'helpModal';

export type Shortcut = {
    id: string;
    section: string;
    keys: string[];
    description: string;
    contexts: ShortcutContext[];
    allowWhileTyping?: boolean;
    match: (event: KeyboardEvent) => boolean;
    when?: () => boolean;
    handler: () => void;
};

const getState = () => useAppStore.getState();

function sameCard(left: CardRef | null | undefined, right: CardRef | null | undefined): boolean {
    return Boolean(left && right)
        && left!.boardId === right!.boardId
        && Number(left!.taskId) === Number(right!.taskId);
}

function findVisibleRow(state: AppState, ref: CardRef | null): PortfolioRow | null {
    return (state.portfolioVisibleRows || []).find((row) => sameCard(row, ref)) || null;
}

// Card shortcuts act on the hovered card, falling back to the selected one.
function getShortcutTargetRow(state = getState()): PortfolioRow | null {
    return findVisibleRow(state, state.hoveredPortfolioCardRef)
        || findVisibleRow(state, state.selectedPortfolioCardRef);
}

// The selected card scrolls itself into view (PortfolioTaskCard).
export function selectAdjacentPortfolioCard(step: number): void {
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
}

export function focusPortfolioSearch(): void {
    focusTarget('portfolioSearch');
}

export function focusPortfolioSortControl(): void {
    focusTarget('portfolioSort');
}

export function cyclePortfolioProjectChip(step: number): void {
    const state = getState();
    const ids = [''].concat((state.portfolioBoards || []).map((board) => board.id));
    if (ids.length === 0) return;
    const currentIndex = Math.max(0, ids.indexOf(state.selectedPortfolioBoardId || ''));
    const next = (currentIndex + step + ids.length) % ids.length;
    selectPortfolioBoard(ids[next]);
}

const noModifiers = (event: KeyboardEvent) => !event.ctrlKey && !event.metaKey && !event.altKey;
const isKey = (event: KeyboardEvent, letter: string) => event.key.toLowerCase() === letter;

function withTargetRow(action: (row: PortfolioRow) => void) {
    return () => {
        const row = getShortcutTargetRow();
        if (row) action(row);
    };
}

function withOpenDetail(action: (context: DetailContext) => void) {
    return () => {
        const context = getState().portfolioDetailContext;
        if (context) action(context);
    };
}

const canMutateTargetRow = () => Boolean(getShortcutTargetRow()?.canMutate);
const canEditOpenDetail = () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext?.readOnly);

const MOVE_SHORTCUTS: [string, TaskStatus, string][] = [
    ['1', 'backlog', 'Backlog'],
    ['2', 'to-do', 'To Do'],
    ['3', 'doing', 'In Progress'],
    ['4', 'done', 'Done']
];

export const SHORTCUTS: Shortcut[] = [
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
        when: () => Boolean(getShortcutTargetRow() && !getShortcutTargetRow()?.historical),
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
    ...MOVE_SHORTCUTS.map(([key, status, label]): Shortcut => ({
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

const SHORTCUT_CONTEXT_BY_DIALOG: Record<DialogName, ShortcutContext> = {
    taskEditor: 'taskModal',
    taskDetail: 'detailModal',
    roadmapEntity: 'roadmapEntityModal',
    shortcuts: 'shortcutsModal',
    help: 'helpModal'
};

function isTyping(): boolean {
    const tagName = document.activeElement?.tagName || '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

export function handleShortcutKeydown(event: KeyboardEvent): void {
    // A key already handled elsewhere (a dialog closing on Escape, a drag being
    // cancelled) is not also a shortcut.
    if (event.defaultPrevented) return;
    // An open app message owns the keyboard until it is answered.
    if (getState().appMessage) return;
    const activeDialog = getState().activeDialog;
    const contextName = (activeDialog && SHORTCUT_CONTEXT_BY_DIALOG[activeDialog]) || 'global';
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
