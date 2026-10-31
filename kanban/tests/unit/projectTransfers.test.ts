import type { ConfirmOptions } from '@/app/overlays/appMessages';
import { inheritLegacyTaskIdentities } from '@/domain/taskIdentity';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { serializeBoardDataFromObject } from '@/domain/serialize';
import { normalizeTask } from '@/domain/task';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { buildComment, visibleComments } from '@/domain/comments';
import { projectTaskHistory } from '@/domain/taskHistory';
import { prepareProjectTransfer, removeTransferredSource, sameProduct, type TransferMapping } from '@/domain/projectTransfers';
import { permanentTaskRelations, permanentBlockedIds, referenceFor, assertPermanentGraph } from '@/domain/permanentRelations';
import { createAppStore } from '@/features/portfolio/state/store';
import { createBoardMutationContext } from '@/features/portfolio/commands/mutationContext';
import { createProjectTransferActions } from '@/features/portfolio/commands/projectTransferCommands';
import type { BoardRecord } from '@/features/portfolio/types';

const at = '2026-10-01T09:00:00.000Z';
function project(id: string, productName = 'House'): BoardRecord {
    const data = createEmptyProjectData(id, id === 'Source' ? 'SRC' : 'DST');
    data.extensions.project = { ...data.extensions.project!, id, productName, members: [{ id: 'same-id', name: id === 'Source' ? 'Ana' : 'Ana (destination)' }], tags: ['feature', 'mapped'] };
    data.board.tasks = [normalizeTask({ id: 1, title: `${id} task`, createdAt: at, updatedAt: at, type: 'task', status: 'doing', description: 'Preserved content', checklist: [{ text: 'Done item', done: true }], dueDate: '2026-12-01', assignees: [data.extensions.project.members[0].name], responsible: data.extensions.project.members[0].name, tags: ['feature'] })];
    return fromPartial({ id, title: id, data: serializeBoardDataFromObject(data), fileName: `${id}.board.json`, handle: {} });
}
const mapping: TransferMapping = { members: { 'same-id': 'same-id' }, tags: { feature: 'mapped' } };
function scenario() {
    const source = project('Source'); const destination = project('Destination', ' house ');
    source.data.extensions.roadmap = { version: 1, phases: [{ id: 'phase', title: 'Construction', startDate: '2026-10-01', endDate: '2026-11-01' }], milestones: [{ id: 'release', title: 'Release', dueDate: '2026-11-01' }], sprints: [{ id: 'sprint', title: 'Sprint 1', startDate: '2026-10-01', endDate: '2026-10-15' }] };
    Object.assign(source.data.board.tasks[0], { phaseId: 'phase', phaseMode: 'explicit', milestoneId: 'release', milestoneMode: 'explicit', sprintId: 'sprint', sprintHistory: [{ sprintId: 'sprint', status: 'doing', at }], attachments: [{ id: 'a', name: 'note.txt', mime: 'text/plain', sizeBytes: 2, kind: 'file', dataUrl: 'data:text/plain;base64,aGk=', createdAt: at }] });
    source.data.board.tasks.push({ ...structuredClone(source.data.board.tasks[0]), permanentId: 'blocker', id: 2, title: 'Blocker', status: 'doing' });
    source.data.extensions.taskRelations = { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'blocks' }] };
    source.data.extensions.dayPlanner = { version: 1, blocks: [{ id: 'b', taskId: 1, date: '2026-10-29', start: '09:00', end: '10:00' }] };
    ensureBoardTimelineBaseline(source.data);
    const comment = buildComment(source.data, 1, { id: 'comment-1', author: 'Author', text: 'Original comment', images: [] }, { writable: true, historical: false });
    source.data.extensions.conversations = { version: 1, entries: [comment] };
    appendTimelineEvent(source.data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '1', summary: 'Original comment', meta: { commentId: comment.id, workitemKey: comment.workitemKey } });
    return { source, destination, projects: [source, destination] };
}

