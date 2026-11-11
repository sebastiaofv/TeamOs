import { isRecord, normalizeTimestamp } from './util';
import {
    assertWorkitemFile, closureFromFile, controlFromFile, creditFromFile, dayPlannerFromFile, KNOWN_PROJECT_EXTENSIONS, memberIndexFor, participationFromFile,
    projectBlockFromFile, workflowBlockFromFile
} from './projectFormat';
import { parseProjectData } from './projectData';
import { parseProjectControl } from './projectControl';
import { parseWorkflow, parseWorkflowTypes } from './workflow';
import { parseHierarchyAutomations } from './hierarchyAutomations';
import { normalizeRoadmapItems } from './roadmap';
import { parseSprintResults } from './sprintResults';
import { normalizeDayPlannerExtension } from './dayPlanner';
import { parseBoardView } from './boardView';

type Row = Record<string, unknown>;
export const PROJECT_COLLECTION_PATHS = [
    'workitems',
    'projectControl.records',
    'roadmap.milestones',
    'roadmap.phases',
    'roadmap.sprints',
    'roadmap.sprintResults.credits',
    'roadmap.sprintResults.closures',
    'roadmap.sprintParticipation'
] as const;
export type ProjectCollectionPath = typeof PROJECT_COLLECTION_PATHS[number];
export const PROJECT_BLOCK_PATHS = ['project', 'workflow', 'relations', 'dayPlanner', 'views', 'extensions'] as const;
export type ProjectBlockPath = typeof PROJECT_BLOCK_PATHS[number];
export type ProjectPatchOp =
    | { op: 'upsert'; at: ProjectCollectionPath; key: string; value: Row }
    | { op: 'remove'; at: ProjectCollectionPath; key: string }
    | { op: 'order'; at: ProjectCollectionPath; keys: string[] }
    | { op: 'set'; at: ProjectBlockPath; value: unknown };

/** The fields each operation must have, and no others. */
const OPERATION_FIELDS: Record<string, readonly string[]> = {
    set: ['op', 'at', 'value'],
    upsert: ['op', 'at', 'key', 'value'],
    order: ['op', 'at', 'keys'],
    remove: ['op', 'at', 'key']
};

/** The identity of a stored row. `runtime` reads the in-memory row, whose field names differ. */
export function projectCollectionIdentity(at: ProjectCollectionPath, row: Row, runtime = false): string {
    if (at === 'roadmap.sprintParticipation') return `${String(row.sprintId)}:${String((row[runtime ? 'task' : 'workitem'] as Row).id)}`;
    if (at === 'roadmap.sprintResults.credits') return String(row[runtime ? 'taskKey' : 'workitemKey']);
    if (at === 'roadmap.sprintResults.closures') return String(row.sprintId);
    return String(row.id);
}

const isFilledText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isPositiveInteger = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const isUniqueTextList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim()) && new Set(value).size === value.length;

/** Entity validators throw on invalid input; `isProjectPatch` turns that into `false`. */
function validEntity(at: ProjectCollectionPath, row: Row): boolean {
    if (at === 'workitems') {
        assertWorkitemFile(row);
        return true;
    }
    if (at === 'projectControl.records') {
        if (!isUniqueTextList(row.assigneeIds) || (row.ownerId !== null && typeof row.ownerId !== 'string')) return false;
        // Members are not known here: resolve each id to itself so the runtime rules can run.
        const index = memberIndexFor({ members: row.assigneeIds.map((id) => ({ id, name: id })) });
        const record = controlFromFile(row, index);
        parseProjectControl({ version: 3, records: [record], lastNumber: Number(String(row.id).match(/(\d+)$/)?.[1]) });
        return true;
    }
    if (at === 'roadmap.sprintResults.credits') {
        parseSprintResults({ version: 1, credits: [creditFromFile(row)], closures: [] });
        return true;
    }
    if (at === 'roadmap.sprintResults.closures') {
        parseSprintResults({ version: 1, credits: [], closures: [closureFromFile(row)] });
        return true;
    }
    if (at === 'roadmap.sprintParticipation') {
        participationFromFile(row);
        return isFilledText(row.sprintId) && Boolean(normalizeTimestamp(row.at));
    }
    const milestone = at === 'roadmap.milestones';
    const sprint = at === 'roadmap.sprints';
    const dates = milestone ? ['dueDate'] as const : ['startDate', 'endDate'] as const;
    return Boolean(normalizeRoadmapItems([row], dates, dates, !milestone, !sprint, sprint));
}

