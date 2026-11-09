// One change mechanism for board-level history events: forward-only operations
// computed in v1 shape and replayed onto the in-memory model.

import type { BoardData, BoardExtensions, LooseBoardData, RoadmapExtension, Task, Workflow } from './types';
import { getProjectData } from './projectData';
import { ROADMAP_VERSION, DAY_PLANNER_VERSION } from './constants';
import type { ProjectCheckpoint, ProjectFileV1 } from './projectFormat';
import { controlFromFile, memberIndexFor, projectBlockFromFile, relationsFromFile, resolveInheritedPlanning, workflowBlockFromFile, workitemFromFile } from './projectFormat';
import { isRecord } from './util';

type Rec = Record<string, unknown>;
export type ProjectPatchOp =
    | { op: 'upsert'; at: string; key: string; value: unknown }
    | { op: 'remove'; at: string; key: string }
    | { op: 'order'; at: string; keys: string[] }
    | { op: 'set'; at: string; value: unknown };
type ReplayState = { board?: { tasks?: Task[]; columns?: unknown[]; settings?: Rec }; extensions?: BoardExtensions } & Rec;

const COLLECTIONS: { at: string; key: (item: Rec) => string }[] = [
    { at: 'workitems', key: (item) => String(item.id) },
    { at: 'projectControl.records', key: (item) => String(item.id) },
    { at: 'roadmap.milestones', key: (item) => String(item.id) },
    { at: 'roadmap.phases', key: (item) => String(item.id) },
    { at: 'roadmap.sprints', key: (item) => String(item.id) },
    { at: 'roadmap.sprintResults.credits', key: (item) => String(item.taskKey) },
    { at: 'roadmap.sprintResults.closures', key: (item) => String(item.sprintId) },
    { at: 'roadmap.sprintParticipation', key: (item) => `${String(item.sprintId)}:${String((item.task as Rec).id)}` }
];
const keyFor = (at: string) => COLLECTIONS.find((entry) => entry.at === at)!.key;
// Project and workflow come first: replaying a workitem needs the members of that moment.
const BLOCKS_BEFORE = ['project', 'workflow'] as const;
const BLOCKS_AFTER = ['relations', 'dayPlanner', 'views', 'extensions'] as const;

function read(file: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), file);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function diffProjectState(before: ProjectCheckpoint, after: ProjectCheckpoint): ProjectPatchOp[] {
    const ops: ProjectPatchOp[] = [];
    const block = (at: string) => { if (!same(read(before, at), read(after, at))) ops.push({ op: 'set', at, value: read(after, at) ?? null }); };
    BLOCKS_BEFORE.forEach(block);
    for (const { at, key } of COLLECTIONS) {
        const previous = (read(before, at) || []) as Rec[], next = (read(after, at) || []) as Rec[];
        const previousByKey = new Map(previous.map((item) => [key(item), item]));
        const nextKeys = next.map(key), nextSet = new Set(nextKeys);
        const kept = previous.map(key).filter((id) => nextSet.has(id));
        for (const id of previousByKey.keys()) if (!nextSet.has(id)) ops.push({ op: 'remove', at, key: id });
        next.forEach((item, index) => { if (!same(previousByKey.get(nextKeys[index]), item)) ops.push({ op: 'upsert', at, key: nextKeys[index], value: item }); });
        const replayed = [...kept, ...nextKeys.filter((id) => !previousByKey.has(id))];
        if (!same(replayed, nextKeys)) ops.push({ op: 'order', at, keys: nextKeys });
    }
    BLOCKS_AFTER.forEach(block);
    return ops;
}

function collection(state: ReplayState, at: string): Rec[] {
    const extensions = (state.extensions || {}) as BoardExtensions;
    switch (at) {
        case 'workitems': return (state.board?.tasks || []) as unknown as Rec[];
        case 'projectControl.records': return (extensions.projectControl?.records || []) as unknown as Rec[];
        case 'roadmap.sprintResults.credits': return (extensions.sprintResults?.credits || []) as unknown as Rec[];
        case 'roadmap.sprintResults.closures': return (extensions.sprintResults?.closures || []) as unknown as Rec[];
        case 'roadmap.sprintParticipation': return (extensions.sprintParticipation?.entries || []) as unknown as Rec[];
        default: return (extensions.roadmap?.[at.split('.')[1] as 'milestones'] || []) as unknown as Rec[];
    }
}

