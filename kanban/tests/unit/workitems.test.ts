import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { eligibleLeafTasks, synchronizeParentCompletion, validateWorkitems } from '../../src/domain/workitems';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

it('derives Epic and Story completion from children and counts only leaves', () => {
    const data = createEmptyProjectData('Hierarchy');
    data.board.tasks = [
        normalizeTask({ id: 1, title: 'Epic', workitemType: 'epic' }),
        normalizeTask({ id: 2, title: 'Story', workitemType: 'story', parentId: 1 }),
        normalizeTask({ id: 3, title: 'Task', parentId: 2, status: 'done' }),
        normalizeTask({ id: 4, title: 'Bug', workitemType: 'bug', parentId: 1, status: 'done' })
    ];
    validateWorkitems(data);
    synchronizeParentCompletion(data);
    expect(data.board.tasks.map((t) => t.status)).toEqual(['done', 'done', 'done', 'done']);
    expect(eligibleLeafTasks(data).map((t) => t.id)).toEqual([3, 4]);
    data.board.tasks[2].status = 'doing';
    synchronizeParentCompletion(data);
    expect(data.board.tasks[0].status).toBe('doing');
    expect(serializeBoardDataFromObject(data).board.tasks).toEqual(data.board.tasks);
});

it('rejects changing a type and invalid parents without mutating the original', () => {
    const data = createEmptyProjectData('Hierarchy');
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task' })];
    const next = structuredClone(data);
    next.board.tasks[0].workitemType = 'bug';
    expect(() => validateWorkitems(next, data)).toThrow(/cannot be changed/);
    next.board.tasks[0].workitemType = 'task';
    next.board.tasks[0].parentId = 1;
    expect(() => validateWorkitems(next)).toThrow(/Hierarchy/);
    expect(data.board.tasks[0].parentId).toBeNull();
});
