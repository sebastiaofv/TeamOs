import type { RefObject } from 'react';
import type { MessageSelection, WorkitemReview } from '@/app/types';
import { WorkitemTypeBadge } from '@/features/portfolio/task/WorkitemTypeBadge';
import { useI18n } from '@/shared/i18n';

export function WorkitemReviewContent({ review, fields = [], selections, onChange, selectionRef }: {
    review: WorkitemReview;
    fields?: MessageSelection[];
    selections: Record<string, string>;
    onChange: (id: string, value: string) => void;
    selectionRef: RefObject<HTMLSelectElement | null>;
}) {
    const { t } = useI18n();
    if (review.phaseGroups?.length) return <section className="workitem-review phase-date-review" aria-label={review.heading}>
        {review.phaseGroups.map((group, index) => {
            const field = fields.find(field => field.id === group.selectionId);
            return <section key={group.selectionId} className="phase-date-review-group" aria-labelledby={`phase-date-title-${index}`}>
                <div className="phase-date-review-heading">
                    <div className="phase-date-review-summary"><h3 id={`phase-date-title-${index}`}>{group.title}</h3>
                        <div className="phase-date-review-dates" aria-label={t('planning.phaseDatesTitle')}><span>{group.from}</span><span aria-hidden="true">→</span><strong>{group.to}</strong></div>
                    </div>
                    {field && <select id={`appMessageSelection-${fields.indexOf(field)}`} ref={index === 0 ? selectionRef : undefined} required={field.required}
                        aria-label={`${field.label}: ${t('automations.decision')}`} data-field={field.id} value={selections[field.id]} onChange={event => onChange(field.id, event.target.value)}>
                        {field.required && <option value="" disabled>{t('common.choose')}</option>}
                        {field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>}
                </div>
                <ul>{review.rows.filter(row => row.selectionId === group.selectionId).map(row => <li key={row.id} className="workitem-review-row">
                    <WorkitemTypeBadge type={row.type} /><span className="workitem-review-id">{row.id}</span><span className="workitem-review-title" title={row.title}>{row.title}</span>
                </li>)}</ul>
            </section>;
        })}
    </section>;
    return <section className="workitem-review" aria-label={review.heading}>
        {review.heading && <h3>{review.heading}</h3>}
        {review.rules?.map((rule) => <div key={rule.name} className="workitem-review-rule"><h3>{t('automations.rule')}: {rule.name}</h3><p>{rule.description}</p></div>)}
        {!review.rows.length && <p className="workitem-review-empty">{t('sprint.noUnplanned')}</p>}
        {[...new Set(review.rows.map((row) => row.rule))].map((rule) => <div key={rule || 'workitems'} className="workitem-review-group">
            {rule && !review.rules?.some((entry) => entry.name === rule) && <h3>{t('automations.rule')}: {rule}</h3>}
            <ul>{review.rows.filter((row) => row.rule === rule).map((row) => {
                const field = review.rows.find((entry) => entry.selectionId === row.selectionId) === row ? fields.find((field) => field.id === row.selectionId) : undefined;
                const selected = field?.options.find((option) => option.value === selections[field.id]);
                return <li key={`${row.id}:${row.field || ''}:${row.selectionId || ''}`} className="workitem-review-row">
                    <WorkitemTypeBadge type={row.type} />
                    <span className="workitem-review-id">{row.id}</span>
                    <span className="workitem-review-title" title={row.title}>{row.title}</span>
                    {row.field && <span className="workitem-review-field">{row.field}</span>}
                    {row.from !== undefined && row.to !== undefined && <span className="workitem-review-transition" aria-label={t('automations.transition')}><span>{row.from}</span><span aria-hidden="true">→</span><span>{row.selectionValue && field ? selected?.reviewValue || selected?.label || '—' : row.to}</span></span>}
                    {row.reason && <span className="workitem-review-reason" role="note">{row.reason}</span>}
                    {field && <select id={`appMessageSelection-${fields.indexOf(field)}`} ref={review.rows.indexOf(row) === 0 ? selectionRef : undefined} required={field.required} aria-label={row.selectionValue ? field.label : `${field.label}: ${t('automations.decision')}`} data-field={field.id} value={selections[field.id]} onChange={(event) => (row.selectionIds || [field.id]).forEach((id) => onChange(id, event.target.value))}>
                        {field.required && <option value="" disabled>{t('common.choose')}</option>}
                        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>}
                </li>;
            })}</ul>
        </div>)}
    </section>;
}
