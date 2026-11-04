// Keyboard shortcuts: the shortcut list shown in the Shortcuts dialog, the
// keydown dispatcher, and the card/project navigation actions they trigger.

import type { TaskStatus } from '@/domain/types';
import { getWorkflow } from '@/domain/workflow';
import type { CardRef, DialogName, PortfolioRow } from '@/features/portfolio/types';
import type { DetailContext } from '@/features/portfolio/state/slices';
import { createNewProject, importPortfolioProjects } from '@/features/portfolio/projects/projectCommands';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { getPortfolioMutationActions, type PortfolioMutationActions } from './portfolioCommands';
import {
    resetPortfolioFilters,
    selectPortfolioBoard,
    setPortfolioPlannerMode,
    setPortfolioViewMode,
    shiftPortfolioPlannerDate,
    showPortfolioPlannerToday
} from './portfolioControls';
import { focusTarget } from '@/shared/ui/focusTargets';
import { openCommandPalette } from '@/features/portfolio/palette/openCommandPalette';
import { useAppStore, type AppState } from '@/features/portfolio/state/store';
import { clearTableFilters, setTableSort } from '@/features/portfolio/table/tableControls';

export type ShortcutContext = 'global' | 'taskModal' | 'detailModal' | 'roadmapEntityModal' | 'shortcutsModal' | 'helpModal' | 'paletteModal' | 'appSettingsModal';

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

export const SINGLE_KEY_SHORTCUTS_STORAGE_KEY = 'teamOs.singleKeyShortcuts';

export function areSingleKeyShortcutsEnabled(): boolean {
    try {
        return localStorage.getItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY) !== 'false';
    } catch (_) {
        return true;
    }
}

export function setSingleKeyShortcutsEnabled(enabled: boolean): void {
    try {
        localStorage.setItem(SINGLE_KEY_SHORTCUTS_STORAGE_KEY, String(enabled));
        window.dispatchEvent(new Event('teamOs:shortcut-preference-changed'));
    } catch (_) {
        // Preference storage is optional; the runtime can still use shortcuts.
    }
}

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

const isPlannerActive = () => getState().selectedPortfolioViewMode === 'planner' && getState().portfolioBoards.length > 0;
// Listed in the Shortcuts dialog only; a focused planner block handles these keys itself.
const plannerBlockReference = (id: string, keys: string[], description: string): Shortcut => ({
    id, section: 'Planner Blocks', keys, description, contexts: ['global'], match: () => false, handler: () => {}
});

const canMutateTargetRow = () => Boolean(getShortcutTargetRow()?.canMutate);
const canEditOpenDetail = () => Boolean(getState().portfolioDetailContext && !getState().portfolioDetailContext?.readOnly);

const MOVE_SHORTCUTS: [string, TaskStatus, string][] = [
    ['1', 'backlog', 'Backlog'],
    ['2', 'to-do', 'To Do'],
    ['3', 'doing', 'In Progress'],
    ['4', 'done', 'Done']
];

