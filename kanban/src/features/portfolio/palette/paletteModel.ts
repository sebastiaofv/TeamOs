// The command palette's results for a query: sections of items, each carrying
// a plain action descriptor that paletteActions runs. Pure, so it can be
// tested without React or the store.

import type { Priority, RoadmapItem, TaskStatus } from '@/domain/types';
import type { BoardRecord, PortfolioRow } from '@/features/portfolio/types';
import type { Language } from '@/shared/types/ui';
import type { TranslationKey } from '@/shared/i18n';
import { defaultColumns } from '@/domain/constants';
import { createPortfolioProjectColor } from '@/domain/board';
import {
    PLANNER_DAY_END,
    PLANNER_DAY_START,
    PLANNER_DEFAULT_BLOCK_MINUTES,
    clampPlannerStart,
    formatPlannerTime,
    shiftPlannerDate
} from '@/domain/dayPlanner';
import { normalizeTaskStatus } from '@/domain/task';
import { matchRanges, scoreText } from './paletteText';
import { parseQuickCreate, type QuickCreateDraft } from './quickCreate';

export type PaletteStep = 'status' | 'assignee' | 'priority' | 'plan';
export type PaletteFrame =
    | { kind: 'task'; boardId: string; taskId: number }
    | { kind: 'step'; step: PaletteStep; boardId: string; taskId: number };

export type PaletteCommandId =
    | 'view-board' | 'view-table' | 'view-roadmap' | 'view-calendar' | 'view-planner'
    | 'open-filters' | 'reset-filters' | 'clear-board-filter'
    | 'toggle-theme' | 'toggle-language' | 'open-shortcuts' | 'open-help' | 'open-palette-help'
    | 'new-project' | 'import-projects';

export type QuickCreateFields = Pick<QuickCreateDraft, 'title' | 'assignees' | 'priority' | 'tags' | 'effort' | 'dueDate'>;

export type PaletteAction =
    | { type: 'filterBoard'; text: string }
    | { type: 'openTask'; boardId: string; taskId: number }
    | { type: 'editTask'; boardId: string; taskId: number }
    | { type: 'moveTask'; boardId: string; taskId: number; status: TaskStatus }
    | { type: 'toggleArchive'; boardId: string; taskId: number }
    | { type: 'toggleAssignee'; boardId: string; taskId: number; name: string }
    | { type: 'setPriority'; boardId: string; taskId: number; priority: Priority | null }
    | { type: 'planTask'; boardId: string; taskId: number; date: string; startMinutes: number }
    | { type: 'createTask'; boardId: string; fields: QuickCreateFields }
    | { type: 'selectProject'; boardId: string }
    | { type: 'openRoadmap'; boardId: string }
    | { type: 'command'; id: PaletteCommandId }
    | { type: 'push'; frames: PaletteFrame[] }
    | { type: 'setQuery'; query: string };

export type PaletteIcon =
    | 'task' | 'project' | 'roadmap' | 'command' | 'filter' | 'create'
    | 'open' | 'move' | 'assign' | 'priority' | 'plan' | 'edit' | 'archive' | 'person' | 'time';

export type PaletteItem = {
    key: string;
    icon: PaletteIcon;
    label: string;
    // [start, end) ranges of `label` that match the query.
    ranges: [number, number][];
    detail?: string;
    // Keyboard shortcut keys shown next to the item.
    hint?: string[];
    color?: string;
    // For step choices: whether this is the current value.
    checked?: boolean;
    action: PaletteAction;
    // Frame to open with Tab / →, for tasks.
    drill?: PaletteFrame;
    // Remembered in "Recent" when run.
    recentKey?: string;
};

export type PaletteSection = { id: string; title: string; items: PaletteItem[] };

export type PalettePreview = QuickCreateDraft & { projectTitle: string };

export type PaletteModel = {
    sections: PaletteSection[];
    breadcrumbs: string[];
    preview: PalettePreview | null;
};

export type PaletteInput = {
    query: string;
    stack: PaletteFrame[];
    boards: BoardRecord[];
    // Every task of every board (portfolioTasks).
    rows: PortfolioRow[];
    selectedBoardId: string;
    // The board's active text filter.
    boardSearch: string;
    // Open, hovered or selected task when the palette opened.
    contextTask: { boardId: string; taskId: number } | null;
    recent: string[];
    // Local YYYY-MM-DD and minutes since midnight.
    today: string;
    nowMinutes: number;
    t: (key: TranslationKey, values?: Record<string, string | number>) => string;
    language: Language;
};

