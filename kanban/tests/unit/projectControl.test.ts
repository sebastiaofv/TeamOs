import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { ASSESSMENTS, controlRecords, gateControlProgress, newControlRecord, parseProjectControl, removeDeletedControlLinks, riskLevel, saveControlRecord } from '../../src/domain/projectControl';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import type { BoardData } from '../../src/domain/types';

const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-20.board.json', 'utf8'));
describe('Project Control persistence and lifecycle', () => {
    it('validates the manual board and round-trips identities, history, completed and superseded records', () => {
        const data = fixture(); validateBoardData(data);
        const saved = serializeBoardDataFromObject(data); validateBoardData(saved);
        expect(saved.extensions.projectControl).toEqual(data.extensions.projectControl);
        expect(serializeBoardDataFromObject(saved).extensions.projectControl).toEqual(data.extensions.projectControl);
        expect(saved.board.tasks.map((task) => task.id)).toEqual(data.board.tasks.map((task) => task.id));
    });
    it.each([1, 2, 3, 4, 5])('opens legacy board schema %i without inventing control records or modifying IDs', (version) => {
        const data = fixture(); delete data.extensions.projectControl; data.meta.schemaVersion = version;
        data.extensions.roadmap!.version = Math.min(version, 4);
        data.extensions.roadmap!.phases.forEach((item) => { delete item.objective; delete item.color; });
        data.extensions.roadmap!.milestones.forEach((item) => { delete item.objective; delete item.color; });
        validateBoardData(data);
        const saved = serializeBoardDataFromObject(data); validateBoardData(saved);
        expect(saved.extensions.projectControl).toBeUndefined();
        expect(saved.board.tasks.map((task) => [task.id, task.title])).toEqual(data.board.tasks.map((task) => [task.id, task.title]));
    });
    it('uses monotonic IDs, records author and deltas, and preserves materialization without making workitems', () => {
        const data = fixture(); const tasks = structuredClone(data.board.tasks);
        const draft = { ...newControlRecord('risks'), title: 'New risk' };
        const risk = saveControlRecord(data, draft, 'Ana'); expect(risk.id).toBe('PC-9');
        saveControlRecord(data, { ...risk, status: 'materialized', materializedDate: '2026-10-31', actualImpact: 'Two days' }, 'Rui');
        const updated = controlRecords(data).find((record) => record.id === risk.id)!;
        expect(updated.history).toHaveLength(2); expect(updated.history[1].author).toBe('Rui');
        expect(updated.history[1].changes.status).toEqual({ before: 'open', after: 'materialized' });
        expect(data.board.tasks).toEqual(tasks);
        expect(() => saveControlRecord(data, { ...updated, id: 'PC-999' }, 'Ana')).toThrow(/no longer exists/);
        expect(() => saveControlRecord(data, { ...updated, title: '' }, 'Ana')).toThrow();
    });
    it('calculates all nine risk levels consistently', () => {
        const grid = ASSESSMENTS.flatMap((probability) => ASSESSMENTS.map((impact) => riskLevel({ probability, impact })));
        expect(grid).toEqual(['low', 'low', 'medium', 'low', 'medium', 'high', 'medium', 'high', 'high']);
    });
    it('rejects unsupported versions, duplicate IDs, malformed dates, ratings, history and comments instead of dropping them', () => {
        const extension = fixture().extensions.projectControl!;
        for (const malformed of [
            { ...extension, version: 2 }, { ...extension, lastNumber: 0 }, { ...extension, records: [...extension.records, extension.records[0]] },
            { ...extension, records: [{ ...extension.records[0], dueDate: '2026-02-30' }] },
            { ...extension, records: [{ ...extension.records[0], probability: 'critical' }] },
            { ...extension, records: [{ ...extension.records[0], history: [{ id: 'bad' }] }] },
            { ...extension, records: [{ ...extension.records[0], comments: [{ id: 'bad' }] }] }
        ]) expect(() => parseProjectControl(malformed)).toThrow();
        expect(() => serializeBoardDataFromObject({ ...fixture(), extensions: { projectControl: fromAny({ version: 2 }) } })).toThrow();
    });
    it('keeps associations shared and direct, records unlinking, and never cascades a phase association to its workitems', () => {
        const data = fixture(); const record = controlRecords(data)[0];
        saveControlRecord(data, { ...record, related: { ...record.related, phaseIds: ['launch'], workitemIds: [] } }, 'Ana');
        expect(controlRecords(data)).toHaveLength(8);
        const updated = controlRecords(data).find((item) => item.id === record.id)!;
        expect(updated.related.workitemIds).toEqual([]);
        expect(updated.history.at(-1)!.changes.related).toBeDefined();
        const previous = structuredClone(data); data.board.tasks = data.board.tasks.filter((task) => task.id !== 1);
        expect(removeDeletedControlLinks(data, previous, 'Ana')).toBe(true);
        expect(controlRecords(data).find((item) => item.id === 'PC-6')!.related.workitemIds).toEqual([2]);
        expect(controlRecords(data)).toHaveLength(8);
        expect(() => saveControlRecord(data, { ...updated, related: { phaseIds: ['missing'], milestoneIds: [], workitemIds: [] } }, 'Ana')).toThrow(/no longer exists/);
    });
    it('caps only completion and restores it after explicit acceptance; cancelled deliverables also require acceptance or unlinking', () => {
        const data = fixture();
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(99);
        expect(gateControlProgress(data, 'milestones', new Set(['release']), 100)).toBe(99);
        expect(gateControlProgress(data, 'phases', new Set(['build']), 63)).toBe(63);
        expect(gateControlProgress(data, 'phases', new Set(['build']), null)).toBeNull();
        expect(gateControlProgress(data, 'milestones', new Set(['independent']), 100)).toBe(100);
        const deliverable = controlRecords(data).find((item) => item.id === 'PC-6')!;
        expect(() => saveControlRecord(data, { ...deliverable, status: 'accepted' }, 'Ana')).toThrow(/dates/);
        saveControlRecord(data, { ...deliverable, status: 'accepted', acceptedDate: '2026-10-31' }, 'Ana');
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(100);
        saveControlRecord(data, { ...controlRecords(data).find((item) => item.id === 'PC-6')!, status: 'cancelled' }, 'Ana');
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(99);
    });
    it('does not reuse IDs after a timeline restore to before record creation', () => {
        const data = createEmptyProjectData('Restore'); ensureBoardTimelineBaseline(data);
        const first = saveControlRecord(data, { ...newControlRecord('risks'), title: 'First' }, 'Ana');
        appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: first.id, summary: 'Created', snapshot: createBoardStateSnapshot(data) });
        delete data.extensions.projectControl;
        const next = saveControlRecord(data, { ...newControlRecord('risks'), title: 'After restore' }, 'Ana');
        expect(next.id).toBe('PC-2');
    });
    it('replays records and comments at their actual timeline cutoff', () => {
        const data = createEmptyProjectData('Timeline'); ensureBoardTimelineBaseline(data);
        const record = saveControlRecord(data, { ...newControlRecord('decisions'), title: 'Decision' }, 'Ana');
        appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: record.id, summary: 'Decision created', snapshot: createBoardStateSnapshot(data) });
        const extension = data.extensions.projectControl!;
        extension.records[0].comments.push({ id: 'comment-1', at: new Date().toISOString(), author: { name: 'Rui', kind: 'local' }, text: 'Approved evidence', images: [] });
        appendTimelineEvent(data, { kind: 'board.control.comment', entityType: 'board', entityId: record.id, summary: 'Comment published', snapshot: createBoardStateSnapshot(data) });
        expect(controlRecords(reconstructBoardStateFromTimeline(data, 0))).toHaveLength(0);
        expect(controlRecords(reconstructBoardStateFromTimeline(data, 1))[0].comments).toHaveLength(0);
        expect(controlRecords(reconstructBoardStateFromTimeline(data, 2))[0].comments[0].text).toBe('Approved evidence');
    });
});
