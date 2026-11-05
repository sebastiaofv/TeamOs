// Isolate the entities involved in a failed merged validation. Repair candidates
// use each side's coherent values only for the coupled entities, retaining all
// independent fields from the otherwise merged document.
import type { BoardData } from './types';
import { validateBoardData } from './board';
import { cloneSerializable, areSerializableValuesEqual as equal } from './serializable';

type Unit = { path: string; read: (data: BoardData) => unknown; write: (data: BoardData, value: unknown) => void };
const valid = (data: BoardData) => { try { validateBoardData(data); return true; } catch { return false; } };

function units(data: BoardData, sides: BoardData[]): Unit[] {
    const result: Unit[] = [];
    const property = (parent: Unit, key: string): Unit => ({
        path: parent.path ? `${parent.path}.${key}` : key,
        read: (data) => (parent.read(data) as Record<string, unknown> | undefined)?.[key],
        write: (data, value) => {
            const object = parent.read(data) as Record<string, unknown>;
            if (value === undefined) delete object[key];
            else object[key] = cloneSerializable(value);
        }
    });
    const visit = (unit: Unit, values: unknown[]) => {
        if (unit.path === 'meta') return;
        if (values.every((value) => equal(value, values[0]))) return;
        if (values.every((value) => value && typeof value === 'object' && !Array.isArray(value))) {
            const objects = values as Record<string, unknown>[];
            for (const key of new Set(objects.flatMap(Object.keys))) {
                const child = property(unit, key);
                visit(child, values.map((value) => (value as Record<string, unknown>)[key]));
            }
            return;
        }
        // Collections of stable-ID entities are separate repair units. Lists
        // without identities (tags, workflow transitions) stay atomic fields.
        if (values.every(Array.isArray)) {
            const arrays = values as Record<string, unknown>[][];
            const id = (value: Record<string, unknown>) => value?.permanentId || value?.id;
            if (arrays.every((array) => array.every((item) => item && typeof item === 'object' && id(item)))) {
                for (const key of new Set(arrays.flatMap((array) => array.map(id)))) {
                    result.push({
                        path: `${unit.path}[${key}]`,
                        read: (data) => (unit.read(data) as Record<string, unknown>[]).find((item) => id(item) === key),
                        write: (data, value) => {
                            const array = unit.read(data) as Record<string, unknown>[];
                            const index = array.findIndex((item) => id(item) === key);
                            if (value === undefined) { if (index >= 0) array.splice(index, 1); }
                            else if (index >= 0) array[index] = cloneSerializable(value) as Record<string, unknown>;
                            else array.push(cloneSerializable(value) as Record<string, unknown>);
                        }
                    });
                }
                return;
            }
        }
        result.push(unit);
    };
    visit({ path: '', read: (data) => data, write: () => {} }, [data, ...sides]);
    return result;
}

export function projectIntegrityConflict(merged: BoardData, base: BoardData, local: BoardData, external: BoardData) {
    const candidates = units(merged, [base, local, external]);
    const required = new Set<Unit>();
    for (const side of [local, external]) {
        const repair = cloneSerializable(merged);
        const changed = candidates.filter((unit) => !equal(unit.read(merged), unit.read(side)));
        changed.forEach((unit) => unit.write(repair, unit.read(side)));
        // Greedily retain independent merged edits while keeping a valid repair.
        // If even a whole side is invalid, validation at save still refuses it.
        if (valid(repair)) {
            for (const unit of changed) {
                const previous = cloneSerializable(unit.read(repair));
                unit.write(repair, unit.read(merged));
                if (!valid(repair)) { unit.write(repair, previous); required.add(unit); }
            }
        } else changed.forEach((unit) => required.add(unit));
    }
    const affected = [...required];
    const projection = (data: BoardData) => affected.map((unit) => ({ path: unit.path, value: unit.read(data) }));
    return {
        path: affected.map((unit) => unit.path).join(' + '),
        base: projection(base), local: projection(local), external: projection(external),
        apply: (side: 'local' | 'external') => {
            const repaired = cloneSerializable(merged);
            affected.forEach((unit) => unit.write(repaired, unit.read(side === 'local' ? local : external)));
            return repaired;
        }
    };
}
