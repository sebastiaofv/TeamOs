import { normalizeAssignee } from './taskAssignments';

export const NO_PERSON_FILTER = '__none__';
const NAME_ESCAPE = 'name:';

/** Keep existing name filters/URLs readable, escaping names that collide with controls. */
export function personNameFilter(name: string): string {
    return name === NO_PERSON_FILTER || name.startsWith(NAME_ESCAPE) ? `${NAME_ESCAPE}${name}` : name;
}

export function personFilterName(value: string): string {
    return value.startsWith(NAME_ESCAPE) ? value.slice(NAME_ESCAPE.length) : value;
}

export function matchesPeopleFilter(people: readonly string[], filter: string): boolean {
    if (!filter) return true;
    if (filter === NO_PERSON_FILTER) return people.length === 0;
    const name = normalizeAssignee(personFilterName(filter)).toLowerCase();
    return people.some((person) => normalizeAssignee(person).toLowerCase() === name);
}
