import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { readFileSync } from 'node:fs';
import { createEmptyProjectData, validateBoardData } from '@/domain/board';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '@/domain/serialize';
import { applyProjectSettings, parseProjectData, PROJECT_STATUSES, syncProjectAssignments } from '@/domain/projectData';
import { getWorkflow } from '@/domain/workflow';
import { normalizeTask } from '@/domain/task';
import { reconstructBoardStateFromTimeline } from '@/domain/timeline';
import { createAppStore } from '@/features/portfolio/state/store';
import { createPortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';

function setup({ writable = true, saved = true } = {}) {
    const data = createEmptyProjectData('Project');
    data.extensions.project!.members = [{ id: 'ana', name: 'Ana' }, { id: 'rui', name: 'Rui' }, { id: 'unused', name: 'Unused' }];
    data.board.tasks = [normalizeTask({ id: 1, title: 'Task', assignees: ['Ana', 'Rui'], responsible: 'Ana', tags: ['bug'], archived: true })];
    syncProjectAssignments(data);
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Project', fileName: 'p.board.json', handle: writable ? {} : null, data })], selectedPortfolioBoardId: 'p' });
    const enqueueSave = vi.fn(async () => saved), markDirty = vi.fn(), alert = vi.fn(), closeDialogFn = vi.fn(), openDialogFn = vi.fn();
    const actions = createPortfolioMutationActions({ store, enqueueSave, markDirty, alert, closeDialogFn, openDialogFn });
    const current = () => store.getState().portfolioBoards[0].data;
    const draft = () => structuredClone({ name: current().board.settings.title, project: current().extensions.project! });
    return { data, store, actions, current, draft, enqueueSave, markDirty, alert, closeDialogFn, openDialogFn };
}

describe('project master data and curated values', () => {
    it.each(['us-11', 'us-21'])('validates and round-trips the %s manual test board', (name) => {
        const raw = JSON.parse(readFileSync(`test-board/${name}.board.json`, 'utf8'));
        validateBoardData(raw);
        const migrated = serializeBoardDataFromObject(raw);
        validateBoardData(migrated);
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(migrated)));
        expect(reopened.extensions.project).toEqual(migrated.extensions.project);
        expect(reopened.board.tasks).toEqual(migrated.board.tasks);
        expect(reopened.extensions.roadmap).toEqual(migrated.extensions.roadmap);
    });
    it('migrates legacy names/tags once, leaves the lifecycle unknown, preserves roadmap/history and round-trips stable references', () => {
        const legacy = JSON.parse(readFileSync('tests/fixtures/assignments-v1.board.json', 'utf8'));
        const original = JSON.stringify(legacy);
        const migrated = serializeBoardDataFromObject(legacy);
        validateBoardData(migrated);
        expect(migrated.extensions.project).toMatchObject({ version: 1, status: null, description: '' });
        expect(migrated.extensions.project!.members.map((member) => member.name)).toEqual(['Ana', 'Rui']);
        expect(migrated.board.tasks[0].assigneeIds).toHaveLength(2);
        expect(migrated.board.tasks[0].responsibleId).toBe('');
        expect(migrated.extensions.timeline).toEqual(legacy.extensions.timeline);
        const reopened = serializeBoardDataFromObject(JSON.parse(JSON.stringify(migrated)));
        expect(reopened.extensions.project).toEqual(migrated.extensions.project);
        expect(reopened.board.tasks).toEqual(migrated.board.tasks);
        expect(JSON.stringify(legacy)).toBe(original);
    });

    it('deduplicates legacy names case-insensitively and reuses the canonical spelling', () => {
        const data = createEmptyProjectData('Legacy'); delete data.extensions.project;
        data.board.tasks = [normalizeTask({ id: 1, title: 'One', assignees: [' Ana ', 'ana'], responsible: 'ANA', tags: ['legacy'] }), normalizeTask({ id: 2, title: 'Two', assignees: ['ANA'] })];
        const migrated = serializeBoardDataFromObject(data);
        expect(migrated.extensions.project!.members).toHaveLength(1);
        expect(migrated.extensions.project!.tags).toEqual(['legacy']);
        expect(migrated.board.tasks[1].assigneeIds).toEqual(migrated.board.tasks[0].assigneeIds);
        expect(migrated.board.tasks[0].responsibleId).toBe(migrated.board.tasks[0].assigneeIds![0]);
    });

    it('renames members by identity everywhere, including archived assignments, and preserves project identity', async () => {
        const { actions, current, draft } = setup();
        const before = draft(), after = draft();
        after.name = 'Renamed'; after.project.description = 'Description'; after.project.members[0].name = ' Ana Silva ';
        await expect(actions.saveProjectSettings('p', after, before)).resolves.toBe(true);
        expect(current().extensions.project!.id).toBe(before.project.id);
        expect(current().board.tasks[0]).toMatchObject({ assignees: ['Ana Silva', 'Rui'], responsible: 'Ana Silva', assigneeIds: ['ana', 'rui'], responsibleId: 'ana' });
        validateBoardData(serializeBoardDataFromObject(current()));
    });

    it.each(PROJECT_STATUSES)('allows %s with unfinished/archived tasks, without hiding or changing them', (status) => {
        const { data, draft } = setup(); const before = structuredClone(data.board.tasks);
        const next = draft(); next.project.status = status;
        applyProjectSettings(data, next);
        expect(data.extensions.project!.status).toBe(status);
        expect(data.board.tasks).toEqual(before);
    });

    it('allows empty descriptions/lists and deleting unused default tags but rejects blank names', () => {
        const data = createEmptyProjectData('Empty');
        const project = { ...data.extensions.project!, tags: [] };
        applyProjectSettings(data, { name: ' Name ', project });
        expect(data.board.settings.title).toBe('Name');
        expect(data.extensions.project).toMatchObject({ description: '', members: [], tags: [] });
        expect(() => applyProjectSettings(data, { name: '  ', project })).toThrow(/name/);
    });

    it('rejects duplicate/blank names and malformed/duplicate tags rather than merging identities', () => {
        const { draft } = setup();
        const duplicate = draft().project; duplicate.members[1].name = ' ANA ';
        expect(() => parseProjectData(duplicate)).toThrow(/duplicateMember/);
        const empty = draft().project; empty.members[1].name = ' ';
        expect(() => parseProjectData(empty)).toThrow(/name/);
        expect(() => parseProjectData({ ...draft().project, tags: ['bug', ' BUG '] })).toThrow(/duplicateTag/);
        expect(() => parseProjectData({ ...draft().project, tags: ['x'.repeat(31)] })).toThrow(/tag/);
        expect(() => parseProjectData({ ...draft().project, version: 2 })).toThrow(/invalid/);
    });

    it('blocks deletion of assigned members/tags, including archived tasks; unused members are removable', async () => {
        const { actions, draft, current, enqueueSave } = setup();
        const original = draft(), memberRemoval = draft(), tagRemoval = draft();
        memberRemoval.project.members = memberRemoval.project.members.filter((member) => member.id !== 'ana');
        await expect(actions.saveProjectSettings('p', memberRemoval, original)).resolves.toBe(false);
        tagRemoval.project.tags = [];
        await expect(actions.saveProjectSettings('p', tagRemoval, original)).resolves.toBe(false);
        expect(enqueueSave).not.toHaveBeenCalled(); expect(current().extensions.timeline).toBeUndefined();
        const unusedRemoval = draft(); unusedRemoval.project.members.pop();
        await expect(actions.saveProjectSettings('p', unusedRemoval, original)).resolves.toBe(true);
    });

    it('replays/removes/restores members and metadata without breaking historical assignments or identity', async () => {
        const { actions, current, draft, store } = setup();
        const before = draft(), after = draft(); after.name = 'Changed'; after.project.members[0].name = 'Ana Silva'; after.project.description = 'After';
        await actions.saveProjectSettings('p', after, before);
        const historical = reconstructBoardStateFromTimeline(current(), 0);
        expect(historical.board.settings.title).toBe('Project'); expect(historical.board.tasks[0].responsible).toBe('Ana');
        expect(reconstructBoardStateFromTimeline(current(), 1).board.tasks[0].responsible).toBe('Ana Silva');
        store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        await actions.restorePortfolioTimelineSelection();
        expect(current().extensions.project!.id).toBe(before.project.id);
        expect(current().extensions.project!.description).toBe('');
        expect(current().board.tasks[0].responsibleId).toBe('ana');
        expect(current().board.tasks[0].responsible).toBe('Ana');
        validateBoardData(serializeBoardDataFromObject(current()));
    });

    it('refuses read-only/historical writes, exposes historical settings, and leaves selection unchanged', async () => {
        const readOnly = setup({ writable: false });
        await expect(readOnly.actions.saveProjectSettings('p', readOnly.draft(), readOnly.draft())).resolves.toBe(false);
        readOnly.actions.openProjectSettings('p');
        expect(readOnly.openDialogFn).toHaveBeenCalledWith('projectSettings', expect.objectContaining({ boardId: 'p', readOnly: true }));
        const { actions, draft, store, openDialogFn } = setup();
        const before = draft(), after = draft(); after.name = 'Latest';
        await actions.saveProjectSettings('p', after, before);
        store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        actions.openProjectSettings('p');
        expect(openDialogFn).toHaveBeenLastCalledWith('projectSettings', expect.objectContaining({ readOnly: true, data: expect.objectContaining({ board: expect.objectContaining({ settings: { title: 'Project' } }) }) }));
        await expect(actions.saveProjectSettings('p', before, after)).resolves.toBe(false);
        expect(store.getState().selectedPortfolioBoardId).toBe('p');
    });

    it('rejects stale settings and keeps an applied draft and its event after disk save failure', async () => {
        const { actions, draft, current, closeDialogFn, enqueueSave } = setup({ saved: false });
        const before = draft(), after = draft(); after.name = 'Kept';
        await expect(actions.saveProjectSettings('p', after, before)).resolves.toBe(false);
        expect(current().board.settings.title).toBe('Kept'); expect(closeDialogFn).toHaveBeenCalledWith('projectSettings');
        expect(current().extensions.timeline!.events).toHaveLength(2);
        await expect(actions.saveProjectSettings('p', after, before)).resolves.toBe(false);
        expect(enqueueSave).toHaveBeenCalledTimes(1);
    });

    it('saves general and workflow drafts in one write, rejecting invalid or stale workflows without partial changes', async () => {
        const { actions, draft, current, enqueueSave } = setup();
        const before = draft(), after = draft(); after.name = 'Both settings';
        const originalWorkflow = getWorkflow(current());
        const workflow = structuredClone(originalWorkflow); workflow.states[1].name = 'Ready';
        const invalid = structuredClone(workflow); invalid.entryStateId = 'missing';
        await expect(actions.saveProjectSettings('p', after, before, { original: originalWorkflow, workflow: invalid, relocations: {} })).resolves.toBe(false);
        expect(current().board.settings.title).toBe('Project');
        expect(current().extensions.timeline).toBeUndefined();
        expect(enqueueSave).not.toHaveBeenCalled();
        const staleOriginal = structuredClone(originalWorkflow); staleOriginal.states[1].name = 'Outdated';
        await expect(actions.saveProjectSettings('p', after, before, { original: staleOriginal, workflow, relocations: {} })).resolves.toBe(false);
        expect(current().board.settings.title).toBe('Project');
        await expect(actions.saveProjectSettings('p', after, before, { original: originalWorkflow, workflow, relocations: {} })).resolves.toBe(true);
        expect(enqueueSave).toHaveBeenCalledTimes(1);
        expect(current().board.settings.title).toBe('Both settings');
        expect(getWorkflow(current()).states[1].name).toBe('Ready');
        expect(current().extensions.timeline!.events.slice(-2).map((event) => event.kind)).toEqual(['board.project.updated', 'workflow.updated']);
    });

    it('guards every mutation and quick-create against unknown/cross-project members and tags', async () => {
        const { actions, current, enqueueSave } = setup();
        await expect(actions.togglePortfolioTaskAssignee('p', 1, 'Typo')).resolves.toBe(false);
        await expect(actions.setPortfolioTaskResponsible('p', 1, 'Typo')).resolves.toBe(false);
        await expect(actions.createPortfolioTaskFromFields('p', { title: 'No', assignees: [], tags: ['typo'], dueDate: '', priority: null, effort: null })).resolves.toBeNull();
        expect(current().board.tasks).toHaveLength(1); expect(enqueueSave).not.toHaveBeenCalled();
    });

    it('rejects corrupt persisted references and retains references in snapshots', () => {
        const { data } = setup(); validateBoardData(data);
        expect(createBoardStateSnapshot(data).board.tasks[0].responsibleId).toBe('ana');
        const corrupt = structuredClone(data); corrupt.board.tasks[0].assigneeIds = ['other-project-id', 'rui'];
        expect(() => validateBoardData(corrupt)).toThrow(/unknownMember/);
        data.board.tasks[0].tags = ['typo']; expect(() => validateBoardData(data)).toThrow(/unknownTag/);
    });
});
