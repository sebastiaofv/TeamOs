import { describe, expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '@/domain/board';
import { normalizeTask } from '@/domain/task';
import type { ProjectStatus } from '@/domain/types';
import type { BoardRecord } from '@/features/portfolio/types';
import { createAppStore, useAppStore } from '@/features/portfolio/state/store';
import { buildPortfolioRoadmapView } from '@/features/portfolio/queries/portfolioRoadmapViews';
import { createPortfolioControlActions } from '@/features/portfolio/commands/portfolioControls';
import { setAllRoadmapProjectsExpanded, navigateToRoadmapItem } from '@/features/portfolio/commands/roadmapNavigation';
import { updatePortfolioUrlState } from '@/features/portfolio/commands/portfolioNavigation';

function project(id: string, status: ProjectStatus | null = 'active', start = '2026-02-01') {
    const data = createEmptyProjectData(id, id.slice(0, 3).toUpperCase());
    data.extensions.project!.status = status;
    data.extensions.roadmap = { version: 5, phases: [
        { id: 'parent', title: 'Delivery', startDate: start, endDate: '2026-06-01' },
        { id: 'done', title: 'Completed phase', parentId: 'parent', startDate: start, endDate: '2026-03-01' },
        { id: 'future', title: 'Next phase', parentId: 'parent', startDate: '2026-04-01', endDate: '2026-06-01' }
    ], milestones: [{ id: 'm', title: 'Milestone', dueDate: '2028-01-01' }], sprints: [{ id: 's', title: 'Sprint', startDate: '2025-01-01', endDate: '2025-02-01' }] };
    data.board.tasks = [
        normalizeTask({ id: 1, title: 'Done', phaseId: 'done', phaseMode: 'explicit', status: 'done', archived: true }),
        normalizeTask({ id: 2, title: 'Open', phaseId: 'future', phaseMode: 'explicit', status: 'backlog' }),
        normalizeTask({ id: 3, title: 'Unplanned', status: 'done' })
    ];
    return fromPartial<BoardRecord>({ id, title: id, fileName: `${id}.json`, data });
}

describe('ALL Roadmap', () => {
    it('excludes only paused, completed and archived projects, sorted by phase start, initially collapsed', () => {
        const boards = [project('later'), project('paused', 'paused'), project('early', 'active', '2026-01-01'), project('completed', 'completed'), project('planned', 'planned'), project('archived', 'archived'), project('legacy', null)];
        const before = structuredClone(boards);
        const view = buildPortfolioRoadmapView({ portfolioBoards: boards })!;
        expect(view.projects!.map(({ view }) => view.boardId)).toEqual(['early', 'later', 'legacy', 'planned']);
        expect(view.projects!.every(({ expanded }) => !expanded)).toBe(true);
        expect(view.projects!.every(({ view }) => view.phaseRows.length === 1 && view.phaseRows[0].treeCollapsed)).toBe(true);
        expect(new Set(view.projects!.map(({ item }) => item.color)).size).toBe(4);
        const earlyColour = view.projects![0].item.color;
        const shifted = structuredClone(boards);
        for (const phase of shifted[2].data.extensions.roadmap!.phases) { phase.startDate = '2026-05-01'; phase.endDate = '2026-06-01'; }
        const reordered = buildPortfolioRoadmapView({ portfolioBoards: shifted })!;
        expect(reordered.projects!.at(-1)!.view.boardId).toBe('early');
        expect(reordered.projects!.at(-1)!.item.color).toBe(earlyColour);
        expect(view.range.start.toISOString().slice(0, 10)).toBe('2026-01-01');
        expect(view.range.end.toISOString().slice(0, 10)).toBe('2026-06-01');
        expect(view.projects![0].item).toMatchObject({ startDate: '2026-01-01', endDate: '2026-06-01' });
        expect(view.projects![0].progress.percent).toBeCloseTo(200 / 3);
        expect(view.sprintRows).toEqual([]); expect(view.milestones).toEqual([]);
        expect(boards).toEqual(before);
    });

    it('keeps project, subphase and workitem expansion independent with project-specific workitem context', () => {
        const boards = [project('alpha'), project('beta')];
        const view = buildPortfolioRoadmapView({ portfolioBoards: boards, portfolioRoadmapExpandedRowsByBoardId: {
            alpha: { project: true, 'tree:parent': false, 'phase:done': true }, beta: { 'tree:parent': true }
        } })!;
        const [alpha, beta] = view.projects!;
        expect(alpha.expanded).toBe(true); expect(beta.expanded).toBe(false);
        expect(alpha.view.phaseRows.map(({ item }) => item!.id)).toEqual(['parent', 'done', 'future']);
        expect(beta.view.phaseRows.map(({ item }) => item!.id)).toEqual(['parent']);
        expect(alpha.view.phaseRows[1]).toMatchObject({ expanded: true, progress: { percent: 100 }, rows: [{ boardId: 'alpha', taskId: 1 }] });
        const individual = buildPortfolioRoadmapView({ portfolioBoards: boards, selectedPortfolioBoardId: 'alpha' })!;
        expect(individual.projects).toBeUndefined();
        expect(individual.milestones).toHaveLength(1); expect(individual.sprintRows).toHaveLength(1);
        expect(individual.range.start.getUTCFullYear()).toBe(2025); expect(individual.range.end.getUTCFullYear()).toBe(2028);
    });

    it('handles active projects without phases and portfolios with no active projects', () => {
        const board = project('empty'); board.data.extensions.roadmap = undefined; board.data.board.tasks = [];
        const view = buildPortfolioRoadmapView({ portfolioBoards: [board] })!;
        expect(view.projects).toHaveLength(1); expect(view.projects![0].progress.percent).toBeNull();
        expect(view.projects![0].item.startDate).toBeUndefined(); expect(view.projects![0].view.phaseRows).toEqual([]);
        expect(buildPortfolioRoadmapView({ portfolioBoards: [project('paused', 'paused')] })!.projects).toEqual([]);
    });

    it('expands and collapses the selected project independently and applies ALL controls to planned projects', () => {
        const previous = useAppStore.getState();
        const boards = [project('planned', 'planned'), project('paused', 'paused')];
        try {
            useAppStore.setState({ portfolioBoards: boards, portfolioRoadmapExpandedRowsByBoardId: {} });
            setAllRoadmapProjectsExpanded(true);
            expect(useAppStore.getState().portfolioRoadmapExpandedRowsByBoardId).toEqual({ planned: {
                project: true, 'tree:parent': false, 'tree:done': false, 'tree:future': false
            } });
            setAllRoadmapProjectsExpanded(true, 'paused');
            expect(buildPortfolioRoadmapView({ ...useAppStore.getState(), selectedPortfolioBoardId: 'paused' })!.phaseRows).toHaveLength(3);
            navigateToRoadmapItem('paused', 'phases', 'done', boards[1].data);
            setAllRoadmapProjectsExpanded(false, 'paused');
            const rows = useAppStore.getState().portfolioRoadmapExpandedRowsByBoardId;
            expect(rows.planned.project).toBe(true);
            expect(rows.planned['tree:parent']).toBe(false);
            expect(rows.paused['tree:parent']).toBe(true);
            expect(rows.paused['phase:done']).toBe(false);
            navigateToRoadmapItem('paused', 'phases', 'done', boards[1].data);
            const selected = buildPortfolioRoadmapView({ ...useAppStore.getState(), selectedPortfolioBoardId: 'paused' })!;
            expect(selected.phaseRows.find(row => row.item?.id === 'done')?.expanded).toBe(true);
        } finally { useAppStore.setState(previous, true); }
    });

    it('keeps Roadmap selected in ALL and persists it in the URL', () => {
        const store = createAppStore({ portfolioBoards: [project('alpha')], selectedPortfolioBoardId: 'alpha', selectedPortfolioViewMode: 'roadmap' });
        const actions = createPortfolioControlActions({ store, updateUrlState: () => {} });
        actions.selectPortfolioBoard('');
        expect(store.getState().selectedPortfolioViewMode).toBe('roadmap');
        const windowRef = { location: { pathname: '/', search: '' }, history: { replaceState: (_data: unknown, _unused: string, url: unknown) => { expect(url).toBe('/?pv=roadmap'); } } };
        updatePortfolioUrlState(fromPartial<Window>(windowRef), store.getState());
        actions.setPortfolioViewMode('board'); actions.setPortfolioViewMode('roadmap');
        expect(store.getState().selectedPortfolioViewMode).toBe('roadmap');
    });
});
