import { useState } from 'react';
import { CONTROL_KINDS, controlRecords, type ControlKind, type ControlRecord } from '@/domain/projectControl';
import type { BoardData } from '@/domain/types';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { ControlRecordDialog } from './ControlRecordDialog';

export function ControlAssociations({ boardId, data, selected, onChange, readOnly }: { boardId: string; data: BoardData; selected: string[]; onChange: (ids: string[]) => void; readOnly?: boolean }) {
    const { t } = useI18n();
    const [search, setSearch] = useState('');
    const [editing, setEditing] = useState<{ kind: ControlKind; id?: string } | null>(null);
    const records = controlRecords(data);
    return <section className="control-associations"><h3>{t('control.view')}</h3><p className="field-hint">{t('control.selectRecords')}</p>
        <label>{t('control.search')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        {CONTROL_KINDS.map((kind) => <fieldset key={kind}><legend>{t(`control.${kind}`)}</legend>
            {!readOnly && <button className="btn" type="button" onClick={() => setEditing({ kind })}>{t('control.new')} · {t(`control.${kind}`)}</button>}
            {records.filter((record) => record.kind === kind && (!readOnly || selected.includes(record.id)) && `${record.id} ${record.title}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((record) => <div className="control-relation" key={record.id}>
                {!readOnly && <input type="checkbox" aria-label={`${record.id} · ${record.title}`} checked={selected.includes(record.id)} onChange={(event) => onChange(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))} />}
                <button className="control-link" type="button" onClick={() => setEditing({ kind, id: record.id })}>{record.id} · {record.title} · {t(`control.${record.status}` as TranslationKey)}</button>
            </div>)}
            {!records.some((record) => record.kind === kind && selected.includes(record.id)) && <p className="field-hint">{t('control.noRecords')}</p>}
        </fieldset>)}
        {editing && <ControlRecordDialog key={`${editing.kind}:${editing.id || 'new'}`} boardId={boardId} recordId={editing.id} kind={editing.kind} data={data} readOnly={readOnly} onClose={() => setEditing(null)} onSaved={(record: ControlRecord) => { if (!editing.id && !selected.includes(record.id)) onChange([...selected, record.id]); }} />}
    </section>;
}
