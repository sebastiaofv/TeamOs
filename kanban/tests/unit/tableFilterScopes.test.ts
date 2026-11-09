import { afterEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { DEFAULT_PORTFOLIO_FILTERS } from '../../src/domain/portfolioFilters';
import { clearTableFilters, clearTablePanelFilters, getTableFilters, setTableFilter } from '../../src/features/portfolio/table/tableControls';

const initial = useAppStore.getState();
afterEach(() => useAppStore.setState(initial, true));

describe('independent table filter sessions', () => {
    it('isolates every Table subsection, Sprint and project from Board filters', () => {
        useAppStore.setState({ portfolioFilters: { ...DEFAULT_PORTFOLIO_FILTERS, search: 'Board', priority: 'low' } });
        const scopes = ['p.hierarchy', 'p.epics', 'p.stories', 'p.independent', 'p.all', 'p.unplanned', 'p.sprint-a', 'p.sprint-b', 'q.hierarchy'];
        scopes.forEach((scope, index) => {
            setTableFilter('search', String(index), scope);
            setTableFilter('priority', 'high', scope);
            setTableFilter('epicId', String(index + 1), scope);
        });
        scopes.forEach((scope, index) => expect(getTableFilters(scope)).toMatchObject({ search: String(index), priority: 'high', epicId: String(index + 1) }));
        expect(useAppStore.getState().portfolioFilters).toMatchObject({ search: 'Board', priority: 'low', epicId: '' });
    });

    it('clears one panel while keeping its search, then resets only the active table', () => {
        setTableFilter('search', 'keep', 'p.sprint-a');
        setTableFilter('type', 'task', 'p.sprint-a');
        setTableFilter('statuses', ['doing'], 'p.sprint-a');
        setTableFilter('storyId', '2', 'p.sprint-a');
        setTableFilter('search', 'untouched', 'p.sprint-b');
        clearTablePanelFilters('p.sprint-a');
        expect(getTableFilters('p.sprint-a')).toMatchObject({ search: 'keep', type: '', statuses: [], storyId: '' });
        useAppStore.setState({ activeTableFilterScope: 'p.sprint-a' });
        clearTableFilters();
        expect(getTableFilters()).toMatchObject({ search: '', type: '', statuses: [] });
        expect(getTableFilters('p.sprint-b').search).toBe('untouched');
    });
});
