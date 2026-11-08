import type { WorkitemType } from '@/domain/types';
import { useI18n } from '@/shared/i18n';

export function WorkitemTypeBadge({ type, iconOnly = false }: { type: WorkitemType; iconOnly?: boolean }) {
    const { t } = useI18n();
    const name = t(`workitems.type.${type}`);
    if (iconOnly) return <span className="workitem-type workitem-type-icon" data-workitem-type={type} role="img" aria-label={name} title={name}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {type === 'epic' ? <path d="m13 2-9 12h7l-1 8 10-13h-7z" />
                : type === 'story' ? <path d="M4 3h16v18l-8-4-8 4z" />
                    : type === 'task' ? <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="m7 12 3 3 7-7" /></>
                        : <><rect x="7" y="7" width="10" height="13" rx="5" /><path d="m9 3 3 4 3-4M3 9h4m10 0h4M3 15h4m10 0h4m-4 3 4 3M7 18l-4 3M12 8v12" /></>}
        </svg>
    </span>;
    return <span className="workitem-type" data-workitem-type={type}>{t(`workitems.type.${type}`)}</span>;
}
