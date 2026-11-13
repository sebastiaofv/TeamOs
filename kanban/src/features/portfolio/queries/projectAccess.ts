// What may be done to a loaded project right now, and why not.
//
// Every reason a project can be read-only is listed once here. The two
// policies below decide which reasons matter for ordinary workitem edits and
// which matter for cross-project transfers.

import type { ProjectSaveState } from '@/features/portfolio/types';
import { blocksProjectTransfers, isInConflict } from '@/infrastructure/persistence/projectSaveLifecycle';
import { getBoardRecord, type SelectorState } from './portfolioRowViews';
import { isBoardInHistoricalPreview } from './portfolioTimelineViews';

export type ProjectAccessBlocker =
    /** The project is not loaded. */
    | 'missing'
    /** Opened without a writable file or folder. */
    | 'noFile'
    /** The timeline is scrubbed back to an earlier event. */
    | 'history'
    /** A cross-project transfer is writing to this project. */
    | 'transferLocked'
    /** Local and external versions wait for the user's decision. */
    | 'conflict'
    /** The project file cannot be read. */
    | 'unreachable';

export type ProjectAccessState = SelectorState & { projectSaveStateById: Map<string, ProjectSaveState> };

export function projectAccessBlockers(state: ProjectAccessState, boardId: string, { transferLocked = false } = {}): ProjectAccessBlocker[] {
    const board = getBoardRecord(state, boardId);
    if (!board) return ['missing'];
    const save = state.projectSaveStateById.get(boardId);
    const blockers: ProjectAccessBlocker[] = [];
    if (!board.handle) blockers.push('noFile');
    if (isBoardInHistoricalPreview(state, boardId)) blockers.push('history');
    if (transferLocked) blockers.push('transferLocked');
    if (isInConflict(save)) blockers.push('conflict');
    else if (blocksProjectTransfers(save)) blockers.push('unreachable');
    return blockers;
}

// Workitem edits stay local and recoverable during a conflict or while the
// file is unreachable, so only these block them.
const EDIT_BLOCKERS: readonly ProjectAccessBlocker[] = ['missing', 'noFile', 'history', 'transferLocked'];
// A transfer writes two files and must start from known-current versions. It
// runs under its own transfer lock, so the lock is checked separately.
const TRANSFER_BLOCKERS: readonly ProjectAccessBlocker[] = ['missing', 'noFile', 'history', 'conflict', 'unreachable'];

export function canEditProjectWorkitems(blockers: readonly ProjectAccessBlocker[]): boolean {
    return !blockers.some((blocker) => EDIT_BLOCKERS.includes(blocker));
}

export function canTransferProjectFile(blockers: readonly ProjectAccessBlocker[]): boolean {
    return !blockers.some((blocker) => TRANSFER_BLOCKERS.includes(blocker));
}
