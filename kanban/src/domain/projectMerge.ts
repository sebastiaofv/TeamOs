import { projectIntegrityConflict } from './projectMergeIntegrity';
import type { BoardData } from './types';
import { validateBoardData } from './board';
import { renumberConcurrentWorkitems } from './projectMergeIdentity';
import { workitemTransitionViolations, WorkitemError } from './workitems';
import { cloneSerializable, areSerializableValuesEqual as equal } from './serializable';

export type MergeChoice = 'local' | 'external';
export type ProjectConflict = {
    key: string;
    path: string;
    base: unknown;
    local: unknown;
    external: unknown;
    reason: 'field' | 'delete-edit' | 'regression' | 'integrity';
    message?: string;
};
export type ProjectMerge = { merged: BoardData; conflicts: ProjectConflict[]; changes: string[] };
export type MergeDecisions = Record<string, MergeChoice>;

type ObjectValue = Record<string, unknown>;
function object(value: unknown): value is ObjectValue {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function identity(value: unknown, path: string): string | undefined {
    if (!object(value)) return undefined;
    if (path === 'board.tasks') return String(value.permanentId || `legacy:${value.id}:${value.createdAt}`);
    if (value.id !== undefined) return String(value.id);
    if (value.sprintId !== undefined && object(value.task)) return `${value.sprintId}:${value.task.permanentId || value.task.id}:${value.at}`;
    if (value.sprintId !== undefined) return `${value.sprintId}:${value.at || ''}`;
    if (object(value.source) && object(value.target)) return `${value.source.permanentId}:${value.target.permanentId}:${value.kind}`;
    if (value.sourceId !== undefined && value.targetId !== undefined) {
        const ids = [value.sourceId, value.targetId];
        if (value.kind === 'related') ids.sort((a, b) => Number(a) - Number(b));
        return `${ids[0]}:${ids[1]}:${value.kind}`;
    }
    if (value.status !== undefined && path === 'board.columns') return String(value.status);
    return undefined;
}

/** Related pairs are undirected; compare them in ascending order. */
function canonicalRelations(data: BoardData): BoardData {
    const relations = data.extensions.taskRelations?.relations;
    if (!relations?.some((relation) => relation.kind === 'related' && relation.sourceId > relation.targetId)) return data;
    return { ...data, extensions: { ...data.extensions, taskRelations: { version: 1, relations: relations.map((relation) => relation.kind === 'related' && relation.sourceId > relation.targetId
        ? { ...relation, sourceId: relation.targetId, targetId: relation.sourceId } : relation) } } };
}

/** All inputs are normalized versions of the same project, retaining permanent IDs.
 * Decisions are keyed by the three values as well as the entity/field: a decision
 * survives a new disk version only while the conflicting values still match.
 */
export function mergeProject(baseInput: BoardData, localInput: BoardData, externalInput: BoardData, options: { decisions?: MergeDecisions; regression?: boolean } = {}): ProjectMerge {
    const base = canonicalRelations(baseInput);
    const local = canonicalRelations(localInput);
    const external = renumberConcurrentWorkitems(base, local, canonicalRelations(externalInput));
    // A merge may keep what either side already did, but must not create a new violation.
    // Identity changes are never kept: no writer may change a workitem's type or number.
    const inherited = new Set([...workitemTransitionViolations(local, base), ...workitemTransitionViolations(external, base)]
        .filter((violation) => !violation.startsWith('immutable:')));
    const check = (data: BoardData) => {
        validateBoardData(data);
        const created = workitemTransitionViolations(data, base).find((violation) => !inherited.has(violation));
        if (created) throw new WorkitemError(created.split(':')[0] as WorkitemError['code']);
    };
    const conflicts: ProjectConflict[] = [];
    let conflictCount = 0;
    const changes: string[] = [];
    const conflict = (path: string, b: unknown, l: unknown, e: unknown, reason: ProjectConflict['reason'], message?: string) => {
        conflictCount += 1;
        const key = JSON.stringify([path, b, l, e, reason]);
        const choice = options.decisions?.[key];
        if (!choice) conflicts.push({ key, path, base: cloneSerializable(b), local: cloneSerializable(l), external: cloneSerializable(e), reason, message });
        return cloneSerializable(choice === 'external' ? e : l);
    };
    const merge = (b: unknown, l: unknown, e: unknown, path: string): unknown => {
        // Timestamps and revision counters are derived, never user conflicts.
        if (path === 'meta.revision') return Math.max(Number(l) || 0, Number(e) || 0);
        if (path.endsWith('.updatedAt')) return [l, e].filter((v): v is string => typeof v === 'string').sort().at(-1);
        if (path === 'extensions.taskIdentity.highWaterMark' || path === 'extensions.sprintCatalog.lastNumber' || path === 'extensions.projectControl.lastNumber') return Math.max(Number(l) || 0, Number(e) || 0);
        if (equal(l, e)) return cloneSerializable(l);
        const externalChanged = !equal(b, e);

        if (Array.isArray(l) && Array.isArray(e) && (b === undefined || Array.isArray(b))) {
            const arrays = [Array.isArray(b) ? b : [], l, e];
            const keys = arrays.map((values) => values.map((value) => identity(value, path)));
            if (keys.every((ids) => ids.every((id) => id !== undefined) && new Set(ids).size === ids.length)) {
                const maps = arrays.map((values, index) => new Map(values.map((value, i) => [keys[index][i]!, value])));
                const appendOnly = !options.regression && /\.(events|comments|history|entries|sprintHistory)$/.test(path) && !path.endsWith('sprintCatalog.entries');
                const result: unknown[] = [];
                for (const id of new Set([...maps[1].keys(), ...maps[2].keys()])) {
                    const original = maps[0].get(id);
                    const mine = maps[1].get(id);
                    const theirs = maps[2].get(id);
                    const value = appendOnly && (mine === undefined || theirs === undefined)
                        ? cloneSerializable(mine ?? theirs)
                        : merge(original, mine, theirs, `${path}[${id}]`);
                    if (value !== undefined) result.push(value);
                }
                return result;
            }
        }
        if (object(l) && object(e) && (b === undefined || object(b))) {
            const original = object(b) ? b : {};
            const result: ObjectValue = {};
            for (const key of new Set([...Object.keys(original), ...Object.keys(l), ...Object.keys(e)])) {
                const value = merge(original[key], l[key], e[key], path ? `${path}.${key}` : key);
                if (value !== undefined) result[key] = value;
            }
            return result;
        }
        if (!options.regression) {
            if (equal(b, l)) return cloneSerializable(e);
            if (!externalChanged) return cloneSerializable(l);
        }
        return conflict(path, b, l, e, options.regression ? 'regression' : l === undefined || e === undefined ? 'delete-edit' : 'field');
    };
    const describe = (b: unknown, e: unknown, path: string) => {
        if (equal(b, e) || path === 'meta' || path.endsWith('.updatedAt')) return;
        if (Array.isArray(b) && Array.isArray(e) && [...b, ...e].every((value) => identity(value, path) !== undefined)) {
            const before = new Map(b.map((value) => [identity(value, path), value]));
            const after = new Map(e.map((value) => [identity(value, path), value]));
            for (const id of new Set([...before.keys(), ...after.keys()])) describe(before.get(id), after.get(id), `${path}[${id}]`);
        } else if (object(b) && object(e)) {
            for (const key of new Set([...Object.keys(b), ...Object.keys(e)])) describe(b[key], e[key], path ? `${path}.${key}` : key);
        } else changes.push(path);
    };
    describe(base, external, '');
    let merged = merge(base, local, external, '') as BoardData;
    if (options.regression && conflictCount === 0) {
        // Even a formatting-only replacement at an equal/older revision needs
        // acknowledgement; raw-text hashes, rather than normalized values,
        // triggered this reconciliation.
        conflict('meta.revision', base.meta.revision || 0, local.meta.revision || 0, external.meta.revision || 0, 'regression');
    }
    try {
        check(merged);
    } catch (error) {
        const group = projectIntegrityConflict(merged, base, local, external, check);
        const key = JSON.stringify([group.path, group.base, group.local, group.external, 'integrity']);
        const choice = options.decisions?.[key];
        if (choice) {
            const repaired = group.apply(choice);
            try { check(repaired); merged = repaired; }
            catch { conflicts.push({ key, path: group.path, base: group.base, local: group.local, external: group.external,
                reason: 'integrity', message: error instanceof Error ? error.message : String(error) }); }
        } else conflicts.push({ key, path: group.path, base: group.base, local: group.local, external: group.external,
            reason: 'integrity', message: error instanceof Error ? error.message : String(error) });
    }
    return { merged, conflicts, changes: [...new Set(changes)] };
}
