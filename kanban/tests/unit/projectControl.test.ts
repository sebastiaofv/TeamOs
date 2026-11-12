import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fromAny } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { ASSESSMENTS, controlRecords, gateControlProgress, newControlRecord, parseProjectControl, removeDeletedControlLinks, riskLevel, saveControlRecord, type ControlRecord } from '../../src/domain/projectControl';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { applyProjectSettings } from '../../src/domain/projectData';
import type { BoardData } from '../../src/domain/types';

const fixture = (): BoardData => JSON.parse(readFileSync('tests/fixtures/manual/us-20.board.json', 'utf8'));
describe('Project Control persistence and lifecycle', () => {
    it('migrates v1 workitem links to an archive, preserving IDs, comments and history through round trips', () => {
        const legacy = JSON.parse(readFileSync('tests/fixtures/project-control-v1.json', 'utf8'));
        const migrated = parseProjectControl(legacy)!;
        expect(migrated.version).toBe(3);
        expect(migrated.records.map((record) => record.id)).toEqual(legacy.records.map((record: ControlRecord) => record.id));
        for (const [index, record] of migrated.records.entries()) {
            expect(record.related).toEqual({ phaseIds: legacy.records[index].related.phaseIds, milestoneIds: legacy.records[index].related.milestoneIds });
            expect(record.legacyWorkitemIds || []).toEqual(legacy.records[index].related.workitemIds);
            expect(record.history).toEqual(legacy.records[index].history);
            expect(record.comments).toEqual(legacy.records[index].comments);
        }
        const data = fixture();
        data.extensions.projectControl = fromAny(legacy);
        const saved = serializeBoardDataFromObject(data);
        expect(saved.extensions.projectControl).toEqual(migrated);
        expect(serializeBoardDataFromObject(saved).extensions.projectControl).toEqual(migrated);
        const existing = migrated.records[0];
        expect(saveControlRecord(saved, { ...existing, title: 'Updated legacy risk' }, 'Ana').id).toBe(existing.id);
        expect(controlRecords(saved).find((record) => record.id === existing.id)!.legacyWorkitemIds).toEqual(existing.legacyWorkitemIds);
        expect(saveControlRecord(saved, { ...newControlRecord('risks'), title: 'New risk' }, 'Ana').id).toBe('ATL-RK-9');
        expect(saved.board.tasks).toEqual(serializeBoardDataFromObject(data).board.tasks);
    });
    it('migrates v2 participants and tags without losing legacy owners or changing stored history', () => {
        const legacy = JSON.parse(readFileSync('tests/fixtures/project-control-v2.json', 'utf8'));
        legacy.records[0].owner = ' Legacy external owner ';
        legacy.records[1].owner = '   ';
        const migrated = parseProjectControl(legacy)!;
        expect(migrated.version).toBe(3);
        migrated.records.forEach((record, index) => {
            expect(record).toEqual({ ...legacy.records[index], assignees: legacy.records[index].owner.trim() ? [legacy.records[index].owner] : [], tags: [] });
        });
        expect(legacy.version).toBe(2);
        expect(legacy.records[0].assignees).toBeUndefined();
        const data = fixture(); data.extensions.projectControl = fromAny(legacy);
        const saved = serializeBoardDataFromObject(data);
        expect(saved.extensions.projectControl).toEqual(migrated);
        expect(serializeBoardDataFromObject(saved).extensions.projectControl).toEqual(migrated);
    });
    it('saves curated participants and tags with history and round trips, rejecting unknown additions', () => {
        const data = fixture(); const original = controlRecords(data)[0];
        ensureBoardTimelineBaseline(data);
        const saved = saveControlRecord(data, { ...original, assignees: [...original.assignees, 'Rui Costa'], tags: ['documentation'] }, 'Ana');
        expect(saved.history.at(-1)!.changes.assignees).toEqual({ before: original.assignees, after: ['Ana Silva', 'Rui Costa'] });
        expect(saved.history.at(-1)!.changes.tags).toEqual({ before: ['feature'], after: ['documentation'] });
        expect(controlRecords(serializeBoardDataFromObject(data)).find((record) => record.id === saved.id)).toEqual(saved);
        appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: saved.id, summary: 'People and tags', snapshot: createBoardStateSnapshot(data) });
        expect(controlRecords(reconstructBoardStateFromTimeline(data, 0))[0].assignees).toEqual(['Ana Silva']);
        expect(controlRecords(reconstructBoardStateFromTimeline(data, 1)).find((record) => record.id === saved.id)!.tags).toEqual(['documentation']);
        expect(() => saveControlRecord(data, { ...saved, assignees: ['Unknown member'] }, 'Ana')).toThrow(/unknownMember/);
        expect(() => saveControlRecord(data, { ...saved, tags: ['unknown'] }, 'Ana')).toThrow(/unknownTag/);
    });
    it('keeps control assignments coherent when project members are renamed and prevents removing used catalog entries', () => {
        const data = fixture(); const project = structuredClone(data.extensions.project!);
        project.members = project.members.map((member) => member.id === 'ana' ? { ...member, name: 'Ana Renamed' } : member);
        applyProjectSettings(data, { name: 'Atlas', project });
        expect(controlRecords(data)[0].owner).toBe('Ana Renamed');
        expect(controlRecords(data)[0].assignees).toEqual(['Ana Renamed']);
        const withoutMember = { ...project, members: project.members.filter((member) => member.id !== 'ana') };
        // These records alone still reserve their curated assignments.
        data.board.tasks = [];
        expect(() => applyProjectSettings(data, { name: 'Atlas', project: withoutMember })).toThrow(/memberInUse/);
        expect(() => applyProjectSettings(data, { name: 'Atlas', project: { ...project, tags: [] } })).toThrow(/tagInUse/);
    });
    it('rejects missing, malformed, duplicate participants/tags and responsibility outside participation in v3', () => {
        const extension = fixture().extensions.projectControl!;
        for (const patch of [
            { assignees: undefined }, { tags: undefined }, { assignees: 'Ana Silva' }, { tags: [42] },
            { assignees: ['Ana Silva', 'ana silva'] }, { assignees: [' Ana Silva '] }, { assignees: [] },
            { tags: ['feature', 'FEATURE'] }, { tags: [''] }, { tags: ['x'.repeat(31)] }
        ]) expect(() => parseProjectControl({ ...extension, records: [{ ...extension.records[0], ...patch }] })).toThrow();
    });
    it('assigns project and type IDs once, keeps numbering across types and rejects active workitem links', () => {
        const data = createEmptyProjectData('Atlas', 'ATL');
        const risk = saveControlRecord(data, { ...newControlRecord('risks'), title: 'Risk' }, 'Ana');
        expect(risk.id).toBe('ATL-RK-1');
        expect(saveControlRecord(data, { ...newControlRecord('decisions'), title: 'Decision' }, 'Ana').id).toBe('ATL-DC-2');
        expect(saveControlRecord(data, { ...newControlRecord('deliverables'), title: 'Deliverable' }, 'Ana').id).toBe('ATL-DL-3');
        data.extensions.project!.acronym = 'NEW';
        expect(saveControlRecord(data, { ...risk, title: 'Renamed' }, 'Ana').id).toBe('ATL-RK-1');
        expect(saveControlRecord(data, { ...newControlRecord('risks'), title: 'Next' }, 'Ana').id).toBe('NEW-RK-4');
        const invalid = structuredClone(data.extensions.projectControl!);
        Object.assign(invalid.records[0].related, { workitemIds: [1] });
        expect(() => parseProjectControl(invalid)).toThrow();
        expect(() => parseProjectControl({ ...invalid, records: [{ ...risk, id: 'ATL-DC-1' }] })).toThrow();
        delete data.extensions.project!.acronym;
        expect(() => saveControlRecord(data, { ...newControlRecord('risks'), title: 'Missing acronym' }, 'Ana')).toThrow(/acronym/);
    });
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
        const risk = saveControlRecord(data, draft, 'Ana'); expect(risk.id).toBe('ATL-RK-9');
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
            { ...extension, version: 4 }, { ...extension, lastNumber: 0 }, { ...extension, records: [...extension.records, extension.records[0]] },
            { ...extension, records: [{ ...extension.records[0], dueDate: '2026-02-30' }] },
            { ...extension, records: [{ ...extension.records[0], probability: 'critical' }] },
            { ...extension, records: [{ ...extension.records[0], history: [{ id: 'bad' }] }] },
            { ...extension, records: [{ ...extension.records[0], comments: [{ id: 'bad' }] }] }
        ]) expect(() => parseProjectControl(malformed)).toThrow();
        expect(() => serializeBoardDataFromObject({ ...fixture(), extensions: { projectControl: fromAny({ version: 4 }) } })).toThrow();
    });
    it('keeps associations shared and direct, records unlinking, and never cascades a phase association to its workitems', () => {
        const data = fixture(); const record = controlRecords(data)[0];
        saveControlRecord(data, { ...record, related: { ...record.related, phaseIds: ['launch'] } }, 'Ana');
        expect(controlRecords(data)).toHaveLength(8);
        const updated = controlRecords(data).find((item) => item.id === record.id)!;
        expect(updated.related).toEqual({ phaseIds: ['launch'], milestoneIds: record.related.milestoneIds });
        expect(updated.history.at(-1)!.changes.related).toBeDefined();
        const previous = structuredClone(data); data.extensions.roadmap!.phases = data.extensions.roadmap!.phases.filter((phase) => phase.id !== 'launch');
        expect(removeDeletedControlLinks(data, previous, 'Ana')).toBe(true);
        expect(controlRecords(data).find((item) => item.id === record.id)!.related.phaseIds).toEqual([]);
        expect(controlRecords(data)).toHaveLength(8);
        expect(() => saveControlRecord(data, { ...updated, related: { phaseIds: ['missing'], milestoneIds: [] } }, 'Ana')).toThrow(/no longer exists/);
    });
    it('caps only completion and restores it after explicit acceptance; cancelled deliverables also require acceptance or unlinking', () => {
        const data = fixture();
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(99);
        expect(gateControlProgress(data, 'milestones', new Set(['release']), 100)).toBe(99);
        expect(gateControlProgress(data, 'phases', new Set(['build']), 63)).toBe(63);
        expect(gateControlProgress(data, 'phases', new Set(['build']), null)).toBeNull();
        expect(gateControlProgress(data, 'milestones', new Set(['independent']), 100)).toBe(100);
        const deliverable = controlRecords(data).find((item) => item.id === 'ATL-DL-6')!;
        expect(() => saveControlRecord(data, { ...deliverable, status: 'accepted' }, 'Ana')).toThrow(/dates/);
        saveControlRecord(data, { ...deliverable, status: 'accepted', acceptedDate: '2026-10-31' }, 'Ana');
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(100);
        saveControlRecord(data, { ...controlRecords(data).find((item) => item.id === 'ATL-DL-6')!, status: 'cancelled' }, 'Ana');
        expect(gateControlProgress(data, 'phases', new Set(['build']), 100)).toBe(99);
    });
    it('does not reuse IDs after a timeline restore to before record creation', () => {
        const data = createEmptyProjectData('Restore'); ensureBoardTimelineBaseline(data);
        const first = saveControlRecord(data, { ...newControlRecord('risks'), title: 'First' }, 'Ana');
        appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: first.id, summary: 'Created', snapshot: createBoardStateSnapshot(data) });
        delete data.extensions.projectControl;
        const next = saveControlRecord(data, { ...newControlRecord('risks'), title: 'After restore' }, 'Ana');
        expect(next.id).toBe('RES-RK-2');
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
