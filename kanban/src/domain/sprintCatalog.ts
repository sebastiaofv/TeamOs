import type { BoardData, RoadmapItem, SprintCatalog, SprintIdentity } from '@/domain/types';
import { hasExactKeys, isRecord, normalizeTimestamp } from '@/domain/util';

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

/** Old deleted sprints may exist only in snapshots or sprint-bearing events.
 * First appearance in stored history is deterministic; current-only items follow
 * their existing array order. Neither a planned date nor an event time is invented
 * as a creation timestamp.
 */
function legacySprintIds(sprints: readonly RoadmapItem[], timeline: unknown): string[] {
    const ids = new Set<string>();
    const remember = (id: unknown) => { if (typeof id === 'string' && id.trim()) ids.add(id.trim()); };
    if (isRecord(timeline) && Array.isArray(timeline.events)) {
        for (const event of timeline.events) {
            if (!isRecord(event)) continue;
            const snapshot = event.snapshot;
            const extensions = isRecord(snapshot) && isRecord(snapshot.extensions) ? snapshot.extensions : undefined;
            const roadmap = extensions?.roadmap;
            if (isRecord(roadmap) && Array.isArray(roadmap.sprints)) {
                roadmap.sprints.forEach((sprint: unknown) => { if (isRecord(sprint)) remember(sprint.id); });
            }
            const meta = event.meta;
            if (isRecord(meta) && (meta.roadmapKind === 'sprints' || event.kind === 'roadmap.bulk-assigned')) {
                if (isRecord(meta.sprint)) remember(meta.sprint.id);
                remember(meta.roadmapItemId);
            }
        }
    }
    sprints.forEach((sprint) => remember(sprint.id));
    return [...ids];
}

/** Reconcile the full known project history before any new number is allocated. */
export function normalizeSprintCatalog(value: unknown, sprints: readonly RoadmapItem[], timeline?: unknown): SprintCatalog | undefined {
    const catalog = parseSprintCatalog(value) || { version: 1 as const, lastNumber: 0, entries: [] };
    const ids = new Set(catalog.entries.map((entry) => entry.sprintId));
    for (const sprintId of legacySprintIds(sprints, timeline)) {
        if (ids.has(sprintId)) continue;
        if (catalog.lastNumber === Number.MAX_SAFE_INTEGER) throw new Error('Sprint sequence exhausted.');
        catalog.entries.push({ sprintId, number: ++catalog.lastNumber, createdAt: null });
        ids.add(sprintId);
    }
    return catalog.entries.length || value !== undefined ? catalog : undefined;
}

export function getSprintCatalog(data: BoardData): SprintCatalog {
    return normalizeSprintCatalog(data.extensions.sprintCatalog, data.extensions.roadmap?.sprints || [], data.extensions.timeline) || { version: 1, lastNumber: 0, entries: [] };
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
