import type { ProjectInfo } from '@/domain/project';
import { getProjectInfo, validateProjectInfo } from '@/domain/project';
import { appendTimelineEvent } from '@/domain/timeline';
import { createBoardStateSnapshot } from '@/domain/serialize';
import type { BoardMutationContext } from './mutationContext';
import { applyWorkflow, type Workflow } from '@/domain/workflow';

export function createProjectSettingsActions(context: BoardMutationContext) {
    async function saveProjectSettings(boardId: string, info: ProjectInfo) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            validateProjectInfo(info, true);
            if (info.id !== getProjectInfo(data).id) throw new Error('Project identity cannot change.');
            data.extensions.project = { ...info, needsReview: false };
            data.board.settings.title = info.name.trim();
            appendTimelineEvent(data, { kind: 'board.restored', entityType: 'board', entityId: info.id,
                summary: 'Project settings updated', snapshot: createBoardStateSnapshot(data) });
            return true;
        });
    }
    function saveProjectWorkflow(boardId: string, workflow: Workflow, mapping: Record<string, string>) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            applyWorkflow(data, workflow, mapping);
            appendTimelineEvent(data, { kind: 'board.restored', entityType: 'board', entityId: getProjectInfo(data).id,
                summary: 'Project workflow updated', snapshot: createBoardStateSnapshot(data) });
            return true;
        });
    }
    return { saveProjectSettings, saveProjectWorkflow };
}
