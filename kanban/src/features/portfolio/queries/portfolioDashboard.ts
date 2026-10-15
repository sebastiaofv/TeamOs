import type { BoardRecord, ProjectSaveState } from '@/features/portfolio/types';
import { getProjectInfo, type ProjectState } from '@/domain/project';
import { buildProjectDashboard } from './projectDashboard';
import { groupBy } from '@/domain/util';

export type PortfolioDashboardFilters = { state: ProjectState | 'all'; manager: string; product: string; lateOnly: boolean; sort: 'criticality' | 'deadline' | 'name' };
export const DEFAULT_PORTFOLIO_DASHBOARD_FILTERS: PortfolioDashboardFilters = { state: 'active', manager: '', product: '', lateOnly: false, sort: 'criticality' };

export function buildPortfolioDashboard(records: readonly BoardRecord[], saveStates: ReadonlyMap<string, ProjectSaveState>, filters: PortfolioDashboardFilters, today: string) {
    // The same project file may be opened more than once; count it once.
    const groups = groupBy(records, (record) => getProjectInfo(record.data).id);
    const excluded: { id: string; title: string; reason: 'duplicate' | 'unavailable' }[] = [];
    const unique: BoardRecord[] = [];
    for (const [id, copies] of groups) {
        const distinct = new Set(copies.map((record) => JSON.stringify({ board: record.data.board, extensions: record.data.extensions })));
        if (distinct.size > 1) { excluded.push({ id, title: copies[0].title, reason: 'duplicate' }); continue; }
        const available = copies.filter((record) => !['watch-error', 'conflict'].includes(saveStates.get(record.id)?.watchStatus || ''));
        if (!available.length) { excluded.push({ id, title: copies[0].title, reason: 'unavailable' }); continue; }
        unique.push(available.find((record) => record.handle) || available[0]);
    }
    const allSummaries = unique.map((record) => {
        const info = getProjectInfo(record.data), model = buildProjectDashboard(record.data, unique.map((board) => board.data), today);
        const late = model.metrics.overdue.length > 0 || Boolean(info.forecast.end && info.forecast.end < today && !['completed', 'archived'].includes(info.state));
        return { record, info, model, late };
    });
    const rows = allSummaries.filter(({ info, late }) => (filters.state === 'all' || info.state === filters.state) && (!filters.manager || info.manager === filters.manager) && (!filters.product || info.product === filters.product) && (!filters.lateOnly || late));
    rows.sort((a, b) => {
        if (filters.sort === 'criticality') return Number(b.late) - Number(a.late) || b.model.metrics.overdue.length - a.model.metrics.overdue.length || b.model.metrics.blocked.length - a.model.metrics.blocked.length || a.info.name.localeCompare(b.info.name);
        if (filters.sort === 'deadline') return Number(!a.info.forecast.end) - Number(!b.info.forecast.end) || a.info.forecast.end.localeCompare(b.info.forecast.end) || a.info.name.localeCompare(b.info.name);
        return a.info.name.localeCompare(b.info.name);
    });
    const total = (count: (row: (typeof rows)[number]) => number) => rows.reduce((sum, row) => sum + count(row), 0);
    const eligible = total((row) => row.model.progress.eligible.length), completed = total((row) => row.model.progress.completed.length);
    return {
        rows, allSummaries, excluded, loaded: records.length, unique: groups.size, duplicates: records.length - groups.size,
        totals: {
            projects: rows.length, eligible, completed, percent: eligible ? completed / eligible * 100 : null,
            overdue: total((row) => row.model.metrics.overdue.length), blocked: total((row) => row.model.metrics.blocked.length)
        }
    };
}