type Ctx = PaletteInput & { query: string };

const STATUS_KEYS: Record<TaskStatus, TranslationKey> = {
    backlog: 'board.backlog', 'to-do': 'board.toDo', doing: 'board.doing', done: 'board.done'
};
const STATUS_SHORTCUTS: Record<TaskStatus, string> = { backlog: '1', 'to-do': '2', doing: '3', done: '4' };
const PRIORITY_KEYS: [Priority | null, TranslationKey][] = [
    ['high', 'toolbar.high'], ['medium', 'toolbar.medium'], ['low', 'toolbar.low'], [null, 'palette.priorityNone']
];
const STEP_KEYS: Record<PaletteStep, TranslationKey> = {
    status: 'palette.stepMove', assignee: 'palette.stepAssign', priority: 'palette.stepPriority', plan: 'palette.stepPlan'
};
const ROADMAP_KEYS: Record<'milestones' | 'phases' | 'sprints', TranslationKey> = {
    milestones: 'roadmap.milestone', phases: 'roadmap.phase', sprints: 'roadmap.sprint'
};
const MAX_TASKS = 8;
// Minimum score for commands and projects, so scattered letters do not match.
const WORD_MATCH = 60;

type CommandSpec = { id: PaletteCommandId; key: TranslationKey; hint?: string[]; when?: (ctx: Ctx) => boolean };
const COMMANDS: CommandSpec[] = [
    { id: 'view-board', key: 'palette.cmdBoard' },
    { id: 'view-table', key: 'palette.cmdTable', when: (ctx) => Boolean(ctx.selectedBoardId) },
    { id: 'view-roadmap', key: 'palette.cmdRoadmap', when: (ctx) => Boolean(ctx.selectedBoardId) },
    { id: 'view-calendar', key: 'palette.cmdCalendar' },
    { id: 'view-planner', key: 'palette.cmdPlanner', hint: ['P'] },
    { id: 'open-filters', key: 'palette.cmdFilters' },
    { id: 'clear-board-filter', key: 'palette.cmdClearSearch', when: (ctx) => Boolean(ctx.boardSearch) },
    { id: 'reset-filters', key: 'palette.cmdReset', hint: ['R'] },
    { id: 'toggle-theme', key: 'palette.cmdTheme' },
    { id: 'toggle-language', key: 'palette.cmdLanguage' },
    { id: 'open-shortcuts', key: 'palette.cmdShortcuts', hint: ['?'] },
    { id: 'open-help', key: 'palette.cmdHelp', hint: ['H'] },
    { id: 'open-palette-help', key: 'palette.cmdPaletteHelp' },
    { id: 'new-project', key: 'palette.cmdNewProject', hint: ['N'] },
    { id: 'import-projects', key: 'palette.cmdImport', hint: ['I'] }
];

const boardColor = (board: BoardRecord | undefined) => (board?.projectColor || createPortfolioProjectColor(board?.colorSeed || 0)).border;
const boardTitle = (board: BoardRecord | undefined) => board?.title || board?.fileName || '';
const rowKey = (row: PortfolioRow) => `${row.boardId}:${Number(row.taskId ?? row.task.id)}`;
const findRow = (ctx: Ctx, boardId: string, taskId: number) => ctx.rows.find((row) => row.boardId === boardId && Number(row.taskId ?? row.task.id) === Number(taskId)) || null;
const canEdit = (row: PortfolioRow) => Boolean(row.canMutate) && !row.historical;
const findBoard = (ctx: Ctx, boardId: string) => ctx.boards.find((board) => board.id === boardId);
const statusLabel = (ctx: Ctx, status: TaskStatus) => ctx.t(STATUS_KEYS[status]);

function taskDetail(ctx: Ctx, row: PortfolioRow): string {
    const board = findBoard(ctx, row.boardId);
    return [`#${row.taskId ?? row.task.id}`, boardTitle(board), statusLabel(ctx, normalizeTaskStatus(row.task.status)), row.task.assignees.join(', ')]
        .filter(Boolean)
        .join(' · ');
}

function taskItem(ctx: Ctx, row: PortfolioRow, query: string): PaletteItem {
    const boardId = row.boardId;
    const taskId = Number(row.taskId ?? row.task.id);
    return {
        key: `task:${boardId}:${taskId}`,
        icon: 'task',
        label: row.task.title,
        ranges: matchRanges(row.task.title, query),
        detail: taskDetail(ctx, row),
        color: boardColor(findBoard(ctx, boardId)),
        action: { type: 'openTask', boardId, taskId },
        drill: { kind: 'task', boardId, taskId },
        recentKey: `task:${boardId}:${taskId}`
    };
}

