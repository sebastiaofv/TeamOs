import { ASSESSMENTS, controlPending, riskLevel, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import type { BoardData } from '@/domain/types';
import { projectElementOptions } from './ControlRelated';

export const CONTROL_TABLE_COLUMNS = {
    risks: ['id', 'title', 'status', 'owner', 'probability', 'impact', 'riskLevel', 'dueDate', 'related', 'assignees', 'tags', 'createdAt', 'updatedAt'],
    decisions: ['id', 'title', 'status', 'owner', 'decisionMaker', 'decisionDate', 'dueDate', 'related', 'assignees', 'tags', 'createdAt', 'updatedAt'],
    deliverables: ['id', 'title', 'status', 'owner', 'validator', 'dueDate', 'related', 'assignees', 'tags', 'deliveredDate', 'acceptedDate', 'createdAt', 'updatedAt']
} as const;
export type ControlColumn = typeof CONTROL_TABLE_COLUMNS[ControlKind][number];
export const DEFAULT_CONTROL_COLUMNS: Record<ControlKind, readonly ControlColumn[]> = {
    risks: CONTROL_TABLE_COLUMNS.risks.slice(0, 9), decisions: CONTROL_TABLE_COLUMNS.decisions.slice(0, 8), deliverables: CONTROL_TABLE_COLUMNS.deliverables.slice(0, 7)
};
export function normalizeControlColumns(kind: ControlKind, value: unknown): ControlColumn[] {
    if (!Array.isArray(value)) return [...DEFAULT_CONTROL_COLUMNS[kind]];
    const available: readonly string[] = CONTROL_TABLE_COLUMNS[kind];
    const columns = [...new Set(value.filter((column): column is ControlColumn => typeof column === 'string' && available.includes(column)))];
    if (!columns.length) return [...DEFAULT_CONTROL_COLUMNS[kind]];
    return [...(['id', 'title'] as const).filter(column => !columns.includes(column)), ...columns];
}
export function controlCellValue(record: ControlRecord, column: ControlColumn, data: BoardData): string {
    if (column === 'riskLevel') return riskLevel(record);
    if (column === 'related') return projectElementOptions(data).filter(element => record.related[element.key].includes(element.id)).map(element => element.label).join(', ');
    const value = record[column];
    return Array.isArray(value) ? value.join(', ') : String(value || '');
}
export function filterControlRecords(records: ControlRecord[], search: string, filters: Record<string, string>, today: string, data: BoardData): ControlRecord[] {
    const elements = projectElementOptions(data);
    return records.filter(record => {
        if (!`${record.id} ${record.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())) return false;
        return Object.entries(filters).every(([key, value]) => {
            if (!value) return true;
            if (key === 'pending') return controlPending(record);
            if (key === 'overdue') return Boolean(record.dueDate && record.dueDate < today && controlPending(record));
            if (key === 'awaitingAcceptance') return record.status === 'delivered';
            if (key === 'related') return elements.some(element => `${element.key}:${element.id}` === value && record.related[element.key].includes(element.id));
            if (key === 'riskLevel') return riskLevel(record) === value;
            return String(record[key as keyof ControlRecord]) === value;
        });
    });
}
export function sortControlRecords(records: ControlRecord[], column: ControlColumn, desc: boolean, data: BoardData, language: string): ControlRecord[] {
    const collator = new Intl.Collator(language, { numeric: true, sensitivity: 'base' });
    return [...records].sort((a, b) => {
        const x = controlCellValue(a, column, data), y = controlCellValue(b, column, data);
        if (!x && y) return 1;
        if (!y && x) return -1;
        const diff = column === 'createdAt' || column === 'updatedAt' ? Date.parse(x) - Date.parse(y) : ['probability', 'impact', 'riskLevel'].includes(column)
            ? ASSESSMENTS.indexOf(x as typeof ASSESSMENTS[number]) - ASSESSMENTS.indexOf(y as typeof ASSESSMENTS[number])
            : collator.compare(x, y);
        return diff * (desc ? -1 : 1) || collator.compare(a.id, b.id);
    });
}
