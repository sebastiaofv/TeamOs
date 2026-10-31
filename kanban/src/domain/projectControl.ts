import type { Attachment, BoardData, LooseBoardData, TimelineChanges } from './types';
import { isRecord, normalizeTimestamp, nowIso } from './util';
import { cloneSerializable } from './serializable';
import { parseRoadmapIsoDate } from './roadmap';
import { validateCommentInput } from './comments';

export type ControlErrorCode = 'invalid' | 'references' | 'authorRequired' | 'stale' | 'dates' | 'materializedDateRequired';
export class ControlError extends Error {
    constructor(public readonly code: ControlErrorCode, message: string) { super(message); }
}

export const CONTROL_KINDS = ['risks', 'decisions', 'deliverables'] as const;
export type ControlKind = typeof CONTROL_KINDS[number];
export const CONTROL_STATUSES = {
    risks: ['open', 'in-mitigation', 'materialized', 'closed'],
    decisions: ['proposed', 'approved', 'rejected', 'superseded', 'cancelled'],
    deliverables: ['planned', 'in-progress', 'delivered', 'accepted', 'cancelled']
} as const;
export const ASSESSMENTS = ['low', 'medium', 'high'] as const;
export type Assessment = typeof ASSESSMENTS[number];
export type ControlRelated = { phaseIds: string[]; milestoneIds: string[]; workitemIds: number[] };
export type ControlComment = { id: string; at: string; author: { name: string; kind: 'local' }; text: string; images: Attachment[] };
export type ControlHistory = { id: string; at: string; author: string; changes: TimelineChanges };
export type ControlRecord = {
    id: string; kind: ControlKind; title: string; description: string; status: string; owner: string;
    probability: Assessment; impact: Assessment; mitigationPlan: string; contingencyPlan: string;
    decisionMaker: string; decisionDate: string; rationale: string;
    validator: string; dueDate: string; deliveredDate: string; acceptedDate: string;
    materializedDate: string; actualImpact: string;
    related: ControlRelated; createdAt: string; updatedAt: string;
    comments: ControlComment[]; history: ControlHistory[];
};
export type ProjectControl = { version: 1; lastNumber: number; records: ControlRecord[] };
export function emptyProjectControl(): ProjectControl { return { version: 1, lastNumber: 0, records: [] }; }
export function controlRecords(data?: LooseBoardData | null): ControlRecord[] {
    return (data?.extensions?.projectControl as ProjectControl | undefined)?.records || [];
}
export function riskLevel(record: Pick<ControlRecord, 'probability' | 'impact'>): Assessment {
    const score = (ASSESSMENTS.indexOf(record.probability) + 1) * (ASSESSMENTS.indexOf(record.impact) + 1);
    return score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';
}
export function controlPending(record: ControlRecord): boolean {
    return !['closed', 'accepted', 'cancelled', 'approved', 'rejected', 'superseded'].includes(record.status);
}
export function newControlRecord(kind: ControlKind, related?: Partial<ControlRelated>): ControlRecord {
    const at = nowIso();
    return { id: '', kind, title: '', description: '', status: CONTROL_STATUSES[kind][0], owner: '', probability: 'medium', impact: 'medium', mitigationPlan: '', contingencyPlan: '', decisionMaker: '', decisionDate: '', rationale: '', validator: '', dueDate: '', deliveredDate: '', acceptedDate: '', materializedDate: '', actualImpact: '', related: { phaseIds: [], milestoneIds: [], workitemIds: [], ...related }, createdAt: at, updatedAt: at, comments: [], history: [] };
}
const textFields = ['title', 'description', 'owner', 'mitigationPlan', 'contingencyPlan', 'decisionMaker', 'rationale', 'validator', 'actualImpact'] as const;
const dateFields = ['decisionDate', 'dueDate', 'deliveredDate', 'acceptedDate', 'materializedDate'] as const;
function fail(): never { throw new ControlError('invalid', 'Invalid Project Control record.'); }
export function parseProjectControl(value: unknown): ProjectControl | undefined {
    // Legacy files need no synthetic records or IDs. v1 is an additive, versioned extension.
    if (value === undefined) return undefined;
    if (!isRecord(value) || value.version !== 1 || !Number.isSafeInteger(value.lastNumber) || Number(value.lastNumber) < 0 || !Array.isArray(value.records)) fail();
    const ids = new Set<string>();
    for (const item of value.records) {
        if (!isRecord(item) || typeof item.id !== 'string' || !/^PC-[1-9]\d*$/.test(item.id) || ids.has(item.id) || Number(item.id.slice(3)) > Number(value.lastNumber) || !CONTROL_KINDS.includes(item.kind as ControlKind)) fail();
        ids.add(item.id);
        if (!(CONTROL_STATUSES[item.kind as ControlKind] as readonly unknown[]).includes(item.status) || !ASSESSMENTS.includes(item.probability as Assessment) || !ASSESSMENTS.includes(item.impact as Assessment)) fail();
        if (textFields.some((key) => typeof item[key] !== 'string') || !String(item.title).trim() || String(item.title).length > 200) fail();
        if (dateFields.some((key) => typeof item[key] !== 'string' || (item[key] !== '' && !parseRoadmapIsoDate(item[key])))) fail();
        if (!normalizeTimestamp(item.createdAt) || !normalizeTimestamp(item.updatedAt) || !isRecord(item.related)) fail();
        for (const key of ['phaseIds', 'milestoneIds', 'workitemIds']) {
            const refs = item.related[key];
            if (!Array.isArray(refs) || new Set(refs).size !== refs.length || refs.some((ref) => key === 'workitemIds' ? !Number.isSafeInteger(ref) || Number(ref) <= 0 : typeof ref !== 'string' || !ref.trim())) fail();
        }
        if (!Array.isArray(item.comments) || !Array.isArray(item.history)) fail();
        const commentIds = new Set<string>();
        for (const comment of item.comments) {
            if (!isRecord(comment) || typeof comment.id !== 'string' || commentIds.has(comment.id) || !normalizeTimestamp(comment.at) || !isRecord(comment.author) || comment.author.kind !== 'local') fail();
            validateCommentInput({ id: comment.id, author: comment.author.name as string, text: comment.text as string, images: comment.images as Attachment[] });
            commentIds.add(comment.id);
        }
        const historyIds = new Set<string>();
        for (const event of item.history) {
            if (!isRecord(event) || typeof event.id !== 'string' || !event.id || historyIds.has(event.id) || typeof event.author !== 'string' || !event.author.trim() || !normalizeTimestamp(event.at) || !isRecord(event.changes)) fail();
            historyIds.add(event.id);
            for (const change of Object.values(event.changes)) if (!isRecord(change) || !('before' in change) || !('after' in change)) fail();
        }
    }
    return cloneSerializable(value) as ProjectControl;
}
export function assertControlReferences(data: BoardData, record: ControlRecord): void {
    const roadmap = data.extensions.roadmap;
    if (record.related.phaseIds.some((id) => !roadmap?.phases.some((item) => item.id === id)) || record.related.milestoneIds.some((id) => !roadmap?.milestones.some((item) => item.id === id)) || record.related.workitemIds.some((id) => !data.board.tasks.some((task) => task.id === id))) throw new ControlError('references', 'A related project element no longer exists.');
}
export function saveControlRecord(data: BoardData, input: ControlRecord, author: string): ControlRecord {
    if (!author.trim()) throw new ControlError('authorRequired', 'An author is required.');
    const extension = data.extensions.projectControl || emptyProjectControl();
    const before = extension.records.find((record) => record.id === input.id);
    if (input.id && !before) throw new ControlError('stale', 'Project Control record no longer exists.');
    const timeline = data.extensions.timeline;
    const lastNumber = (timeline?.events || []).reduce((highest, event) => Math.max(highest, event.snapshot?.extensions?.projectControl?.lastNumber || 0), extension.lastNumber);
    const record = cloneSerializable(input);
    record.id = before?.id || `PC-${lastNumber + 1}`;
    if (before && before.kind !== record.kind) fail();
    record.title = record.title.trim();
    if (record.kind === 'deliverables' && ((['delivered', 'accepted'].includes(record.status) && !record.deliveredDate) || (record.status === 'accepted' && !record.acceptedDate) || (record.acceptedDate && record.deliveredDate && record.acceptedDate < record.deliveredDate))) throw new ControlError('dates', 'Delivery and acceptance dates are required and must be in chronological order.');
    if (record.kind === 'risks' && record.status === 'materialized' && !record.materializedDate) throw new ControlError('materializedDateRequired', 'A materialization date is required.');
    record.createdAt = before?.createdAt || nowIso(); record.updatedAt = nowIso();
    record.comments = before?.comments || []; record.history = before?.history || [];
    assertControlReferences(data, record);
    const changes: TimelineChanges = {};
    for (const key of Object.keys(record) as (keyof ControlRecord)[]) {
        if (['comments', 'history', 'updatedAt'].includes(key)) continue;
        if (JSON.stringify(before?.[key]) !== JSON.stringify(record[key])) changes[key] = { before: before?.[key] ?? null, after: cloneSerializable(record[key]) };
    }
    if (!Object.keys(changes).length) return before!;
    record.history = [...record.history, { id: crypto.randomUUID(), at: record.updatedAt, author: author.trim(), changes }];
    const next: ProjectControl = { version: 1, lastNumber: before ? lastNumber : lastNumber + 1, records: [...extension.records.filter((item) => item.id !== record.id), record] };
    parseProjectControl(next); data.extensions.projectControl = next;
    return record;
}
/** Keep the existing work calculation. A pending acceptance caps completion at 99%. */
export function gateControlProgress(data: BoardData, kind: 'phases' | 'milestones', ids: ReadonlySet<string>, percent: number | null): number | null {
    const key = kind === 'phases' ? 'phaseIds' : 'milestoneIds';
    const pending = controlRecords(data).some((record) => record.kind === 'deliverables' && record.status !== 'accepted' && record.related[key].some((id) => ids.has(id)));
    return pending && percent !== null ? Math.min(percent, 99) : percent;
}

/** Deleting an element removes its links, retaining the record and its previous associations in history. */
export function removeDeletedControlLinks(data: BoardData, previous: BoardData, author: string): boolean {
    let changed = false;
    const removed = {
        phaseIds: new Set((previous.extensions.roadmap?.phases || []).filter((item) => !data.extensions.roadmap?.phases.some((next) => next.id === item.id)).map((item) => item.id)),
        milestoneIds: new Set((previous.extensions.roadmap?.milestones || []).filter((item) => !data.extensions.roadmap?.milestones.some((next) => next.id === item.id)).map((item) => item.id)),
        workitemIds: new Set(previous.board.tasks.filter((task) => !data.board.tasks.some((next) => next.id === task.id)).map((task) => task.id))
    };
    for (const record of controlRecords(data)) {
        const related = { phaseIds: record.related.phaseIds.filter((id) => !removed.phaseIds.has(id)), milestoneIds: record.related.milestoneIds.filter((id) => !removed.milestoneIds.has(id)), workitemIds: record.related.workitemIds.filter((id) => !removed.workitemIds.has(id)) };
        if (JSON.stringify(related) !== JSON.stringify(record.related)) { saveControlRecord(data, { ...record, related }, author); changed = true; }
    }
    return changed;
}