function commandItem(ctx: Ctx, spec: CommandSpec, query: string): PaletteItem {
    const label = ctx.t(spec.key, { query: ctx.boardSearch });
    return {
        key: `cmd:${spec.id}`, icon: 'command', label, ranges: matchRanges(label, query), hint: spec.hint,
        action: { type: 'command', id: spec.id }, recentKey: `cmd:${spec.id}`
    };
}

function projectItem(ctx: Ctx, board: BoardRecord, query: string): PaletteItem {
    const label = boardTitle(board);
    return {
        key: `project:${board.id}`, icon: 'project', label, ranges: matchRanges(label, query), color: boardColor(board),
        detail: board.handle ? undefined : ctx.t('palette.readOnly'),
        action: { type: 'selectProject', boardId: board.id }, recentKey: `project:${board.id}`
    };
}

// Actions for a task. `compact` is the short list shown for the context task.
function taskActionItems(ctx: Ctx, row: PortfolioRow, compact: boolean): PaletteItem[] {
    const boardId = row.boardId;
    const taskId = Number(row.taskId ?? row.task.id);
    const base = `action:${boardId}:${taskId}`;
    const item = (id: string, icon: PaletteIcon, label: string, action: PaletteAction, hint?: string[]): PaletteItem => (
        { key: `${base}:${id}`, icon, label, ranges: [], action, hint }
    );
    const step = (stepName: PaletteStep): PaletteAction => ({
        type: 'push', frames: [{ kind: 'task', boardId, taskId }, { kind: 'step', step: stepName, boardId, taskId }]
    });
    const items = [item('open', 'open', ctx.t('palette.open'), { type: 'openTask', boardId, taskId }, ['Enter'])];
    if (!canEdit(row)) return items;

    const current = normalizeTaskStatus(row.task.status);
    const statuses = defaultColumns.map((column) => column.status);
    const targets = compact ? statuses.slice(statuses.indexOf(current) + 1) : statuses.filter((status) => status !== current);
    targets.forEach((status) => items.push(item(`move-${status}`, 'move', ctx.t('palette.moveTo', { status: statusLabel(ctx, status) }),
        { type: 'moveTask', boardId, taskId, status }, [STATUS_SHORTCUTS[status]])));
    if (!compact) items.push(item('move', 'move', ctx.t('palette.moveToStep'), step('status')));
    items.push(item('assign', 'assign', ctx.t('palette.assign'), step('assignee')));
    if (!compact) items.push(item('priority', 'priority', ctx.t('palette.setPriority'), step('priority')));
    items.push(item('plan', 'plan', ctx.t('palette.plan'), step('plan')));
    if (!compact) {
        items.push(item('edit', 'edit', ctx.t('palette.edit'), { type: 'editTask', boardId, taskId }, ['E']));
        items.push(item('archive', 'archive', ctx.t(row.task.archived ? 'palette.restore' : 'palette.archive'),
            { type: 'toggleArchive', boardId, taskId }, ['X']));
    }
    return items;
}

function allPeople(ctx: Ctx): string[] {
    const names = new Map<string, string>();
    ctx.rows.forEach((row) => row.task.assignees.forEach((name) => {
        if (name && !names.has(name.toLowerCase())) names.set(name.toLowerCase(), name);
    }));
    return [...names.values()].sort((a, b) => a.localeCompare(b));
}

// Free 1-hour slots: the next whole hour today, 14:00 and 16:00 today when
// still ahead, then 09:00 and 14:00 tomorrow.
function planSlots(ctx: Ctx): { label: string; date: string; startMinutes: number }[] {
    const latestStart = PLANNER_DAY_END - PLANNER_DEFAULT_BLOCK_MINUTES;
    const nextHour = Math.max(PLANNER_DAY_START, Math.ceil((ctx.nowMinutes + 1) / 60) * 60);
    const today = [nextHour, 14 * 60, 16 * 60]
        .filter((minutes, index, all) => minutes > ctx.nowMinutes && minutes <= latestStart && all.indexOf(minutes) === index)
        .sort((a, b) => a - b);
    const tomorrow = shiftPlannerDate(ctx.today, 1);
    return [
        ...today.map((minutes) => ({ label: ctx.t('palette.todayAt', { time: formatPlannerTime(minutes) }), date: ctx.today, startMinutes: minutes })),
        ...[9 * 60, 14 * 60].map((minutes) => ({ label: ctx.t('palette.tomorrowAt', { time: formatPlannerTime(minutes) }), date: tomorrow, startMinutes: minutes }))
    ];
}

