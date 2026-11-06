import { useI18n } from '@/shared/i18n';
import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useTableDisclosure } from './useTableDisclosure';

/** The same chooser, ordering and focus behavior for every workspace table. */
export function TableColumnMenu<Column extends string>({ columns, available, defaults, required, label, onChange, scope = '', hidden = false }: {
    columns: Column[]; available: readonly Column[]; defaults: readonly Column[]; required: readonly Column[];
    label: (column: Column) => string; onChange: (columns: Column[]) => void; scope?: string; hidden?: boolean;
}) {
    const { t } = useI18n();
    const disclosure = useTableDisclosure(hidden);
    const scopedId = (id: string) => scope ? `${id}-${scope}` : id;
    function move(column: Column, step: number) {
        const next = [...columns];
        const from = next.indexOf(column), to = from + step;
        if (from < 0 || to < 0 || to >= next.length) return;
        [next[from], next[to]] = [next[to], next[from]];
        onChange(next);
    }
    return <details id={scopedId('tableColumns')} className="table-columns" ref={disclosure.detailsRef} onKeyDown={disclosure.onKeyDown} onToggle={disclosure.onToggle}>
        <summary className="btn icon-btn" ref={disclosure.summaryRef} aria-label={t('table.columns')} title={t('table.columns')}><WorkspaceIcon name="columns" /></summary>
        <div className="table-column-panel" data-table-panel>
            <div className="table-column-options">
                {[...columns, ...available.filter(column => !columns.includes(column))].map(column => {
                    const mandatory = required.includes(column), index = columns.indexOf(column), title = label(column);
                    return <div className="table-column-option" key={column}>
                        <label htmlFor={scopedId(`tableColumn-${column}`)}><input id={scopedId(`tableColumn-${column}`)} type="checkbox" checked={index >= 0} disabled={mandatory}
                            onChange={event => onChange(event.target.checked ? [...columns, column] : columns.filter(entry => entry !== column))} /> {title}
                            {mandatory && <span className="table-column-required"> ({t('table.mandatory')})</span>}
                        </label>
                        <button className="btn" type="button" disabled={index <= 0} aria-label={t('table.moveLeft', { column: title })} onClick={() => move(column, -1)}>←</button>
                        <button className="btn" type="button" disabled={index < 0 || index === columns.length - 1} aria-label={t('table.moveRight', { column: title })} onClick={() => move(column, 1)}>→</button>
                    </div>;
                })}
            </div>
            <button className="btn" type="button" onClick={() => onChange([...defaults])}>{t('table.resetColumns')}</button>
        </div>
    </details>;
}
