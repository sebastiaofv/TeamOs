import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import type { RoadmapItem } from '@/domain/types';
import { getSprintStatus } from '@/domain/roadmap';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function SprintAction({ sprint, boardId, disabled, compact = false }: { sprint: RoadmapItem; boardId: string; disabled: boolean; compact?: boolean }) {
    const { changeSprintStatus } = usePortfolioActions();
    const { t } = useI18n();
    const status = getSprintStatus(sprint);
    if (status === 'done') return null;
    const label = t(status === 'planned' ? 'sprint.start' : 'sprint.finish');
    return <button aria-label={label} title={label} className={`btn sprint-lifecycle-action${compact ? ' icon-btn' : ''}`} type="button" disabled={disabled} onClick={(event) => {
        event.preventDefault(); event.stopPropagation();
        void changeSprintStatus(boardId, sprint.id, status === 'planned' ? 'active' : 'done');
    }}>{compact ? <WorkspaceIcon name={status === 'planned' ? 'play' : 'finish'} /> : label}</button>;
}
