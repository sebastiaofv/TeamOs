import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';

export function PendingProjectTransfers() {
    const boards = useAppStore((state) => state.portfolioBoards);
    const { resumeProjectTransfer } = portfolioActions;
    const [busy, setBusy] = useState(false);
    const { t } = useI18n();
    const pending = boards.flatMap((board) => (board.data.extensions.projectTransfers?.operations || [])
        .filter((operation) => !operation.batchId || operation.id === operation.batchId)
        .filter((operation) => operation.status === 'pending')
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