function stepItems(ctx: Ctx, frame: Extract<PaletteFrame, { kind: 'step' }>, row: PortfolioRow): PaletteItem[] {
    const { boardId, taskId } = frame;
    const q = ctx.query;
    const choice = (id: string, icon: PaletteIcon, label: string, action: PaletteAction, extra: Partial<PaletteItem> = {}): PaletteItem => (
        { key: `step:${frame.step}:${id}`, icon, label, ranges: matchRanges(label, q), action, ...extra }
    );
    const matches = (label: string) => scoreText(label, q) > 0;
    if (frame.step === 'status') {
        const current = normalizeTaskStatus(row.task.status);
        return defaultColumns.map((column) => column.status)
            .filter((status) => matches(statusLabel(ctx, status)))
            .map((status) => choice(status, 'move', statusLabel(ctx, status), { type: 'moveTask', boardId, taskId, status },
                { checked: status === current, hint: [STATUS_SHORTCUTS[status]] }));
    }
    if (frame.step === 'priority') {
        return PRIORITY_KEYS.filter(([, key]) => matches(ctx.t(key)))
            .map(([priority, key]) => choice(String(priority), 'priority', ctx.t(key), { type: 'setPriority', boardId, taskId, priority },
                { checked: row.task.priority === priority }));
    }
    if (frame.step === 'plan') {
        return planSlots(ctx).filter((slot) => matches(slot.label))
            .map((slot) => choice(`${slot.date}-${slot.startMinutes}`, 'time', slot.label,
                { type: 'planTask', boardId, taskId, date: slot.date, startMinutes: slot.startMinutes }));
    }
    const assigned = new Set(row.task.assignees.map((name) => name.toLowerCase()));
    const people = allPeople(ctx).filter((name) => matches(name))
        .map((name) => choice(name, 'person', name, { type: 'toggleAssignee', boardId, taskId, name }, { checked: assigned.has(name.toLowerCase()) }));
    const typed = q.trim();
    if (typed && !allPeople(ctx).some((name) => name.toLowerCase() === typed.toLowerCase())) {
        people.push(choice('new', 'person', ctx.t('palette.addPerson', { name: typed }), { type: 'toggleAssignee', boardId, taskId, name: typed },
            { checked: false, ranges: [] }));
    }
    return people;
}

function defaultCreateBoard(ctx: Ctx): BoardRecord | undefined {
    const writable = (id: string | undefined) => ctx.boards.find((board) => board.id === id && board.handle);
    return writable(ctx.contextTask?.boardId) || writable(ctx.selectedBoardId) || ctx.boards.find((board) => board.handle);
}

function quickCreate(ctx: Ctx): PaletteModel {
    const fallback = defaultCreateBoard(ctx);
    const writableBoards = ctx.boards.filter((board) => board.handle);
    const draft = parseQuickCreate(ctx.query, {
        people: allPeople(ctx),
        projects: writableBoards.map((board) => ({ id: board.id, title: boardTitle(board) })),
        defaultProjectId: fallback?.id || '',
        today: ctx.today
    });
    const board = findBoard(ctx, draft.projectId);
    const preview: PalettePreview = { ...draft, projectTitle: boardTitle(board) };
    const items: PaletteItem[] = draft.title && board ? [{
        key: 'create', icon: 'create', label: ctx.t('palette.create', { title: draft.title, project: boardTitle(board) }), ranges: [],
        hint: ['Enter'], color: boardColor(board),
        action: { type: 'createTask', boardId: board.id, fields: {
            title: draft.title, assignees: draft.assignees, priority: draft.priority, tags: draft.tags, effort: draft.effort, dueDate: draft.dueDate
        } }
    }] : [];
    return { sections: [{ id: 'create', title: ctx.t('palette.sectionCreate'), items }], breadcrumbs: [], preview };
}

const PLAN_QUERY = /^plan\s+(.+?)(?:\s+(\d{1,2})(?::(\d{2}))?)?\s*$/i;

