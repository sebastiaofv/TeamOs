import type { WorkitemType } from '@/domain/types';
import { useI18n } from '@/shared/i18n';

export function WorkitemTypeBadge({ type }: { type: WorkitemType }) {
    const { t } = useI18n();
    return <span className="workitem-type" data-workitem-type={type}>{t(`workitems.type.${type}`)}</span>;
}
