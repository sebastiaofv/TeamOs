import type { BoardData } from '@/domain/types';
import { sprintPointSummary } from '@/domain/sprintResults';
import { useI18n } from '@/shared/i18n';

function GaugeIcon() {
    return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2.5 11.5a5.5 5.5 0 1 1 11 0" /><path d="m8 11.5 2.5-3.5" /></svg>;
}
function CheckIcon() {
    return <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="m5.5 8 1.8 1.8 3.2-3.6" /></svg>;
}

/** SP planned / capacity for every Sprint and, once Done, SP completed / planned (frozen at closure). */
export function SprintPoints({ data, sprintId }: { data: BoardData; sprintId: string }) {
    const { t } = useI18n();
    const { planned, capacity, completed } = sprintPointSummary(data, sprintId);
    const over = capacity !== null && planned > capacity;
    const short = completed !== null && completed < planned;
    const capacityLabel = capacity === null ? t('sprint.noCapacity') : String(capacity);
    return <span className="sprint-points">
        <span className="sprint-points-indicator" data-sprint-points="capacity" title={t('sprint.pointsCapacity', { planned, capacity: capacityLabel })} aria-label={t('sprint.pointsCapacity', { planned, capacity: capacityLabel })}>
            <GaugeIcon /><span><span className={over ? 'sprint-points-alert' : undefined}>{planned}</span>/{capacity ?? '—'}</span>
        </span>
        {completed !== null && <span className="sprint-points-indicator" data-sprint-points="completed" title={t('sprint.pointsCompleted', { completed, planned })} aria-label={t('sprint.pointsCompleted', { completed, planned })}>
            <CheckIcon /><span><span className={short ? 'sprint-points-alert' : undefined}>{completed}</span>/{planned}</span>
        </span>}
    </span>;
}
