import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import type { BoardData } from '@/domain/types';
import { sprintPointSummary } from '@/domain/sprintResults';
import { useI18n } from '@/shared/i18n';


/** SP planned / capacity for every Sprint and, once Done, SP completed / planned (frozen at closure). */
export function SprintPoints({ data, sprintId }: { data: BoardData; sprintId: string }) {
    const { t } = useI18n();
    const { planned, capacity, completed } = sprintPointSummary(data, sprintId);
    const over = capacity !== null && planned > capacity;
    const short = completed !== null && completed < planned;
    const capacityLabel = capacity === null ? t('sprint.noCapacity') : String(capacity);
    return <span className="sprint-points">
        <span className="sprint-points-indicator" data-sprint-points="capacity" title={t('sprint.pointsCapacity', { planned, capacity: capacityLabel })} aria-label={t('sprint.pointsCapacity', { planned, capacity: capacityLabel })}>
            <WorkspaceIcon name="gauge" size={14} /><span><span className={over ? 'sprint-points-alert' : undefined}>{planned}</span>/{capacity ?? '—'}</span>
        </span>
        {completed !== null && <span className="sprint-points-indicator" data-sprint-points="completed" title={t('sprint.pointsCompleted', { completed, planned })} aria-label={t('sprint.pointsCompleted', { completed, planned })}>
            <WorkspaceIcon name="completed" size={14} /><span><span className={short ? 'sprint-points-alert' : undefined}>{completed}</span>/{planned}</span>
        </span>}
    </span>;
}
