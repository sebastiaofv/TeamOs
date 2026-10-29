import { useEffect, useRef, useState } from 'react';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function TaskTransferMenu({ boardId, taskId, historical = false }: { boardId: string; taskId: number; historical?: boolean }) {
    const { transferPortfolioTask } = usePortfolioActions();
    const { t } = useI18n();
    const menu = useRef<HTMLDetailsElement>(null);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        if (!open) return;
        const closeOutside = (event: PointerEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);
    return <details ref={menu} onToggle={(event) => setOpen(event.currentTarget.open)} className="task-transfer-menu" onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
        <summary className="task-action-btn" aria-label={t('transfer.actions')} title={t('transfer.actions')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="13" cy="8" r="1" /></svg>
        </summary>
        <div className="task-transfer-options">
            {(['copy', 'move'] as const).map((mode) => <button key={mode} type="button" disabled={historical} title={historical ? t('task.readOnlyHistorical') : undefined}
                onClick={() => { if (menu.current) menu.current.open = false; void transferPortfolioTask(boardId, taskId, mode); }}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">{mode === 'copy' ? <><rect x="7" y="7" width="10" height="10" rx="1" /><path d="M4 13H3V3h10v1" /></> : <><path d="M3 10h12m-5-5 5 5-5 5M17 3v14" /></>}</svg>
                {t(`transfer.${mode}`)}
            </button>)}
        </div>
    </details>;
}
