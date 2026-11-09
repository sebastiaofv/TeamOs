import { isRecord, normalizeTimestamp } from './util';
import { assertWorkitemFile, controlFromFile, KNOWN_PROJECT_EXTENSIONS, memberIndexFor, projectBlockFromFile, workflowBlockFromFile } from './projectFormat';
import { parseProjectData } from './projectData';
import { parseProjectControl } from './projectControl';
import { parseWorkflow, parseWorkflowTypes } from './workflow';
import { parseHierarchyAutomations } from './hierarchyAutomations';
import { normalizeRoadmapItems } from './roadmap';
import { parseSprintResults } from './sprintResults';
import { normalizeDayPlannerExtension } from './dayPlanner';
import { parseBoardView } from './boardView';

type Row = Record<string, unknown>;
export const PROJECT_COLLECTION_PATHS = ['workitems', 'projectControl.records', 'roadmap.milestones', 'roadmap.phases', 'roadmap.sprints', 'roadmap.sprintResults.credits', 'roadmap.sprintResults.closures', 'roadmap.sprintParticipation'] as const;
export type ProjectCollectionPath = typeof PROJECT_COLLECTION_PATHS[number];
export const PROJECT_BLOCK_PATHS = ['project', 'workflow', 'relations', 'dayPlanner', 'views', 'extensions'] as const;
export type ProjectBlockPath = typeof PROJECT_BLOCK_PATHS[number];
export type ProjectPatchOp =
    | { op: 'upsert'; at: ProjectCollectionPath; key: string; value: Row }
    | { op: 'remove'; at: ProjectCollectionPath; key: string }
    | { op: 'order'; at: ProjectCollectionPath; keys: string[] }
    | { op: 'set'; at: ProjectBlockPath; value: unknown };

export function projectCollectionIdentity(at: ProjectCollectionPath, row: Row): string {
    if (at === 'roadmap.sprintParticipation') return `${String(row.sprintId)}:${String((row.task as Row).id)}`;
    return String(row[at === 'roadmap.sprintResults.credits' ? 'taskKey' : at === 'roadmap.sprintResults.closures' ? 'sprintId' : 'id']);
}

const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim()) && new Set(value).size === value.length;
const taskRow = (value: unknown): value is Row => isRecord(value) && Number.isSafeInteger(value.id) && Number(value.id) > 0 && typeof value.title === 'string' && typeof value.status === 'string';

function validEntity(at: ProjectCollectionPath, row: Row): boolean {
    if (at === 'workitems') { assertWorkitemFile(row); return true; }
    if (at === 'projectControl.records') {
        if (!strings(row.assigneeIds) || (row.ownerId !== null && typeof row.ownerId !== 'string')) return false;
        const index = memberIndexFor({ members: row.assigneeIds.map((id) => ({ id, name: id })) });
        const record = controlFromFile(row, index);
        parseProjectControl({ version: 3, records: [record], lastNumber: Number(String(row.id).match(/(\d+)$/)?.[1]) });
        return true;
    }
    if (at === 'roadmap.sprintResults.credits' || at === 'roadmap.sprintResults.closures') {
        parseSprintResults({ version: 1, credits: at.endsWith('credits') ? [row] : [], closures: at.endsWith('closures') ? [row] : [] });
        return true;
    }
    if (at === 'roadmap.sprintParticipation') return typeof row.sprintId === 'string' && Boolean(row.sprintId) && Boolean(normalizeTimestamp(row.at)) && taskRow(row.task);
    const milestone = at === 'roadmap.milestones';
    return Boolean(normalizeRoadmapItems([row], milestone ? ['dueDate'] : ['startDate', 'endDate'], milestone ? ['dueDate'] : ['startDate', 'endDate'], !milestone, at !== 'roadmap.sprints', at === 'roadmap.sprints'));
}

function validBlock(at: ProjectBlockPath, value: unknown): boolean {
    if (at === 'extensions') return value === null || (isRecord(value) && Object.keys(value).every((key) => !KNOWN_PROJECT_EXTENSIONS.has(key)));
    if (at === 'views') {
        if (value === null) return true;
        if (!isRecord(value) || !isRecord(value.board) || !isRecord(value.board.hiddenStateIds)) return false;
        const hidden = value.board.hiddenStateIds;
        parseBoardView({ version: 1, hiddenStateIds: hidden.technical, ...(hidden.functional ? { functionalHiddenStateIds: hidden.functional } : {}) });
        return true;
    }
    if (!isRecord(value)) return false;
    if (at === 'project') { parseProjectData(projectBlockFromFile(value).project); return typeof value.title === 'string' && Boolean(value.title.trim()); }
    if (at === 'workflow') {
        const runtime = workflowBlockFromFile(value);
        parseWorkflow(runtime.workflow); parseWorkflow(runtime.functionalWorkflow); parseWorkflowTypes(runtime.workflowTypes);
        if (runtime.hierarchyAutomations) parseHierarchyAutomations(runtime.hierarchyAutomations);
        return true;
    }
    if (at === 'dayPlanner') return Boolean(normalizeDayPlannerExtension({ version: 1, blocks: value.blocks }));
    if (at === 'relations') return Array.isArray(value.edges) && value.edges.every((edge) => isRecord(edge) && typeof edge.source === 'string' && Boolean(edge.source) && typeof edge.target === 'string' && Boolean(edge.target) && edge.source !== edge.target && ['related', 'blocks'].includes(String(edge.kind))) && isRecord(value.external) && Object.values(value.external).every((entry) => isRecord(entry) && typeof entry.projectId === 'string' && typeof entry.projectTitle === 'string' && typeof entry.title === 'string' && Number.isSafeInteger(entry.taskId) && Number(entry.taskId) > 0);
    return false;
}

/** Strict validation at import/save boundaries; replay operates on this contract. */
export function isProjectPatch(value: unknown): value is ProjectPatchOp[] {
    if (!Array.isArray(value)) return false;
    try {
        return value.every((op) => {
            if (!isRecord(op) || typeof op.at !== 'string') return false;
            const allowed = op.op === 'set' || op.op === 'upsert' ? ['op', 'at', ...(op.op === 'upsert' ? ['key'] : []), 'value'] : op.op === 'order' ? ['op', 'at', 'keys'] : ['op', 'at', 'key'];
            if (Object.keys(op).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in op))) return false;
            if (op.op === 'set') return (PROJECT_BLOCK_PATHS as readonly string[]).includes(op.at) && validBlock(op.at as ProjectBlockPath, op.value);
            if (!(PROJECT_COLLECTION_PATHS as readonly string[]).includes(op.at)) return false;
            if (op.op === 'order') return strings(op.keys);
            if (typeof op.key !== 'string' || !op.key) return false;
            if (op.op === 'remove') return true;
            return op.op === 'upsert' && isRecord(op.value) && validEntity(op.at as ProjectCollectionPath, op.value) && projectCollectionIdentity(op.at as ProjectCollectionPath, op.value) === op.key;
        });
    } catch { return false; }
}
