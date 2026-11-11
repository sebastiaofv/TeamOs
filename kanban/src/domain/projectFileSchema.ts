// Shapes and validation of the entities stored in project.json v1 (see PROJECT_FORMAT.md).
//
// The field tables below are the single source for writing, validating and
// documenting which fields each workitem type and Project Control type carries;
// tests/unit/projectFileSchema.test.ts keeps the tables in PROJECT_FORMAT.md equal to them.

import type { Attachment, ChecklistItem, DayPlanBlock, Effort, Priority, ProjectMember, SprintClosure, SprintCredit, Task, Workflow, WorkflowTypes, WorkitemType } from './types';
import type { Assessment, ControlKind, ControlRelated } from './projectControl';
import { WORKITEM_FIELDS, WORKITEM_TYPES, workitemFieldNames } from './workitems';
import { parseRoadmapIsoDate } from './roadmap';
import { isRecord, normalizeTimestamp } from './util';

type Rec = Record<string, unknown>;
type PlanningMode = NonNullable<Task['phaseMode']>;
type WorkitemTextField = typeof WORKITEM_FIELDS[number];

export type WorkitemFile = {
    id: number;
    permanentId?: string;
    displayId?: string;
    type: WorkitemType;
    title: string;
    description: string;
    status: string;
    parentId?: number | null;
    assigneeIds: string[];
    responsibleId: string | null;
    tags: string[];
    priority: Priority | null;
    effort?: Effort | null;
    storyPoints?: number | null;
    dueDate: string | null;
    sprintId?: string | null;
    phaseMode: PlanningMode;
    phaseId?: string;
    milestoneMode: PlanningMode;
    milestoneId?: string;
    blocked: boolean;
    blockerReason?: string;
    archived: boolean;
    checklist: ChecklistItem[];
    pullRequests?: string[];
    /** `dataUrl` references in memory; bare `sha256` hashes in the file text. */
    attachments: Attachment[];
    severity?: string;
    acceptance?: Task['acceptance'];
    sprintHistory?: Task['sprintHistory'];
    createdAt: string;
    updatedAt: string;
    statusChangedAt?: string;
} & Partial<Record<WorkitemTextField, string>>;

/** Project Control record types as stored: singular, like workitem types. */
export type ControlTypeFile = 'risk' | 'decision' | 'deliverable';
export const CONTROL_TYPE_TO_FILE: Readonly<Record<ControlKind, ControlTypeFile>> = { risks: 'risk', decisions: 'decision', deliverables: 'deliverable' };
export const CONTROL_KIND_FROM_FILE: Readonly<Record<string, ControlKind>> = { risk: 'risks', decision: 'decisions', deliverable: 'deliverables' };

export type ControlRecordFile = {
    id: string;
    type: ControlTypeFile;
    title: string;
    description: string;
    status: string;
    ownerId: string | null;
    assigneeIds: string[];
    tags: string[];
    related: ControlRelated;
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
    legacyWorkitemIds?: number[];
    // Risks
    probability?: Assessment;
    impact?: Assessment;
    mitigationPlan?: string;
    contingencyPlan?: string;
    materializedDate?: string | null;
    actualImpact?: string;
    // Decisions
    decisionMaker?: string;
    decisionDate?: string | null;
    rationale?: string;
    // Deliverables
    validator?: string;
    deliveredDate?: string | null;
    acceptedDate?: string | null;
};

/** Names at the moment a row was frozen, for the member ids its rows use. */
export type FrozenMembersFile = ProjectMember[];

/** A closed Sprint as stored: its workitems as they were, in the v1 workitem shape. */
export type SprintClosureFile = Omit<SprintClosure, 'tasks' | 'workflow' | 'functionalWorkflow' | 'workflowTypes'> & {
    workitems: WorkitemFile[];
    members: FrozenMembersFile;
    workflow: Omit<Workflow, 'version'>;
    functionalWorkflow: Omit<Workflow, 'version'>;
    workflowTypes?: Omit<WorkflowTypes, 'version'>;
};
export type SprintParticipationFile = { sprintId: string; at: string; workitem: WorkitemFile; members: FrozenMembersFile };
export type SprintCreditFile = Omit<SprintCredit, 'taskKey' | 'taskId'> & { workitemKey: string; workitemId: number };
export type DayPlanBlockFile = Omit<DayPlanBlock, 'taskId'> & { workitemId: number };

