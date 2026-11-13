import type { ButtonHTMLAttributes } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { useI18n } from '@/shared/i18n';
import { isProjectSaving } from '@/infrastructure/persistence/projectSaveLifecycle';

export function SaveIndicator({ boardId }: { boardId: string }) {
    const saving = useAppStore((state) => isProjectSaving(state.projectSaveStateById.get(boardId)));
    const { t } = useI18n();
    return saving ? <span role="status" className="save-indicator"><span className="save-spinner" aria-hidden="true" />{t('toolbar.saving')}</span> : null;
}
export function SaveButton({ boardId, busy = false, children, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { boardId: string; busy?: boolean }) {
    const saving = useAppStore((state) => isProjectSaving(state.projectSaveStateById.get(boardId)));
    const { t } = useI18n();
    return <button {...props} disabled={disabled || busy || saving} aria-busy={busy || saving}>{(busy || saving) && <><span className="save-spinner" aria-hidden="true" /><span className="sr-only">{t('toolbar.saving')} · </span></>}{children}</button>;
}
