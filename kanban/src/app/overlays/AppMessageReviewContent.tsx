import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import * as Dialog from '@radix-ui/react-dialog';
import { useI18n } from '@/shared/i18n';
import type { AppMessageReview } from '@/app/types';

export function AppMessageReviewContent({ review }: { review: AppMessageReview }) {
    const { t } = useI18n();
    return <div className="transfer-review">
        {review.rejection && <Dialog.Description asChild><p className="transfer-error" id="appMessageText">{review.note}</p></Dialog.Description>}
        <div className="transfer-route">
            <div className="transfer-route-project"><span className="transfer-label">{review.sourceLabel}</span><strong>{review.source}</strong></div>
            <WorkspaceIcon name="arrowRight" className="transfer-route-arrow" size={20} />
            <div className="transfer-route-project"><span className="transfer-label">{review.destinationLabel}</span><strong>{review.destination}</strong></div>
        </div>
        {review.state && <div className="transfer-state"><span className="transfer-label">{review.stateLabel}</span><span className="transfer-state-value"><span style={{ background: review.color }} aria-hidden="true" />{review.state}</span></div>}
        {!review.rejection && <Dialog.Description asChild><p className="transfer-note" id="appMessageText">{review.note}</p></Dialog.Description>}
        {Boolean(review.children?.length) && <section className="transfer-children" aria-label={review.childrenLabel}>
            <h3>{review.childrenLabel}</h3>
            <div className="transfer-table-scroll"><table className="transfer-mapping-table"><thead><tr><th>ID</th><th>{t('task.title')}</th><th>{t('task.status')}</th></tr></thead>
                <tbody>{review.children?.map((child) => <tr key={child.id} className={child.blocked ? 'transfer-child-blocked' : undefined}><td>{child.id}</td><td>{child.title}</td><td>{child.blocked && <WorkspaceIcon name="alert" role="img" aria-label={t('transfer.blocksTransfer')} className="transfer-blocked-icon" />}{child.state}</td></tr>)}</tbody>
            </table></div>
        </section>}
        {review.removals.length > 0 && <section className="transfer-removals" aria-label={review.removalsLabel}>
            <div className="transfer-section-heading"><h3>{review.removalsLabel}</h3><span>{review.removals.length}</span></div>
            <ul>{review.removals.map((item, index) => <li key={index}>
                <span className="transfer-removal-kind">{item.label}</span>
                <div><strong>{item.title}</strong><span className="transfer-removal-detail">{item.detail}</span></div>
            </li>)}</ul>
        </section>}
    </div>;
}