export type CommentSubjectFile =
    | { kind: 'workitem'; workitemId: number; workitemKey: string; workitemCreatedAt: string }
    | { kind: 'control'; recordId: string; current?: false };
export type CommentFile = Rec & { id: string; subject: CommentSubjectFile };

const NOT_EPIC: readonly WorkitemType[] = ['story', 'task', 'bug'];

/** Which workitem types carry each type-dependent field. Text fields follow `workitemFieldNames`. */
export const WORKITEM_FIELD_TYPES: Readonly<Record<string, readonly WorkitemType[]>> = {
    ...Object.fromEntries(WORKITEM_FIELDS.map((field) => [field, WORKITEM_TYPES.filter((type) => workitemFieldNames(type).includes(field))])),
    severity: ['bug'],
    parentId: NOT_EPIC,
    effort: NOT_EPIC,
    sprintId: NOT_EPIC,
    pullRequests: NOT_EPIC,
    sprintHistory: NOT_EPIC,
    storyPoints: NOT_EPIC,
    acceptance: ['story', 'bug']
};
export const workitemFieldApplies = (field: string, type: string): boolean => WORKITEM_FIELD_TYPES[field].includes(type as WorkitemType);

/** Only planning units carry points: a Task under a Story or Bug is estimated by its parent. */
export const carriesStoryPoints = (type: string, parentType: string | undefined): boolean =>
    workitemFieldApplies('storyPoints', type) && !(type === 'task' && (parentType === 'story' || parentType === 'bug'));

/** Fields that exist only on one Project Control type. Every other field, including dueDate, is common. */
export const CONTROL_TYPE_FIELDS: Readonly<Record<ControlTypeFile, readonly string[]>> = {
    risk: ['probability', 'impact', 'mitigationPlan', 'contingencyPlan', 'materializedDate', 'actualImpact'],
    decision: ['decisionMaker', 'decisionDate', 'rationale'],
    deliverable: ['validator', 'deliveredDate', 'acceptedDate']
};
export const CONTROL_DATE_FIELDS: ReadonlySet<string> = new Set(['decisionDate', 'dueDate', 'deliveredDate', 'acceptedDate', 'materializedDate']);
const ALL_CONTROL_TYPE_FIELDS = Object.values(CONTROL_TYPE_FIELDS).flat();

const PLANNING_MODES = ['none', 'inherit', 'explicit'];
const SHA256 = /^[a-f0-9]{64}$/;

const isText = (value: unknown): value is string => typeof value === 'string';
const isFilledText = (value: unknown): value is string => typeof value === 'string' && value !== '';
const isPositiveInteger = (value: unknown): boolean => Number.isSafeInteger(value) && Number(value) >= 1;
const isUniqueIdList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every(isFilledText) && new Set(value).size === value.length;
const isNullOr = (value: unknown, check: (value: unknown) => boolean): boolean => value === null || check(value);
/** An optional key: absent is fine, present must pass. */
const optional = (value: Rec, field: string, check: (value: unknown) => boolean): boolean => !(field in value) || check(value[field]);

function isAttachmentFile(value: unknown): boolean {
    if (!isRecord(value)) return false;
    const stored = isText(value.dataUrl) || (isText(value.sha256) && SHA256.test(value.sha256));
    return isFilledText(value.id) && isText(value.name) && isText(value.mime)
        && ['file', 'image'].includes(String(value.kind))
        && typeof value.sizeBytes === 'number' && Number.isFinite(value.sizeBytes) && value.sizeBytes >= 0
        && Boolean(normalizeTimestamp(value.createdAt))
        && stored;
}

const isChecklistItem = (value: unknown): boolean => isRecord(value) && isText(value.text) && typeof value.done === 'boolean';

