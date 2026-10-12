import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import {
  getProjectAssigneeSuggestions,
  getProjectBaseData,
  normalizeProjectBaseData,
  projectBaseDataEqual,
  setProjectBaseData
} from '../../src/domain/projectDetails';
import type { ProjectBaseData } from '../../src/domain/projectDetails';
import { createBoardStateSnapshot, serializeBoardDataFromObject } from '../../src/domain/serialize';
import { normalizeTask } from '../../src/domain/task';
import {
  appendTimelineEvent,
  ensureBoardTimelineBaseline,
  getBoardTimelineData,
  reconstructBoardStateFromTimeline,
  recordBoardRestoreTimelineEvent
} from '../../src/domain/timeline';
import type { BoardData, TimelineChanges } from '../../src/domain/types';

const populated: ProjectBaseData = {
  title: 'Delivery',
  description: '  First line\nSecond line\n',
  team: ['Ana', 'Bruno']
};

function reopen(data: BoardData): BoardData {
  const parsed = JSON.parse(JSON.stringify(serializeBoardDataFromObject(data)));
  validateBoardData(parsed);
  return serializeBoardDataFromObject(parsed);
}

function saveDetails(data: BoardData, next: ProjectBaseData): void {
  ensureBoardTimelineBaseline(data);
  const before = getProjectBaseData(data);
  const after = normalizeProjectBaseData(next);
  const changes: TimelineChanges = {};
  for (const field of ['title', 'description', 'team'] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      changes[field] = { before: before[field], after: after[field] };
    }
  }
  setProjectBaseData(data, after);
  if (Object.keys(changes).length) {
    appendTimelineEvent(data, {
      kind: 'project.details.updated',
      entityType: 'board',
      entityId: 'board',
      summary: 'Project details updated',
      changes
    });
  }
}

