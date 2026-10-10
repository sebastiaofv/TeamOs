import { describe, expect, it } from 'vitest';
import type { TaskHistoryEntry, TaskHistoryValue } from '../../src/domain/taskHistoryTypes';
import {
    taskHistoryEntrySummary, taskHistoryItemChanges, taskHistoryValueLines
} from '../../src/features/portfolio/task/dialogs/taskHistoryText';

const known = (value: unknown, label?: string): TaskHistoryValue => ({ known: true, value, label });

describe('readable task history', () => {
    it('localizes grouped fields and baseline wording without implying creation', () => {
        const entry: TaskHistoryEntry = {
            id: 'change', at: '2026-10-09T12:00:00Z', kind: 'task.updated', incomplete: false,
            changes: [
                { field: 'title', before: known('A'), after: known('B') },
                { field: 'status', before: known('doing'), after: known('done') }
            ]
        };
        expect(taskHistoryEntrySummary(entry, 'en')).toBe('Task updated: Title, Status');
        expect(taskHistoryEntrySummary(entry, 'pt')).toBe('Tarefa alterada: Título, Estado');
        expect(taskHistoryEntrySummary({ ...entry, kind: 'task.initial' }, 'pt')).toBe('Estado inicial conhecido');
        expect(taskHistoryEntrySummary({ ...entry, kind: 'roadmap.bulk-assigned' }, 'pt')).toContain('Atribuição em lote');
    });

    it('localizes canonical status titles while preserving custom historical titles and references', () => {
        expect(taskHistoryValueLines('status', known('doing', 'in progress'), 'pt')).toEqual(['Em curso']);
        expect(taskHistoryValueLines('status', known('doing', 'Review queue'), 'pt')).toEqual(['Review queue']);
        expect(taskHistoryValueLines('phaseId', known('deleted-phase', 'Original phase title'), 'pt')).toEqual(['Original phase title']);
        expect(taskHistoryValueLines('description', { known: false, value: 'untrustworthy' }, 'pt')).toEqual(['Indisponível']);
    });

    it('describes completed checklist items and attachment additions without exposing binary content', () => {
        expect(taskHistoryItemChanges({
            field: 'checklist', before: known([{ text: 'Review', done: false }]), after: known([{ text: 'Review', done: true }])
        }, 'pt')).toEqual(['Item concluído: Review']);
        const attachment = { id: 'a', name: 'report.pdf', mime: 'application/pdf', sizeBytes: 2048, dataUrl: 'data:binary-secret' };
        expect(taskHistoryItemChanges({ field: 'attachments', before: known([]), after: known([attachment]) }, 'en')).toEqual(['Attachment added: report.pdf']);
        const lines = taskHistoryValueLines('attachments', known([attachment]), 'en').join(' ');
        expect(lines).toContain('report.pdf');
        expect(lines).toContain('application/pdf');
        expect(lines).not.toContain('binary-secret');
        expect(taskHistoryValueLines('unknown', known(attachment), 'en')).toEqual(['Unavailable']);
    });

    it('formats planning arrays and individual blocks with local date, time and duration', () => {
        const block = { id: 'b', taskId: 1, date: '2026-10-09', start: '09:15', end: '10:45' };
        expect(taskHistoryValueLines('planning', known([block]), 'pt')[0]).toContain('09:15–10:45 • 90 min');
        expect(taskHistoryValueLines('block', known(block), 'en')[0]).toContain('9 Oct 2026');
        expect(taskHistoryValueLines('planning', known([]), 'pt')).toEqual(['Nenhum']);
    });
});
