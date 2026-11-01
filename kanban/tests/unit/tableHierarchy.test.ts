import { describe, expect, it } from 'vitest';
import { normalizeTask } from '@/domain/task';
import type { PortfolioRow } from '@/features/portfolio/types';
import { groupTableRows, visibleTableRows } from '@/features/portfolio/table/tableHierarchy';

function row(id: number, type: 'epic' | 'story' | 'task' | 'bug', parentId?: number): PortfolioRow {
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
            { row: bug, children: [] }, { row: story, children: [{ row: secondChild, children: [] }, { row: child, children: [] }] }, { row: independent, children: [] }
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


describe('Full Epic hierarchy', () => {
    it('groups both hierarchy levels and direct Epic Tasks, preserving sibling order', () => {
        const rows = [row(3, 'task', 2), row(1, 'epic'), row(4, 'task', 1), row(2, 'story', 1), row(5, 'bug')];
        const groups = groupTableRows(rows, true);
        expect(groups.map((group) => group.row.taskId)).toEqual([1, 5]);
        expect(visibleTableRows(groups, new Set()).map(({ row }) => row.taskId)).toEqual([1, 5]);
        expect(visibleTableRows(groups, new Set([1])).map(({ row, depth }) => [row.taskId, depth])).toEqual([[1, 0], [4, 1], [2, 1], [5, 0]]);
        expect(visibleTableRows(groups, new Set([1, 2])).map(({ row, depth, hasChildren }) => [row.taskId, depth, hasChildren])).toEqual([[1, 0, true], [4, 1, false], [2, 1, true], [3, 2, false], [5, 0, false]]);
        expect(visibleTableRows(groups.slice(0, 1), new Set([1, 2]))).toHaveLength(4);
    });
    it('promotes matching Stories and Tasks when filters remove their ancestors', () => {
        const rows = [row(3, 'task', 2), row(2, 'story', 1)];
        expect(visibleTableRows(groupTableRows(rows, true), new Set([2])).map(({ row, depth }) => [row.taskId, depth])).toEqual([[2, 0], [3, 1]]);
        expect(groupTableRows([rows[0]], true)[0].row.taskId).toBe(3);
    });
});
