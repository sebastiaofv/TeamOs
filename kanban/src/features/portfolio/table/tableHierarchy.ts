import { validParent, workitemType } from '@/domain/workitems';
import type { PortfolioRow } from '@/features/portfolio/types';

export type TableRowGroup = { row: PortfolioRow; children: TableRowGroup[] };
export type VisibleTableRow = { row: PortfolioRow; depth: number; hasChildren: boolean };

/** Group after filtering/sorting: a matching descendant stays reachable when its parent is filtered out. */
export function groupTableRows(rows: PortfolioRow[], nested: boolean): TableRowGroup[] {
    const groups = rows.map((row): TableRowGroup => ({ row, children: [] }));
    const byId = new Map(groups.map((group) => [`${group.row.boardId}:${group.row.taskId}`, group]));
    const roots: TableRowGroup[] = [];
    for (const group of groups) {
        const { row } = group;
        const parent = nested && row.task.parentId != null ? byId.get(`${row.boardId}:${row.task.parentId}`) : undefined;
        if (parent && parent !== group && validParent(workitemType(row.task), parent.row.task)) parent.children.push(group);
        else roots.push(group);
    }
    return roots;
}

/** Pagination applies to complete root groups before expanding any number of hierarchy levels. */
export function visibleTableRows(groups: TableRowGroup[], expanded: ReadonlySet<number>, depth = 0): VisibleTableRow[] {
    return groups.flatMap(({ row, children }) => [
        { row, depth, hasChildren: children.length > 0 },
        ...(expanded.has(row.taskId) ? visibleTableRows(children, expanded, depth + 1) : [])
    ]);
}
