import { dashboardActivityLayout, type DashboardActivityLayout } from '@/domain/dashboardActivityLayout';
import { appendTimelineEvent } from '@/domain/timeline';
import type { BoardMutationContext } from './mutationContext';

export function createDashboardActions({ runPortfolioBoardMutation }: BoardMutationContext) {
    return {
        saveDashboardActivityLayout(boardId: string, layout: DashboardActivityLayout) {
            return runPortfolioBoardMutation(boardId, (data) => {
                const before = dashboardActivityLayout(data.extensions.dashboardActivity);
                const after = dashboardActivityLayout(layout);
                if (JSON.stringify(before) === JSON.stringify(after)) return false;
                data.extensions.dashboardActivity = after;
                appendTimelineEvent(data, { kind: 'board.dashboard.activity.changed', entityType: 'board', entityId: 'board',
                    summary: 'Dashboard activity layout updated', changes: { dashboardActivity: { before, after } } });
                return true;
            });
        }
    };
}