function planQuery(ctx: Ctx, match: RegExpExecArray): PaletteModel {
    const text = match[1];
    const minutes = match[2] !== undefined
        ? clampPlannerStart(Number(match[2]) * 60 + Number(match[3] || 0), PLANNER_DEFAULT_BLOCK_MINUTES)
        : null;
    const items = ctx.rows
        .filter((row) => canEdit(row) && !row.task.archived)
        .map((row) => [row, scoreText(row.task.title, text)] as const)
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TASKS)
        .map(([row]) => {
            const item = taskItem(ctx, row, text);
            const taskId = Number(row.taskId ?? row.task.id);
            return {
                ...item,
                icon: 'plan' as const,
                hint: undefined,
                action: minutes === null
                    ? { type: 'push' as const, frames: [{ kind: 'task' as const, boardId: row.boardId, taskId }, { kind: 'step' as const, step: 'plan' as const, boardId: row.boardId, taskId }] }
                    : { type: 'planTask' as const, boardId: row.boardId, taskId, date: ctx.today, startMinutes: minutes }
            };
        });
    const title = minutes === null ? ctx.t('palette.sectionPlan') : ctx.t('palette.sectionPlanAt', { time: formatPlannerTime(minutes) });
    return { sections: [{ id: 'plan', title, items }], breadcrumbs: [], preview: null };
}

function taskScore(row: PortfolioRow, query: string, boardName: string): number {
    const q = query.trim();
    const idMatch = /^#(\d+)$/.exec(q);
    if (idMatch) return Number(row.taskId ?? row.task.id) === Number(idMatch[1]) ? 100 : 0;
    if (q.startsWith('#')) return Math.max(0, ...row.task.tags.map((tag) => scoreText(`#${tag}`, q)));
    return Math.max(
        scoreText(row.task.title, q),
        ...row.task.tags.map((tag) => scoreText(tag, q) >= WORD_MATCH ? scoreText(tag, q) * 0.9 : 0),
        ...row.task.assignees.map((name) => scoreText(name, q) >= WORD_MATCH ? scoreText(name, q) * 0.9 : 0),
        scoreText(boardName, q) >= WORD_MATCH ? scoreText(boardName, q) * 0.6 : 0,
        row.task.description && row.task.description.toLowerCase().includes(q.toLowerCase()) ? 40 : 0
    );
}

function roadmapItems(ctx: Ctx, query: string): PaletteItem[] {
    return ctx.boards.flatMap((board) => {
        const roadmap = board.data.extensions?.roadmap;
        if (!roadmap) return [];
        return (['milestones', 'phases', 'sprints'] as const).flatMap((kind) => (roadmap[kind] || [] as RoadmapItem[])
            .filter((item) => scoreText(item.title, query) >= WORD_MATCH)
            .map((item): PaletteItem => ({
                key: `roadmap:${board.id}:${kind}:${item.id}`, icon: 'roadmap', label: item.title, ranges: matchRanges(item.title, query),
                detail: [ctx.t(ROADMAP_KEYS[kind]), boardTitle(board), item.dueDate || [item.startDate, item.endDate].filter(Boolean).join(' – ')]
                    .filter(Boolean).join(' · '),
                color: boardColor(board),
                action: { type: 'openRoadmap', boardId: board.id }
            })));
    });
}

function search(ctx: Ctx): PaletteModel {
    const q = ctx.query.trim();
    const sections: PaletteSection[] = [];
    // Actions of the task in front of the user come first when they match.
    const contextRow = ctx.contextTask ? findRow(ctx, ctx.contextTask.boardId, ctx.contextTask.taskId) : null;
    const contextActions = contextRow
        ? taskActionItems(ctx, contextRow, false)
            .filter((item) => scoreText(item.label, q) >= WORD_MATCH)
            .map((item) => ({ ...item, ranges: matchRanges(item.label, q) }))
        : [];
    if (contextRow && contextActions.length) sections.push({ id: 'context', title: contextRow.task.title, items: contextActions });
    sections.push({
        id: 'filter', title: ctx.t('palette.sectionFilter'),
        items: [{ key: 'filter', icon: 'filter', label: ctx.t('palette.filterBoard', { query: q }), ranges: [], action: { type: 'filterBoard', text: q } }]
    });
    // Recently used tasks rank a little higher, but only when they match.
    const tasks = ctx.rows
        .filter((row) => !row.task.archived)
        .map((row) => {
            const score = taskScore(row, q, boardTitle(findBoard(ctx, row.boardId)));
            return [row, score > 0 && ctx.recent.includes(`task:${rowKey(row)}`) ? score + 5 : score] as const;
        })
        .filter(([, score]) => score > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_TASKS)
        .map(([row]) => taskItem(ctx, row, q.startsWith('#') ? '' : q));
    const projects = ctx.boards.filter((board) => scoreText(boardTitle(board), q) >= WORD_MATCH).map((board) => projectItem(ctx, board, q));
    const roadmap = roadmapItems(ctx, q);
    const commands = COMMANDS.filter((spec) => (!spec.when || spec.when(ctx)) && scoreText(ctx.t(spec.key, { query: ctx.boardSearch }), q) >= WORD_MATCH)
        .map((spec) => commandItem(ctx, spec, q));
    if (tasks.length) sections.push({ id: 'tasks', title: ctx.t('palette.sectionTasks'), items: tasks });
    if (projects.length) sections.push({ id: 'projects', title: ctx.t('palette.sectionProjects'), items: projects });
    if (roadmap.length) sections.push({ id: 'roadmap', title: ctx.t('palette.sectionRoadmap'), items: roadmap });
    if (commands.length) sections.push({ id: 'commands', title: ctx.t('palette.sectionCommands'), items: commands });
    if (sections.every((section) => section.id === 'filter')) {
        sections.push({
            id: 'create', title: ctx.t('palette.sectionCreate'),
            items: [{ key: 'create-suggestion', icon: 'create', label: ctx.t('palette.createSuggestion', { title: q }), ranges: [], action: { type: 'setQuery', query: `+ ${q}` } }]
        });
    }
    return { sections, breadcrumbs: [], preview: null };
}