function validRelations(value: Row): boolean {
    const validEdge = (edge: unknown) => isRecord(edge)
        && isFilledText(edge.source) && isFilledText(edge.target) && edge.source !== edge.target
        && ['related', 'blocks'].includes(String(edge.kind));
    const validExternal = (entry: unknown) => isRecord(entry)
        && typeof entry.projectId === 'string' && typeof entry.projectTitle === 'string' && typeof entry.title === 'string'
        && isPositiveInteger(entry.workitemId);
    return Array.isArray(value.edges) && value.edges.every(validEdge)
        && isRecord(value.external) && Object.values(value.external).every(validExternal);
}

function validBlock(at: ProjectBlockPath, value: unknown): boolean {
    if (at === 'extensions') {
        return value === null || (isRecord(value) && Object.keys(value).every((key) => !KNOWN_PROJECT_EXTENSIONS.has(key)));
    }
    if (at === 'views') {
        if (value === null) return true;
        if (!isRecord(value) || !isRecord(value.board) || !isRecord(value.board.hiddenStateIds)) return false;
        const hidden = value.board.hiddenStateIds;
        parseBoardView({ version: 1, hiddenStateIds: hidden.technical, ...(hidden.functional ? { functionalHiddenStateIds: hidden.functional } : {}) });
        return true;
    }
    if (!isRecord(value)) return false;
    if (at === 'project') {
        parseProjectData(projectBlockFromFile(value).project);
        return typeof value.title === 'string' && Boolean(value.title.trim());
    }
    if (at === 'workflow') {
        const runtime = workflowBlockFromFile(value);
        parseWorkflow(runtime.workflow);
        parseWorkflow(runtime.functionalWorkflow);
        parseWorkflowTypes(runtime.workflowTypes);
        if (runtime.hierarchyAutomations) parseHierarchyAutomations(runtime.hierarchyAutomations);
        return true;
    }
    if (at === 'dayPlanner') return Array.isArray(value.blocks) && Boolean(normalizeDayPlannerExtension({ version: 1, blocks: dayPlannerFromFile(value.blocks) }));
    if (at === 'relations') return validRelations(value);
    return false;
}

function validOperation(op: unknown): boolean {
    if (!isRecord(op) || typeof op.at !== 'string') return false;
    const fields = OPERATION_FIELDS[String(op.op)];
    if (!fields || Object.keys(op).some((key) => !fields.includes(key)) || fields.some((key) => !(key in op))) return false;
    if (op.op === 'set') {
        return (PROJECT_BLOCK_PATHS as readonly string[]).includes(op.at) && validBlock(op.at as ProjectBlockPath, op.value);
    }
    if (!(PROJECT_COLLECTION_PATHS as readonly string[]).includes(op.at)) return false;
    const at = op.at as ProjectCollectionPath;
    if (op.op === 'order') return isUniqueTextList(op.keys);
    if (!isFilledText(op.key)) return false;
    if (op.op === 'remove') return true;
    return isRecord(op.value) && validEntity(at, op.value) && projectCollectionIdentity(at, op.value) === op.key;
}

/** Strict validation at import/save boundaries; replay operates on this contract. */
export function isProjectPatch(value: unknown): value is ProjectPatchOp[] {
    if (!Array.isArray(value)) return false;
    try { return value.every(validOperation); }
    catch { return false; }
}
