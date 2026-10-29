import { describe, expect, it } from 'vitest';
import { normalizeTask } from '@/domain/task';
import type { PortfolioRow } from '@/features/portfolio/types';
import { groupTableRows } from '@/features/portfolio/table/tableHierarchy';

function row(id: number, type: 'story' | 'task' | 'bug', parentId?: number): PortfolioRow {
    return { boardId: 'p', boardTitle: 'Project', boardFileName: 'p.json', boardIndex: 0, taskIndex: id - 1, taskId: id,
        canMutate: false, task: normalizeTask({ id, title: `Item ${id}`, type, parentId }) };
}

describe('Sprint table hierarchy', () => {
    const story = row(1, 'story');
    const child = row(2, 'task', 1);
    const secondChild = row(3, 'task', 1);
    const independent = row(4, 'task');
    const bug = row(5, 'bug');

    it('keeps the sorted order within roots and children without mutating the input', () => {
        const rows = [secondChild, bug, child, story, independent];
        const before = structuredClone(rows);
        expect(groupTableRows(rows, true)).toEqual([
            { row: bug, children: [] }, { row: story, children: [secondChild, child] }, { row: independent, children: [] }
        ]);
        expect(rows).toEqual(before);
    });

    it('keeps matching children reachable when filters remove their Story, including absent parents', () => {
        expect(groupTableRows([child, independent, row(6, 'task', 99)], true).map(({ row }) => row.taskId)).toEqual([2, 4, 6]);
        expect(groupTableRows([story], true)).toEqual([{ row: story, children: [] }]);
        expect(groupTableRows([], true)).toEqual([]);
    });

    it('preserves flat rows for the other table perspectives', () => {
        expect(groupTableRows([child, story], false)).toEqual([{ row: child, children: [] }, { row: story, children: [] }]);
    });
});
