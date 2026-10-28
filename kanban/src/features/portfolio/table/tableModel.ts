import { effectivePlanning, workitemType, parentOf, epicOf } from '@/domain/workitems';
import type { BoardData } from '@/domain/types';
import { getWorkflow } from '@/domain/workflow';
import type { PortfolioFilters, PortfolioRow } from '@/features/portfolio/types';
import { DEFAULT_PORTFOLIO_FILTERS, taskMatchesPortfolioFilters } from '@/domain/portfolioFilters';
import { getRoadmapItemTitle } from '@/domain/roadmap';
import { effortRank, priorityRank, taskScore } from '@/domain/scoring';

export type TableColumnId =
    | 'type' | 'epic' | 'story' | 'id' | 'title' | 'status' | 'assignees' | 'priority' | 'phase' | 'updatedAt'
    | 'milestone' | 'sprint' | 'dueDate' | 'createdAt' | 'blocked' | 'blockerReason'
    | 'effort' | 'tags' | 'archived' | 'responsible';

export const TABLE_COLUMNS: readonly TableColumnId[] = Object.freeze([
    'id', 'title', 'type', 'epic', 'story', 'status', 'assignees', 'priority', 'phase', 'updatedAt',
    'milestone', 'sprint', 'dueDate', 'createdAt', 'blocked', 'blockerReason',
    'effort', 'tags', 'archived', 'responsible'
]);
export const DEFAULT_TABLE_COLUMNS: readonly TableColumnId[] = Object.freeze(['id', 'title', 'type', 'epic', 'story', 'status', 'assignees', 'priority', 'phase', 'updatedAt']);
export type TableSort = { column: TableColumnId | 'score'; direction: 'asc' | 'desc' };
export const DEFAULT_TABLE_SORT: TableSort = Object.freeze({ column: 'id', direction: 'asc' });

export type TableFilters = PortfolioFilters;
export const DEFAULT_TABLE_FILTERS = DEFAULT_PORTFOLIO_FILTERS;

/** Each populated filter is ANDed; statuses are ORed within their selection. */
export function filterTableRows(rows: PortfolioRow[], filters: TableFilters): PortfolioRow[] {
    return rows.filter(({ task, boardData }) => taskMatchesPortfolioFilters(task, filters, boardData));
}

/** Raw, unlocalized cells. Roadmap IDs are resolved only against this project. */
export function tableCellValue(row: PortfolioRow, column: TableColumnId, boardData: BoardData | null): string {
    const { task } = row;
    const roadmap = boardData?.extensions.roadmap;
    switch (column) {
        case 'type': return workitemType(task);
        case 'epic': { const epic = boardData && epicOf(boardData, task); return epic ? `#${epic.id} ${epic.title}` : ''; }
        case 'story': { const parent = boardData && parentOf(boardData, task); return parent && workitemType(parent) === 'story' ? `#${parent.id} ${parent.title}` : ''; }
        case 'id': return String(task.id);
        case 'phase': return getRoadmapItemTitle(roadmap, 'phases', boardData ? effectivePlanning(boardData, task, 'phaseId') : task.phaseId);
        case 'milestone': return getRoadmapItemTitle(roadmap, 'milestones', boardData ? effectivePlanning(boardData, task, 'milestoneId') : task.milestoneId);
        case 'sprint': return getRoadmapItemTitle(roadmap, 'sprints', task.sprintId);
        case 'assignees': return (task.assignees || []).join(', ');
        case 'tags': return (task.tags || []).join(', ');
        default: return task[column] == null ? '' : String(task[column]);
    }
}

const textCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function tableSortValue(row: PortfolioRow, column: TableSort['column'], boardData: BoardData | null): string | number | null {
    if (column === 'score') return taskScore(row.task);
    const value = tableCellValue(row, column, boardData);
    if (!value.trim()) return null;
    switch (column) {
        case 'id': return row.task.id;
        case 'status': return getWorkflow(boardData).states.findIndex((s) => s.id === row.task.status);
        case 'priority': return priorityRank(row.task.priority);
        case 'effort': return effortRank(row.task.effort);
        case 'blocked': return Number(row.task.blocked);
        case 'archived': return Number(row.task.archived);
        case 'createdAt':
        case 'updatedAt': {
            const timestamp = Date.parse(value);
            return Number.isNaN(timestamp) ? null : timestamp;
        }
        default: return value;
    }
}

/** Missing values stay last in both directions; equal values use ascending numeric ID. */
export function sortTableRows(
    rows: PortfolioRow[], column: TableSort['column'], direction: 'asc' | 'desc', boardData: BoardData | null
): PortfolioRow[] {
    const sign = direction === 'desc' ? -1 : 1;
    return rows.map((row) => ({ row, value: tableSortValue(row, column, boardData) }))
        .sort((a, b) => {
            if (a.value === null && b.value !== null) return 1;
            if (b.value === null && a.value !== null) return -1;
            const comparison = a.value === null || b.value === null ? 0
                : typeof a.value === 'number' && typeof b.value === 'number'
                    ? a.value - b.value : textCollator.compare(String(a.value), String(b.value));
            return comparison * sign || a.row.task.id - b.row.task.id
                || textCollator.compare(a.row.boardId, b.row.boardId);
        })
        .map(({ row }) => row);
}

/** Invalid/empty preferences fall back to defaults; valid ordering is preserved. */
export function normalizeTableColumns(value: unknown): TableColumnId[] {
    if (!Array.isArray(value)) return [...DEFAULT_TABLE_COLUMNS];
    const columns = value.filter((column): column is TableColumnId =>
        typeof column === 'string' && TABLE_COLUMNS.includes(column as TableColumnId));
    const unique = [...new Set(columns)];
    if (!unique.length) return [...DEFAULT_TABLE_COLUMNS];
    const missing = (['id', 'title'] as const).filter((column) => !unique.includes(column));
    return [...missing, ...unique];
}

export type TableCsvOptions = {
    separator?: ',' | ';';
    header?: (column: TableColumnId) => string;
    value?: (row: PortfolioRow, column: TableColumnId) => string;
};

function csvCell(value: string, separator: ',' | ';'): string {
    // Spreadsheet parsers may ignore leading whitespace and control characters.
    let start = 0;
    while (start < value.length) {
        const code = value.charCodeAt(start);
        if (code > 32 && !(code >= 127 && code <= 159) && !/\s/u.test(value[start])) break;
        start += 1;
    }
    const safe = start < value.length && '=+-@'.includes(value[start]) ? `'${value}` : value;
    return safe.includes(separator) || /["\r\n]/u.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Pass the entire filtered/sorted result, independent of selection or pagination. */
export function buildTableCsv(
    rows: PortfolioRow[], columns: readonly TableColumnId[], boardData: BoardData | null,
    options: TableCsvOptions = {}
): string {
    const separator = options.separator || ',';
    const header = options.header || ((column: TableColumnId) => column);
    const value = options.value || ((row: PortfolioRow, column: TableColumnId) => tableCellValue(row, column, boardData));
    return [columns.map((column) => csvCell(header(column), separator)).join(separator),
        ...rows.map((row) => columns.map((column) => csvCell(value(row, column), separator)).join(separator))]
        .join('\r\n');
}
