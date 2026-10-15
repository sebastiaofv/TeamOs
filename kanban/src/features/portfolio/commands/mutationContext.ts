import type { BoardData, Task } from '@/domain/types';
import type { BoardRecord, DialogName } from '@/features/portfolio/types';
import { useAppStore, type AppStore } from '@/features/portfolio/state/store';
import { cloneSerializable } from '@/domain/serialize';
import {
    captureTaskTimelineSnapshot,
    appendTimelineEvent,
    ensureBoardTimelineBaseline,
    getBoardTimelineData,
    recordTaskTimelineEvent,
} from '@/domain/timeline';
import { touchTask } from '@/domain/task';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { enqueueProjectSave, markProjectDirty } from '@/infrastructure/persistence/projectFiles';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { showAlert, showConfirm, type ConfirmOptions } from '@/app/overlays/appMessages';
import { translateCurrent } from '@/shared/i18n';
import { validateWorkitems } from '@/domain/workitems';
import { assertTaskTransition, synchronizeAggregateStatuses } from '@/domain/workflow';
import { validatePhaseHierarchy } from '@/domain/projectPlan';
import { reconcileAssignments } from '@/domain/assignments';
import { ensureTaskAuditEvents } from '@/domain/workitemHistory';
import { getProjectInfo } from '@/domain/project';
import { validateNewAttachments } from '@/domain/attachmentPolicy';

// A board mutator edits the cloned board data in place; returning false
// discards the draft.
export type BoardMutator = (data: BoardData, draft: BoardRecord) => boolean;
export type TaskMutator = (task: Task, draft: BoardRecord) => boolean;

export type BoardMutationOptions = {
    store?: AppStore;
    enqueueSave?: (boardRecord: BoardRecord | null) => Promise<unknown>;
    markDirty?: (boardId: string) => unknown;
    closeDialogFn?: (name?: DialogName) => void;
    openDialogFn?: typeof openDialog;
    alert?: (text: string, options?: { title?: string }) => unknown;
    confirm?: (text: string, options?: ConfirmOptions) => unknown;
    onBoardChanged?: (boardId: string) => void;
};