describe('products and versioned permanent task identities', () => {
    it('normalizes only the edited product and keeps legacy identities stable across read-only opens and saves', () => {
        const legacy = JSON.parse(readFileSync('test-board/us-2.board.json', 'utf8'));
        delete legacy.extensions.project;
        const a = serializeBoardDataFromObject(legacy), b = serializeBoardDataFromObject(legacy);
        expect(a.meta.schemaVersion).toBe(6);
        expect(a.extensions.project!.id).toBe(b.extensions.project!.id);
        expect(a.board.tasks.map((task) => task.permanentId)).toEqual(b.board.tasks.map((task) => task.permanentId));
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(a))); validateBoardData(reopened);
        expect(reopened.board.tasks.map((task) => task.permanentId)).toEqual(a.board.tasks.map((task) => task.permanentId));
        const { source, destination } = scenario();
        expect(sameProduct(source.data, destination.data)).toBe(true);
        source.data.extensions.project!.productName = '  '; expect(sameProduct(source.data, destination.data)).toBe(false);
        source.data.extensions.project!.productName = 'Other'; expect(sameProduct(source.data, destination.data)).toBe(false);
        expect(destination.data.extensions.project!.productName).toBe('house');
    });
    it('rejects malformed identities, products, relation versions and transfer records without discarding data', () => {
        const source = project('Source').data;
        source.board.tasks[0].permanentId = ''; expect(() => validateBoardData(source)).toThrow();
        for (const extension of [{ permanentRelations: { version: 2, relations: [] } }, { projectTransfers: { version: 1, operations: [{}] } }, { project: { ...source.extensions.project, productName: 42 } }]) {
            expect(() => serializeBoardDataFromObject({ ...source, extensions: { ...source.extensions, ...extension } })).toThrow();
        }
    });
});

describe('single task transfer drafts', () => {
    it('copies content with a new identity, mapped local catalogs and a new history without comments, leaving the source untouched', () => {
        const { source, destination, projects } = scenario(); const before = structuredClone(source.data);
        const result = prepareProjectTransfer(source, destination, 1, 'copy', 'testing', mapping, projects);
        validateBoardData(result.destination);
        const copy = result.destination.board.tasks.at(-1)!;
        expect(copy.id).toBe(2); expect(copy.permanentId).not.toBe(source.data.board.tasks[0].permanentId);
        expect(copy).toMatchObject({ title: 'Source task', status: 'testing', assignees: ['Ana (destination)'], responsible: 'Ana (destination)', tags: ['mapped'], dueDate: '2026-12-01', checklist: [{ text: 'Done item', done: true }], phaseId: '', milestoneId: '', sprintId: '' });
        expect(copy.attachments).toEqual(before.board.tasks[0].attachments);
        expect(visibleComments(result.destination, copy)).toEqual([]);
        expect(result.operation.history).toEqual([]);
        expect(result.operation.removed).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'planner', id: 'b', date: '2026-10-29', start: '09:00', end: '10:00' }), expect.objectContaining({ kind: 'phases', id: 'phase', title: 'Construction' }), expect.objectContaining({ kind: 'sprints', id: 'sprint' })]));
        expect(projectTaskHistory(result.destination, copy).entries.some((entry) => entry.changes.some((change) => change.field === 'transfer'))).toBe(true);
        expect(source.data).toEqual(before); expect(result.destination.extensions.project).toEqual(destination.data.extensions.project);
    });
    it('moves identity, comments and historical records through collisions, repeated moves and JSON round trips', () => {
        const { source, destination, projects } = scenario(); const original = source.data.board.tasks[0];
        const first = prepareProjectTransfer(source, destination, 1, 'move', 'to-do', mapping, projects);
        const moved = first.destination.board.tasks.at(-1)!;
        expect(moved.permanentId).toBe(original.permanentId); expect(moved.createdAt).toBe(original.createdAt); expect(moved.updatedAt).toBe(original.updatedAt);
        expect(visibleComments(first.destination, moved).map((comment) => [comment.id, comment.text, comment.author.name])).toEqual([['comment-1', 'Original comment', 'Author']]);
        const updatedSource = removeTransferredSource(source.data, first.operation, first.destination); validateBoardData(updatedSource);
        expect(updatedSource.board.tasks.map((task) => task.title)).toEqual(['Blocker']);
        expect(updatedSource.extensions.dayPlanner!.blocks).toEqual([]);
        const boards = [{ ...source, data: serializeBoardDataFromObject(updatedSource) }, { ...destination, data: serializeBoardDataFromObject(first.destination) }];
        const third = project('Third');
        third.data.extensions.project!.productName = 'House';
        const next = prepareProjectTransfer(boards[1], third, moved.id, 'move', 'testing', { members: { 'same-id': '' }, tags: { mapped: '' } }, [...boards, third]);
        boards[1].data = removeTransferredSource(boards[1].data, next.operation, next.destination);
        third.data = serializeBoardDataFromObject(JSON.parse(JSON.stringify(next.destination))); validateBoardData(third.data);
        const latest = third.data.board.tasks.at(-1)!;
        expect(latest.permanentId).toBe(original.permanentId); expect(latest.tags).toEqual([]); expect(latest.assignees).toEqual([]);
        expect(visibleComments(third.data, latest).map((comment) => comment.id)).toEqual(['comment-1']);
        expect(projectTaskHistory(third.data, latest).entries.some((entry) => entry.eventIds.includes('comment-event-comment-1'))).toBe(true);
        boards[0].data.extensions.project!.productName = 'Changed after transfer';
        const relations = permanentTaskRelations([...boards, third], 'blocker');
        expect(relations).toHaveLength(1); expect(relations[0].location!.project.id).toBe('Third');
        expect(relations[0].location!.task.id).toBe(latest.id);
        expect(permanentBlockedIds(third.data, [...boards, third]).has(latest.id)).toBe(true);
        expect(permanentBlockedIds(third.data, [third]).has(latest.id)).toBe(true);
        const unavailable = permanentTaskRelations([third], latest.permanentId!)[0]; expect(unavailable.location).toBeUndefined(); expect(unavailable.reference.title).toBe('Blocker');
        boards[0].data.board.tasks[0].status = 'done'; expect(permanentBlockedIds(third.data, [...boards, third]).has(latest.id)).toBe(false);
    });
    it('requires explicit destination state and every mapping even when source and destination names/IDs match', () => {
        const { source, destination, projects } = scenario();
        expect(() => prepareProjectTransfer(source, destination, 1, 'copy', '', mapping, projects)).toThrow('state');
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'testing', { members: {}, tags: {} }, projects)).toThrow('mapping');
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'testing', { members: { 'same-id': 'missing' }, tags: { feature: '' } }, projects)).toThrow('mapping');
        const result = prepareProjectTransfer(source, destination, 1, 'copy', 'testing', { members: { 'same-id': '' }, tags: { feature: '' } }, projects);
        expect(result.destination.board.tasks.at(-1)!.responsible).toBe('');
    });
    it('rejects self relations, duplicate pairs and cycles across permanent identities', () => {
        const a = project('A'), b = project('B'), c = project('C');
        const refs = [a, b, c].map((project) => referenceFor(project, project.data.board.tasks[0]));
        expect(() => assertPermanentGraph([{ source: refs[0], target: refs[0], kind: 'related' }])).toThrow('self');
        const ab = { source: refs[0], target: refs[1], kind: 'blocks' as const };
        expect(() => assertPermanentGraph([ab, ab])).toThrow('duplicate');
        expect(() => assertPermanentGraph([ab, { source: refs[1], target: refs[2], kind: 'blocks' }, { source: refs[2], target: refs[0], kind: 'blocks' }])).toThrow('cycle');
    });
});

