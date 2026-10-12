import type { BoardData, ProjectDetailsExtension } from './types';
import { normalizeAssignees, taskAssignees } from './task';
import { isRecord } from './util';

export type ProjectBaseData = { title: string; description: string; team: string[] };

export function normalizeProjectDetailsExtension(value: unknown): ProjectDetailsExtension | null {
    if (!isRecord(value) || value.version !== 1) return null;
    if (typeof value.description !== 'string' || !Array.isArray(value.team)
        || value.team.some((name: unknown) => typeof name !== 'string')) return null;
    return { version: 1, description: value.description, team: normalizeAssignees(value.team) };
}

export function getProjectBaseData(data: BoardData): ProjectBaseData {
    const details = normalizeProjectDetailsExtension(data.extensions.projectDetails);
    return {
        title: data.board.settings.title.trim(),
        description: details?.description ?? '',
        team: details?.team ?? []
    };
}

export function normalizeProjectBaseData(input: ProjectBaseData): ProjectBaseData {
    const title = input.title.trim();
    if (!title) throw new Error('Project title must be non-empty.');
    return { title, description: input.description, team: normalizeAssignees(input.team) };
}

export function projectBaseDataEqual(a: ProjectBaseData, b: ProjectBaseData): boolean {
    const left = normalizeProjectBaseData(a);
    const right = normalizeProjectBaseData(b);
    return left.title === right.title && left.description === right.description
        && left.team.length === right.team.length
        && left.team.every((name, index) => name === right.team[index]);
}

export function setProjectBaseData(data: BoardData, input: ProjectBaseData): void {
    const next = normalizeProjectBaseData(input);
    if (projectBaseDataEqual(getProjectBaseData(data), next)) return;
    data.board.settings.title = next.title;
    data.extensions.projectDetails = { version: 1, description: next.description, team: next.team };
}

export function getProjectAssigneeSuggestions(data: BoardData): string[] {
    return normalizeAssignees([
        ...getProjectBaseData(data).team,
        ...data.board.tasks.flatMap((task) => taskAssignees(task))
    ]);
}
