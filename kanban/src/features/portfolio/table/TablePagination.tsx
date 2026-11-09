import { useI18n } from '@/shared/i18n';

export function TablePagination({ page, pageCount, pageSize, onPage, onPageSize, scope = '' }: {
    page: number; pageCount: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void; scope?: string;
}) {
    const { t } = useI18n();
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
    return <nav className="table-pagination" aria-label={t('table.view')}>
        <label htmlFor={scopedId('tablePageSize')}>{t('table.pageSize')}
            <span className="table-select table-page-size-select">
                <select id={scopedId('tablePageSize')} value={pageSize} onChange={event => onPageSize(Number(event.target.value))}>
                    {[25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
                </select>
                <svg className="table-select-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </span>
        </label>
        <button className="btn" type="button" id={scopedId('tablePreviousPage')} disabled={page === 0} onClick={() => onPage(page - 1)}>{t('table.previous')}</button>
        <span role="status">{t('table.page', { current: page + 1, total: pageCount })}</span>
        <button className="btn" type="button" id={scopedId('tableNextPage')} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)}>{t('table.next')}</button>
    </nav>;
}
