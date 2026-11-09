import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { newControlRecord, type ControlRecord } from '../../src/domain/projectControl';
import { buildCsv } from '../../src/infrastructure/browser/csv';
import { CONTROL_TABLE_COLUMNS, DEFAULT_CONTROL_COLUMNS, controlCellValue, filterControlRecords, normalizeControlColumns, sortControlRecords } from '../../src/features/portfolio/control/controlTableModel';

const data = createEmptyProjectData('Control');
data.extensions.roadmap = { version: 1, phases: [{ id: 'delivery', title: 'Delivery', startDate: '', endDate: '' }], milestones: [{ id: 'release', title: 'Release', dueDate: '' }], sprints: [] };
const record = (fields: Partial<ControlRecord>): ControlRecord => ({ ...newControlRecord('risks'), id: 'CTL-RK-1', title: 'Risk', ...fields });

describe('Project Control table queries', () => {
    it('keeps column preferences valid for each subsection and restores mandatory columns', () => {
        for (const kind of ['risks', 'decisions', 'deliverables'] as const) {
            expect(normalizeControlColumns(kind, null)).toEqual(DEFAULT_CONTROL_COLUMNS[kind]);
            expect(normalizeControlColumns(kind, [])).toEqual(DEFAULT_CONTROL_COLUMNS[kind]);
            expect(normalizeControlColumns(kind, ['status', 'id', 'status', 'nonsense', 'validator'])).toEqual(kind === 'deliverables' ? ['title', 'status', 'id', 'validator'] : ['title', 'status', 'id']);
            expect(normalizeControlColumns(kind, ['nonsense'])).toEqual(DEFAULT_CONTROL_COLUMNS[kind]);
            expect(DEFAULT_CONTROL_COLUMNS[kind].every(column => (CONTROL_TABLE_COLUMNS[kind] as readonly string[]).includes(column))).toBe(true);
        }
    });
    it('combines search, responsible, assessments, risk level and phase associations', () => {
        const rows = [record({ probability: 'high', impact: 'high', owner: 'Ana', related: { phaseIds: ['delivery'], milestoneIds: [] } }), record({ id: 'CTL-RK-2', owner: 'Ana', probability: 'low', impact: 'low' })];
        expect(filterControlRecords(rows, 'ctl-rk', { owner: 'Ana', probability: 'high', impact: 'high', riskLevel: 'high', related: 'phaseIds:delivery', pending: 'yes' }, '2026-11-06', data)).toEqual([rows[0]]);
        expect(filterControlRecords(rows, 'missing', {}, '2026-11-06', data)).toEqual([]);
        expect(filterControlRecords(rows, '', { related: 'phaseIds:missing' }, '2026-11-06', data)).toEqual([]);
    });
    it('preserves deliverable acceptance, overdue boundary, status and exact date filters', () => {
        const rows = [record({ kind: 'deliverables', id: 'CTL-DL-1', status: 'delivered', dueDate: '2026-11-05', validator: 'Rui', related: { phaseIds: [], milestoneIds: ['release'] } }), record({ kind: 'deliverables', id: 'CTL-DL-2', status: 'accepted', dueDate: '2026-11-05' }), record({ kind: 'deliverables', id: 'CTL-DL-3', status: 'delivered', dueDate: '2026-11-06' })];
        expect(filterControlRecords(rows, '', { pending: 'yes', overdue: 'yes', awaitingAcceptance: 'yes', status: 'delivered', validator: 'Rui', dueDate: '2026-11-05', related: 'milestoneIds:release' }, '2026-11-06', data)).toEqual([rows[0]]);
        const decision = record({ kind: 'decisions', decisionMaker: 'Ana', decisionDate: '2026-11-06' });
        expect(filterControlRecords([decision], '', { decisionMaker: 'Ana', decisionDate: '2026-11-06' }, '2026-11-06', data)).toEqual([decision]);
        expect(filterControlRecords([decision], '', { decisionDate: '2026-11-05' }, '2026-11-06', data)).toEqual([]);
    });
    it('sorts assessments and numeric IDs, keeps missing values last and preserves the input', () => {
        const rows = [record({ id: 'CTL-RK-10', probability: 'low', impact: 'low', owner: '' }), record({ id: 'CTL-RK-2', probability: 'high', impact: 'high', owner: 'Ana' }), record({ id: 'CTL-RK-3', probability: 'medium', impact: 'medium', owner: 'Rui' })];
        expect(sortControlRecords(rows, 'id', false, data, 'en').map(row => row.id)).toEqual(['CTL-RK-2', 'CTL-RK-3', 'CTL-RK-10']);
        expect(sortControlRecords(rows, 'riskLevel', true, data, 'pt').map(row => row.id)).toEqual(['CTL-RK-2', 'CTL-RK-3', 'CTL-RK-10']);
        expect(sortControlRecords(rows, 'owner', true, data, 'en').map(row => row.owner)).toEqual(['Rui', 'Ana', '']);
        expect(rows[0].id).toBe('CTL-RK-10');
        const timestamps = [record({ id: 'CTL-RK-1', updatedAt: '2026-11-06T09:00:00Z' }), record({ id: 'CTL-RK-2', updatedAt: '2026-11-06T10:00:00+02:00' })];
        expect(sortControlRecords(timestamps, 'updatedAt', false, data, 'en').map(row => row.id)).toEqual(['CTL-RK-2', 'CTL-RK-1']);
    });
    it('resolves related elements, people and tags and exports safely with either separator', () => {
        const item = record({ title: '=SUM(1,2)', assignees: ['Ana', 'Rui'], tags: ['review', 'design'], related: { phaseIds: ['delivery'], milestoneIds: ['release'] } });
        expect(controlCellValue(item, 'related', data)).toBe('delivery · Delivery, release · Release');
        expect(controlCellValue(item, 'assignees', data)).toBe('Ana, Rui');
        expect(controlCellValue(item, 'tags', data)).toBe('review, design');
        expect(buildCsv([['Title', 'Notes'], [item.title, 'line; "quoted"\nnext']], ';')).toBe('Title;Notes\r\n\'=SUM(1,2);"line; ""quoted""\nnext"');
        expect(buildCsv([['Title'], [item.title]], ',')).toBe('Title\r\n"\'=SUM(1,2)"');
    });
});
