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
    return <section className="workitem-review" aria-label={review.heading}>
        {review.heading && <h3>{review.heading}</h3>}
        {!review.rows.length && <p className="workitem-review-empty">{t('sprint.noUnplanned')}</p>}
        {[...new Set(review.rows.map((row) => row.rule))].map((rule) => <div key={rule || 'workitems'} className="workitem-review-group">
            {rule && <h3>{rule}</h3>}
            <ul>{review.rows.filter((row) => row.rule === rule).map((row) => {
                const field = fields.find((field) => field.id === row.selectionId);
                return <li key={row.selectionId || row.id} className="workitem-review-row">
                    <WorkitemTypeBadge type={row.type} iconOnly />
                    <span className="workitem-review-id">{row.id}</span>
                    <span className="workitem-review-title" title={row.title}>{row.title}</span>
                    {row.from && row.to && <span className="workitem-review-transition" aria-label={t('automations.transition')}><span>{row.from}</span><span aria-hidden="true">→</span><span>{row.to}</span></span>}
                    {field && <select ref={review.rows.indexOf(row) === 0 ? selectionRef : undefined} aria-label={`${field.label}: ${t('automations.decision')}`} data-field={field.id} value={selections[field.id]} onChange={(event) => (row.selectionIds || [field.id]).forEach((id) => onChange(id, event.target.value))}>
                        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>}
                </li>;
            })}</ul>
        </div>)}
    </section>;
}
