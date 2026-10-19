import type { BoardData } from '@/domain/types';
import { formatRoadmapDateRange, getRoadmapExtension, getSprintCalendarStatus } from '@/domain/roadmap';
import { getSprintCatalog } from '@/domain/sprintCatalog';
import type { SelectOption } from '@/features/portfolio/types';
import type { Language } from '@/shared/types/ui';
import { translate } from '@/shared/i18n';

export function buildAssignableSprintOptions(board: BoardData, today: string, language: Language): SelectOption[] {
    const identities = new Map(getSprintCatalog(board).entries.map((entry) => [entry.sprintId, entry.number]));
    return (getRoadmapExtension(board)?.sprints || [])
        .filter((sprint) => getSprintCalendarStatus(sprint, today) !== 'done')
        .map((sprint) => ({
            value: sprint.id,
            label: `${translate(language, 'table.sprintIdentity', { number: identities.get(sprint.id)!, name: sprint.title })} • ${formatRoadmapDateRange(sprint, language)}`
        }));
}
