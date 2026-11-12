import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { DASHBOARD_WIDGETS, dashboardActivityLayout } from '../../src/domain/dashboardActivityLayout';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { reconstructBoardStateFromTimeline } from '../../src/domain/timeline';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';

function setup(writable = true) {
    const data = createEmptyProjectData('Activity');
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Activity', handle: writable ? {} : null, data })], selectedPortfolioBoardId: 'p' });
    const save = vi.fn(async () => true);
    const actions = createPortfolioMutationActions({ store, enqueueSave: save, alert: vi.fn(), markDirty: vi.fn(), openDialogFn: vi.fn() });
    return { store, actions, save, data: () => store.getState().portfolioBoards[0].data };
}

describe('shared Dashboard activity layout', () => {
    it('supplies defaults and normalizes unknown widgets, duplicates and missing order entries', () => {
        expect(dashboardActivityLayout(undefined)).toEqual({ version: 2, order: [...DASHBOARD_WIDGETS], hidden: ['started', 'completedInPeriod', 'currentlyInProgress', 'testing'] });
        expect(dashboardActivityLayout({ version: 1, order: ['started', 'missing', 'started'], hidden: ['started', 3, 'started'] })).toEqual({ version: 2, order: ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'epics', 'workitemStatus', 'started', 'activitySummary', 'activityDetails', 'completedInPeriod', 'currentlyInProgress', 'testing', 'openRisks', 'deliverables', 'decisions'], hidden: ['started'] });
        expect(dashboardActivityLayout({ version: 99 })).toEqual(dashboardActivityLayout(null));
    });
    it('adds Testing visibly to saved layouts without losing existing choices', () => {
        expect(dashboardActivityLayout({ version: 1, order: ['currentlyInProgress', 'completedInPeriod', 'started', 'activitySummary'], hidden: ['started'] }))
            .toEqual({ version: 2, order: ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'epics', 'workitemStatus', 'currentlyInProgress', 'completedInPeriod', 'started', 'activitySummary', 'activityDetails', 'testing', 'openRisks', 'deliverables', 'decisions'], hidden: ['started'] });
    });
    it('normalizes full layouts and preserves non-activity widget choices on serialization', () => {
        const layout = dashboardActivityLayout({ version: 2, order: ['epics', 'projectProgress', 'epics', 'unknown'], hidden: ['milestones', 'unknown', 'milestones'] });
        expect(layout.order.slice(0, 2)).toEqual(['epics', 'projectProgress']);
        expect(new Set(layout.order)).toEqual(new Set(DASHBOARD_WIDGETS));
        expect(layout.hidden).toEqual(['milestones']);
        const data = createEmptyProjectData('Layout');
        data.extensions.dashboardActivity = layout;
        expect(serializeBoardDataFromObject(data).extensions.dashboardActivity).toEqual(layout);
    });
    it('persists and replays order/visibility, resets defaults and leaves workitems untouched', async () => {
        const { actions, data, save } = setup();
        const before = structuredClone(data().board);
        const layout = dashboardActivityLayout({ version: 1, order: ['completedInPeriod', 'activitySummary', 'started', 'currentlyInProgress'], hidden: ['started'] });
        expect(await actions.saveDashboardActivityLayout('p', layout)).toBe(true);
        const saved = serializeBoardDataFromObject(data());
        validateBoardData(saved);
        expect(saved.extensions.dashboardActivity).toEqual(layout);
        expect(saved.board).toEqual(before);
        expect(reconstructBoardStateFromTimeline(saved, 1).extensions.dashboardActivity).toEqual(layout);
        expect(await actions.saveDashboardActivityLayout('p', layout)).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
        expect(await actions.saveDashboardActivityLayout('p', dashboardActivityLayout(null))).toBe(true);
        expect(data().extensions.dashboardActivity).toEqual(dashboardActivityLayout(null));
    });
    it('protects read-only files and historical previews', async () => {
        const readOnly = setup(false);
        const layout = dashboardActivityLayout({ version: 1, hidden: ['started'] });
        expect(await readOnly.actions.saveDashboardActivityLayout('p', layout)).toBe(false);
        expect(readOnly.save).not.toHaveBeenCalled();
        const { actions, store, save } = setup();
        await actions.saveDashboardActivityLayout('p', layout);
        store.setState({ portfolioTimelineSelection: { boardId: 'p', eventIndex: 0 } });
        expect(await actions.saveDashboardActivityLayout('p', dashboardActivityLayout(null))).toBe(false);
        expect(save).toHaveBeenCalledTimes(1);
    });
});
