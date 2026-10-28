import type { BoardData, LooseBoardData } from './types';
import { hasExactKeys } from './util';
import { getWorkflow } from './workflow';

export type BoardViewPreferences = { version: 1; hiddenStateIds: string[] };

/** Missing preferences are the backwards-compatible default: every state is visible. */
export function parseBoardView(value: unknown, stateIds?: ReadonlySet<string>): BoardViewPreferences | undefined {
    if (value === undefined) return undefined;
    if (!hasExactKeys(value, ['version', 'hiddenStateIds']) || value.version !== 1 || !Array.isArray(value.hiddenStateIds)
        || value.hiddenStateIds.some((id) => typeof id !== 'string' || !id.trim() || (stateIds && !stateIds.has(id)))
        || new Set(value.hiddenStateIds).size !== value.hiddenStateIds.length) throw new Error('Invalid extensions.boardView: expected version 1 and unique existing hidden state IDs.');
    return { version: 1, hiddenStateIds: [...value.hiddenStateIds] };
}

export function hiddenBoardStates(data?: LooseBoardData | null): ReadonlySet<string> {
    return new Set(parseBoardView(data?.extensions?.boardView)?.hiddenStateIds || []);
}

export function setBoardColumnVisibility(data: BoardData, stateId: string, visible: boolean): boolean {
    if (!getWorkflow(data).states.some((state) => state.id === stateId)) throw new Error('The workflow state no longer exists.');
    const hidden = new Set(hiddenBoardStates(data));
    if (hidden.has(stateId) === !visible) return false;
    if (visible) hidden.delete(stateId); else hidden.add(stateId);
    data.extensions.boardView = { version: 1, hiddenStateIds: [...hidden] };
    return true;
}
