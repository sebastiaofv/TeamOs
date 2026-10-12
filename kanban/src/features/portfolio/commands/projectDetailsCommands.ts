import type { ProjectDetailsViewModel } from '@/features/portfolio/types';
import type { TimelineChanges } from '@/domain/types';
import type { BoardMutationContext } from './mutationContext';
import {
    getProjectBaseData,
    normalizeProjectBaseData,
    projectBaseDataEqual,
    setProjectBaseData,
    type ProjectBaseData
} from '@/domain/projectDetails';
import { appendTimelineEvent } from '@/domain/timeline';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { translateTimeline } from '@/shared/i18n';

export type ProjectDetailsSaveResult = 'saved' | 'unchanged' | 'invalid-name' | 'conflict' | 'unavailable' | 'failed';

export function createProjectDetailsActions({ getState, getBoardRecord, canUsePortfolioTaskMutations,
    runPortfolioBoardMutation, openDialogFn, closeDialogFn }: BoardMutationContext) {
    function openProjectDetails(boardId: string): ProjectDetailsViewModel | undefined {
        const record = getBoardRecord(boardId);
        if (!record) return;
        // Query this board explicitly, without changing the selected project.
        const view = getSelectedPortfolioTimelineView({ ...getState(), selectedPortfolioBoardId: boardId });
        const historical = view?.isPreview === true;
        const data = historical ? view?.projectedBoard : record.data;
        if (!data) return;
        const initial = getProjectBaseData(data);
        const vm: ProjectDetailsViewModel = {
            boardId,
            initial: { ...initial, team: [...initial.team] },
            readOnly: !record.handle || historical,
            historical
        };
        openDialogFn('projectDetails', vm);
        return vm;
    }

    function closeProjectDetails() {
        closeDialogFn('projectDetails');
    }

    async function saveProjectDetails(vm: ProjectDetailsViewModel, input: ProjectBaseData): Promise<ProjectDetailsSaveResult> {
        const current = getBoardRecord(vm.boardId);
        if (vm.readOnly || !current || !canUsePortfolioTaskMutations(vm.boardId)) return 'unavailable';
        // Title validation precedes normalization, which may reject empty names.
        if (!input.title.trim()) return 'invalid-name';
        const next = normalizeProjectBaseData(input);
        const before = getProjectBaseData(current.data);
        if (!projectBaseDataEqual(vm.initial, before)) return 'conflict';
        // Stay outside the mutation seam: even a baseline must not be created.
        if (projectBaseDataEqual(before, next)) {
            closeProjectDetails();
            return 'unchanged';
        }

        const saved = await runPortfolioBoardMutation(vm.boardId, (data) => {
            // The mutation infrastructure clones the latest record, preserving
            // concurrent changes to tasks, planning and unrelated extensions.
            const latest = getProjectBaseData(data);
            if (!projectBaseDataEqual(vm.initial, latest)) return false;
            const changes: TimelineChanges = {};
            for (const field of ['title', 'description', 'team'] as const) {
                if (JSON.stringify(latest[field]) !== JSON.stringify(next[field])) {
                    changes[field] = { before: latest[field], after: next[field] };
                }
            }
            setProjectBaseData(data, next);
            appendTimelineEvent(data, {
                kind: 'project.details.updated',
                entityType: 'board',
                entityId: 'board',
                summary: translateTimeline('timeline.projectDetailsUpdated', { title: next.title }),
                changes
            });
            return true;
        }, { onMutated: closeProjectDetails });
        return saved ? 'saved' : 'failed';
    }

    return { openProjectDetails, closeProjectDetails, saveProjectDetails };
}
