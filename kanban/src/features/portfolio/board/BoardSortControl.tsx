import { useAppStore } from '@/features/portfolio/state/store';
import { setPortfolioSort } from '@/features/portfolio/commands/portfolioControls';
import { portfolioSortSelectValueFromKey } from '@/domain/board';
import { useFocusTarget } from '@/shared/hooks/useFocusTarget';
import { useI18n } from '@/shared/i18n';

export function PortfolioSortControl() {
    const { t } = useI18n();
    const sort = useAppStore((state) => state.portfolioSortKey);
    const sortRef = useFocusTarget<HTMLSelectElement>('portfolioSort');
    return <div className="portfolio-filters-field">
        <label htmlFor="portfolioSortSelect">{t('toolbar.sort')}</label>
        <select id="portfolioSortSelect" ref={sortRef} value={portfolioSortSelectValueFromKey(sort)} onChange={(event) => setPortfolioSort(event.target.value)}>
            <option value="name">{t('toolbar.name')}</option>
            <option value="priority">{t('toolbar.priority').replace(':', '')}</option>
            <option value="effort">{t('toolbar.effort').replace(':', '')}</option>
            <option value="score">{t('toolbar.score')}</option>
        </select>
    </div>;
}
