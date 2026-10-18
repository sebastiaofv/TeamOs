import type { BoardData, RoadmapItem, SprintCatalog, SprintIdentity } from './types';
import { hasExactKeys, normalizeTimestamp } from './util';

/** Versioned, project-local identities; deleted entries remain reserved. */
export function parseSprintCatalog(value: unknown): SprintCatalog | undefined {
    if (value === undefined) return undefined;
    if (!hasExactKeys(value, ['version', 'lastNumber', 'entries']) || value.version !== 1
        || typeof value.lastNumber !== 'number' || !Number.isSafeInteger(value.lastNumber) || value.lastNumber < 0 || !Array.isArray(value.entries)) {
        throw new Error('Invalid extensions.sprintCatalog: expected version 1, lastNumber and entries.');
    }
    const ids = new Set<string>();
    const numbers = new Set<number>();
    const lastNumber = value.lastNumber;
    const entries: SprintIdentity[] = value.entries.map((entry: unknown) => {
        if (!hasExactKeys(entry, ['sprintId', 'number', 'createdAt']) || typeof entry.sprintId !== 'string' || !entry.sprintId.trim()
            || typeof entry.number !== 'number' || !Number.isSafeInteger(entry.number) || entry.number < 1 || entry.number > lastNumber
            || (entry.createdAt !== null && (typeof entry.createdAt !== 'string' || !normalizeTimestamp(entry.createdAt))) || ids.has(entry.sprintId) || numbers.has(entry.number)) {
            throw new Error('Invalid extensions.sprintCatalog: invalid or duplicate sprint identity.');
        }
        ids.add(entry.sprintId);
        numbers.add(entry.number);
        return { sprintId: entry.sprintId, number: entry.number, createdAt: entry.createdAt };
    });
    return { version: 1, lastNumber: value.lastNumber, entries };
}

/** Absent identities migrate using existing array order; missing dates stay unknown. */
export function normalizeSprintCatalog(value: unknown, sprints: readonly RoadmapItem[]): SprintCatalog | undefined {
    const catalog = parseSprintCatalog(value) || { version: 1 as const, lastNumber: 0, entries: [] };
    const ids = new Set(catalog.entries.map((entry) => entry.sprintId));
    for (const sprint of sprints) {
        if (ids.has(sprint.id)) continue;
        if (catalog.lastNumber === Number.MAX_SAFE_INTEGER) throw new Error('Sprint sequence exhausted.');
        catalog.entries.push({ sprintId: sprint.id, number: ++catalog.lastNumber, createdAt: null });
        ids.add(sprint.id);
    }
    return catalog.entries.length || value !== undefined ? catalog : undefined;
}

export function getSprintCatalog(data: BoardData): SprintCatalog {
    return normalizeSprintCatalog(data.extensions.sprintCatalog, data.extensions.roadmap?.sprints || []) || { version: 1, lastNumber: 0, entries: [] };
}

/** Allocate before inserting the new sprint, so legacy migration cannot consume its number. */
export function registerSprintCreation(data: BoardData, sprintId: string, createdAt: string): SprintIdentity {
    const catalog = getSprintCatalog(data);
    if (catalog.entries.some((entry) => entry.sprintId === sprintId)) throw new Error('Sprint identity is already reserved.');
    if (catalog.lastNumber === Number.MAX_SAFE_INTEGER || !normalizeTimestamp(createdAt)) throw new Error('Invalid sprint creation metadata.');
    const identity = { sprintId, number: ++catalog.lastNumber, createdAt };
    catalog.entries.push(identity);
    data.extensions.sprintCatalog = catalog;
    return identity;
}