function actionsSetup() {
    const { source, destination } = scenario();
    const store = createAppStore({ portfolioBoards: [source, destination] });
    const writes: string[] = []; let fail = '';
    const save = vi.fn(async (record: BoardRecord | null) => { writes.push(record!.id); return record!.id !== fail; });
    const context = createBoardMutationContext({ store, enqueueSave: save, markDirty: vi.fn(), alert: vi.fn(), choose: vi.fn().mockResolvedValueOnce('Destination').mockResolvedValueOnce('testing'), confirm: vi.fn(async (_text: string, options?: ConfirmOptions) => Object.fromEntries((options?.selections || []).map((field) => [field.id, field.id === 'state' ? 'testing' : field.id === 'member-0' ? 'same-id' : field.id === 'tag-0' ? 'mapped' : '__remove__']))), prompt: vi.fn().mockResolvedValue('New reviewer'), closeDialogFn: vi.fn() });
    const actions = createProjectTransferActions(context, vi.fn(async () => true));
    return { store, context, actions, save, writes, fail: (id: string) => { fail = id; } };
}

describe('transfer persistence and recovery', () => {
    it('does not remove the source on a destination failure and retries without allocating another copy', async () => {
        const { store, actions, fail, writes } = actionsSetup(); fail('Destination');
        expect(await actions.transferPortfolioTask('Source', 1, 'copy')).toBe(false);
        expect(writes).toEqual(['Destination']);
        expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(2);
        expect(store.getState().portfolioBoards[1].data.board.tasks).toHaveLength(2);
        fail(''); expect(await actions.transferPortfolioTask('Source', 1, 'copy')).toBe(true);
        expect(store.getState().portfolioBoards[1].data.board.tasks).toHaveLength(2);
    });
    it('saves the destination first and exposes an incomplete move until source persistence succeeds', async () => {
        const { store, actions, fail, writes } = actionsSetup(); fail('Source');
        expect(await actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(writes).toEqual(['Destination', 'Source']);
        const op = store.getState().portfolioBoards[1].data.extensions.projectTransfers!.operations[0]; expect(op.status).toBe('pending');
        fail(''); expect(await actions.resumeProjectTransfer('Destination', op.id)).toBe(true);
        expect(store.getState().portfolioBoards[1].data.board.tasks).toHaveLength(2);
        expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(1);
        expect(store.getState().portfolioBoards[1].data.extensions.projectTransfers!.operations[0].status).toBe('complete');
    });
    it('supports a read-only copy source and rejects moving it, cancellation and stale source removal', async () => {
        const { store, actions, context } = actionsSetup();
        store.setState((state) => ({ portfolioBoards: state.portfolioBoards.map((board) => board.id === 'Source' ? { ...board, handle: null } : board) }));
        expect(await actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(await actions.transferPortfolioTask('Source', 1, 'copy')).toBe(true);
        const cancelled = actionsSetup(); vi.mocked(cancelled.context.confirm).mockResolvedValue(false);
        const before = structuredClone(cancelled.store.getState().portfolioBoards.map((board) => board.data));
        expect(await cancelled.actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(cancelled.store.getState().portfolioBoards.map((board) => board.data)).toEqual(before); expect(cancelled.save).not.toHaveBeenCalled();
        const { source, destination, projects } = scenario();
        const op = prepareProjectTransfer(source, destination, 1, 'move', 'testing', mapping, projects);
        source.data.board.tasks[0].title = 'Changed while pending';
        expect(() => removeTransferredSource(source.data, op.operation, op.destination)).toThrow('stale');
        expect(context.alert).toHaveBeenCalled();
    });
});

describe('US-13 acceptance fixtures', () => {
    it.each(['us-13', 'us-13-maintenance', 'us-13-other', 'us-13-independent', 'us-13-hierarchy'])('validates and round-trips %s without losing identities, relations, comments or planning', (name) => {
        const raw = JSON.parse(readFileSync(`test-board/${name}.board.json`, 'utf8'));
        validateBoardData(raw);
        const saved = serializeBoardDataFromObject(raw); validateBoardData(saved);
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(saved))); validateBoardData(reopened);
        expect(reopened.board).toEqual(saved.board);
        expect(reopened.extensions).toEqual(saved.extensions);
        expect(reopened.board.tasks.map((task) => task.permanentId)).toEqual(raw.board.tasks.map((task) => task.permanentId));
    });
});

describe('transfer recovery and unavailable inverse references', () => {
    it('keeps the inverse reference after closing a copied task’s file, including a read-only original project', () => {
        const { source, destination, projects } = scenario(); source.handle = null;
        const copy = prepareProjectTransfer(source, destination, 1, 'copy', 'testing', mapping, projects);
        const store = createAppStore({ portfolioBoards: [source, { ...destination, data: copy.destination }] });
        store.setState({ portfolioBoards: [source] });
        const unavailable = store.getState().unloadedRelationSources.flatMap((entry) => entry.relations);
        const inverse = permanentTaskRelations([source], 'blocker', unavailable);
        expect(inverse).toHaveLength(2);
        expect(inverse.find((entry) => entry.reference.permanentId === copy.operation.to.permanentId)?.location).toBeUndefined();
        store.setState({ portfolioBoards: [source, { ...destination, data: copy.destination }] });
        expect(store.getState().unloadedRelationSources).toEqual([]);
    });
    it('compares canonical recovery context after reopening and refuses to drop comments added while pending', () => {
        const { source, destination, projects } = scenario();
        const prepared = prepareProjectTransfer(source, destination, 1, 'move', 'testing', mapping, projects);
        const reordered = JSON.parse(JSON.stringify(source.data, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
        expect(() => removeTransferredSource(serializeBoardDataFromObject(reordered), prepared.operation, prepared.destination)).not.toThrow();
        const comment = buildComment(source.data, 1, { id: 'new-comment', author: 'Author', text: 'Added while the transfer was pending', images: [] }, { writable: true, historical: false });
        source.data.extensions.conversations!.entries.push(comment);
        appendTimelineEvent(source.data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '1', summary: 'New comment', meta: { commentId: comment.id, workitemKey: comment.workitemKey } });
        expect(() => removeTransferredSource(source.data, prepared.operation, prepared.destination)).toThrow('stale');
        expect(visibleComments(source.data, source.data.board.tasks[0])).toHaveLength(2);
    });
});

describe('transfer restrictions', () => {
    it('rejects historical sources and unresolved destination conflicts before any write', async () => {
        const historical = actionsSetup();
        historical.store.setState({ portfolioTimelineSelection: { boardId: 'Source', eventIndex: 0 } });
        expect(await historical.actions.transferPortfolioTask('Source', 1, 'copy')).toBe(false);
        expect(historical.save).not.toHaveBeenCalled();
        const conflict = actionsSetup();
        conflict.store.setState({ projectSaveStateById: new Map([['Destination', fromPartial({ watchStatus: 'conflict' })]]) });
        expect(await conflict.actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(conflict.save).not.toHaveBeenCalled();
    });
});

describe('validation of combined local and permanent dependency graphs', () => {
    it('rejects a cycle that spans local links and preserved transfer links in one file', () => {
        const { source } = scenario();
        source.data.board.tasks.push({ ...source.data.board.tasks[0], id: 3, permanentId: 'third-task' });
        const [a, b, c] = source.data.board.tasks.map((task) => referenceFor(source, task));
        source.data.extensions.permanentRelations = { version: 1, relations: [{ source: a, target: c, kind: 'blocks' }, { source: c, target: b, kind: 'blocks' }] };
        expect(() => validateBoardData(source.data)).toThrow('cycle');
    });
    it('rejects a dependency cycle completed by importing another project', () => {
        const boards = [project('A'), project('B'), project('C')];
        const refs = boards.map((board) => referenceFor(board, board.data.board.tasks[0]));
        boards.forEach((board, index) => { board.data.extensions.permanentRelations = { version: 1, relations: [{ source: refs[index], target: refs[(index + 1) % 3], kind: 'blocks' }] }; });
        expect(() => createAppStore({ portfolioBoards: boards })).toThrow('cycle');
    });
});


describe('external legacy file reloads', () => {
    it('preserves already assigned identities when an old file is renamed externally before its first migrated save', () => {
        const legacy = JSON.parse(readFileSync('test-board/us-2.board.json', 'utf8'));
        delete legacy.extensions.project;
        legacy.board.tasks.forEach((task: { permanentId?: string }) => delete task.permanentId);
        const current = serializeBoardDataFromObject(legacy);
        legacy.board.settings.title = 'Externally renamed legacy project';
        const reloaded = serializeBoardDataFromObject(legacy);
        reloaded.extensions.project!.id = current.extensions.project!.id;
        inheritLegacyTaskIdentities(reloaded, legacy, current);
        expect(reloaded.board.tasks.map((task) => task.permanentId)).toEqual(current.board.tasks.map((task) => task.permanentId));
        expect(reloaded.board.settings.title).toBe('Externally renamed legacy project');
    });
});


describe('transfer lifecycle regressions', () => {
    it.each(['story', 'bug'] as const)('requires new acceptance for a completed %s copy and preserves it only for completed moves', (type) => {
        const { source, destination, projects } = scenario();
        const task = source.data.board.tasks[0];
        Object.assign(task, { type, acceptanceCriteria: 'Verified result', acceptance: { author: 'Original reviewer', at, local: true } });
        expect(() => prepareProjectTransfer(source, destination, task.id, 'copy', 'done', mapping, projects)).toThrow('author');
        const copy = prepareProjectTransfer(source, destination, task.id, 'copy', 'done', mapping, projects, undefined, [], 'New reviewer');
        expect(copy.destination.board.tasks.at(-1)!.acceptance?.author).toBe('New reviewer');
        expect(projectTaskHistory(copy.destination, copy.destination.board.tasks.at(-1)!).entries.some((entry) => entry.changes.some((change) => change.field === 'acceptance'))).toBe(true);
        const moved = prepareProjectTransfer(source, destination, task.id, 'move', 'done', mapping, projects);
        expect(moved.destination.board.tasks.at(-1)!.acceptance).toEqual(task.acceptance);
        const reopened = prepareProjectTransfer(source, destination, task.id, 'move', 'doing', mapping, projects);
        expect(reopened.destination.board.tasks.at(-1)!.acceptance).toBeUndefined();
        expect(reopened.operation.sourceTask.acceptance).toEqual(task.acceptance);
        delete task.acceptance;
        expect(() => prepareProjectTransfer(source, destination, task.id, 'move', 'done', mapping, projects)).toThrow('author');
    });
    it('rejects missing Story criteria even with an author and keeps a failed move from changing hierarchy', () => {
        const { source, destination, projects } = scenario();
        source.data.board.tasks[0].type = 'story';
        expect(() => prepareProjectTransfer(source, destination, 1, 'copy', 'done', mapping, projects, undefined, [], 'Reviewer')).toThrow('criteria');
        source.data.board.tasks[1].parentId = 1;
        const before = structuredClone(source.data);
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'doing', mapping, projects)).toThrow('Backlog or To-do');
        expect(source.data).toEqual(before);
        expect(prepareProjectTransfer(source, destination, 1, 'copy', 'doing', mapping, projects).destination.board.tasks.at(-1)!.parentId).toBeNull();
    });
    it('confirms acceptance before saving, cancels without writes, and revalidates after that prompt', async () => {
        for (const action of ['confirm', 'cancel', 'stale'] as const) {
            const setup = actionsSetup();
            const source = setup.store.getState().portfolioBoards[0];
            Object.assign(source.data.board.tasks[0], { type: 'story', acceptanceCriteria: 'Verified result' });
            vi.mocked(setup.context.choose).mockReset().mockResolvedValueOnce('Destination');
            const confirm = vi.mocked(setup.context.confirm).getMockImplementation()!;
            vi.mocked(setup.context.confirm).mockImplementation(async (text, options) => ({ ...fromAny<Record<string, string>, unknown>(await confirm(text, options)), state: 'done' }));
            vi.mocked(setup.context.prompt).mockImplementation(async () => {
                expect(setup.save).not.toHaveBeenCalled();
                if (action === 'stale') setup.store.setState((state) => ({ portfolioBoards: state.portfolioBoards.map((board) => board.id === 'Source' ? { ...board, data: structuredClone(board.data) } : board) }));
                return action === 'cancel' ? null : 'New reviewer';
            });
            expect(await setup.actions.transferPortfolioTask('Source', 1, 'copy')).toBe(action === 'confirm');
            if (action === 'confirm') expect(setup.store.getState().portfolioBoards[1].data.board.tasks.at(-1)!.acceptance?.author).toBe('New reviewer');
            else expect(setup.save).not.toHaveBeenCalled();
        }
    });
    it('rejects moving a parent before asking for a destination or writing either file', async () => {
        const { actions, store, context, save } = actionsSetup();
        const source = store.getState().portfolioBoards[0];
        source.data.board.tasks[0].type = 'story'; source.data.board.tasks[1].parentId = 1;
        expect(await actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(context.choose).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
        expect(source.data.board.tasks[1].parentId).toBe(1);
    });
    it('reconciles comments on repeated return trips, retaining original historical views and canonical content', () => {
        const { source, destination } = scenario();
        const original = structuredClone(source.data);
        const originalComment = original.extensions.conversations!.entries[0];
        let from = source, to = destination;
        for (let index = 0; index < 4; index++) {
            const task = from.data.board.tasks.find((task) => task.permanentId === original.board.tasks[0].permanentId)!;
            const currentMapping = { members: { 'same-id': 'same-id' }, tags: Object.fromEntries(task.tags.map((tag) => [tag, 'mapped'])) };
            const prepared = prepareProjectTransfer(from, to, task.id, 'move', 'doing', currentMapping, [from, to]);
            from.data = serializeBoardDataFromObject(removeTransferredSource(from.data, prepared.operation, prepared.destination));
            to.data = serializeBoardDataFromObject(JSON.parse(JSON.stringify(prepared.destination)));
            validateBoardData(from.data); validateBoardData(to.data);
            const moved = to.data.board.tasks.find((item) => item.permanentId === task.permanentId)!;
            expect(visibleComments(to.data, moved).map((comment) => comment.id)).toEqual(['comment-1']);
            expect(to.data.extensions.conversations!.entries).toHaveLength(1);
            [from, to] = [to, from];
        }
        expect(source.data.extensions.conversations!.entries[0]).toEqual(originalComment);
        const cutoff = original.extensions.timeline!.events.length - 1;
        const historical = reconstructBoardStateFromTimeline(source.data, cutoff);
        expect(visibleComments(source.data, historical.board.tasks[0], cutoff)).toEqual([originalComment]);
        const current = source.data.board.tasks.find((task) => task.permanentId === original.board.tasks[0].permanentId)!;
        const referenceIndex = source.data.extensions.timeline!.events.findLastIndex((event) => event.kind === 'task.comment.referenced');
        expect(visibleComments(source.data, current, referenceIndex - 1)).toEqual([]);
        expect(visibleComments(source.data, current, referenceIndex)).toEqual([originalComment]);
    });
    it.each(['Different comment', 'Original comment'])('still rejects unrelated comment ID collisions with content %s', (text) => {
        const { source, destination, projects } = scenario();
        ensureBoardTimelineBaseline(destination.data);
        const comment = buildComment(destination.data, 1, { id: 'comment-1', author: 'Author', text, images: [] }, { writable: true, historical: false });
        comment.at = source.data.extensions.conversations!.entries[0].at;
        destination.data.extensions.conversations = { version: 1, entries: [comment] };
        appendTimelineEvent(destination.data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '1', summary: 'Comment', meta: { commentId: comment.id, workitemKey: comment.workitemKey } });
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'doing', mapping, projects)).toThrow('invalid');
    });
});

