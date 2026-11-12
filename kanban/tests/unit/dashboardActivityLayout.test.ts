import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { ACTIVITY_WIDGETS, dashboardActivityLayout } from '../../src/domain/dashboardActivityLayout';
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
        expect(dashboardActivityLayout(undefined)).toEqual({ version: 1, order: [...ACTIVITY_WIDGETS], hidden: ['started', 'completedInPeriod', 'currentlyInProgress', 'testing'] });
        expect(dashboardActivityLayout({ version: 1, order: ['started', 'missing', 'started'], hidden: ['started', 3, 'started'] })).toEqual({ version: 1, order: ['started', 'activitySummary', 'activityDetails', 'completedInPeriod', 'currentlyInProgress', 'testing'], hidden: ['started'] });
        expect(dashboardActivityLayout({ version: 99 })).toEqual(dashboardActivityLayout(null));
    });
    it('adds Testing visibly to saved layouts without losing existing choices', () => {
        expect(dashboardActivityLayout({ version: 1, order: ['currentlyInProgress', 'completedInPeriod', 'started', 'activitySummary'], hidden: ['started'] }))
            .toEqual({ version: 1, order: ['currentlyInProgress', 'completedInPeriod', 'started', 'activitySummary', 'activityDetails', 'testing'], hidden: ['started'] });
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
