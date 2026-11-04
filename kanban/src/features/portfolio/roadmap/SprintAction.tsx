import type { RoadmapItem } from '@/domain/types';
import { getSprintStatus } from '@/domain/roadmap';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function SprintAction({ sprint, boardId, disabled }: { sprint: RoadmapItem; boardId: string; disabled: boolean }) {
    const { changeSprintStatus } = usePortfolioActions();
    const { t } = useI18n();
    const status = getSprintStatus(sprint);
    if (status === 'done') return null;
    return <button className="btn sprint-lifecycle-action" type="button" disabled={disabled} onClick={(event) => {
        event.preventDefault(); event.stopPropagation();
        void changeSprintStatus(boardId, sprint.id, status === 'planned' ? 'active' : 'done');
    }}>{t(status === 'planned' ? 'sprint.start' : 'sprint.finish')}</button>;
}
