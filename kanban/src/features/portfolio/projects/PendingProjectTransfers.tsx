import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function PendingProjectTransfers() {
    const boards = useAppStore((state) => state.portfolioBoards);
    const saves = useAppStore((state) => state.projectSaveStateById);
    const { resumeProjectTransfer } = usePortfolioActions();
    const [busy, setBusy] = useState(false);
    const { t } = useI18n();
    const pending = boards.flatMap((board) => (board.data.extensions.projectTransfers?.operations || [])
        .filter((operation) => !operation.batchId || operation.id === operation.batchId)
        .filter((operation) => operation.status === 'pending' || ((operation === board.data.extensions.projectTransfers?.operations.at(-1) || operation.id === board.data.extensions.projectTransfers?.operations.at(-1)?.batchId) && saves.get(board.id)?.status === 'error'))
        .map((operation) => ({ board, operation })));
    if (!pending.length) return null;
    return <section className="pending-transfers" aria-label={t('transfer.pendingTitle')}>
        <h3>{t('transfer.pendingTitle')}</h3>
        <p>{t('transfer.pending')}</p>
        {pending.map(({ board, operation }) => <div key={operation.id}>
            <span>{operation.from.projectTitle} → {operation.to.projectTitle} · {operation.from.title}</span>
            <button type="button" className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await resumeProjectTransfer(board.id, operation.id); } finally { setBusy(false); } }}>{t('transfer.recover')}</button>
        </div>)}
    </section>;
}
