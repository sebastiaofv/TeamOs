import { z } from 'zod';
import { filledTextSchema, positiveIntegerSchema, timestampSchema, uniqueIdListSchema, recordSchema } from './fileValidation';
// Shapes and validation of the entities stored in project.json v1 (see PROJECT_FORMAT.md).
//
// The field tables below are the single source for writing, validating and
// documenting which fields each workitem type and Project Control type carries;
// tests/unit/projectFileSchema.test.ts keeps the tables in PROJECT_FORMAT.md equal to them.

import type { Attachment, DayPlanBlock, ProjectMember, SprintClosure, SprintCredit, Task, Workflow, WorkflowTypes, WorkitemType } from './types';
import type { Assessment, ControlKind, ControlRelated } from './projectControl';
import { WORKITEM_FIELDS, WORKITEM_TYPES, workitemFieldNames } from './workitems';
import { parseRoadmapIsoDate } from './roadmap';

type Rec = Record<string, unknown>;
type WorkitemTextField = typeof WORKITEM_FIELDS[number];

/** Project Control record types as stored: singular, like workitem types. */
export type ControlTypeFile = 'risk' | 'decision' | 'deliverable';
export const CONTROL_TYPE_TO_FILE: Readonly<Record<ControlKind, ControlTypeFile>> = { risks: 'risk', decisions: 'decision', deliverables: 'deliverable' };
export const CONTROL_KIND_FROM_FILE: Readonly<Record<string, ControlKind>> = { risk: 'risks', decision: 'decisions', deliverable: 'deliverables' };

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

const attachmentFileSchema = z.looseObject({
    id: filledTextSchema, name: z.string(), mime: z.string(),
    kind: z.enum(['file', 'image']), sizeBytes: z.number().nonnegative(), createdAt: timestampSchema
}).refine(value => typeof value.dataUrl === 'string' || (typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)));
const planningModeSchema = z.enum(['none', 'inherit', 'explicit']);
const roadmapDateSchema = z.string().refine(value => Boolean(parseRoadmapIsoDate(value)));
const optionalTextFields = Object.fromEntries(WORKITEM_FIELDS.map(field => [field, z.string().optional()]));
const checkedOptionalFields = ['permanentId', 'displayId', 'severity', 'blockerReason', 'statusChangedAt', 'pullRequests',
    'parentId', 'phaseId', 'milestoneId', 'sprintId', 'storyPoints', 'effort', ...WORKITEM_FIELDS];

/** Loose objects retain extension fields. Validation never replaces or coerces the input. */
export const workitemFileSchema = z.looseObject({
    ...optionalTextFields,
    id: positiveIntegerSchema, type: z.enum(WORKITEM_TYPES),
    permanentId: z.string().optional(), displayId: z.string().optional(),
    title: z.string().refine(value => Boolean(value.trim())), description: z.string(),
    status: z.string().refine(value => Boolean(value.trim())), parentId: positiveIntegerSchema.nullable().optional(),
    assigneeIds: uniqueIdListSchema, responsibleId: z.string().nullable(), tags: z.array(z.string()),
    priority: z.enum(['high', 'medium', 'low']).nullable(), effort: z.enum(['XS', 'S', 'M', 'L', 'XL']).nullable().optional(),
    storyPoints: z.number().nonnegative().nullable().optional(), dueDate: roadmapDateSchema.nullable(),
    sprintId: filledTextSchema.nullable().optional(), phaseMode: planningModeSchema, milestoneMode: planningModeSchema,
    phaseId: filledTextSchema.nullable().optional(), milestoneId: filledTextSchema.nullable().optional(),
    blocked: z.boolean(), blockerReason: z.string().optional(), archived: z.boolean(),
    checklist: z.array(z.looseObject({ text: z.string(), done: z.boolean() })), pullRequests: z.array(z.string()).optional(),
    // Files may carry hashes before attachment hydration; the runtime converter owns that distinction.
    attachments: z.array(z.custom<Attachment>(value => attachmentFileSchema.safeParse(value).success)),
    severity: z.string().optional(), acceptance: z.custom<Task['acceptance']>().optional(),
    sprintHistory: z.custom<Task['sprintHistory']>().optional(),
    createdAt: timestampSchema, updatedAt: timestampSchema, statusChangedAt: timestampSchema.optional()
}).superRefine((value, context) => {
    if (value.responsibleId !== null && !value.assigneeIds.includes(value.responsibleId)) context.addIssue({ code: 'custom', path: ['responsibleId'], message: 'Responsible must be an assignee.' });
    for (const field of ['phase', 'milestone'] as const) if (value[`${field}Mode`] === 'explicit' && !value[`${field}Id`]) context.addIssue({ code: 'custom', path: [`${field}Id`], message: 'Explicit planning requires an id.' });
    // Optional means absent, not an explicitly present undefined value.
    for (const field of checkedOptionalFields) if (field in value && value[field] === undefined) context.addIssue({ code: 'custom', path: [field], message: 'Invalid present field.' });
});
export type WorkitemFile = z.infer<typeof workitemFileSchema> & Partial<Record<WorkitemTextField, string>>;