function writeCollection(state: ReplayState, at: string, items: Rec[]): void {
    const extensions = state.extensions as BoardExtensions;
    if (at === 'workitems') { state.board = { ...state.board, tasks: items as unknown as Task[] }; return; }
    if (at === 'projectControl.records') {
        const records = items as unknown as NonNullable<BoardExtensions['projectControl']>['records'];
        const lastNumber = records.reduce((highest, record) => Math.max(highest, Number(record.id.match(/(\d+)$/)?.[1] || 0)), extensions.projectControl?.lastNumber || 0);
        extensions.projectControl = { version: 3, lastNumber, records };
        return;
    }
    if (at.startsWith('roadmap.sprintResults.')) {
        const current = extensions.sprintResults || { version: 1 as const, credits: [], closures: [] };
        extensions.sprintResults = { ...current, [at.split('.')[2]]: items };
        if (!extensions.sprintResults.credits.length && !extensions.sprintResults.closures.length) delete extensions.sprintResults;
        return;
    }
    if (at === 'roadmap.sprintParticipation') {
        if (items.length) extensions.sprintParticipation = { version: 1, entries: items as unknown as NonNullable<BoardExtensions['sprintParticipation']>['entries'] };
        else delete extensions.sprintParticipation;
        return;
    }
    const current: RoadmapExtension = extensions.roadmap || { version: ROADMAP_VERSION, milestones: [], phases: [], sprints: [] };
    extensions.roadmap = { ...current, [at.split('.')[1]]: items };
}

function toRuntime(state: ReplayState, at: string, value: Rec): Rec {
    const members = memberIndexFor(getProjectData(state as LooseBoardData));
    if (at === 'workitems') return workitemFromFile(value, members) as unknown as Rec;
    if (at === 'projectControl.records') return controlFromFile(value, members) as unknown as Rec;
    return value;
}

function applyBlock(state: ReplayState, at: string, value: unknown): void {
    const extensions = state.extensions as BoardExtensions;
    if (at === 'project') {
        const { project, title } = projectBlockFromFile(value as Rec);
        extensions.project = project;
        state.board = { ...state.board, settings: { ...state.board?.settings, title } };
    } else if (at === 'workflow') {
        for (const key of ['hierarchyAutomations', 'workitemAutomation', 'workflowTypes'] as const) delete extensions[key];
        const workflow = workflowBlockFromFile(value as Rec);
        Object.assign(extensions, workflow);
        state.board = { ...state.board, columns: (workflow.workflow as Workflow).states.map((item) => ({ status: item.id, title: item.name })) };
    } else if (at === 'relations') {
        delete extensions.taskRelations; delete extensions.permanentRelations;
        const project = getProjectData(state as LooseBoardData);
        Object.assign(extensions, relationsFromFile(value as ProjectFileV1['relations'], state.board?.tasks || [], { id: project.id, title: String(state.board?.settings?.title ?? '') }));
    } else if (at === 'dayPlanner') {
        const blocks = (value as { blocks?: unknown[] } | null)?.blocks || [];
        if (blocks.length) extensions.dayPlanner = { version: DAY_PLANNER_VERSION, blocks } as BoardExtensions['dayPlanner'];
        else delete extensions.dayPlanner;
    } else if (at === 'views') {
        const hidden = (value as { board?: { hiddenStateIds?: { technical?: string[]; functional?: string[] } } } | null)?.board?.hiddenStateIds;
        if (hidden) extensions.boardView = { version: 1, hiddenStateIds: hidden.technical || [], ...(hidden.functional ? { functionalHiddenStateIds: hidden.functional } : {}) };
        else delete extensions.boardView;
    } else if (at === 'extensions') {
        Object.assign(extensions, value || {});
    }
}

/** Replay never mutates its input: earlier states stay valid observations. */
export function applyProjectPatch<T extends object>(input: T, ops: readonly ProjectPatchOp[]): T {
    const state = { ...input, board: { ...(input as ReplayState).board }, extensions: { ...(input as ReplayState).extensions } } as unknown as ReplayState;
    for (const op of ops) {
        if (op.op === 'set') { applyBlock(state, op.at, op.value); continue; }
        const key = keyFor(op.at);
        let items = collection(state, op.at);
        // Runtime rows and v1 rows share their identity field, so one key function serves both.
        if (op.op === 'remove') items = items.filter((item) => key(item) !== op.key);
        else if (op.op === 'order') { const byKey = new Map(items.map((item) => [key(item), item])); items = op.keys.map((id) => byKey.get(id)!).filter(Boolean); }
        else {
            const value = toRuntime(state, op.at, op.value as Rec);
            const index = items.findIndex((item) => key(item) === op.key);
            items = index < 0 ? [...items, value] : items.map((item, position) => (position === index ? value : item));
        }
        writeCollection(state, op.at, items);
    }
    if (state.board?.tasks && ops.some((op) => op.at === 'workitems')) state.board.tasks = resolveInheritedPlanning(state.board.tasks);
    return state as unknown as T;
}

export const isProjectSnapshot = (value: unknown): value is BoardData => isRecord(value) && isRecord(value.board);
