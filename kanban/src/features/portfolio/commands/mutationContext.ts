import { applyStoryAutomation, assertAcceptance, assertWorkitems, childrenOf, effectivePlanning, parentOf, syncWorkitemPlanning, workitemType, WorkitemError } from '@/domain/workitems';
import type { BoardData, Task } from '@/domain/types';
import type { BoardRecord, DialogName } from '@/features/portfolio/types';
import { useAppStore, type AppStore } from '@/features/portfolio/state/store';
import { cloneSerializable } from '@/domain/serialize';
import {
    appendTimelineEvent,
    captureTaskTimelineSnapshot,
    ensureBoardTimelineBaseline,
    getBoardTimelineData,
    recordTaskTimelineEvent,
    createTimelineEventId,
} from '@/domain/timeline';
import { annotateTimelineOperation } from '@/domain/taskHistory';
import { reserveTaskIdentities } from '@/domain/taskIdentity';
import { touchTask } from '@/domain/task';
import { canTransition, statusCategory, getWorkflow } from '@/domain/workflow';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { enqueueProjectSave, markProjectDirty } from '@/infrastructure/persistence/projectFiles';
import { closeDialog, openDialog } from '@/app/overlays/dialogs';
import { showAlert, showConfirm, showChoice, showPrompt, type ConfirmOptions } from '@/app/overlays/appMessages';
import { translateCurrent } from '@/shared/i18n';
import { ProjectDataError, syncProjectAssignments } from '@/domain/projectData';

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
    choose?: typeof showChoice;
    prompt?: typeof showPrompt;
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
    choose = showChoice,
    prompt = showPrompt,
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
            const firstEvent = draft.data.extensions.timeline?.events.length || 0;
            if (mutator(draft.data, draft) === false) return false;
            const stage = cloneSerializable(draft.data);
            syncWorkitemPlanning(draft.data, current.data);
            const effects = applyStoryAutomation(draft.data, current.data);
            assertWorkitems(draft.data, current.data);
            const previews: string[] = [];
            const beforeTasks = new Map(current.data.board.tasks.map((task) => [task.id, task]));
            const stageTasks = new Map(stage.board.tasks.map((task) => [task.id, task]));
            const sprintName = (data: BoardData, id: string) => data.extensions.roadmap?.sprints.find((sprint) => sprint.id === id)?.title || id || '—';
            const stateName = (data: BoardData, id: string) => getWorkflow(data).states.find((state) => state.id === id)?.name || id;
            for (const task of draft.data.board.tasks) {
                const before = beforeTasks.get(task.id);
                const category = statusCategory(task.status, draft.data);
                const changedStatus = !before || before.status !== task.status || statusCategory(before.status, current.data) !== category;
                const changedCriteria = before && workitemType(task) === 'story' && before.acceptanceCriteria !== task.acceptanceCriteria;
                if ((changedStatus || changedCriteria) && category === 'completed' && ['story', 'bug'].includes(workitemType(task))) {
                    assertAcceptance(draft.data, task);
                    const author = await prompt(translateCurrent('workitems.acceptQuestion', { id: task.id, title: task.title }) + (task.acceptanceCriteria ? `\n\n${task.acceptanceCriteria}` : task.expectedResult ? `\n\n${task.expectedResult}` : ''), '', { title: translateCurrent('workitems.acceptance'), confirmLabel: translateCurrent('workitems.accept'), required: true });
                    if (author === null) return false;
                    if (!author.trim()) throw new WorkitemError('author');
                    task.acceptance = { author: author.trim(), at: new Date().toISOString(), local: true };
                }
                if (changedStatus && category !== 'completed') delete task.acceptance;
                if (before && changedStatus && (category === 'cancelled' || ['completed', 'cancelled'].includes(statusCategory(before.status, current.data)))) previews.push(`#${task.id} ${task.title}\n${stateName(current.data, before.status)} → ${stateName(draft.data, task.status)}`);
                if (before && ((before.parentId ?? null) !== (task.parentId ?? null) || before.sprintId !== task.sprintId)) {
                    const name = (id: number | null | undefined, data: BoardData) => { const item = data.board.tasks.find((entry) => entry.id === id); return item ? `#${item.id} ${item.title}` : '—'; };
                    previews.push(`#${task.id} ${task.title}\n${translateCurrent('workitems.parent')}: ${name(before.parentId, current.data)} → ${name(task.parentId, draft.data)}\nSprint: ${sprintName(current.data, before.sprintId)} → ${sprintName(draft.data, task.sprintId)}`);
                }
                if (changedStatus && category === 'completed' && workitemType(task) === 'epic' && childrenOf(draft.data, task.id).some((child) => !['completed', 'cancelled'].includes(statusCategory(child.status, draft.data)))) previews.push(translateCurrent('workitems.epicPending', { id: task.id, title: task.title }));
                const parent = parentOf(draft.data, task);
                if (before && changedStatus && parent && workitemType(parent) === 'story' && statusCategory(parent.status, draft.data) === 'completed' && category !== 'completed') previews.push(translateCurrent('workitems.reopened', { id: task.id, parent: parent.id }));
                if (before) for (const field of ['phaseId', 'milestoneId'] as const) {
                    const oldValue = effectivePlanning(current.data, before, field); const newValue = effectivePlanning(draft.data, task, field);
                    if (oldValue !== newValue && before[field] === task[field] && (field === 'phaseId' ? before.phaseMode === task.phaseMode : before.milestoneMode === task.milestoneMode)) previews.push(`#${task.id} ${task.title} · ${translateCurrent(field === 'phaseId' ? 'task.phase' : 'task.milestone')}: ${oldValue || '—'} → ${newValue || '—'}`);
                }
                const rawStage = stageTasks.get(task.id);
                if (rawStage && JSON.stringify(rawStage) !== JSON.stringify(task)) {
                    const stageTask = captureTaskTimelineSnapshot(stage, task.id);
                    const count = draft.data.extensions.timeline?.events.length || 0;
                    recordTaskTimelineEvent(draft.data, stageTask, captureTaskTimelineSnapshot(draft.data, task.id));
                    const event = draft.data.extensions.timeline?.events.at(-1);
                    if (event && (draft.data.extensions.timeline?.events.length || 0) > count) {
                        const automatic = effects.find((effect) => !effect.blocked && effect.storyId === task.id);
                        event.meta = { ...event.meta, ...(automatic ? { automatic: true, causeTaskId: automatic.taskId, cause: `Task #${automatic.taskId}` } : {}), ...(task.acceptance && !before?.acceptance ? { author: task.acceptance.author } : {}) };
                    }
                }
            }
            for (const effect of effects) if (!effect.blocked) previews.push(translateCurrent('workitems.autoEffect', { id: effect.storyId, state: stateName(draft.data, draft.data.board.tasks.find((task) => task.id === effect.storyId)?.status || '') }));
            if (previews.length && !(await confirm(translateCurrent('workitems.impact') + '\n\n' + previews.join('\n\n'), { title: translateCurrent('workitems.confirmChanges'), confirmLabel: translateCurrent('messages.confirm') }))) return false;
            if (getBoardRecord(boardId)?.data !== current.data) throw new WorkitemError('stale');
            for (const effect of effects) if (effect.blocked) void alert(translateCurrent('workitems.autoBlocked', { id: effect.storyId }));
            syncWorkitemPlanning(draft.data, draft.data);
            if (JSON.stringify(stage.extensions.sprintParticipation) !== JSON.stringify(draft.data.extensions.sprintParticipation)) appendTimelineEvent(draft.data, { kind: 'sprint.participation.updated', entityType: 'board', entityId: 'board', summary: 'Sprint participation recorded', changes: { sprintParticipation: { before: stage.extensions.sprintParticipation ?? null, after: structuredClone(draft.data.extensions.sprintParticipation) } } });
            syncProjectAssignments(draft.data);
            annotateTimelineOperation(current.data, draft.data, firstEvent, createTimelineEventId());
            reserveTaskIdentities(draft.data, current.data);
        } catch (error) {
            alert(error instanceof WorkitemError ? translateCurrent(`workitems.error.${error.code}`) : error instanceof ProjectDataError ? translateCurrent(`project.error.${error.code}`)
                : translateCurrent('messages.portfolioUpdateFailed', { error: (error as Error).message }));
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
            syncProjectAssignments(data);
            if (before && task.status !== before.status && !canTransition(data, before.status, task.status)) throw new Error(translateCurrent('workflow.transitionDenied'));
            touchTask(task);
            recordTaskTimelineEvent(data, before, captureTaskTimelineSnapshot(data, taskId));
            return true;
        }, options);
    }
    return {
        getState, commitState, getBoardRecord, findPortfolioTaskSource,
        isPortfolioBoardMutable, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable,
        runPortfolioBoardMutation, runPortfolioTaskMutation,
        alert, confirm, choose, prompt, closeDialogFn, openDialogFn
    };
}

export type BoardMutationContext = ReturnType<typeof createBoardMutationContext>;
