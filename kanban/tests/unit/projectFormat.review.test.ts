import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fromAny, fromPartial } from '@total-typescript/shoehorn';
import type { BoardData, LooseBoardData } from '../../src/domain/types';
import { createEmptyProjectData } from '../../src/domain/board';
import { createBoardStateSnapshot, hashTextContent, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { appendTimelineEvent, ensureBoardTimelineBaseline, reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { fromProjectFile, KNOWN_PROJECT_EXTENSIONS, toProjectCheckpoint, toProjectFile, type ProjectFileV1 } from '../../src/domain/projectFormat';
import { applyProjectPatch, diffProjectState } from '../../src/domain/projectPatch';
import { newControlRecord, saveControlRecord, type ControlRecord } from '../../src/domain/projectControl';
import { closeSprint } from '../../src/domain/sprintResults';
import { createProjectDirectory, getDirectoryProject, loadDirectoryHistory, openProjectDirectory } from '../../src/infrastructure/persistence/projectDirectory';
import { BoardRepository, writeJsonToFileHandle } from '../../src/infrastructure/persistence/boardRepository';
import { getWorkflow } from '../../src/domain/workflow';
import { dashboardMetrics, dashboardTasks } from '../../src/domain/dashboard';
import { getProjectFileState, refreshProjectFileBaseline, restoreProjectRecovery, syncProjectSaveStates } from '../../src/infrastructure/persistence/projectFiles';
import type { ProjectRecovery } from '../../src/infrastructure/persistence/projectRecovery';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { MemoryDirectory, MemoryFile } from '../support/projectDirectory';

const roundTrip = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Everything a user can observe, with the documented normalizations applied. */
function observable(data: BoardData) {
    const tasks = data.board.tasks.map((task) => ({ id: task.id, permanentId: task.permanentId, displayId: task.displayId, type: task.type ?? 'task', title: task.title, description: task.description, status: task.status, parentId: task.parentId ?? null, assignees: task.assignees, responsible: task.responsible, tags: task.tags, priority: task.priority, dueDate: task.dueDate, blocked: task.blocked, blockerReason: task.blockerReason, archived: task.archived, checklist: task.checklist, attachments: task.attachments, effort: task.effort, storyPoints: task.storyPoints, sprintId: task.sprintId, phaseMode: task.phaseMode ?? (task.phaseId ? 'explicit' : 'none'), milestoneMode: task.milestoneMode ?? (task.milestoneId ? 'explicit' : 'none'), statusChangedAt: task.statusChangedAt, acceptance: task.acceptance, sprintHistory: task.sprintHistory || undefined, createdAt: task.createdAt, updatedAt: task.updatedAt }));
    const extensions = data.extensions;
    const onlyFor = (record: ControlRecord, kind: ControlRecord['kind'], value: unknown) => (record.kind === kind ? value : '');
    const records = extensions.projectControl?.records.map(({ history: _history, comments: _comments, ...record }) => ({ ...record, probability: onlyFor(record as ControlRecord, 'risks', record.probability), impact: onlyFor(record as ControlRecord, 'risks', record.impact), mitigationPlan: onlyFor(record as ControlRecord, 'risks', record.mitigationPlan), contingencyPlan: onlyFor(record as ControlRecord, 'risks', record.contingencyPlan), materializedDate: onlyFor(record as ControlRecord, 'risks', record.materializedDate), actualImpact: onlyFor(record as ControlRecord, 'risks', record.actualImpact), decisionMaker: onlyFor(record as ControlRecord, 'decisions', record.decisionMaker), decisionDate: onlyFor(record as ControlRecord, 'decisions', record.decisionDate), rationale: onlyFor(record as ControlRecord, 'decisions', record.rationale), validator: onlyFor(record as ControlRecord, 'deliverables', record.validator), deliveredDate: onlyFor(record as ControlRecord, 'deliverables', record.deliveredDate), acceptedDate: onlyFor(record as ControlRecord, 'deliverables', record.acceptedDate) }));
    return { title: data.board.settings.title, tasks, records, roadmap: { milestones: extensions.roadmap?.milestones || [], phases: extensions.roadmap?.phases || [], sprints: extensions.roadmap?.sprints || [] }, sprintResults: extensions.sprintResults, workflow: getWorkflow(data), hidden: extensions.boardView?.hiddenStateIds || [], members: extensions.project?.members.map((member) => member.name).sort(), planner: extensions.dayPlanner?.blocks || [], relations: extensions.taskRelations?.relations || [], participation: (extensions.sprintParticipation?.entries || []).filter((entry) => !extensions.sprintResults?.closures.some((closure) => closure.sprintId === entry.sprintId)).map((entry) => [entry.sprintId, entry.task.id, entry.task.title]), unknownExtensions: Object.keys(extensions).filter((key) => !KNOWN_PROJECT_EXTENSIONS.has(key)).sort() };
}

describe('project folder conversion safeguards', () => {
    const legacyFolder = (path = 'tests/fixtures/legacy/folder-v6/alpha') => {
        const directory = new MemoryDirectory('alpha');
        directory.children.set('project.json', new MemoryFile('project.json', readFileSync(join(path, 'project.json'), 'utf8')));
        directory.children.set('history.json', new MemoryFile('history.json', readFileSync(join(path, 'history.json'), 'utf8')));
        directory.children.set('attachments', new MemoryDirectory('attachments'));
        return directory;
    };
    const text = (directory: MemoryDirectory, name: string) => (directory.children.get(name) as MemoryFile).text();
    const seedFolder = async (title = 'Seed', acronym = 'SED') => {
        const parent = new MemoryDirectory('projects');
        const data = createEmptyProjectData(title, acronym);
        ensureBoardTimelineBaseline(data);
        const handle = await createProjectDirectory(parent, 'seed', data);
        return { parent, handle, directory: await parent.getDirectoryHandle('seed'), record: await BoardRepository.createRecordFromHandle(handle) };
    };

    it('keeps a project readable when the commit marker fails after the project write', async () => {
        const { directory, handle, record } = await seedFolder();
        const history = directory.children.get('history.json') as MemoryFile;
        const edit = (title: string) => { const saved = saveControlRecord(record.data, { ...newControlRecord('risks'), title }, 'Ana'); appendTimelineEvent(record.data, { kind: 'board.control.updated', entityType: 'board', entityId: saved.id, summary: title, snapshot: createBoardStateSnapshot(record.data) }); };
        edit('First');
        history.attempts = 0; history.failOnAttempt = 2;
        await expect(writeJsonToFileHandle(handle, record.data)).rejects.toThrow('write denied');
        history.failOnAttempt = 0;
        edit('Second');
        await writeJsonToFileHandle(handle, record.data);
        const reopened = await openProjectDirectory(directory);
        await BoardRepository.createRecordFromHandle(reopened);
        expect((await loadDirectoryHistory(reopened))!.events.filter((event) => event.kind === 'board.control.updated')).toHaveLength(2);
    });

    it('rejects invalid legacy structures instead of converting them', async () => {
        const reject = async (change: (project: LooseBoardData & { extensions: Record<string, unknown> }, history: Record<string, unknown>) => void, message: string) => {
            const directory = legacyFolder();
            const project = JSON.parse(text(directory, 'project.json')), history = JSON.parse(text(directory, 'history.json'));
            change(project, history);
            (directory.children.get('project.json') as MemoryFile).setText(JSON.stringify(project));
            (directory.children.get('history.json') as MemoryFile).setText(JSON.stringify(history));
            await expect(openProjectDirectory(directory)).rejects.toThrow(message);
            expect(directory.children.has('backup')).toBe(false);
        };
        await reject((project) => { project.extensions.timeline = { version: 1, baselineEventId: '', events: [] }; }, 'without a timeline');
        await reject((project) => { project.extensions.projectStorage = { version: 2, baselineEventId: '' }; }, 'projectStorage');
        await reject((project) => { (project.extensions.projectStorage as { baselineEventId: string }).baselineEventId = 'other'; }, 'baseline');
        await reject((_project, history) => { const timeline = history.timeline as { events: { kind: string }[] }; timeline.events[0].kind = 'task.updated'; }, 'invalid timeline');
    });

    it('rejects invalid v1 storage metadata', async () => {
        const { directory } = await seedFolder();
        const file = directory.children.get('project.json') as MemoryFile;
        const value = JSON.parse(file.text()); value.system.storage.historyTransactionId = '';
        file.setText(JSON.stringify(value));
        await expect(openProjectDirectory(directory)).rejects.toThrow('projectStorage');
    });

    it('reserves restored-away control numbers when a .board.json becomes a folder', async () => {
        const data = createEmptyProjectData('Import', 'IMP');
        ensureBoardTimelineBaseline(data);
        saveControlRecord(data, { ...newControlRecord('risks'), title: 'A' }, 'Ana');
        const snapshot = createBoardStateSnapshot(data); snapshot.extensions.projectControl!.lastNumber = 7;
        appendTimelineEvent(data, { kind: 'board.control.updated', entityType: 'board', entityId: 'x', summary: 's', snapshot });
        data.extensions.projectControl!.lastNumber = 1;
        data.extensions.projectStorage = { version: 1, baselineEventId: '', legacyFileName: 'import.board.json' };
        const parent = new MemoryDirectory('projects');
        await createProjectDirectory(parent, 'import', data);
        const file = JSON.parse((await (await parent.getDirectoryHandle('import')).getFileHandle('project.json')).text());
        expect(file.system.sequences.controlRecords.lastNumber).toBe(7);
    });

    it('accepts a recovery draft taken before the conversion', async () => {
        const directory = legacyFolder();
        const legacyText = text(directory, 'project.json');
        const handle = await openProjectDirectory(directory);
        const board = await BoardRepository.createRecordFromHandle(handle);
        useAppStore.setState({ portfolioBoards: [board] }); syncProjectSaveStates();
        await refreshProjectFileBaseline(board);
        const projectId = board.data.extensions.project!.id;
        expect(restoreProjectRecovery(board.id, { id: 'draft', projectId, fileName: 'project.json', at: board.data.meta.updatedAt, base: board.data, baseHash: hashTextContent(legacyText), local: board.data } as ProjectRecovery)).toBe(true);
        expect(getProjectFileState(board.id)!.lastTextHash).toBe(getDirectoryProject(handle)!.projectHash);
    });
});

describe('format rules', () => {
    const task = (patch: Partial<BoardData['board']['tasks'][number]>) => fromPartial<BoardData['board']['tasks'][number]>({ id: 1, type: 'task', title: 'T', description: '', status: 'backlog', assignees: [], responsible: '', tags: [], blocked: false, blockerReason: '', checklist: [], attachments: [], archived: false, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', dueDate: '', priority: null, effort: null, phaseId: '', milestoneId: '', sprintId: '', phaseMode: 'none', milestoneMode: 'none', permanentId: 'p1', parentId: null, ...patch });
    const withTasks = (...tasks: BoardData['board']['tasks']) => { const data = createEmptyProjectData('Rules', 'RUL'); data.board.tasks.push(...tasks); return data; };

    it('keeps statusChangedAt', () => {
        const statusChangedAt = '2026-02-02T00:00:00.000Z';
        expect(fromProjectFile(roundTrip(toProjectFile(withTasks(task({ statusChangedAt }))))).board.tasks[0].statusChangedAt).toBe(statusChangedAt);
    });

    it('writes only the planning fields of each type and rejects the others', () => {
        const acceptance = { author: 'Ana', at: '2026-01-01T00:00:00.000Z', local: true as const };
        const file = roundTrip(toProjectFile(withTasks(
            task({ id: 1, permanentId: 'a', type: 'epic', storyPoints: 3, severity: 'high', acceptance, sprintHistory: [{ sprintId: 's', status: 'x', at: acceptance.at }] }),
            task({ id: 2, permanentId: 'b', type: 'story', storyPoints: 5, severity: 'high', parentId: 1, acceptance }),
            task({ id: 3, permanentId: 'c', type: 'task', storyPoints: 2, parentId: 2, acceptance }),
            task({ id: 4, permanentId: 'd', type: 'task', storyPoints: 2, parentId: 1 }),
            task({ id: 5, permanentId: 'e', type: 'bug', severity: 'high', acceptance })
        )));
        const [epic, story, child, independent, bug] = file.workitems;
        for (const field of ['storyPoints', 'severity', 'acceptance', 'sprintHistory']) expect(epic).not.toHaveProperty(field);
        expect(story).toMatchObject({ storyPoints: 5, acceptance }); expect(story).not.toHaveProperty('severity');
        expect(child).not.toHaveProperty('storyPoints'); expect(child).not.toHaveProperty('acceptance');
        expect(independent.storyPoints).toBe(2); expect(bug).toMatchObject({ severity: 'high', acceptance });
        const reject = (index: number, field: string, value: unknown) => { const bad = roundTrip(file); bad.workitems[index][field] = value; expect(() => fromProjectFile(bad)).toThrow(field); };
        reject(0, 'storyPoints', 1); reject(0, 'sprintHistory', []); reject(1, 'severity', 'high'); reject(2, 'acceptance', acceptance); reject(2, 'storyPoints', 1); reject(3, 'severity', 'high');
    });

    it('persists an explicit mode without a value as unplanned, so the file stays readable', () => {
        const file = roundTrip(toProjectFile(withTasks(task({ phaseMode: 'explicit', milestoneMode: 'explicit' }))));
        expect(file.workitems[0]).toMatchObject({ phaseMode: 'none', milestoneMode: 'none' });
        expect(file.workitems[0]).not.toHaveProperty('phaseId');
        expect(() => fromProjectFile(file)).not.toThrow();
    });

    it('stores closures without internal versions or duplicate assignment ids, and replays them', () => {
        const data = createEmptyProjectData('Closed', 'CLS');
        data.extensions.project!.members.push({ id: 'ana', name: 'Ana' });
        data.extensions.roadmap = { version: 5, milestones: [], phases: [], sprints: [{ id: 'sprint-1', title: 'S1', startDate: '2026-01-01', endDate: '2026-01-14' }] };
        data.board.tasks.push(task({ sprintId: 'sprint-1', assignees: ['Ana'], assigneeIds: ['ana'], responsible: 'Ana', responsibleId: 'ana' }));
        const before = toProjectCheckpoint(createBoardStateSnapshot(data));
        closeSprint(data, 'sprint-1');
        const file = roundTrip(toProjectFile(data));
        const stored = (file.roadmap.sprintResults as { closures: Record<string, unknown>[] }).closures[0];
        expect(JSON.stringify(stored)).not.toContain('"version"');
        expect((stored.tasks as Record<string, unknown>[])[0]).toMatchObject({ assignees: ['Ana'], responsible: 'Ana' });
        expect((stored.tasks as Record<string, unknown>[])[0]).not.toHaveProperty('assigneeIds');
        const restored = fromProjectFile(file).extensions.sprintResults!.closures[0];
        expect(restored.workflow.version).toBe(2);
        const previous = fromProjectFile(roundTrip({ ...before, system: {} }) as never);
        const replayed = applyProjectPatch(previous, roundTrip(diffProjectState(before, toProjectCheckpoint(createBoardStateSnapshot(data)))));
        expect(replayed.extensions.sprintResults!.closures[0].workflow.version).toBe(2);
    });

    it('removes unknown extension keys on replay', () => {
        const a = createEmptyProjectData('Ext', 'EXT'), b = createEmptyProjectData('Ext', 'EXT');
        b.extensions.project = a.extensions.project; b.meta = a.meta;
        Object.assign(a.extensions, { thirdParty: { keep: false } });
        const result = applyProjectPatch(a, roundTrip(diffProjectState(toProjectCheckpoint(a), toProjectCheckpoint(b))));
        expect(result.extensions).not.toHaveProperty('thirdParty');
    });

    it('absorbs the old task attachment map', () => {
        const data = serializeBoardDataFromObject({ ...withTasks(task({})), extensions: { ...withTasks().extensions, teamOsKanban: { taskAttachments: {} } } });
        expect(roundTrip(toProjectFile(data))).not.toHaveProperty('extensions');
    });

    it('rebuilds from the nearest checkpoint and shows only transfers that already existed', () => {
        const data = createEmptyProjectData('Near', 'NEA');
        ensureBoardTimelineBaseline(data);
        data.extensions.projectStorage = { version: 1, baselineEventId: data.extensions.timeline!.baselineEventId };
        const baseline = data.extensions.timeline!.events[0];
        const operation = (id: string, at: string) => fromPartial<NonNullable<BoardData['extensions']['projectTransfers']>['operations'][number]>({ id, at, history: [] });
        data.extensions.projectTransfers = { version: 1, operations: [operation('past', '2026-01-01T00:00:00.000Z'), operation('future', '2099-01-01T00:00:00.000Z')] };
        const broken = { id: 'broken', at: '2026-02-01T00:00:00.000Z', kind: 'board.control.updated', entityType: 'board', entityId: 'x', summary: 's', patch: [{ op: 'remove', at: 'not-a-collection', key: 'x' }] };
        const checkpoint = { ...baseline, id: 'checkpoint', at: '2026-03-01T00:00:00.000Z', kind: 'board.project.updated' };
        data.extensions.timeline!.events.push(fromAny(broken), checkpoint);
        const state = reconstructBoardStateFromTimeline(data, 2);
        expect(state.extensions.projectTransfers?.operations.map((item) => item.id)).toEqual(['past']);
    });
});

describe('golden conversion of folder fixtures', () => {
    const load6 = (name: string) => {
        const base = `tests/fixtures/legacy/${name === 'beta' ? 'folder-v6-large' : 'folder-v6'}/${name}`;
        const project = readFileSync(join(base, 'project.json'), 'utf8'), history = readFileSync(join(base, 'history.json'), 'utf8');
        const directory = new MemoryDirectory(name);
        directory.children.set('project.json', new MemoryFile('project.json', project));
        directory.children.set('history.json', new MemoryFile('history.json', history));
        directory.children.set('attachments', new MemoryDirectory('attachments'));
        const legacy = JSON.parse(project) as LooseBoardData & { extensions: Record<string, unknown> };
        delete legacy.extensions.projectStorage;
        legacy.extensions.timeline = (JSON.parse(history) as { timeline: unknown }).timeline;
        return { directory, legacy: serializeBoardDataFromObject(legacy, { reuseTimeline: false }) };
    };

    it.each(['alpha', 'beta'])('%s: every sampled moment matches the legacy reconstruction', async (name) => {
        const { directory, legacy } = load6(name);
        const handle = await openProjectDirectory(directory);
        const record = await BoardRepository.createRecordFromHandle(handle);
        record.data.extensions.timeline = await loadDirectoryHistory(handle);
        const count = legacy.extensions.timeline!.events.length;
        expect(record.data.extensions.timeline!.events.length).toBe(count + 1);
        const step = Math.max(1, Math.floor(count / 25));
        const indexes = [...new Set([...Array.from({ length: Math.ceil(count / step) }, (_, index) => index * step), count - 1])];
        const asOf = '2026-12-31';
        const moment = (data: BoardData, index: number) => { const state = reconstructBoardStateFromTimeline(data, index); return { state: { ...observable(state), records: undefined }, comments: state.extensions.conversations?.entries.map((entry) => entry.id) || [], metrics: JSON.parse(JSON.stringify(dashboardMetrics(state, dashboardTasks(state), asOf)).replaceAll('"technical:', '"')) }; };
        for (const index of indexes) expect(moment(record.data, index), `event ${index}`).toEqual(moment(legacy, index));
    }, 120000);

    it.each(['alpha', 'beta'])('%s: sequences never fall below what the old code computed', async (name) => {
        const { directory, legacy } = load6(name);
        await openProjectDirectory(directory);
        const sequences = (JSON.parse((directory.children.get('project.json') as MemoryFile).text()) as ProjectFileV1).system!.sequences as { workitems: { lastId: number }; sprints: { lastNumber: number }; controlRecords: { lastNumber: number } };
        expect(sequences.workitems.lastId).toBeGreaterThanOrEqual((legacy.extensions.taskIdentity as { highWaterMark?: number } | undefined)?.highWaterMark || 0);
        expect(sequences.sprints.lastNumber).toBeGreaterThanOrEqual(legacy.extensions.sprintCatalog?.lastNumber || 0);
        expect(sequences.controlRecords.lastNumber).toBeGreaterThanOrEqual(legacy.extensions.projectControl?.lastNumber || 0);
    });
});
