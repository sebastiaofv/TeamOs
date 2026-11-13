import { z } from 'zod';
import { filledTextSchema, positiveIntegerSchema, recordSchema } from './fileValidation';
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
/** The identity of a stored row. `runtime` reads the in-memory row, whose field names differ. */
export function projectCollectionIdentity(at: ProjectCollectionPath, row: Row, runtime = false): string {
    if (at === 'roadmap.sprintParticipation') return `${String(row.sprintId)}:${String((row[runtime ? 'task' : 'workitem'] as Row).id)}`;
    if (at === 'roadmap.sprintResults.credits') return String(row[runtime ? 'taskKey' : 'workitemKey']);
    if (at === 'roadmap.sprintResults.closures') return String(row.sprintId);
    return String(row.id);
}

const isFilledText = (value: unknown): value is string => typeof value === 'string' && value !== '';
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

const relationsSchema = z.looseObject({
    edges: z.array(z.looseObject({ source: filledTextSchema, target: filledTextSchema, kind: z.enum(['related', 'blocks']) }).refine(edge => edge.source !== edge.target)),
    external: z.record(z.string(), z.looseObject({ projectId: z.string(), projectTitle: z.string(), title: z.string(), workitemId: positiveIntegerSchema }))
});

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
    if (at === 'relations') return relationsSchema.safeParse(value).success;
    return false;
}

export const projectPatchOpSchema = z.discriminatedUnion('op', [
    z.strictObject({ op: z.literal('upsert'), at: z.enum(PROJECT_COLLECTION_PATHS), key: filledTextSchema, value: recordSchema }),
    z.strictObject({ op: z.literal('remove'), at: z.enum(PROJECT_COLLECTION_PATHS), key: filledTextSchema }),
    z.strictObject({ op: z.literal('order'), at: z.enum(PROJECT_COLLECTION_PATHS), keys: z.array(z.string()).refine(isUniqueTextList) }),
    z.strictObject({ op: z.literal('set'), at: z.enum(PROJECT_BLOCK_PATHS), value: z.unknown() })
]).refine(op => {
    if (op.op === 'set') return validBlock(op.at, op.value);
    if (op.op === 'upsert') return validEntity(op.at, op.value) && projectCollectionIdentity(op.at, op.value) === op.key;
    return true;
});
export type ProjectPatchOp = z.infer<typeof projectPatchOpSchema>;
export const projectPatchSchema = z.array(projectPatchOpSchema);

/** Strict validation at import/save boundaries; replay operates on this contract. */
export function isProjectPatch(value: unknown): value is ProjectPatchOp[] {
    try { return projectPatchSchema.safeParse(value).success; }
    catch { return false; }
}