describe('reviewed association and hierarchy transfers', () => {
    function family() {
        const source = project('Source'), destination = project('Destination');
        Object.assign(source.data.board.tasks[0], { type: 'epic', effort: null, status: 'to-do' });
        const root = source.data.board.tasks[0];
        source.data.board.tasks.push(
            { ...structuredClone(root), id: 2, permanentId: 'story', type: 'story', title: 'Child story', parentId: 1, status: 'backlog' },
            { ...structuredClone(root), id: 3, permanentId: 'task', type: 'task', title: 'Grandchild task', parentId: 2, status: 'to-do' }
        );
        const choices = Object.fromEntries(source.data.board.tasks.slice(1).map((task) => [task.permanentId!, { stateId: 'to-do', mapping }]));
        return { source, destination, choices };
    }
    it('moves every descendant preserving hierarchy, identity, comments and relations across collisions and reopen', () => {
        const { source, destination, choices } = family();
        ensureBoardTimelineBaseline(source.data);
        const comment = buildComment(source.data, 3, { id: 'child-comment', author: 'Author', text: 'Child conversation', images: [] }, { writable: true, historical: false });
        source.data.extensions.conversations = { version: 1, entries: [comment] };
        appendTimelineEvent(source.data, { id: comment.eventId, at: comment.at, kind: 'task.comment.published', entityType: 'task', entityId: '3', summary: 'Comment', meta: { commentId: comment.id, workitemKey: comment.workitemKey } });
        source.data.extensions.taskRelations = { version: 1, relations: [{ sourceId: 2, targetId: 3, kind: 'related' }] };
        const before = structuredClone(source.data);
        const result = prepareProjectTransfer(source, destination, 1, 'move', 'to-do', mapping, [source, destination], undefined, [], undefined, choices);
        expect(source.data).toEqual(before);
        const target = serializeBoardDataFromObject(JSON.parse(JSON.stringify(result.destination)));
        validateBoardData(target);
        const moved = target.board.tasks.filter((task) => before.board.tasks.some((original) => original.permanentId === task.permanentId));
        const root = moved.find((task) => task.type === 'epic')!, story = moved.find((task) => task.type === 'story')!, task = moved.find((task) => task.type === 'task')!;
        expect(story.parentId).toBe(root.id); expect(task.parentId).toBe(story.id);
        expect(new Set(target.board.tasks.map((task) => task.id)).size).toBe(4);
        expect(visibleComments(target, task)[0].text).toBe('Child conversation');
        expect(permanentTaskRelations([{ ...destination, data: target }], task.permanentId!)).toHaveLength(1);
        expect(target.extensions.projectTransfers!.operations.every((op) => op.batchId === result.operation.id)).toBe(true);
        expect(target.extensions.projectTransfers!.operations.flatMap((op) => op.removed).some((entry) => entry.kind === 'parent' || entry.kind === 'child')).toBe(false);
        const removed = removeTransferredSource(source.data, result.operation, target);
        expect(removed.board.tasks).toEqual([]); validateBoardData(serializeBoardDataFromObject(removed));
        expect(removeTransferredSource(removed, result.operation, target)).toBe(removed);
    });
    it.each(['doing', 'done', 'cancelled'])('rejects an ineligible nested descendant in %s without modifying either project', (status) => {
        const { source, destination, choices } = family(); source.data.board.tasks[2].status = status;
        const before = structuredClone([source.data, destination.data]);
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'to-do', mapping, [source, destination], undefined, [], undefined, choices)).toThrow('Backlog or To-do');
        expect([source.data, destination.data]).toEqual(before);
    });
    it('revalidates every child before removing any source data during recovery', () => {
        const { source, destination, choices } = family();
        const result = prepareProjectTransfer(source, destination, 1, 'move', 'to-do', mapping, [source, destination], undefined, [], undefined, choices);
        source.data.board.tasks[2].title = 'Changed during pending save';
        expect(() => removeTransferredSource(source.data, result.operation, result.destination)).toThrow('stale');
        expect(source.data.board.tasks).toHaveLength(3);
        source.data.board.tasks.pop();
        expect(() => removeTransferredSource(source.data, result.operation, result.destination)).toThrow('stale');
    });
    it('remaps phase, milestone, sprint and parent only to valid destination values and audits original associations', () => {
        const { source, destination, projects } = scenario();
        destination.data.extensions.roadmap = { version: 1, phases: [{ id: 'p', title: 'Target phase' }], milestones: [{ id: 'm', title: 'Target milestone' }], sprints: [{ id: 's', title: 'Target sprint', startDate: '2099-01-01', endDate: '2099-01-15' }] };
        Object.assign(destination.data.board.tasks[0], { type: 'story', parentId: null });
        source.data.board.tasks[1].type = 'story'; source.data.board.tasks[0].parentId = 2;
        const associations = { 'phases:phase': 'p', 'milestones:release': 'm', 'sprints:sprint': 's', 'sprintHistory:sprint': '', 'planner:b': '', 'parent:2': '1' };
        const result = prepareProjectTransfer(source, destination, 1, 'move', 'testing', { ...mapping, associations }, projects);
        const task = result.destination.board.tasks.at(-1)!;
        expect(task).toMatchObject({ phaseId: 'p', phaseMode: 'explicit', milestoneId: 'm', milestoneMode: 'explicit', sprintId: 's', parentId: 1 });
        expect(result.operation.removed.map((entry) => entry.id)).toContain('phase');
        expect(result.operation.mapping.associations).toEqual(associations);
        validateBoardData(serializeBoardDataFromObject(result.destination));
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'testing', { ...mapping, associations: { ...associations, 'phases:phase': 'missing' } }, projects)).toThrow('mapping');
        expect(() => prepareProjectTransfer(source, destination, 1, 'move', 'testing', { ...mapping, associations: {} }, projects)).toThrow('mapping');
    });
    it.each(['Source', 'Destination'])('recovers a whole hierarchy after a %s write failure without duplicates', async (failed) => {
        const { source, destination } = family();
        const store = createAppStore({ portfolioBoards: [source, destination] });
        let fail = true;
        const save = vi.fn(async (board: BoardRecord | null) => !(fail && board!.id === failed));
        const context = createBoardMutationContext({ store, enqueueSave: save, markDirty: vi.fn(), alert: vi.fn(), choose: vi.fn().mockResolvedValue('Destination'),
            confirm: vi.fn(async (_text: string, options?: ConfirmOptions) => Object.fromEntries((options?.selections || []).map((field) => [field.id, field.id.endsWith('state') ? 'to-do' : '__remove__']))) });
        const actions = createProjectTransferActions(context, vi.fn(async () => true));
        expect(await actions.transferPortfolioTask('Source', 1, 'move')).toBe(false);
        expect(context.alert).toHaveBeenCalledWith(expect.stringContaining('Transfer incomplete'));
        fail = false;
        const receipt = store.getState().portfolioBoards[1].data.extensions.projectTransfers!.operations[0];
        expect(await actions.resumeProjectTransfer('Destination', receipt.id)).toBe(true);
        expect(store.getState().portfolioBoards[0].data.board.tasks).toHaveLength(0);
        expect(store.getState().portfolioBoards[1].data.board.tasks).toHaveLength(4);
        expect(store.getState().portfolioBoards[1].data.extensions.projectTransfers!.operations.every((op) => op.status === 'complete')).toBe(true);
    });
});
