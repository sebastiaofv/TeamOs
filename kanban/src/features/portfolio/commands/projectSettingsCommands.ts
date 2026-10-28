import type { Workflow, WorkflowKind } from '@/domain/types';
import { applyWorkflow, getWorkflow, workflowKind } from '@/domain/workflow';
import type { BoardMutationContext } from './mutationContext';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { applyProjectSettings, ProjectDataError, type ProjectSettingsDraft } from '@/domain/projectData';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { appendTimelineEvent } from '@/domain/timeline';
import { translateCurrent } from '@/shared/i18n';
import { areSerializableValuesEqual, cloneSerializable } from '@/domain/serializable';

type WorkflowSettingsChange = { kind?: WorkflowKind; original: Workflow; workflow: Workflow; relocations: Record<string, string> };

export function createProjectSettingsActions(context: BoardMutationContext) {
    const { getState, getBoardRecord, openDialogFn, closeDialogFn, runPortfolioBoardMutation, confirm, canUsePortfolioTaskMutations, notifyPortfolioMutationUnavailable } = context;
    function openProjectSettings(boardId: string) {
        const board = getBoardRecord(boardId);
        if (!board) return;
        const view = getState().selectedPortfolioBoardId === boardId ? getSelectedPortfolioTimelineView(getState()) : null;
        openDialogFn('projectSettings', {
            boardId, data: cloneSerializable(view?.isPreview && view.projectedBoard ? view.projectedBoard : board.data),
            readOnly: !context.canUsePortfolioTaskMutations(boardId)
        });
    }
    async function saveProjectSettings(boardId: string, draft: ProjectSettingsDraft, original: unknown, workflowDraft?: WorkflowSettingsChange | WorkflowSettingsChange[]) {
        if (!canUsePortfolioTaskMutations(boardId)) { notifyPortfolioMutationUnavailable(boardId); return false; }
        const source = getBoardRecord(boardId)?.data;
        if (!source) return false;
        const changes = workflowDraft ? Array.isArray(workflowDraft) ? workflowDraft : [workflowDraft] : [];
        if (new Set(changes.map((change) => change.kind || 'technical')).size !== changes.length) throw new Error('Duplicate workflow changes.');
        const affected = source.board.tasks.filter((task) => changes.some((change) => workflowKind(task) === (change.kind || 'technical') && change.original.states.find((state) => state.id === task.status)?.category !== change.workflow.states.find((state) => state.id === task.status)?.category));
        if (affected.length && !(await confirm(translateCurrent('workflow.impact', { count: affected.length }), { title: translateCurrent('workflow.settings') }))) return false;
        return runPortfolioBoardMutation(boardId, (data) => {
            if (workflowDraft && getBoardRecord(boardId)?.data !== source) throw new ProjectDataError('stale');
            // Do not overwrite an external/local update that arrived while this draft was open.
            if (!areSerializableValuesEqual(original, { name: data.board.settings.title, project: data.extensions.project })) {
                throw new ProjectDataError('stale');
            }
            for (const change of changes) if (!areSerializableValuesEqual(change.original, getWorkflow(data, change.kind))) throw new ProjectDataError('stale');
            const projectChanged = !areSerializableValuesEqual(original, draft);
            applyProjectSettings(data, draft);
            if (projectChanged || !workflowDraft) appendTimelineEvent(data, {
                kind: 'board.project.updated', entityType: 'board', entityId: data.extensions.project!.id,
                summary: translateCurrent('project.updated'), snapshot: createBoardStateSnapshot(data)
            });
            for (const change of changes) {
                const beforeStatuses = Object.fromEntries(data.board.tasks.map((task) => [task.id, task.status]));
                applyWorkflow(data, change.workflow, change.relocations, change.kind);
                appendTimelineEvent(data, { kind: 'workflow.updated', entityType: 'board', entityId: 'board', summary: 'Workflow updated',
                    snapshot: createBoardStateSnapshot(data), meta: { workflowKind: change.kind || 'technical', beforeWorkflow: change.original, beforeStatuses } });
            }
            return true;
        }, { onMutated: () => closeDialogFn('projectSettings') });
    }
    return { openProjectSettings, saveProjectSettings };
}
