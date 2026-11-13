import { useI18n } from '@/shared/i18n';
import { ActionMenu } from './ActionMenu';

export function DeleteMenu({ disabled, onDelete }: { disabled?: boolean; onDelete: () => unknown }) {
    const { t } = useI18n();
    return <ActionMenu trigger={<button type="button" className="btn" aria-label={t('transfer.actions')}>⋯</button>}
        actions={[{ label: t('common.delete'), disabled, run: onDelete }]} />;
}
