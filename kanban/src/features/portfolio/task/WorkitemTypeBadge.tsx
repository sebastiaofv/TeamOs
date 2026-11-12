import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import type { WorkitemType } from '@/domain/types';
import { useI18n } from '@/shared/i18n';

export function WorkitemTypeBadge({ type, iconOnly = false }: { type: WorkitemType; iconOnly?: boolean }) {
    const { t } = useI18n();
    const name = t(`workitems.type.${type}`);
    if (iconOnly) return <span className="workitem-type workitem-type-icon" data-workitem-type={type} role="img" aria-label={name} title={name}>
        <WorkspaceIcon name={type} size={14} />
    </span>;
    return <span className="workitem-type" data-workitem-type={type}>{t(`workitems.type.${type}`)}</span>;
}
