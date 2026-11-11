import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertControlRecordFile, assertWorkitemFile, CONTROL_TYPE_FIELDS, WORKITEM_FIELD_TYPES } from '../../src/domain/projectFileSchema';

/** A documented `| Field | a | b |` table as { field: [columns marked ✓] }. */
function documentedTable(firstColumnAfterField: string): Record<string, string[]> {
    const lines = readFileSync('PROJECT_FORMAT.md', 'utf8').split('\n');
    const start = lines.findIndex((line) => line.startsWith(`| Field | ${firstColumnAfterField} |`));
    const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim());
    const columns = cells(lines[start]).slice(1);
    const table: Record<string, string[]> = {};
    for (let index = start + 2; lines[index]?.startsWith('|'); index++) {
        const [fields, ...marks] = cells(lines[index]);
        const applies = columns.filter((_, column) => marks[column].startsWith('✓'));
        for (const [, field] of fields.matchAll(/`([^`]+)`/g)) table[field] = applies;
    }
    return table;
}
const sorted = (table: Record<string, readonly string[]>) => Object.fromEntries(Object.entries(table).sort().map(([field, columns]) => [field, [...columns].sort()]));

describe('project file schema', () => {
    it('documents exactly the workitem fields the code writes and validates', () => {
        expect(sorted(documentedTable('epic'))).toEqual(sorted(WORKITEM_FIELD_TYPES));
    });

    it('documents exactly the Project Control fields of each type', () => {
        const byField: Record<string, string[]> = {};
        for (const [type, fields] of Object.entries(CONTROL_TYPE_FIELDS)) for (const field of fields) byField[field] = [type];
        expect(sorted(documentedTable('risk'))).toEqual(sorted(byField));
    });

    const risk = () => ({
        id: 'TOS-RK-1', type: 'risk', title: 'Risk', description: '', status: 'open', ownerId: null, assigneeIds: [], tags: [],
        related: { phaseIds: [], milestoneIds: [] }, dueDate: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        probability: 'medium', impact: 'medium', mitigationPlan: '', contingencyPlan: '', materializedDate: null, actualImpact: ''
    });

    it('accepts a complete record and rejects one that is malformed, incomplete or of mixed types', () => {
        expect(() => assertControlRecordFile(risk())).not.toThrow();
        const { mitigationPlan: _mitigationPlan, ...incomplete } = risk();
        void _mitigationPlan;
        expect(() => assertControlRecordFile(incomplete)).toThrow('malformed Project Control record TOS-RK-1');
        expect(() => assertControlRecordFile({ ...risk(), rationale: '' })).toThrow('rationale, which does not apply to risk');
        expect(() => assertControlRecordFile({ ...risk(), type: 'issue' })).toThrow('malformed');
        expect(() => assertControlRecordFile({ ...risk(), type: 'risks' })).toThrow('malformed');
        expect(() => assertControlRecordFile({ ...risk(), kind: 'risks' })).toThrow('malformed');
        expect(() => assertControlRecordFile({ ...risk(), title: 7 })).toThrow('malformed');
        expect(() => assertControlRecordFile({ ...risk(), assigneeIds: ['a', 'a'] })).toThrow('malformed');
        expect(() => assertControlRecordFile({ ...risk(), materializedDate: 7 })).toThrow('malformed');
    });

    const story = () => ({
        id: 1, type: 'story', title: 'Story', description: '', status: 'to-do', parentId: null, assigneeIds: ['m1'], responsibleId: 'm1', tags: [],
        priority: null, effort: null, dueDate: null, sprintId: null, phaseMode: 'none', milestoneMode: 'none', blocked: false, archived: false,
        checklist: [], pullRequests: [], attachments: [], acceptanceCriteria: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    });

    it.each([
        ['a responsible who is not an assignee', { responsibleId: 'm2' }, 'malformed'],
        ['a planning id without explicit mode', { phaseId: 'p1' }, 'phaseId, which does not apply'],
        ['explicit mode without an id', { milestoneMode: 'explicit' }, 'malformed'],
        ['a blocker reason when not blocked', { blockerReason: 'x' }, 'blockerReason, which does not apply'],
        ['a field of another type', { stepsToReproduce: '' }, 'stepsToReproduce, which does not apply to story'],
        ['an invalid attachment hash', { attachments: [{ id: 'a', name: 'n', mime: 'm', kind: 'file', sizeBytes: 1, createdAt: '2026-01-01T00:00:00.000Z', sha256: 'xyz' }] }, 'malformed'],
        ['a negative estimate', { storyPoints: -1 }, 'malformed'],
        ['an unknown priority', { priority: 'urgent' }, 'malformed']
    ])('rejects a workitem with %s', (_, change, message) => {
        expect(() => assertWorkitemFile(story())).not.toThrow();
        expect(() => assertWorkitemFile({ ...story(), ...change })).toThrow(message);
    });
});
