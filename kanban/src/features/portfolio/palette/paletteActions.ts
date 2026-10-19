// Runs a palette action descriptor against the app. The app's functions are
// passed in (see CommandPalette), so this stays testable without React.
// 'push' and 'setQuery' change the palette itself and are handled there.

import type { Priority, TaskStatus } from '@/domain/types';
import type { PortfolioViewMode } from '@/features/portfolio/types';
import type { TranslationKey } from '@/shared/i18n';
import type { PaletteAction, QuickCreateFields } from './paletteModel';

const STATUS_KEYS: Record<TaskStatus, TranslationKey> = {
    backlog: 'board.backlog', 'to-do': 'board.toDo', doing: 'board.doing', done: 'board.done'
};

export type PaletteDeps = {
    openTask: (boardId: string, taskId: number) => void;
    editTask: (boardId: string, taskId: number) => void;
    toggleArchive: (boardId: string, taskId: number) => unknown;
    selectCard: (boardId: string, taskId: number) => void;
    moveTask: (boardId: string, taskId: number, status: TaskStatus) => Promise<boolean>;
    toggleAssignee: (boardId: string, taskId: number, name: string) => Promise<boolean>;
    setResponsible: (boardId: string, taskId: number, name: string) => Promise<boolean>;
    setPriority: (boardId: string, taskId: number, priority: Priority | null) => Promise<boolean>;
    planTask: (boardId: string, taskId: number, date: string, startMinutes: number) => Promise<boolean>;
    createTask: (boardId: string, fields: QuickCreateFields) => Promise<number | null>;
    setBoardSearch: (text: string) => void;
    setViewMode: (mode: PortfolioViewMode) => void;
    selectBoard: (boardId: string) => void;
    resetFilters: () => void;
    openFilters: () => void;
    toggleTheme: () => void;
    toggleLanguage: () => void;
    openShortcuts: () => void;
    openHelp: () => void;
    openPaletteHelp: () => void;
    newProject: () => unknown;
    importProjects: () => unknown;
    taskInfo: (boardId: string, taskId: number) => { title: string; status: TaskStatus } | null;
    showUndo: (message: string, undo: () => unknown) => void;
    t: (key: TranslationKey, values?: Record<string, string | number>) => string;
};

export async function runPaletteAction(action: PaletteAction, deps: PaletteDeps): Promise<void> {
    switch (action.type) {
    case 'filterBoard': deps.setBoardSearch(action.text); return;
    case 'openTask': deps.openTask(action.boardId, action.taskId); return;
    case 'editTask': deps.editTask(action.boardId, action.taskId); return;
    case 'toggleArchive': await deps.toggleArchive(action.boardId, action.taskId); return;
    case 'toggleAssignee': await deps.toggleAssignee(action.boardId, action.taskId, action.name); return;
    case 'setResponsible': await deps.setResponsible(action.boardId, action.taskId, action.name); return;
    case 'setPriority': await deps.setPriority(action.boardId, action.taskId, action.priority); return;
    case 'planTask': await deps.planTask(action.boardId, action.taskId, action.date, action.startMinutes); return;
    case 'selectProject': deps.selectBoard(action.boardId); return;
    case 'openRoadmap':
        deps.selectBoard(action.boardId);
        deps.setViewMode('roadmap');
        return;
    case 'moveTask': {
        const before = deps.taskInfo(action.boardId, action.taskId);
        if (!before || !(await deps.moveTask(action.boardId, action.taskId, action.status))) return;
        deps.showUndo(
            deps.t('palette.moved', { title: before.title, status: deps.t(STATUS_KEYS[action.status]) }),
            () => deps.moveTask(action.boardId, action.taskId, before.status)
        );
        return;
    }
    case 'createTask': {
        const id = await deps.createTask(action.boardId, action.fields);
        if (id !== null) deps.selectCard(action.boardId, id);
        return;
    }
    case 'command':
        switch (action.id) {
        case 'view-board': deps.setViewMode('board'); return;
        case 'view-roadmap': deps.setViewMode('roadmap'); return;
        case 'view-table': deps.setViewMode('table'); return;
        case 'view-calendar': deps.setViewMode('calendar'); return;
        case 'view-planner': deps.setViewMode('planner'); return;
        case 'open-filters': deps.openFilters(); return;
        case 'reset-filters': deps.resetFilters(); return;
        case 'clear-board-filter': deps.setBoardSearch(''); return;
        case 'toggle-theme': deps.toggleTheme(); return;
        case 'toggle-language': deps.toggleLanguage(); return;
        case 'open-shortcuts': deps.openShortcuts(); return;
        case 'open-help': deps.openHelp(); return;
        case 'open-palette-help': deps.openPaletteHelp(); return;
        case 'new-project': await deps.newProject(); return;
        case 'import-projects': await deps.importProjects(); return;
        }
        return;
    default:
        return;
    }
}