/** Reading rejects a malformed workitem and any field that does not apply to its type. */
export function assertWorkitemFile(value: Rec): asserts value is WorkitemFile {
    const type = String(value.type);
    const malformed = (): never => { throw new Error(`Invalid project.json: malformed workitem ${String(value.id)}.`); };
    const notApplicable = (field: string): never => {
        throw new Error(`Invalid project.json: workitem ${String(value.id)} has field ${field}, which does not apply to ${type}.`);
    };

    const identity = (WORKITEM_TYPES as readonly string[]).includes(type) && isPositiveInteger(value.id)
        && isText(value.title) && value.title.trim() !== ''
        && isText(value.description)
        && isText(value.status) && value.status.trim() !== ''
        && ['permanentId', 'displayId', 'severity', 'blockerReason'].every((field) => optional(value, field, isText));
    if (!identity) malformed();

    const assignments = isUniqueIdList(value.assigneeIds)
        && isNullOr(value.responsibleId, (id) => isText(id) && (value.assigneeIds as string[]).includes(id));
    if (!assignments) malformed();

    const timestamps = Boolean(normalizeTimestamp(value.createdAt)) && Boolean(normalizeTimestamp(value.updatedAt))
        && optional(value, 'statusChangedAt', (at) => Boolean(normalizeTimestamp(at)));
    if (!timestamps) malformed();

    const content = typeof value.blocked === 'boolean' && typeof value.archived === 'boolean'
        && Array.isArray(value.checklist) && value.checklist.every(isChecklistItem)
        && Array.isArray(value.attachments) && value.attachments.every(isAttachmentFile)
        && Array.isArray(value.tags) && value.tags.every(isText)
        && optional(value, 'pullRequests', (links) => Array.isArray(links) && links.every(isText))
        && WORKITEM_FIELDS.every((field) => optional(value, field, isText));
    if (!content) malformed();

    const planning = PLANNING_MODES.includes(String(value.phaseMode)) && PLANNING_MODES.includes(String(value.milestoneMode))
        && isNullOr(value.dueDate, (date) => isText(date) && Boolean(parseRoadmapIsoDate(date)))
        && optional(value, 'parentId', (id) => isNullOr(id, isPositiveInteger))
        && ['phaseId', 'milestoneId', 'sprintId'].every((field) => optional(value, field, (id) => isNullOr(id, isFilledText)))
        && (value.phaseMode !== 'explicit' || isFilledText(value.phaseId))
        && (value.milestoneMode !== 'explicit' || isFilledText(value.milestoneId))
        && optional(value, 'storyPoints', (points) => isNullOr(points, (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0))
        && isNullOr(value.priority, (priority) => ['high', 'medium', 'low'].includes(String(priority)))
        && optional(value, 'effort', (effort) => isNullOr(effort, (size) => ['XS', 'S', 'M', 'L', 'XL'].includes(String(size))));
    if (!planning) malformed();

    for (const field of Object.keys(WORKITEM_FIELD_TYPES)) if (field in value && !workitemFieldApplies(field, type)) notApplicable(field);
    if ('phaseId' in value && value.phaseMode !== 'explicit') notApplicable('phaseId');
    if ('milestoneId' in value && value.milestoneMode !== 'explicit') notApplicable('milestoneId');
    if ('blockerReason' in value && value.blocked !== true) notApplicable('blockerReason');
}

/** Reading rejects a malformed record, a field of another type, and a missing field of its own type. */
export function assertControlRecordFile(value: Rec): asserts value is ControlRecordFile {
    const type = String(value.type) as ControlTypeFile;
    const malformed = (): never => { throw new Error(`Invalid project.json: malformed Project Control record ${String(value.id)}.`); };
    const own = Object.hasOwn(CONTROL_TYPE_FIELDS, type) ? CONTROL_TYPE_FIELDS[type] : undefined;
    if (!own || 'kind' in value) malformed();

    for (const field of ALL_CONTROL_TYPE_FIELDS) {
        if (field in value && !own!.includes(field)) {
            throw new Error(`Invalid project.json: record ${String(value.id)} has field ${field}, which does not apply to ${type}.`);
        }
    }
    const dateOrNull = (date: unknown) => isNullOr(date, isText);
    const common = isFilledText(value.id) && isText(value.title) && isText(value.description) && isText(value.status)
        && isNullOr(value.ownerId, isFilledText)
        && isUniqueIdList(value.assigneeIds)
        && Array.isArray(value.tags) && value.tags.every(isText)
        && isRecord(value.related)
        && dateOrNull(value.dueDate)
        && Boolean(normalizeTimestamp(value.createdAt)) && Boolean(normalizeTimestamp(value.updatedAt))
        && optional(value, 'legacyWorkitemIds', Array.isArray);
    if (!common) malformed();

    const specific = own!.every((field) => (CONTROL_DATE_FIELDS.has(field) ? dateOrNull(value[field]) : isText(value[field])));
    if (!specific) malformed();
}