export function createPortfolioShortcuts(actions: PortfolioMutationActions = getPortfolioMutationActions()): Shortcut[] {
    return [
    {
        id: 'open-palette', section: 'Global', keys: ['Ctrl/⌘', 'K'], description: 'Open the command palette', contexts: ['global', 'detailModal'],
        allowWhileTyping: true,
        match: (event) => (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k',
        handler: () => openCommandPalette()
    },
    {
        id: 'focus-search', section: 'Global', keys: ['/'], description: 'Search tasks and commands', contexts: ['global'],
        match: (event) => noModifiers(event) && !event.shiftKey && event.key === '/',
        handler: () => openCommandPalette()
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
        handler: () => {
            if (getState().selectedPortfolioViewMode === 'table') {
                clearTableFilters();
                setTableSort('id');
            } else resetPortfolioFilters();
        }
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
        handler: withTargetRow((row) => actions.openPortfolioTaskDetails(row.boardId, row.taskId))
    },
    {
        id: 'card-edit', section: 'Cards', keys: ['E'], description: 'Edit hovered or selected card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'e'),
        when: canMutateTargetRow,
        handler: withTargetRow((row) => actions.editPortfolioTask(row.boardId, row.taskId))
    },
    {
        id: 'card-archive', section: 'Cards', keys: ['X'], description: 'Archive/restore hovered or selected card', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'x'),
        when: canMutateTargetRow,
        handler: withTargetRow((row) => { void actions.togglePortfolioArchiveTask(row.boardId, row.taskId); })
    },
    ...MOVE_SHORTCUTS.map(([key, status, label]): Shortcut => ({
        id: `move-${status}`,
        section: 'Cards',
        keys: [key],
        description: `Move hovered or selected card to ${label}`,
        contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === key,
        when: canMutateTargetRow,
        handler: withTargetRow((row) => {
            const workflow = getWorkflow(row.boardData || getState().portfolioBoards.find((b) => b.id === row.boardId)?.data, row.task);
            const destination = status === 'backlog' ? 'backlog' : status === 'to-do' ? workflow.entryStateId : workflow.references[status === 'doing' ? 'in-progress' : 'completed'];
            if (destination) void actions.movePortfolioTaskToStatus(row.boardId, row.taskId, destination);
        })
    })),
    {
        id: 'open-planner', section: 'Day Planner', keys: ['P'], description: 'Open the Day Planner', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'p'),
        when: () => getState().portfolioBoards.length > 0,
        handler: () => setPortfolioViewMode('planner')
    },
    {
        id: 'planner-today', section: 'Day Planner', keys: ['T'], description: 'Jump to today', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 't'),
        when: isPlannerActive,
        handler: () => showPortfolioPlannerToday()
    },
    {
        id: 'planner-day', section: 'Day Planner', keys: ['D'], description: 'Show one day', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'd'),
        when: isPlannerActive,
        handler: () => setPortfolioPlannerMode('day')
    },
    {
        id: 'planner-week', section: 'Day Planner', keys: ['W'], description: 'Show the work week', contexts: ['global'],
        match: (event) => noModifiers(event) && isKey(event, 'w'),
        when: isPlannerActive,
        handler: () => setPortfolioPlannerMode('week')
    },
    {
        id: 'planner-prev', section: 'Day Planner', keys: [','], description: 'Previous day or week', contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === ',',
        when: isPlannerActive,
        handler: () => shiftPortfolioPlannerDate(-1)
    },
    {
        id: 'planner-next', section: 'Day Planner', keys: ['.'], description: 'Next day or week', contexts: ['global'],
        match: (event) => noModifiers(event) && event.key === '.',
        when: isPlannerActive,
        handler: () => shiftPortfolioPlannerDate(1)
    },
    plannerBlockReference('planner-block-move', ['↑/↓'], 'Move the focused block by 15 minutes'),
    plannerBlockReference('planner-block-resize', ['Shift', '↑/↓'], 'Resize the focused block by 15 minutes'),
    plannerBlockReference('planner-block-remove', ['Delete'], 'Remove the focused block'),
    plannerBlockReference('planner-block-open', ['Enter'], "Open the focused block's task"),
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
        handler: withOpenDetail((context) => actions.editPortfolioTask(context.boardId, context.taskId))
    },
    {
        id: 'detail-archive', section: 'Task Detail', keys: ['X'], description: 'Archive/restore open task', contexts: ['detailModal'],
        match: (event) => noModifiers(event) && isKey(event, 'x'),
        when: canEditOpenDetail,
        handler: withOpenDetail((context) => { void actions.togglePortfolioArchiveTask(context.boardId, context.taskId); })
    },
    {
        id: 'close-modal', section: 'Modal', keys: ['Esc'], description: 'Close open modal',
        contexts: ['taskModal', 'detailModal', 'roadmapEntityModal', 'shortcutsModal', 'helpModal', 'appSettingsModal'], allowWhileTyping: true,
        match: (event) => event.key === 'Escape',
        handler: () => {
            actions.closeTaskEditor();
            actions.closeTaskDetail();
            actions.closeRoadmapEntity();
            closeDialog();
        }
    }
    ];
}

export const SHORTCUTS: Shortcut[] = createPortfolioShortcuts();

const SHORTCUT_CONTEXT_BY_DIALOG: Record<DialogName, ShortcutContext> = {
    appSettings: 'appSettingsModal',
    projectSettings: 'roadmapEntityModal',
    projectControl: 'roadmapEntityModal',
    taskEditor: 'taskModal',
    taskDetail: 'detailModal',
    roadmapEntity: 'roadmapEntityModal',
    shortcuts: 'shortcutsModal',
    help: 'helpModal',
    commandPalette: 'paletteModal'
};

function isTyping(): boolean {
    const tagName = document.activeElement?.tagName || '';
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT'
        || document.activeElement?.getAttribute('contenteditable') === 'true';
}

function isSingleKeyShortcut(entry: Shortcut): boolean {
    const key = entry.keys[0] || '';
    return entry.keys.length === 1 && key.length === 1;
}

export function handleShortcutKeydown(event: KeyboardEvent, actions: PortfolioMutationActions = getPortfolioMutationActions()): void {
    // A key already handled elsewhere (a dialog closing on Escape, a drag being
    // cancelled) is not also a shortcut.
    if (event.defaultPrevented) return;
    // An open app message owns the keyboard until it is answered.
    if (getState().appMessage) return;
    const activeDialog = getState().activeDialog;
    const contextName = (activeDialog && SHORTCUT_CONTEXT_BY_DIALOG[activeDialog]) || 'global';
    const typing = isTyping();
    const shortcuts = actions === getPortfolioMutationActions()
        ? SHORTCUTS
        : createPortfolioShortcuts(actions);
    for (const entry of shortcuts) {
        if (!entry.contexts.includes(contextName)) continue;
        // Card shortcuts must not target the hidden Board's independent rows.
        if (contextName === 'global' && getState().selectedPortfolioViewMode === 'table'
            && entry.section === 'Cards') continue;
        if (contextName === 'global' && !areSingleKeyShortcutsEnabled() && isSingleKeyShortcut(entry)) continue;
        if (typing && !entry.allowWhileTyping) continue;
        if (!entry.match(event)) continue;
        if (entry.when && !entry.when()) continue;
        event.preventDefault();
        entry.handler();
        return;
    }
}
