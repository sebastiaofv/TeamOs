import type { BoardData, LooseBoardData } from './types';
import { parseRoadmapIsoDate } from './roadmap';

export const PROJECT_STATES = ['planned', 'active', 'paused', 'completed', 'archived'] as const;
export type ProjectState = typeof PROJECT_STATES[number];
export type ProjectMember = { id: string; name: string; role: string; active: boolean; email: string; provisional?: boolean };
export type ProjectDates = { start: string; end: string };
export type ProjectInfo = {
    productId?: string;
    version: 1; id: string; name: string; state: ProjectState; description: string;
    manager: string; product: string; team: ProjectMember[]; tags: string[];
    forecast: ProjectDates; baseline: ProjectDates; actual: ProjectDates;
    needsReview: boolean;
};

export function stableLocalId(value: string): string {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(36);
}

export function newLocalId(prefix: string): string {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

export function getProjectInfo(data: LooseBoardData): ProjectInfo {
    const stored = data.extensions?.project;
    if (stored && typeof stored === 'object') {
        const info = stored as ProjectInfo;
        if (info.version !== 1 || !info.id || !Array.isArray(info.team)) throw new Error('Invalid or unsupported project metadata.');
        return info;
    }
    const settings = data.board?.settings as { title?: string } | undefined;
    const name = settings?.title || 'Untitled Project';
    const names = new Set<string>();
    if (Array.isArray(data.board?.tasks)) for (const task of data.board.tasks) {
        const assignees = task.assignees ?? task.assignee ?? [];
        for (const value of Array.isArray(assignees) ? assignees : [assignees]) {
            if (typeof value === 'string' && value.trim()) names.add(value.trim());
        }
    }
    return {
        version: 1, id: `project_${stableLocalId(`${data.meta?.createdAt}|${name}`)}`,
        name, state: 'planned', description: '', manager: '', product: '', tags: [],
        team: [...names].map((name) => ({ id: `member_${stableLocalId(name)}`, name, role: '', active: true, email: '', provisional: true })),
        forecast: { start: '', end: '' }, baseline: { start: '', end: '' }, actual: { start: '', end: '' }, needsReview: true
    };
}

export function validateDatePair(dates: ProjectDates): void {
    for (const value of [dates.start, dates.end]) if (value && !parseRoadmapIsoDate(value)) throw new Error('Dates must use YYYY-MM-DD.');
    if (dates.start && dates.end && dates.end < dates.start) throw new Error('End date cannot precede start date.');
}

export function validateProjectInfo(info: ProjectInfo, complete = false): void {
    if (info.version !== 1 || !info.id || !info.name.trim() || !PROJECT_STATES.includes(info.state)) throw new Error('Invalid project identity or state.');
    for (const dates of [info.forecast, info.baseline, info.actual]) validateDatePair(dates);
    const ids = new Set<string>();
    for (const member of info.team) {
        if (!member.id || ids.has(member.id) || !member.name.trim()) throw new Error('Team members need unique IDs and names.');
        ids.add(member.id);
    }
    if (complete && (!info.description.trim() || !info.manager.trim() || !info.product.trim() || !info.team.length || !info.tags.length || !info.forecast.start || !info.forecast.end)) {
        throw new Error('Complete description, manager, product, team, tags and planned start/end dates.');
    }
}

// Versioned additive migration: legacy fields, task IDs and other extensions are retained.
export function migrateProjectMetadata(data: BoardData): BoardData {
    const project = getProjectInfo(data);
    validateProjectInfo(project);
    data.extensions.project = structuredClone(project);
    return data;
}
