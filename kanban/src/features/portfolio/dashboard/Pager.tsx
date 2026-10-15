import { useState } from 'react';
import { useI18n } from '@/shared/i18n';

export const DASHBOARD_PAGE_SIZE = 50;

export function paginate<T>(items: readonly T[], page: number) {
    const count = Math.max(1, Math.ceil(items.length / DASHBOARD_PAGE_SIZE));
    const current = Math.min(page, count - 1);
    const start = current * DASHBOARD_PAGE_SIZE;
    return { current, count, items: items.slice(start, start + DASHBOARD_PAGE_SIZE) };
}

export function usePage<T>(items: readonly T[]) {
    const [page, setPage] = useState(0);
    return { ...paginate(items, page), setPage };
}

export function Pager({ current, count, setPage }: { current: number; count: number; setPage: (page: number) => void }) {
    const { t } = useI18n();
    if (count <= 1) return null;
    return (
        <div className="dashboard-controls">
            <button className="btn" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{t('table.previous')}</button>
            <span>{current + 1}/{count}</span>
            <button className="btn" type="button" disabled={current + 1 >= count} onClick={() => setPage(current + 1)}>{t('table.next')}</button>
        </div>
    );
}
