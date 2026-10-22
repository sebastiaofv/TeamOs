import type { BoardMutationContext } from './mutationContext';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { applyProjectSettings, ProjectDataError, type ProjectSettingsDraft } from '@/domain/projectData';
import { createBoardStateSnapshot } from '@/domain/serialize';
import { appendTimelineEvent } from '@/domain/timeline';
import { translateCurrent } from '@/shared/i18n';
import { areSerializableValuesEqual, cloneSerializable } from '@/domain/serializable';

export function createProjectSettingsActions(context: BoardMutationContext) {
    const { getState, getBoardRecord, openDialogFn, closeDialogFn, runPortfolioBoardMutation } = context;
    function openProjectSettings(boardId: string) {
        const board = getBoardRecord(boardId);
        if (!board) return;
        const view = getState().selectedPortfolioBoardId === boardId ? getSelectedPortfolioTimelineView(getState()) : null;
        openDialogFn('projectSettings', {
            boardId, data: cloneSerializable(view?.isPreview && view.projectedBoard ? view.projectedBoard : board.data),
            readOnly: !context.canUsePortfolioTaskMutations(boardId)
        });
    }
    async function saveProjectSettings(boardId: string, draft: ProjectSettingsDraft, original: unknown) {
        return runPortfolioBoardMutation(boardId, (data) => {
            // Do not overwrite an external/local update that arrived while this draft was open.
            if (!areSerializableValuesEqual(original, { name: data.board.settings.title, project: data.extensions.project })) {
                throw new ProjectDataError('stale');
            }
            applyProjectSettings(data, draft);
            appendTimelineEvent(data, {
                kind: 'board.project.updated', entityType: 'board', entityId: data.extensions.project!.id,
                summary: translateCurrent('project.updated'), snapshot: createBoardStateSnapshot(data)
            });
            return true;
        }, { onMutated: () => closeDialogFn('projectSettings') });
    }
    return { openProjectSettings, saveProjectSettings };
}
