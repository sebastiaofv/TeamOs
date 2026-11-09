import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardData, LooseBoardData, TimelineEvent } from '../../src/domain/types';
import { createEmptyProjectData } from '../../src/domain/board';
import { createBoardStateSnapshot, hashTextContent, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { fromProjectFile, parseProjectText, toProjectCheckpoint, toProjectFile, type ProjectFileV1 } from '../../src/domain/projectFormat';
import { applyProjectPatch, diffProjectState } from '../../src/domain/projectPatch';
import { createHistoryWriter, eventFromFile, eventToFile } from '../../src/domain/projectHistoryFormat';
import { newControlRecord, saveControlRecord, type ControlRecord } from '../../src/domain/projectControl';
import { closeSprint } from '../../src/domain/sprintResults';
import { createProjectDirectory, loadDirectoryHistory, openProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { BoardRepository, writeJsonToFileHandle } from '../../src/infrastructure/persistence/boardRepository';
import { getWorkflow, functionalWorkitemTypes } from '../../src/domain/workflow';
import { WORKITEM_FIELDS, effectivePlanning, workitemFieldNames, workitemType } from '../../src/domain/workitems';
import { MemoryDirectory, MemoryFile } from '../support/projectDirectory';

const boardFiles = readdirSync('test-board').filter((name) => name.endsWith('.board.json')).map((name) => join('test-board', name));
const fixtures = [...boardFiles, 'test-board/us-25/migration/legacy.board.json', 'tests/fixtures/project-control-v1.json', 'tests/fixtures/project-control-v2.json'];
const load = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as LooseBoardData;
const runtime = (path: string) => { const data = serializeBoardDataFromObject(load(path)); data.extensions.projectStorage = { version: 1, baselineEventId: '' }; return data; };
const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Everything a user can observe, with the documented normalizations applied. */
function observable(data: BoardData, recordHistory = false) {
    const tasks = data.board.tasks.map((task) => ({ id: task.id, permanentId: task.permanentId, displayId: task.displayId, type: task.type ?? 'task', title: task.title, description: task.description, status: task.status, statusChangedAt: task.statusChangedAt, pullRequests: task.pullRequests || [], ...Object.fromEntries(WORKITEM_FIELDS.filter((field) => workitemFieldNames(workitemType(task)).includes(field)).map((field) => [field, task[field] || ''])), severity: task.severity || '', phaseId: effectivePlanning(data, task, 'phaseId'), milestoneId: effectivePlanning(data, task, 'milestoneId'), parentId: task.parentId ?? null, assignees: task.assignees, responsible: task.responsible, tags: task.tags, priority: task.priority, dueDate: task.dueDate, blocked: task.blocked, blockerReason: task.blockerReason, archived: task.archived, checklist: task.checklist, attachments: task.attachments, effort: task.effort, storyPoints: task.storyPoints, sprintId: task.sprintId, phaseMode: task.phaseMode ?? (task.phaseId ? 'explicit' : 'none'), milestoneMode: task.milestoneMode ?? (task.milestoneId ? 'explicit' : 'none'), acceptance: task.acceptance, sprintHistory: task.sprintHistory || undefined, createdAt: task.createdAt, updatedAt: task.updatedAt }));
    const extensions = data.extensions;
    const onlyFor = (record: ControlRecord, kind: ControlRecord['kind'], value: unknown) => (record.kind === kind ? value : '');
    const records = extensions.projectControl?.records.map(({ history: _history, comments: _comments, ...record }) => ({ ...record, comments: _comments, ...(recordHistory ? { history: _history } : {}), probability: onlyFor(record as ControlRecord, 'risks', record.probability), impact: onlyFor(record as ControlRecord, 'risks', record.impact), mitigationPlan: onlyFor(record as ControlRecord, 'risks', record.mitigationPlan), contingencyPlan: onlyFor(record as ControlRecord, 'risks', record.contingencyPlan), materializedDate: onlyFor(record as ControlRecord, 'risks', record.materializedDate), actualImpact: onlyFor(record as ControlRecord, 'risks', record.actualImpact), decisionMaker: onlyFor(record as ControlRecord, 'decisions', record.decisionMaker), decisionDate: onlyFor(record as ControlRecord, 'decisions', record.decisionDate), rationale: onlyFor(record as ControlRecord, 'decisions', record.rationale), validator: onlyFor(record as ControlRecord, 'deliverables', record.validator), deliveredDate: onlyFor(record as ControlRecord, 'deliverables', record.deliveredDate), acceptedDate: onlyFor(record as ControlRecord, 'deliverables', record.acceptedDate) }));
    return { title: data.board.settings.title, tasks, records, roadmap: { milestones: extensions.roadmap?.milestones || [], phases: extensions.roadmap?.phases || [], sprints: extensions.roadmap?.sprints || [] }, sprintParticipation: (extensions.sprintParticipation?.entries || []).filter((entry) => !extensions.sprintResults?.closures.some((closure) => closure.sprintId === entry.sprintId)), dayPlanner: extensions.dayPlanner?.blocks || [], functionalWorkflow: getWorkflow(data, 'functional'), functionalTypes: functionalWorkitemTypes(data), sprintResults: extensions.sprintResults, workflow: getWorkflow(data), hidden: extensions.boardView?.hiddenStateIds || [], members: extensions.project?.members.map((member) => member.name).sort() };
}

describe('project format v1 mapper', () => {
    it.each(fixtures)('%s keeps every observable value and is idempotent', (path) => {
        const source = runtime(path);
        const file = roundTrip(toProjectFile(source));
        const restored = serializeBoardDataFromObject(fromProjectFile(file));
        const expected = observable(source), actual = observable(restored);
        // Free-text names may become members; everything already referenced must survive.
        expect(actual.members).toEqual(expect.arrayContaining(expected.members || []));
        expect({ ...actual, members: [] }).toEqual({ ...expected, members: [] });
        expect(JSON.stringify(toProjectFile(fromProjectFile(file)))).toBe(JSON.stringify(file));
    });

    it('separates the envelope, removes board/columns and versions, and leaves extensions out when empty', () => {
        const file = roundTrip(toProjectFile(createEmptyProjectData('Shape', 'SHP')));
        expect(Object.keys(file.meta).sort()).toEqual(['appId', 'createdAt', 'revision', 'schemaVersion', 'updatedAt']);
        expect(file.meta.schemaVersion).toBe(1);
        expect(file.project.title).toBe('Shape');
        expect(file).not.toHaveProperty('board'); expect(file).not.toHaveProperty('extensions');
        expect(JSON.stringify(file)).not.toContain('"version"');
        expect(file.workflow).toHaveProperty('functional');
    });

    it('stores assignments by member id, converting free-text Project Control names to members', () => {
        const data = createEmptyProjectData('Names', 'NAM');
        data.extensions.project!.members.push({ id: 'ana', name: 'Ana' });
        const record = saveControlRecord(data, { ...newControlRecord('risks'), title: 'Risk' }, 'Ana');
        Object.assign(data.extensions.projectControl!.records[0], { owner: 'External Person', assignees: ['External Person', 'Ana'] });
        const file = roundTrip(toProjectFile(data));
        const stored = file.projectControl.records[0];
        expect(stored.ownerId).toBe('legacy-member_external%20person');
        expect(stored.assigneeIds).toEqual(['legacy-member_external%20person', 'ana']);
        expect(stored).not.toHaveProperty('owner'); expect(stored).not.toHaveProperty('decisionMaker');
        expect(fromProjectFile(file).extensions.projectControl!.records[0]).toMatchObject({ id: record.id, owner: 'External Person', assignees: ['External Person', 'Ana'] });
    });

    it('rejects fields of another type, planning ids without explicit mode, and ambiguous files', () => {
        const base = () => { const data = createEmptyProjectData('Reject', 'REJ'); data.board.tasks.push({ id: 1, type: 'task', title: 'T', description: '', status: 'backlog', assignees: [], responsible: '', tags: [], blocked: false, blockerReason: '', checklist: [], attachments: [], archived: false, createdAt: data.meta.createdAt, updatedAt: data.meta.createdAt, dueDate: '', priority: null, effort: null, phaseId: '', milestoneId: '', sprintId: '', phaseMode: 'none', milestoneMode: 'none', permanentId: 'p1', parentId: null } as never); return roundTrip(toProjectFile(data)); };
        const foreign = base(); foreign.workitems[0].objective = 'Epic only';
        expect(() => fromProjectFile(foreign)).toThrow('objective');
        const planning = base(); planning.workitems[0].phaseId = 'phase';
        expect(() => fromProjectFile(planning)).toThrow('phaseId');
        expect(() => parseProjectText(JSON.stringify({ ...base(), board: {} }))).toThrow('Ambiguous');
        expect(() => parseProjectText(JSON.stringify({ ...base(), meta: { schemaVersion: 99 } }))).toThrow('Unsupported');
    });

    it('keeps a closed Sprint once', () => {
        const data = createEmptyProjectData('Sprint', 'SPR');
        data.extensions.roadmap = { version: 5, milestones: [], phases: [], sprints: [{ id: 'sprint-1', title: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' }] };
        data.extensions.sprintParticipation = { version: 1, entries: [] };
        closeSprint(data, 'sprint-1');
        expect(data.extensions.sprintParticipation).toBeUndefined();
        expect(roundTrip(toProjectFile(data)).roadmap.sprintParticipation).toEqual([]);
    });
});

describe('history v1', () => {
    const withHistory = fixtures.filter((path) => { const timeline = load(path).extensions?.timeline as { events?: { snapshot?: { board?: unknown } }[] } | undefined; return timeline?.events?.[0]?.snapshot?.board; });
    it.each(withHistory)('%s replays identically at every event', (path) => {
        const data = runtime(path);
        const events = data.extensions.timeline!.events;
        const writer = createHistoryWriter(undefined, undefined, data);
        const converted = roundTrip(events.map((event) => eventToFile(event, writer))).map((event) => eventFromFile(event)) as TimelineEvent[];
        const convertedData = { ...data, extensions: { ...data.extensions, timeline: { ...data.extensions.timeline!, events: converted } } };
        events.forEach((_, index) => expect(observable(reconstructBoardStateFromTimeline(convertedData, index), true), `event ${index}`).toEqual(observable(reconstructBoardStateFromTimeline(data, index), true)));
        expect(converted.slice(1).every((event) => !event.snapshot?.board || event.checkpoint)).toBe(true);
    });

    it.each(withHistory)('%s: applying a diff reproduces the target', (path) => {
        const snapshots = runtime(path).extensions.timeline!.events.filter((event) => event.snapshot?.board).map((event) => event.snapshot as BoardData);
        for (let index = 1; index < snapshots.length; index++) {
            const previous = createBoardStateSnapshot(snapshots[index - 1]), target = createBoardStateSnapshot(snapshots[index]);
            const result = applyProjectPatch(previous, roundTrip(diffProjectState(toProjectCheckpoint(previous), toProjectCheckpoint(target))));
            expect(observable(createBoardStateSnapshot(result))).toEqual(observable(target));
        }
    });

    it('writes a Project Control edit as a small patch and bounds checkpoints', () => {
        const data = createEmptyProjectData('Budget', 'BUD');
        ensureBoardTimelineBaseline(data);
        const writer = createHistoryWriter(undefined);
        eventToFile(data.extensions.timeline!.events[0], writer);
        const record = saveControlRecord(data, { ...newControlRecord('risks'), title: 'A' }, 'Ana');
        const event = appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: record.id, summary: 'Updated', snapshot: createBoardStateSnapshot(data) })!;
        const stored = eventToFile(event, writer);
        expect(stored).not.toHaveProperty('checkpoint'); expect(stored).not.toHaveProperty('snapshot');
        expect(stored.patch).toEqual([expect.objectContaining({ op: 'upsert', at: 'projectControl.records', key: record.id })]);
        writer.patchBytes = 10 * 1024 * 1024;
        expect(eventToFile(event, writer)).toHaveProperty('checkpoint');
        expect(writer.patchBytes).toBe(0);
    });

    it('replaces whole sprint structures with deltas', () => {
        const data = createEmptyProjectData('Sprints', 'SPT');
        ensureBoardTimelineBaseline(data);
        const writer = createHistoryWriter(undefined);
        eventToFile(data.extensions.timeline!.events[0], writer);
        const credit = (id: number) => ({ taskKey: `k${id}`, taskId: id, sprintId: 's', storyPoints: 1, at: data.meta.createdAt });
        const after = { version: 1 as const, credits: [credit(1), credit(2)], closures: [] };
        writer.state = { ...(writer.state as object), extensions: { ...(writer.state as BoardData).extensions, sprintResults: { version: 1, credits: [credit(1)], closures: [] } } };
        const event = { id: 'e', at: data.meta.createdAt, kind: 'sprint.results.updated', entityType: 'board', entityId: 'board', summary: 's', changes: { sprintResults: { before: { version: 1, credits: [credit(1)], closures: [] }, after } } } as TimelineEvent;
        const stored = eventToFile(event, writer);
        expect(stored).not.toHaveProperty('changes');
        expect(stored.patch).toEqual([expect.objectContaining({ op: 'upsert', at: 'roadmap.sprintResults.credits', key: 'k2' })]);
    });
});

describe('project folder conversion', () => {
    const legacyFolder = (path = 'tests/fixtures/legacy/folder-v6/alpha') => {
        const directory = new MemoryDirectory('alpha');
        directory.children.set('project.json', new MemoryFile('project.json', readFileSync(join(path, 'project.json'), 'utf8')));
        directory.children.set('history.json', new MemoryFile('history.json', readFileSync(join(path, 'history.json'), 'utf8')));
        directory.children.set('attachments', new MemoryDirectory('attachments'));
        return directory;
    };
    const text = (directory: MemoryDirectory, name: string) => (directory.children.get(name) as MemoryFile).text();
    afterEach(() => { /* MemoryDirectory instances are local to each test. */ });

    it('converts once, keeps a verified backup, and preserves ids and history', async () => {
        const directory = legacyFolder();
        const project = text(directory, 'project.json'), history = text(directory, 'history.json');
        const before = (JSON.parse(project) as BoardData);
        const handle = await openProjectDirectory(directory);
        const backup = await (await directory.getDirectoryHandle('backup')).getDirectoryHandle('schema-6');
        expect((await backup.getFileHandle('project.json')).text()).toBe(project);
        expect((await backup.getFileHandle('history.json')).text()).toBe(history);
        const file = JSON.parse(text(directory, 'project.json')) as ProjectFileV1;
        expect(file.meta.schemaVersion).toBe(1); expect(file).not.toHaveProperty('board');
        expect((file.system as { storage: { convertedFromHash: string } }).storage.convertedFromHash).toBe(hashTextContent(project));
        expect(text(directory, 'project.json')).not.toContain('teamos-attachment:');
        const record = await BoardRepository.createRecordFromHandle(handle);
        expect(record.data.board.tasks.map((task) => task.permanentId)).toEqual(before.board.tasks.map((task) => task.permanentId));
        expect(record.data.board.tasks[0].attachments[0].dataUrl).toBe(before.board.tasks[0].attachments[0].dataUrl);
        expect(record.data.extensions.conversations?.entries[0].id).toBe('us25-comment');
        expect((await loadDirectoryHistory(handle))?.events.map((event) => event.id)).toEqual(['baseline_he3a58c1', 'comment-event-us25-comment']);
        const converted = text(directory, 'project.json');
        await openProjectDirectory(directory);
        expect(text(directory, 'project.json')).toBe(converted);
    });

    it('is deterministic and survives interruption at every write', async () => {
        const clean = legacyFolder(); await openProjectDirectory(clean);
        for (const [name, attempt] of [['history.json', 1], ['project.json', 1]] as const) {
            const directory = legacyFolder();
            const file = directory.children.get(name) as MemoryFile;
            file.failOnAttempt = attempt;
            await expect(openProjectDirectory(directory)).rejects.toThrow('write denied');
            file.failOnAttempt = 0; file.attempts = 0;
            await openProjectDirectory(directory);
            expect(text(directory, 'project.json')).toBe(text(clean, 'project.json'));
            expect(text(directory, 'history.json')).toBe(text(clean, 'history.json'));
        }
    });

    it('rejects a corrupt legacy history and inconsistent folders without changing anything', async () => {
        const corrupt = legacyFolder();
        (corrupt.children.get('history.json') as MemoryFile).setText('{bad JSON');
        const project = text(corrupt, 'project.json');
        await expect(openProjectDirectory(corrupt)).rejects.toThrow('history.json');
        expect(text(corrupt, 'project.json')).toBe(project); expect(corrupt.children.has('backup')).toBe(false);
        const partial = legacyFolder();
        (partial.children.get('history.json') as MemoryFile).setText(JSON.stringify({ schemaVersion: 1, projectId: 'x', baselineEventId: '', events: [], transactions: [] }));
        await expect(openProjectDirectory(partial)).rejects.toThrow('no backup');
    });

    it('stores a Project Control edit as a patch and replays it after reopening', async () => {
        const parent = new MemoryDirectory('projects');
        const data = createEmptyProjectData('Replay', 'RPL');
        ensureBoardTimelineBaseline(data);
        const handle = await createProjectDirectory(parent, 'replay', data);
        const record = await BoardRepository.createRecordFromHandle(handle);
        const saved = saveControlRecord(record.data, { ...newControlRecord('risks'), title: 'Tracked risk' }, 'Ana');
        record.data.extensions.projectControl!.records[0].comments.push({ id: 'c1', at: new Date(Date.now() + 1000).toISOString(), author: { name: 'Rui', kind: 'local' }, text: 'Later comment', images: [] });
        appendTimelineEvent(record.data, { id: 'control', at: new Date(Date.now() + 2000).toISOString(), kind: 'board.control.updated', entityType: 'board', entityId: saved.id, summary: 'Risk', snapshot: createBoardStateSnapshot(record.data) });
        await writeJsonToFileHandle(handle, record.data);
        const directory = await parent.getDirectoryHandle('replay');
        const raw = JSON.parse((await directory.getFileHandle('history.json')).text());
        const stored = raw.transactions[0].events[0];
        expect(stored).toHaveProperty('patch'); expect(stored).not.toHaveProperty('checkpoint');
        expect(raw.recordHistory.control).toEqual({});
        expect(raw.transactions[0].recordHistory.control[saved.id]).toHaveLength(1);
        const reopened = await BoardRepository.createRecordFromHandle(await openProjectDirectory(directory));
        reopened.data.extensions.timeline = await loadDirectoryHistory(reopened.handle!);
        const current = reopened.data.extensions.projectControl!.records[0];
        expect(current.comments[0].text).toBe('Later comment');
        const observed = reconstructBoardStateFromTimeline(reopened.data, 1).extensions.projectControl!.records[0];
        expect(observed.title).toBe('Tracked risk');
        expect(observed.comments.map((comment) => comment.id)).toEqual(['c1']);
    });

    it('never reuses numbers after restoring an older state in a folder project', async () => {
        const parent = new MemoryDirectory('projects');
        const data = createEmptyProjectData('Numbers', 'NUM');
        ensureBoardTimelineBaseline(data);
        const handle = await createProjectDirectory(parent, 'numbers', data);
        const record = await BoardRepository.createRecordFromHandle(handle);
        const first = saveControlRecord(record.data, { ...newControlRecord('risks'), title: 'First' }, 'Ana');
        appendTimelineEvent(record.data, { kind: 'board.control.updated', entityType: 'board', entityId: first.id, summary: 'First', snapshot: createBoardStateSnapshot(record.data) });
        await writeJsonToFileHandle(handle, record.data);
        const reopened = await BoardRepository.createRecordFromHandle(await openProjectDirectory(await parent.getDirectoryHandle('numbers')));
        reopened.data.extensions.timeline = await loadDirectoryHistory(reopened.handle!);
        const restored = reconstructBoardStateFromTimeline(reopened.data, 0);
        restored.extensions.projectStorage = reopened.data.extensions.projectStorage;
        expect(saveControlRecord(restored, { ...newControlRecord('risks'), title: 'Second' }, 'Ana').id).toBe('NUM-RK-2');
    });
});
