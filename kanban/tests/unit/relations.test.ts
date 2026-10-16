import { expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { addRelation, dependencyBlockers, getRelations, removeTaskRelations, taskRef } from '../../src/domain/relations';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';

function board() {
    const data = serializeBoardDataFromObject(createEmptyProjectData('Relations'));
    data.board.tasks = [1, 2, 3].map((id) => normalizeTask({ id, title: `Task ${id}` }));
    return data;
}

it('rejects self-links, symmetric duplicates and blocking cycles', () => {
    const data = board(), ref = (id: number) => taskRef(data, id);
    expect(() => addRelation(data, [data], { kind: 'related', from: ref(1), to: ref(1) })).toThrow(/itself/);
    addRelation(data, [data], { kind: 'related', from: ref(1), to: ref(2) });
    expect(() => addRelation(data, [data], { kind: 'related', from: ref(2), to: ref(1) })).toThrow(/already exists/);
    addRelation(data, [data], { kind: 'blocks', from: ref(1), to: ref(2) });
    addRelation(data, [data], { kind: 'blocks', from: ref(2), to: ref(3) });
    expect(() => addRelation(data, [data], { kind: 'blocks', from: ref(3), to: ref(1) })).toThrow(/cycles/);
    expect(dependencyBlockers([data], ref(2))).toEqual([ref(1)]);
    data.board.tasks[0].status = 'done';
    expect(dependencyBlockers([data], ref(2))).toEqual([]);
    expect(getRelations(serializeBoardDataFromObject(data))).toEqual(getRelations(data));
});

it('allows loaded same-product cross-project links and preserves unresolved references', () => {
    const a = board(), b = board();
    const p1 = a.extensions.project as { id: string; product: string }, p2 = b.extensions.project as typeof p1;
    p2.id = 'other-project'; p1.product = 'App'; p2.product = 'App';
    addRelation(a, [a, b], { kind: 'blocks', from: taskRef(b, 1), to: taskRef(a, 2) });
    expect(dependencyBlockers([a], taskRef(a, 2))).toEqual([taskRef(b, 1)]);
    p2.product = 'Other';
    expect(() => addRelation(a, [a, b], { kind: 'related', from: taskRef(a, 1), to: taskRef(b, 2) })).toThrow(/same product/);
});

it('drops relations that reference a removed workitem', () => {
    const data = board(), ref = (id: number) => taskRef(data, id);
    addRelation(data, [data], { kind: 'blocks', from: ref(1), to: ref(2) });
    addRelation(data, [data], { kind: 'related', from: ref(2), to: ref(3) });
    removeTaskRelations(data, ref(1));
    expect(getRelations(data).map((link) => [link.from.taskId, link.to.taskId])).toEqual([[2, 3]]);
    expect(dependencyBlockers([data], ref(2))).toEqual([]);
});
