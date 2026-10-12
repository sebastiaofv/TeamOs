import { fromAny } from '@total-typescript/shoehorn';
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import type { BoardRecord } from '../../src/features/portfolio/types';
import { buildTaskEditorViewModel } from '../../src/features/portfolio/commands/taskViewModels';

describe('task editor assignee suggestions', () => {
  it('uses the owning project\'s team first, then only its local task assignees', () => {
    const data = createEmptyProjectData('Owner');
    data.extensions.projectDetails = { version: 1, description: '', team: ['Zoe', 'Ana', 'ana'] };
    const task = normalizeTask({ id: 1, title: 'Task', status: 'to-do', assignees: ['ANA', 'Bruno'] });
    data.board.tasks = [task, normalizeTask({ id: 2, title: 'Other local task', assignees: ['Carla'] })];
    const owner = fromAny<BoardRecord, Record<string, unknown>>({ id: 'owner', title: 'Owner', data });
    const editor = buildTaskEditorViewModel(owner, task, 1);
    expect(editor.assigneePool).toEqual(['Zoe', 'Ana', 'Bruno', 'Carla']);
    expect(editor.initial.assignees).toEqual(['ANA', 'Bruno']);
    expect(buildTaskEditorViewModel(owner, null, 2).assigneePool).toEqual(editor.assigneePool);
  });

  it('keeps free task names after a person is removed from the team', () => {
    const data = createEmptyProjectData('Owner');
    data.extensions.projectDetails = { version: 1, description: '', team: [] };
    const task = normalizeTask({ id: 1, title: 'Task', assignees: ['External Person'] });
    data.board.tasks = [task];
    const owner = fromAny<BoardRecord, Record<string, unknown>>({ id: 'owner', title: 'Owner', data });
    const editor = buildTaskEditorViewModel(owner, task, 1);
    expect(editor.assigneePool).toEqual(['External Person']);
    expect(editor.initial.assignees).toEqual(['External Person']);
  });
});
