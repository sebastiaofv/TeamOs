import { useState } from 'react';
import { useI18n } from '@/shared/i18n';

export function AssigneeEditor({ value, onChange, pool, onRemove }: {
    value: string[]; onChange: (next: string[]) => void; pool: string[]; onRemove: (index: number) => unknown;
}) {
    const { t } = useI18n();
    const [selected, setSelected] = useState('');
    const available = pool.filter((name) => !value.includes(name));
    const add = () => {
        if (!available.includes(selected)) return;
        onChange([...value, selected]);
        setSelected('');
    };
    return <div className="assignee-editor" id="taskAssigneeEditor" aria-labelledby="taskAssigneesLabel">
        <div className="assignee-editor-list" id="taskAssigneeItems">
            {!value.length && <div className="assignee-editor-empty">{t('editor.noAssignees')}</div>}
            {value.map((name, index) => <div className="assignee-editor-row" key={name}>
                <span>{name}</span>
                <button type="button" className="assignee-editor-remove" aria-label={t('editor.removeAssignee')}
                    onClick={() => { void onRemove(index); }}>&times;</button>
            </div>)}
        </div>
        <div className="assignee-editor-add">
            <select id="taskAssigneeNewItem" aria-label={t('editor.addAssigneePlaceholder')} value={selected}
                onChange={(event) => setSelected(event.target.value)}>
                <option value="">{t('common.choose')}</option>
                {available.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button type="button" className="btn" id="taskAssigneeAddBtn" disabled={!selected} onClick={add}>{t('common.add')}</button>
        </div>
        <p>{t('project.curatedHelp')}</p>
    </div>;
}
