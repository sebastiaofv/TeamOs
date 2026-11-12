import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { useEffect, useRef } from 'react';
import { useI18n } from '@/shared/i18n';

export function DeleteMenu({ disabled, onDelete }: { disabled?: boolean; onDelete: () => unknown }) {
    const { t } = useI18n();
    const menu = useRef<HTMLDetailsElement>(null);
    useEffect(() => {
        const outside = (event: PointerEvent) => { if (menu.current?.open && !menu.current.contains(event.target as Node)) menu.current.open = false; };
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && menu.current?.open && menu.current.contains(event.target as Node)) event.preventDefault(); };
        document.addEventListener('pointerdown', outside);
        window.addEventListener('keydown', escape, true);
        return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', escape, true); };
    }, []);
    return <details className="task-transfer-menu" ref={menu} onKeyDown={(event) => {
        if (event.key === 'Escape' && menu.current?.open) { event.preventDefault(); event.stopPropagation(); menu.current.open = false; menu.current.querySelector('summary')?.focus(); }
    }}><summary className="btn" aria-label={t('transfer.actions')}><WorkspaceIcon name="more" /></summary><div className="task-transfer-options">
        <button type="button" disabled={disabled} onClick={() => { if (menu.current) menu.current.open = false; onDelete(); }}>{t('common.delete')}</button>
    </div></details>;
}
