import { expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { getProjectInfo } from '../../src/domain/project';
import { buildPortfolioDashboard, DEFAULT_PORTFOLIO_DASHBOARD_FILTERS } from '../../src/features/portfolio/queries/portfolioDashboard';
import type { BoardRecord, ProjectSaveState } from '../../src/features/portfolio/types';

function record(id: string, eligible: number, completed: number): BoardRecord {
    const data = createEmptyProjectData(id);
    data.board.tasks = Array.from({ length: eligible }, (_, index) => normalizeTask({ id: index + 1, title: `${id} Task ${index}`, status: index < completed ? 'done' : 'doing' }));
    data.extensions.project = { ...getProjectInfo(data), id, state: 'active', product: id };
    return { id, title: id, data, colorSeed: 0, fileName: `${id}.json`, handle: null };
}

it('sums leaf denominators across all products and deduplicates persistent IDs', () => {
    const a = record('A', 1, 1), b = record('B', 9, 1), copy = { ...a, id: 'copy', fileName: 'renamed.json' };
    const model = buildPortfolioDashboard([a, b, copy], new Map(), DEFAULT_PORTFOLIO_DASHBOARD_FILTERS, '2026-10-15');
    expect(model.totals).toMatchObject({ projects: 2, eligible: 10, completed: 2, percent: 20 });
    expect(model.duplicates).toBe(1);
    expect(model.rows.map((r) => r.info.product)).toEqual(['A', 'B']);
});

it('excludes unavailable files and conflicting copies instead of manufacturing current totals', () => {
    const a = record('A', 1, 1), b = record('B', 9, 1), copy = structuredClone(a); copy.id = 'copy'; copy.data.board.tasks[0].title = 'Conflicting task';
    const statuses = new Map<string, ProjectSaveState>([['B', fromPartial({ watchStatus: 'watch-error' })]]);
    const model = buildPortfolioDashboard([a, b, copy], statuses, DEFAULT_PORTFOLIO_DASHBOARD_FILTERS, '2026-10-15');
    expect(model.totals.percent).toBeNull(); expect(model.totals.projects).toBe(0);
    expect(model.excluded.map((r) => r.reason).sort()).toEqual(['duplicate', 'unavailable']);
});
