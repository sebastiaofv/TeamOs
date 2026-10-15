import { useAppStore } from '@/features/portfolio/state/store';
import { getProjectInfo } from '@/domain/project';
import { setPortfolioFilter } from '@/features/portfolio/commands/portfolioControls';
import { setTableFilter } from '@/features/portfolio/table/tableControls';
import { useI18n } from '@/shared/i18n';

export function LocalProfile() {
    const { t } = useI18n();
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === s.selectedPortfolioBoardId));
    const profiles = useAppStore((s) => s.localProfiles);
    const view = useAppStore((s) => s.selectedPortfolioViewMode);
    if (!board) return null;
    const project = getProjectInfo(board.data), selected = profiles[project.id] || '';
    const active = project.team.filter((m) => m.active);
    return <div className="local-profile"><label htmlFor="localProfile">{t('assignment.profile')}</label>
        <select id="localProfile" value={selected} onChange={(e) => useAppStore.setState({ localProfiles: { ...profiles, [project.id]: e.target.value } })}><option value="">{t('assignment.unidentified')}</option>{active.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select>
        <button type="button" className="btn-text" disabled={!active.some((member) => member.id === selected)} onClick={() => view === 'table' ? setTableFilter('assignee', selected) : setPortfolioFilter('assignee', selected)}>{t('assignment.mine')}</button>
        <span className="muted">{t('assignment.local')}</span>
    </div>;
}