describe('project base data', () => {
  it('trims title and team, drops empty/duplicate names, and preserves description text and first spelling', () => {
    expect(normalizeProjectBaseData({
      title: '  Delivery  ', description: populated.description,
      team: [' Ana ', '', 'ana', ' ANA ', '  ', 'Bruno', 'BRUNO', 'Ana Maria']
    })).toEqual({ ...populated, team: ['Ana', 'Bruno', 'Ana Maria'] });
  });

  it.each(['', ' \n\t '])('rejects blank title %j before mutating the project', (title) => {
    const data = createEmptyProjectData('Original');
    const before = JSON.stringify(data);
    expect(() => normalizeProjectBaseData({ ...populated, title })).toThrow('Project title');
    expect(() => setProjectBaseData(data, { ...populated, title })).toThrow('Project title');
    expect(JSON.stringify(data)).toBe(before);
  });

  it('compares normalized content while treating spelling, order and description whitespace as changes', () => {
    expect(projectBaseDataEqual(populated, {
      ...populated, title: ' Delivery ', team: [' Ana ', 'ana', 'Bruno', ' ']
    })).toBe(true);
    expect(projectBaseDataEqual(populated, { ...populated, team: ['ana', 'Bruno'] })).toBe(false);
    expect(projectBaseDataEqual(populated, { ...populated, team: ['Bruno', 'Ana'] })).toBe(false);
    expect(projectBaseDataEqual(populated, { ...populated, description: populated.description.trim() })).toBe(false);
  });

  it('does not infer an old project team from existing assignees or add an extension on an empty no-op save', () => {
    const data = createEmptyProjectData('Old project');
    data.board.tasks.push(normalizeTask({ id: 1, title: 'Old task', assignee: 'Ana' }));
    const before = JSON.stringify(data);
    expect(getProjectBaseData(data)).toEqual({ title: 'Old project', description: '', team: [] });
    setProjectBaseData(data, { title: ' Old project ', description: '', team: [' '] });
    expect(JSON.stringify(data)).toBe(before);
    expect(getProjectBaseData(reopen(data))).toEqual({ title: 'Old project', description: '', team: [] });
  });

  it('changes only base data, keeps the title in settings, and isolates caller-owned arrays', () => {
    const data = createEmptyProjectData('Original');
    data.board.settings.sortMode = 'manual';
    data.board.tasks.push(normalizeTask({ id: 1, title: 'Work', assignees: ['Ana'] }));
    data.extensions.other = { nested: ['keep'] };
    data.extensions.dayPlanner = { version: 1, blocks: [{
      id: 'block-1', taskId: 1, date: '2026-10-12', start: '09:00', end: '09:30'
    }] };
    const tasks = data.board.tasks;
    const planner = data.extensions.dayPlanner;
    const other = data.extensions.other;
    const meta = { ...data.meta };
    const draft = { ...populated, team: [...populated.team] };
    setProjectBaseData(data, draft);
    draft.team.push('Later');
    expect(data.board.settings).toEqual({ title: populated.title, sortMode: 'manual' });
    expect(data.extensions.projectDetails).toEqual({ version: 1, description: populated.description, team: populated.team });
    expect(data.extensions.projectDetails).not.toHaveProperty('title');
    expect(data.board.tasks).toBe(tasks);
    expect(data.board.tasks[0].assignees).toEqual(['Ana']);
    expect(data.extensions.dayPlanner).toBe(planner);
    expect(data.extensions.other).toBe(other);
    expect(data.meta).toEqual(meta);
    const read = getProjectBaseData(data);
    read.team.push('Another');
    expect(getProjectBaseData(data)).toEqual(populated);
    const details = data.extensions.projectDetails;
    setProjectBaseData(data, { ...populated, team: [' Ana ', 'ana', 'Bruno'] });
    expect(data.extensions.projectDetails).toBe(details);
    setProjectBaseData(data, { ...populated, team: ['Bruno'] });
    expect(data.board.tasks[0].assignees).toEqual(['Ana']);
  });

  it('suggests the project team first, then local task assignees, without altering tasks or consulting other projects', () => {
    const data = createEmptyProjectData('Local');
    setProjectBaseData(data, { title: 'Local', description: '', team: [' Ana ', 'Bruno'] });
    data.board.tasks.push(
      normalizeTask({ id: 1, title: 'First', assignees: ['ana', 'Carla'] }),
      normalizeTask({ id: 2, title: 'Archived', archived: true, assignees: ['CARLA', 'Duarte'] })
    );
    const other = createEmptyProjectData('Other');
    setProjectBaseData(other, { title: 'Other', description: '', team: ['External'] });
    other.board.tasks.push(normalizeTask({ id: 1, title: 'Other task', assignees: ['Elsewhere'] }));
    const before = JSON.stringify(data);
    expect(getProjectAssigneeSuggestions(data)).toEqual(['Ana', 'Bruno', 'Carla', 'Duarte']);
    expect(getProjectAssigneeSuggestions(other)).toEqual(['External', 'Elsewhere']);
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe('project details persistence', () => {
  it('normalizes imported details and preserves other extensions through reopen and snapshots', () => {
    const data = createEmptyProjectData('Delivery');
    data.extensions = fromAny({
      projectDetails: { version: 1, description: populated.description, team: [' Ana ', 'ana', '', 'Bruno'] },
      custom: { value: ['preserved'] },
      roadmap: { version: 1, milestones: [], phases: [], sprints: [] }
    });
    const before = JSON.stringify(data);
    validateBoardData(data);
    const reopened = reopen(data);
    const snapshot = createBoardStateSnapshot(reopened);
    expect(getProjectBaseData(reopened)).toEqual(populated);
    expect(getProjectBaseData(snapshot)).toEqual(populated);
    expect(snapshot.extensions.custom).toEqual({ value: ['preserved'] });
    expect(snapshot.extensions.roadmap).toEqual(data.extensions.roadmap);
    expect(JSON.stringify(data)).toBe(before);
    snapshot.extensions.projectDetails!.team.push('Snapshot only');
    expect(getProjectBaseData(reopened)).toEqual(populated);
  });

  it('preserves explicit empty description and team when clearing and reopening', () => {
    const data = createEmptyProjectData('Delivery');
    setProjectBaseData(data, populated);
    setProjectBaseData(data, { title: 'Delivery', description: '', team: [] });
    expect(reopen(data).extensions.projectDetails).toEqual({ version: 1, description: '', team: [] });
    expect(createBoardStateSnapshot(data).extensions.projectDetails).toEqual({ version: 1, description: '', team: [] });
  });

  it.each([
    null,
    { version: 2, description: '', team: [] },
    { version: 1, description: null, team: [] },
    { version: 1, description: '', team: 'Ana' },
    { version: 1, description: '', team: [1] }
  ])('rejects malformed project details %j during file validation', (details) => {
    const data = createEmptyProjectData('Invalid');
    data.extensions.projectDetails = fromAny(details);
    expect(() => validateBoardData(data)).toThrow('extensions.projectDetails');
  });
});

describe('project details timeline replay and restore', () => {
  it('replays all changed fields, single-field updates, spelling corrections and empty values after JSON persistence', () => {
    const data = createEmptyProjectData('Original');
    data.board.tasks.push(normalizeTask({ id: 1, title: 'Task', assignees: ['Ana'] }));
    data.extensions.custom = { keep: true };
    saveDetails(data, populated);
    saveDetails(data, { ...populated, team: ['ana', 'Bruno'] });
    saveDetails(data, { ...populated, title: 'Renamed', team: ['ana', 'Bruno'] });
    saveDetails(data, { title: 'Renamed', description: '', team: [] });
    const reopened = reopen(data);
    const events = getBoardTimelineData(reopened)!.events;
    expect(events).toHaveLength(5);
    expect(events[1].changes).toEqual({
      title: { before: 'Original', after: 'Delivery' },
      description: { before: '', after: populated.description },
      team: { before: [], after: ['Ana', 'Bruno'] }
    });
    expect(Object.keys(events[2].changes!)).toEqual(['team']);
    expect(Object.keys(events[3].changes!)).toEqual(['title']);
    expect(events[4].changes).toEqual({
      description: { before: populated.description, after: '' },
      team: { before: ['ana', 'Bruno'], after: [] }
    });
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 0))).toEqual({ title: 'Original', description: '', team: [] });
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 1))).toEqual(populated);
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 2))).toEqual({ ...populated, team: ['ana', 'Bruno'] });
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 3))).toEqual({ ...populated, title: 'Renamed', team: ['ana', 'Bruno'] });
    const cleared = reconstructBoardStateFromTimeline(reopened, 4);
    expect(getProjectBaseData(cleared)).toEqual({ title: 'Renamed', description: '', team: [] });
    expect(cleared.board.tasks[0].assignees).toEqual(['Ana']);
    expect(cleared.extensions.custom).toEqual({ keep: true });
  });

  it('replays description-only and team-only events on an old baseline without losing fields', () => {
    const data = createEmptyProjectData('Old');
    saveDetails(data, { title: 'Old', description: 'Description', team: [] });
    saveDetails(data, { title: 'Old', description: 'Description', team: [' Ana ', 'ana'] });
    const reopened = reopen(data);
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 1))).toEqual({ title: 'Old', description: 'Description', team: [] });
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 2))).toEqual({ title: 'Old', description: 'Description', team: ['Ana'] });
  });

  it('restores a populated snapshot and an old snapshot, and persists their replayed details', () => {
    const data = createEmptyProjectData('Original');
    saveDetails(data, populated);
    saveDetails(data, { title: 'Current', description: '', team: ['Carla'] });
    const old = reconstructBoardStateFromTimeline(data, 0);
    const historical = reconstructBoardStateFromTimeline(data, 1);
    const events = getBoardTimelineData(data)!.events;
    const restored = { ...historical, extensions: { ...historical.extensions, timeline: data.extensions.timeline } };
    recordBoardRestoreTimelineEvent(restored, events[1]);
    const reopened = reopen(restored);
    expect(getProjectBaseData(reopened)).toEqual(populated);
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(reopened, 3))).toEqual(populated);
    const restoredOld = { ...old, extensions: { ...old.extensions, timeline: reopened.extensions.timeline } };
    recordBoardRestoreTimelineEvent(restoredOld, events[0]);
    const oldReopened = reopen(restoredOld);
    expect(getProjectBaseData(oldReopened)).toEqual({ title: 'Original', description: '', team: [] });
    expect(getProjectBaseData(reconstructBoardStateFromTimeline(oldReopened, 4))).toEqual({ title: 'Original', description: '', team: [] });
  });
});
