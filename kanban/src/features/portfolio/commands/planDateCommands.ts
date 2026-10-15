import { approvePlanBaseline, revisePhaseBaseline, setPhaseActualDates } from '@/domain/dateVariance';
import { appendTimelineEvent } from '@/domain/timeline';
import type { ProjectDates } from '@/domain/project';
import type { BoardMutationContext } from './mutationContext';

export function createPlanDateActions(context: BoardMutationContext) {
    function approveProjectBaseline(boardId: string, reason: string) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            approvePlanBaseline(data, reason);
            appendTimelineEvent(data, { kind: 'plan.baseline.approved', entityType: 'board', entityId: 'plan', summary: 'Plan baseline approved', meta: { reason } }); return true;
        });
    }
    function reviseProjectPhaseBaseline(boardId: string, phaseId: string, reason: string) {
        return context.runPortfolioBoardMutation(boardId, (data) => {
            revisePhaseBaseline(data, phaseId, reason);
            appendTimelineEvent(data, { kind: 'plan.baseline.revised', entityType: 'board', entityId: phaseId, summary: 'Phase baseline revised', meta: { reason } }); return true;
        });
    }
    function saveProjectPhaseActual(boardId: string, phaseId: string, dates: ProjectDates) {
        return context.runPortfolioBoardMutation(boardId, (data) => { setPhaseActualDates(data, phaseId, dates); return true; });
    }
    return { approveProjectBaseline, reviseProjectPhaseBaseline, saveProjectPhaseActual };
}
