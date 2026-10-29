import * as Dialog from '@radix-ui/react-dialog';
import type { AppMessageReview } from '@/app/types';

export function AppMessageReviewContent({ review }: { review: AppMessageReview }) {
    return <div className="transfer-review">
        <div className="transfer-route">
            <div className="transfer-route-project"><span className="transfer-label">{review.sourceLabel}</span><strong>{review.source}</strong></div>
            <svg className="transfer-route-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
            <div className="transfer-route-project"><span className="transfer-label">{review.destinationLabel}</span><strong>{review.destination}</strong></div>
        </div>
        <div className="transfer-state"><span className="transfer-label">{review.stateLabel}</span><span className="transfer-state-value"><span style={{ background: review.color }} aria-hidden="true" />{review.state}</span></div>
        <Dialog.Description asChild><p className="transfer-note" id="appMessageText">{review.note}</p></Dialog.Description>
        {review.removals.length > 0 && <section className="transfer-removals" aria-label={review.removalsLabel}>
            <div className="transfer-section-heading"><h3>{review.removalsLabel}</h3><span>{review.removals.length}</span></div>
            <ul>{review.removals.map((item, index) => <li key={index}>
                <span className="transfer-removal-kind">{item.label}</span>
                <div><strong>{item.title}</strong><span className="transfer-removal-detail">{item.detail}</span></div>
            </li>)}</ul>
        </section>}
    </div>;
}