const assessmentSchema = z.custom<Assessment>(value => typeof value === 'string');
export const controlRecordFileSchema = z.looseObject({
    id: filledTextSchema, type: z.enum(['risk', 'decision', 'deliverable']), title: z.string(), description: z.string(), status: z.string(),
    ownerId: filledTextSchema.nullable(), assigneeIds: uniqueIdListSchema, tags: z.array(z.string()),
    related: z.custom<ControlRelated>(value => recordSchema.safeParse(value).success), dueDate: z.string().nullable(),
    createdAt: timestampSchema, updatedAt: timestampSchema,
    legacyWorkitemIds: z.custom<number[]>(Array.isArray).optional(),
    probability: assessmentSchema.optional(), impact: assessmentSchema.optional(), mitigationPlan: z.string().optional(),
    contingencyPlan: z.string().optional(), materializedDate: z.string().nullable().optional(), actualImpact: z.string().optional(),
    decisionMaker: z.string().optional(), decisionDate: z.string().nullable().optional(), rationale: z.string().optional(),
    validator: z.string().optional(), deliveredDate: z.string().nullable().optional(), acceptedDate: z.string().nullable().optional()
}).superRefine((value, context) => {
    for (const field of CONTROL_TYPE_FIELDS[value.type]) if (value[field] === undefined) context.addIssue({ code: 'custom', path: [field], message: 'Missing type-specific field.' });
    if ('legacyWorkitemIds' in value && value.legacyWorkitemIds === undefined) context.addIssue({ code: 'custom', path: ['legacyWorkitemIds'], message: 'Invalid present field.' });
});
export type ControlRecordFile = z.infer<typeof controlRecordFileSchema>;

/** Keep boundary errors stable while schemas own structural validation. */
export function assertWorkitemFile(value: Rec): asserts value is WorkitemFile {
    if (!workitemFileSchema.safeParse(value).success) throw new Error(`Invalid project.json: malformed workitem ${String(value.id)}.`);
    const type = String(value.type);
    const notApplicable = (field: string): never => { throw new Error(`Invalid project.json: workitem ${String(value.id)} has field ${field}, which does not apply to ${type}.`); };
    for (const field of Object.keys(WORKITEM_FIELD_TYPES)) if (field in value && !workitemFieldApplies(field, type)) notApplicable(field);
    if ('phaseId' in value && value.phaseMode !== 'explicit') notApplicable('phaseId');
    if ('milestoneId' in value && value.milestoneMode !== 'explicit') notApplicable('milestoneId');
    if ('blockerReason' in value && value.blocked !== true) notApplicable('blockerReason');
}

export function assertControlRecordFile(value: Rec): asserts value is ControlRecordFile {
    const type = String(value.type) as ControlTypeFile;
    const malformed = (): never => { throw new Error(`Invalid project.json: malformed Project Control record ${String(value.id)}.`); };
    if (!Object.hasOwn(CONTROL_TYPE_FIELDS, type) || 'kind' in value) malformed();
    for (const field of ALL_CONTROL_TYPE_FIELDS) if (field in value && !CONTROL_TYPE_FIELDS[type].includes(field)) {
        throw new Error(`Invalid project.json: record ${String(value.id)} has field ${field}, which does not apply to ${type}.`);
    }
    if (!controlRecordFileSchema.safeParse(value).success) malformed();
}
