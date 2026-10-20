import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import type { BoardData } from '../../src/domain/types';
import { buildPortfolioRoadmapView } from '../../src/features/portfolio/queries/portfolioRoadmapViews';
import { createAppStore } from '../../src/features/portfolio/state/store';
import { createPortfolioMutationActions } from '../../src/features/portfolio/commands/portfolioCommands';
import { DEFAULT_PORTFOLIO_FILTERS } from '../../src/domain/portfolioFilters';
import { isValidRoadmapAssignment } from '../../src/domain/roadmap';

const fixture = (): BoardData => JSON.parse(readFileSync('test-board/us-5.board.json', 'utf8'));
function setup() {
    const data = fixture();
    const store = createAppStore({ portfolioBoards: [fromPartial({ id: 'p', title: 'Roadmap', handle: {}, data })], selectedPortfolioBoardId: 'p' });
    return { data, store, view: () => buildPortfolioRoadmapView(store.getState())! };
}
describe('Roadmap clarification view models', () => {
    it('scopes sprint and milestone perspectives to the selected phase, with independent absence groups', () => {
        const { view } = setup(); const model = view();
        const delivery = model.phaseRows.find((row) => row.item?.id === 'delivery')!;
        expect(delivery.progress).toMatchObject({ associated: 4, eligible: 4, completed: 1, percent: 25 });
        expect(delivery.sprintGroups.find((group) => group.referenceId === 'october')!.tasks.map((task) => task.id)).toEqual([501, 502]);
        expect(delivery.sprintGroups.find((group) => !group.referenceId)!.tasks.map((task) => task.id)).toEqual([503, 504]);
        expect(delivery.milestoneGroups.find((group) => group.referenceId === 'release')!.tasks.map((task) => task.id)).toEqual([501, 502, 503]);
        expect(delivery.milestoneGroups.find((group) => !group.referenceId)!.tasks.map((task) => task.id)).toEqual([504]);
        expect(model.sprintRows[0].tasks.map((task) => task.id)).toEqual([501, 502, 506, 507]);
        expect(model.milestones.find((item) => item.item?.id === 'release')!.tasks.map((task) => task.id)).toEqual([501, 502, 503, 506]);
        expect(model.unclassified.tasks.map((task) => task.id)).toEqual([505, 506]);
    });
    it('keeps global progress stable under archive/status filters and passing time', () => {
        const { store, view } = setup();
        const initial = view().phaseRows.find((row) => row.item?.id === 'delivery')!;
        expect(initial.visibleCount).toBe(3);
        store.setState({ portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, statuses: ['done'] } });
        const filtered = view().phaseRows.find((row) => row.item?.id === 'delivery')!;
        expect(filtered.visibleCount).toBe(1); expect(filtered.progress).toEqual(initial.progress);
        store.setState({ portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, archive: 'all' } });
        expect(view().phaseRows.find((row) => row.item?.id === 'delivery')!.visibleCount).toBe(4);
        vi.useFakeTimers(); vi.setSystemTime(new Date('2030-12-01T00:00:00Z'));
        try { expect(view().phaseRows.find((row) => row.item?.id === 'delivery')!.progress).toEqual(initial.progress); }
        finally { vi.useRealTimers(); }
    });
    it('separates colliding milestone annotations without creating milestone data rows', () => {
        const { view } = setup(); const model = view();
        const release = model.milestones.find((marker) => marker.item?.id === 'release')!;
        const checkpoint = model.milestones.find((marker) => marker.item?.id === 'checkpoint')!;
        expect(release.position).toBe(checkpoint.position); expect(release.lane).not.toBe(checkpoint.lane);
        expect(checkpoint.progress.percent).toBeNull();
        expect(model.phaseRows.every((row) => row.kind === 'phases')).toBe(true);
        expect(model.sprintRows.every((row) => row.kind === 'sprints')).toBe(true);
    });
    it('preserves label width and expanded descendants across collapsing a parent', () => {
        const { store, view } = setup(); const width = view().labelWidth;
        store.setState({ portfolioRoadmapExpandedRowsByBoardId: { p: { 'tree:engineering': true, 'phase:api': true } } });
        expect(view().phaseRows.some((row) => row.item?.id === 'api')).toBe(false);
        expect(view().labelWidth).toBe(width);
        store.setState({ portfolioRoadmapExpandedRowsByBoardId: { p: { 'tree:engineering': false, 'phase:api': true } } });
        expect(view().phaseRows.find((row) => row.item?.id === 'api')!.expanded).toBe(true);
    });
    it('saves a parent-only edit and preserves the workitem associations on the moved leaf', async () => {
        const { store } = setup(); const openDialogFn = vi.fn();
        const actions = createPortfolioMutationActions({ store, enqueueSave: async () => true, markDirty: vi.fn(), openDialogFn, closeDialogFn: vi.fn(), alert: vi.fn() });
        actions.openRoadmapEntityModal('phases', 'future');
        await actions.saveRoadmapEntity({ kind: 'phases', itemId: 'future', title: 'Future work', startDate: '2026-12-01', endDate: '2026-12-20', parentId: 'delivery' });
        const data = store.getState().portfolioBoards[0].data;
        expect(data.extensions.roadmap!.phases.find((phase) => phase.id === 'future')!.parentId).toBe('delivery');
        expect(data.extensions.roadmap!.phases.find((phase) => phase.id === 'delivery')!.endDate).toBe('2026-12-20');
        expect(data.board.tasks.find((task) => task.id === 507)!.phaseId).toBe('future');
        expect(data.extensions.timeline!.events.at(-1)!.kind).toBe('roadmap.updated');
    });
    it('uses the same domain rule for editor and direct planning assignments', () => {
        const data = fixture();
        expect(isValidRoadmapAssignment(data.extensions.roadmap, 'phaseId', 'delivery')).toBe(false);
        expect(isValidRoadmapAssignment(data.extensions.roadmap, 'phaseId', 'api')).toBe(true);
        expect(isValidRoadmapAssignment(data.extensions.roadmap, 'milestoneId', 'release')).toBe(true);
        expect(isValidRoadmapAssignment(data.extensions.roadmap, 'milestoneId', 'foreign')).toBe(false);
        expect(isValidRoadmapAssignment(null, 'phaseId', '')).toBe(true);
    });
    it('refuses a structural operation if its affected roster changes during confirmation', async () => {
        const { store } = setup(); const save = vi.fn(async () => true); const alert = vi.fn();
        const actions = createPortfolioMutationActions({ store, enqueueSave: save, markDirty: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn(), alert,
            choose: async (_text, choices) => {
                store.getState().portfolioBoards[0].data.board.tasks.find((task) => task.id === 505)!.phaseId = 'ui';
                return choices[0].value;
            } });
        actions.openRoadmapEntityModal('phases');
        await actions.saveRoadmapEntity({ kind: 'phases', title: 'New child', parentId: 'ui', startDate: '2026-10-10', endDate: '2026-11-15' });
        const data = store.getState().portfolioBoards[0].data;
        expect(data.extensions.roadmap!.phases.some((phase) => phase.id === 'new-child')).toBe(false);
        expect(data.board.tasks.find((task) => task.id === 505)!.phaseId).toBe('ui');
        expect(data.extensions.timeline).toBeUndefined(); expect(save).not.toHaveBeenCalled();
        expect(alert).toHaveBeenCalledWith(expect.stringContaining('affected workitems changed'));
    });
    it('does not close or delete a milestone when its removal confirmation is cancelled', async () => {
        const { store } = setup(); const applied = vi.fn(); const save = vi.fn(async () => true);
        const actions = createPortfolioMutationActions({ store, enqueueSave: save, markDirty: vi.fn(), openDialogFn: vi.fn(), closeDialogFn: vi.fn(), confirm: async () => false });
        await actions.deleteRoadmapEntity('milestones', 'checkpoint', { onApplied: applied });
        expect(store.getState().portfolioBoards[0].data.extensions.roadmap!.milestones.some((milestone) => milestone.id === 'checkpoint')).toBe(true);
        expect(applied).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    });
});
