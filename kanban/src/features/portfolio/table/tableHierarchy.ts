import { workitemType } from '@/domain/workitems';
import type { PortfolioRow } from '@/features/portfolio/types';

export type TableRowGroup = { row: PortfolioRow; children: PortfolioRow[] };

/** Group after filtering/sorting so matching children remain reachable even if their Story is filtered out. */
export function groupTableRows(rows: PortfolioRow[], nested: boolean): TableRowGroup[] {
    const stories = new Set(nested ? rows.filter((row) => workitemType(row.task) === 'story').map((row) => row.taskId) : []);
    const children = new Map<number, PortfolioRow[]>();
    const roots: PortfolioRow[] = [];
    for (const row of rows) {
        if (workitemType(row.task) === 'task' && row.task.parentId != null && stories.has(row.task.parentId)) {
            const siblings = children.get(row.task.parentId) || [];
            siblings.push(row);
            children.set(row.task.parentId, siblings);
        } else roots.push(row);
    }
    return roots.map((row) => ({ row, children: children.get(row.taskId) || [] }));
}
