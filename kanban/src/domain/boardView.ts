import type { BoardData, LooseBoardData, WorkflowKind } from './types';
import { hasExactKeys } from './util';
import { getWorkflow } from './workflow';

export type BoardViewPreferences = { version: 1; hiddenStateIds: string[]; functionalHiddenStateIds?: string[] };

/** Missing preferences are the backwards-compatible default: every state is visible. */
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
    return new Set((kind === 'functional' ? preferences?.functionalHiddenStateIds : preferences?.hiddenStateIds) || []);
}

export function setBoardColumnVisibility(data: BoardData, stateId: string, visible: boolean, kind: WorkflowKind = 'technical'): boolean {
    if (!getWorkflow(data, kind).states.some((state) => state.id === stateId)) throw new Error('The workflow state no longer exists.');
    const hidden = new Set(hiddenBoardStates(data, kind));
    if (hidden.has(stateId) === !visible) return false;
    if (visible) hidden.delete(stateId); else hidden.add(stateId);
    data.extensions.boardView = { version: 1, hiddenStateIds: [], ...data.extensions.boardView, [kind === 'functional' ? 'functionalHiddenStateIds' : 'hiddenStateIds']: [...hidden] };
    return true;
}