// `alert` and `confirm` return promises (see appMessages.ts); await `confirm`.
export function createBoardMutationContext({
    store = useAppStore,
    enqueueSave = enqueueProjectSave,
    markDirty = markProjectDirty,
    closeDialogFn = closeDialog,
    openDialogFn = openDialog,
    alert = showAlert,
    confirm = showConfirm,
    onBoardChanged = () => {}
}: BoardMutationOptions = {}) {
    const getState = store.getState;
    const commitState = store.setState;
    const getBoardRecord = (boardId: string): BoardRecord | null => getState().portfolioBoards.find((board) => board.id === boardId) || null;

    function findPortfolioTaskSource(boardId: string, taskId: unknown): { boardRecord: BoardRecord; taskIndex: number; task: Task } | null {
        const boardRecord = getBoardRecord(boardId);
        if (!boardRecord) return null;
        const taskIndex = boardRecord.data.board.tasks.findIndex((task) => Number(task.id) === Number(taskId));
        return taskIndex < 0 ? null : { boardRecord, taskIndex, task: boardRecord.data.board.tasks[taskIndex] };
    }

    function isPortfolioBoardMutable(boardId: string): boolean {
        return Boolean(getBoardRecord(boardId)?.handle);
    }

    function canUsePortfolioTaskMutations(boardId: string): boolean {
        return isPortfolioBoardMutable(boardId) && !isBoardInHistoricalPreview(getState(), boardId);
    }

    function notifyPortfolioMutationUnavailable(boardId: string): void {
        alert(isBoardInHistoricalPreview(getState(), boardId)
            ? translateCurrent('messages.readOnlyHistorical')
            : translateCurrent('messages.readOnlyProject'));
    }

    async function runPortfolioBoardMutation(
        boardId: string,
        mutator: BoardMutator,
        { allowHistorical = false, onMutated = () => {}, onCommitted = () => {} }: { allowHistorical?: boolean; onMutated?: () => void; onCommitted?: () => void } = {}
    ): Promise<boolean> {
        const current = getBoardRecord(boardId);
        if (!current) return false;
        if (!isPortfolioBoardMutable(boardId) || (!allowHistorical && !canUsePortfolioTaskMutations(boardId))) {
            notifyPortfolioMutationUnavailable(boardId);
            return false;
        }
        const draft: BoardRecord = { ...current, data: cloneSerializable(current.data) };
        try {
            ensureBoardTimelineBaseline(draft.data);
            const eventStart = getBoardTimelineData(draft.data)?.events.length || 0;
            if (mutator(draft.data, draft) === false) return false;
            const previousTasks = new Map(current.data.board.tasks.map((task) => [task.id, task]));
            for (const task of draft.data.board.tasks) validateNewAttachments(previousTasks.get(task.id)?.attachments || [], task.attachments || []);
            const beforeAssignment = new Map(draft.data.board.tasks.map((task) => [task.id, { ...task }]));
            reconcileAssignments(draft.data, current.data);
            for (const task of draft.data.board.tasks) {
                const before = beforeAssignment.get(task.id);
                if (before && (before.assigneeId !== task.assigneeId || JSON.stringify(before.assignees) !== JSON.stringify(task.assignees))) {
                    if (previousTasks.has(task.id)) recordTaskTimelineEvent(draft.data, before, task);
                    else {
                        const event = [...(getBoardTimelineData(draft.data)?.events || [])].reverse().find((event) => event.kind === 'task.created' && event.entityId === String(task.id));
                        if (event) event.snapshot = captureTaskTimelineSnapshot(draft.data, task.id) || undefined;
                    }
                }
            }
            validateWorkitems(draft.data, current.data);
            validatePhaseHierarchy(draft.data);
            if (JSON.stringify(current.data.extensions.workflow) === JSON.stringify(draft.data.extensions.workflow)) {
                for (const task of draft.data.board.tasks) {
                    const before = previousTasks.get(task.id);
                    if (before) assertTaskTransition(current.data, before, task.status);
                }
            }
            const beforeAggregate = new Map(draft.data.board.tasks.map((task) => [task.id, { ...task }]));
            synchronizeAggregateStatuses(draft.data);
            for (const task of draft.data.board.tasks) {
                const before = beforeAggregate.get(task.id);
                if (before && before.status !== task.status) {
                    touchTask(task);
                    recordTaskTimelineEvent(draft.data, before, task);
                }
            }
            for (const key of ['relations', 'pullRequests', 'projectPlan']) if (JSON.stringify(current.data.extensions[key]) !== JSON.stringify(draft.data.extensions[key])) {
                appendTimelineEvent(draft.data, { kind: 'board.extension.updated', entityType: 'board', entityId: key, summary: `Workitem ${key} updated`, changes: { [key]: { before: current.data.extensions[key], after: draft.data.extensions[key] } } });
            }
            ensureTaskAuditEvents(draft.data, current.data, eventStart);
            const project = getProjectInfo(draft.data);
            const profileId = getState().localProfiles[project.id];
            const actor = project.team.find((member) => member.id === profileId && member.active);
            if (actor) for (const event of getBoardTimelineData(draft.data)?.events.slice(eventStart) || []) event.meta = { ...event.meta, actor: { id: actor.id, name: actor.name, verified: false } };
        } catch (error) {
            alert(translateCurrent('messages.portfolioUpdateFailed', { error: (error as Error).message }));
            return false;
        }
        draft.title = draft.data.board.settings.title;
        const state = getState();
        const timeline = getBoardTimelineData(draft.data);
        const pinLatest = state.selectedPortfolioBoardId === boardId || state.portfolioTimelineSelection.boardId === boardId;
        commitState({
            portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId ? draft : board),
            ...(pinLatest ? { portfolioTimelineSelection: { boardId, eventIndex: (timeline?.events.length || 1) - 1 } } : {})
        });
        markDirty(boardId);
        onBoardChanged(boardId);
        onMutated();
        const saved = Boolean(await enqueueSave(getBoardRecord(boardId)));
        if (!saved) return false;
        onCommitted();
        return true;
    }

    function runPortfolioTaskMutation(
        boardId: string,
        taskId: unknown,
        mutator: TaskMutator,
        options: { allowHistorical?: boolean; onMutated?: () => void; onCommitted?: () => void } = {}
    ): Promise<boolean> | false {
        if (!findPortfolioTaskSource(boardId, taskId)) return false;
        return runPortfolioBoardMutation(boardId, (data, draft) => {
            const task = data.board.tasks.find((entry) => Number(entry.id) === Number(taskId)) as Task;
            const before = captureTaskTimelineSnapshot(data, taskId);
            if (mutator(task, draft) === false) return false;
            touchTask(task);
            recordTaskTimelineEvent(data, before, captureTaskTimelineSnapshot(data, taskId));
            return true;
        }, options);
    }
    return {
        getState, commitState, getBoardRecord, findPortfolioTaskSource,
        isPortfolioBoardMutable, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable,
        runPortfolioBoardMutation, runPortfolioTaskMutation,
        alert, confirm, closeDialogFn, openDialogFn
    };
}

export type BoardMutationContext = ReturnType<typeof createBoardMutationContext>;
