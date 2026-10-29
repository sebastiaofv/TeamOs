import type { BoardData, LooseBoardData, WorkflowKind } from './types';
import { hasExactKeys } from './util';
import { getWorkflow } from './workflow';

export type BoardViewPreferences = { version: 1; hiddenStateIds: string[]; functionalHiddenStateIds?: string[] };

/** Explicit visibility choices survive workflow changes and file round trips. */
export function parseBoardView(value: unknown, stateIds?: ReadonlySet<string>, functionalStateIds?: ReadonlySet<string>): BoardViewPreferences | undefined {
    if (value === undefined) return undefined;
    if ((!hasExactKeys(value, ['version', 'hiddenStateIds']) && !hasExactKeys(value, ['version', 'hiddenStateIds', 'functionalHiddenStateIds'])) || value.version !== 1) throw new Error('Invalid extensions.boardView.');
    const parseIds = (ids: unknown, known?: ReadonlySet<string>): string[] => {
        if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !id.trim() || (known && !known.has(id))) || new Set(ids).size !== ids.length) throw new Error('Invalid extensions.boardView: expected unique existing hidden state IDs.');
        return [...ids];
    };
    const functional = 'functionalHiddenStateIds' in value ? value.functionalHiddenStateIds : undefined;
    return { version: 1, hiddenStateIds: parseIds(value.hiddenStateIds, stateIds), ...(functional === undefined ? {} : { functionalHiddenStateIds: parseIds(functional, functionalStateIds) }) };
}

export function hiddenBoardStates(data?: LooseBoardData | null, kind: WorkflowKind = 'technical'): ReadonlySet<string> {
    const preferences = parseBoardView(data?.extensions?.boardView);
    const stored = kind === 'functional' ? preferences?.functionalHiddenStateIds : preferences?.hiddenStateIds;
    return new Set(stored ?? getWorkflow(data, kind).states.filter((state) => state.category === 'cancelled').map((state) => state.id));
}

export function setBoardColumnVisibility(data: BoardData, stateId: string, visible: boolean, kind: WorkflowKind = 'technical'): boolean {
    if (!getWorkflow(data, kind).states.some((state) => state.id === stateId)) throw new Error('The workflow state no longer exists.');
    const hidden = new Set(hiddenBoardStates(data, kind));
    if (hidden.has(stateId) === !visible) return false;
    if (visible) hidden.delete(stateId); else hidden.add(stateId);
    data.extensions.boardView = { version: 1, hiddenStateIds: [...hiddenBoardStates(data, 'technical')], functionalHiddenStateIds: [...hiddenBoardStates(data, 'functional')], ...data.extensions.boardView, [kind === 'functional' ? 'functionalHiddenStateIds' : 'hiddenStateIds']: [...hidden] };
    return true;
}
