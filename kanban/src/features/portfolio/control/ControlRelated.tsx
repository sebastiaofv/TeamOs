import { useState } from 'react';
import type { BoardData } from '@/domain/types';
import type { ControlRelated as Related } from '@/domain/projectControl';
import { workitemLabel } from '@/domain/taskIdentity';
import { useI18n } from '@/shared/i18n';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';

export function projectElementOptions(data: BoardData) {
    return [
        ...(data.extensions.roadmap?.phases || []).map((item) => ({ key: 'phaseIds' as const, id: item.id, label: `${item.id} · ${item.title}` })),
        ...(data.extensions.roadmap?.milestones || []).map((item) => ({ key: 'milestoneIds' as const, id: item.id, label: `${item.id} · ${item.title}` })),
        ...data.board.tasks.map((item) => ({ key: 'workitemIds' as const, id: item.id, label: `${workitemLabel(item)} · ${item.title}` }))
    ];
}
export function ControlRelated({ boardId, data, value, onChange, onNavigate }: { boardId: string; data: BoardData; value: Related; onChange?: (value: Related) => void; onNavigate: () => void }) {
    const { t } = useI18n();
    const actions = usePortfolioActions();
    const [search, setSearch] = useState('');
    const options = projectElementOptions(data);
    return <section className="control-related">
        <h3>{t('control.related')}</h3>
        {onChange && <label>{t('control.relatedSearch')}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>}
        {(['phaseIds', 'milestoneIds', 'workitemIds'] as const).map((key) => <fieldset key={key}><legend>{t(`control.${key}`)}</legend>
            {options.filter((option) => option.key === key && (onChange || (value[key] as (string | number)[]).includes(option.id)) && option.label.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map((option) => {
                const checked = (value[key] as (string | number)[]).includes(option.id);
                return <div className="control-relation" key={option.id}>
                    {onChange && <input type="checkbox" aria-label={option.label} checked={checked} onChange={() => onChange({ ...value, [key]: checked ? value[key].filter((id) => id !== option.id) : [...value[key], option.id] })} />}
                    <button type="button" className="control-link" onClick={() => {
                        onNavigate();
                        if (key === 'workitemIds') actions.openPortfolioTaskDetails(boardId, Number(option.id));
                        else actions.openRoadmapEntityModal(key === 'phaseIds' ? 'phases' : 'milestones', String(option.id), { boardId });
                    }}>{option.label}</button>
                </div>;
            })}
            {value[key].filter((id) => !options.some((option) => option.key === key && option.id === id)).map((id) => <div key={id}>{id} · {t('control.missing')}{onChange && <button type="button" className="btn" onClick={() => onChange({ ...value, [key]: value[key].filter((ref) => ref !== id) })}>{t('common.remove')}</button>}</div>)}
        </fieldset>)}
    </section>;
}