function home(ctx: Ctx): PaletteModel {
    const sections: PaletteSection[] = [];
    const contextRow = ctx.contextTask ? findRow(ctx, ctx.contextTask.boardId, ctx.contextTask.taskId) : null;
    if (contextRow) sections.push({ id: 'context', title: contextRow.task.title, items: taskActionItems(ctx, contextRow, true) });
    const recent = ctx.recent.flatMap((key): PaletteItem[] => {
        const [kind, first, second] = key.split(':');
        if (kind === 'task') {
            const row = findRow(ctx, first, Number(second));
            return row && !row.task.archived ? [taskItem(ctx, row, '')] : [];
        }
        if (kind === 'project') {
            const board = findBoard(ctx, first);
            return board ? [projectItem(ctx, board, '')] : [];
        }
        const spec = COMMANDS.find((entry) => entry.id === first && (!entry.when || entry.when(ctx)));
        return kind === 'cmd' && spec ? [commandItem(ctx, spec, '')] : [];
    });
    if (recent.length) sections.push({ id: 'recent', title: ctx.t('palette.sectionRecent'), items: recent });
    const recentKeys = new Set(recent.map((item) => item.key));
    sections.push({
        id: 'commands', title: ctx.t('palette.sectionCommands'),
        items: COMMANDS.filter((spec) => (!spec.when || spec.when(ctx)) && !recentKeys.has(`cmd:${spec.id}`)).map((spec) => commandItem(ctx, spec, ''))
    });
    return { sections, breadcrumbs: [], preview: null };
}

function framed(ctx: Ctx): PaletteModel | null {
    const top = ctx.stack[ctx.stack.length - 1];
    if (!top) return null;
    const row = findRow(ctx, top.boardId, top.taskId);
    if (!row) return { sections: [], breadcrumbs: [], preview: null };
    const breadcrumbs = ctx.stack.map((frame) => frame.kind === 'task'
        ? `#${frame.taskId} ${row.task.title}`
        : ctx.t(STEP_KEYS[frame.step]));
    if (top.kind === 'task') {
        const items = taskActionItems(ctx, row, false)
            .filter((item) => scoreText(item.label, ctx.query) > 0)
            .map((item) => ({ ...item, ranges: matchRanges(item.label, ctx.query) }));
        return { sections: [{ id: 'actions', title: ctx.t('palette.sectionActions'), items }], breadcrumbs, preview: null };
    }
    return { sections: [{ id: 'step', title: ctx.t(STEP_KEYS[top.step]), items: stepItems(ctx, top, row) }], breadcrumbs, preview: null };
}

export function buildPaletteModel(input: PaletteInput): PaletteModel {
    const ctx: Ctx = { ...input, query: input.query };
    const inFrame = framed(ctx);
    if (inFrame) return inFrame;
    const trimmed = ctx.query.trim();
    if (trimmed.startsWith('+')) return quickCreate(ctx);
    const plan = PLAN_QUERY.exec(trimmed);
    if (plan) return planQuery(ctx, plan);
    if (!trimmed) return home(ctx);
    return search(ctx);
}
