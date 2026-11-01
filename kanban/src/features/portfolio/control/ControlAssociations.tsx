import { useState } from 'react';
import { CONTROL_KINDS, controlRecords, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import type { BoardData } from '@/domain/types';
import { useI18n } from '@/shared/i18n';
import { ControlRecordDialog } from './ControlRecordDialog';
import { ControlBadge } from './ControlBadge';

export function ControlAssociations({ boardId, data, selected, onChange, readOnly }: { boardId: string; data: BoardData; selected: string[]; onChange: (ids: string[]) => void; readOnly?: boolean }) {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [linking, setLinking] = useState(false);
    const [editing, setEditing] = useState<{ kind: ControlKind; id?: string } | null>(null);
    const records = controlRecords(data);
    return <section className="control-associations"><h3>{t('control.view')}</h3>
        {!readOnly && <><button className="btn" type="button" aria-expanded={linking} onClick={() => setLinking(!linking)}>{t('control.link')}</button>{linking && <label>{t('control.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}</>}
        {CONTROL_KINDS.map((kind) => <section className="workitem-section workitem-child-section" key={kind}>
            <div className="workitem-section-heading"><h3>{t(`control.${kind}`)} <span className="detail-tab-count">{records.filter((record) => record.kind === kind && selected.includes(record.id)).length}</span></h3>
                {!readOnly && <button className="btn" type="button" onClick={() => setEditing({ kind })}>{t('control.new')} · {t(`control.type.${kind}`)}</button>}
            </div>
            <ul className={`control-record-list${readOnly ? ' is-readonly' : ''}`}>{records.filter((record) => record.kind === kind && (selected.includes(record.id) || (!readOnly && linking)) && (!linking || `${record.id} ${record.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).map((record) => <li key={record.id}>
                {!readOnly && <input type="checkbox" aria-label={`${record.id} · ${record.title}`} checked={selected.includes(record.id)} onChange={(event) => onChange(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} />}
                <span className="workitem-child-id">{record.id}</span><button className="table-item-link" type="button" onClick={() => setEditing({ kind, id: record.id })}>{record.title}</button><ControlBadge value={record.status} />
            </li>)}</ul>
            {!records.some((record) => record.kind === kind && selected.includes(record.id)) && <p className="field-hint">{t('control.noRecords')}</p>}
        </section>)}
        {editing && <ControlRecordDialog key={`${editing.kind}:${editing.id || 'new'}`} boardId={boardId} recordId={editing.id} kind={editing.kind} data={data} readOnly={readOnly} onClose={() => setEditing(null)} onSaved={(record: ControlRecord) => { if (!editing.id && !selected.includes(record.id)) onChange([...selected, record.id]); }} />}
    </section>;
}
