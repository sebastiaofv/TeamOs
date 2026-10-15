import type { Attachment } from '@/domain/types';
import { appendComment } from '@/domain/comments';
import { activeTeamMember, getProjectInfo } from '@/domain/project';
import { appendTimelineEvent } from '@/domain/timeline';
import type { BoardMutationContext } from './mutationContext';

export function createConversationActions(context: BoardMutationContext) {
    function addWorkitemComment(boardId: string, taskId: number, body: string, images: Attachment[]) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            const project = getProjectInfo(data);
            const member = activeTeamMember(project, context.getState().localProfiles[project.id]);
            const comment = appendComment(data, taskId, body, images, member ? { id: member.id, name: member.name, verified: false } : null);
            appendTimelineEvent(data, { kind: 'workitem.comment.added', entityType: 'task', entityId: String(taskId), summary: 'Comment added', at: comment.at, meta: { commentId: comment.id } });
            return true;
        });
    }
    return { addWorkitemComment };
}
