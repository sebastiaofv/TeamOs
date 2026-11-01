import type { ControlKind } from '@/domain/projectControl';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { useI18n, type TranslationKey } from '@/shared/i18n';

const COLORS: Record<string, string> = {
    open: '#60a5fa', 'in-mitigation': '#fbbf24', materialized: '#f87171', closed: '#34d399',
    proposed: '#60a5fa', approved: '#34d399', rejected: '#f87171', superseded: '#94a3b8', cancelled: '#94a3b8',
    planned: '#94a3b8', 'in-progress': '#fbbf24', delivered: '#a78bfa', accepted: '#34d399',
    low: '#34d399', medium: '#fbbf24', high: '#f87171'
};

export function ControlBadge({ value }: { value: string }) {
    const { t } = useI18n();
    return <WorkflowStateBadge state={{ id: `control-${value}`, name: t(`control.${value}` as TranslationKey), color: COLORS[value] || '#94a3b8', category: 'to-do' }} />;
}

export function ControlTypeBadge({ kind }: { kind: ControlKind }) {
    const { t } = useI18n();
    return <span className="workitem-type control-type" data-control-kind={kind}>{t(`control.type.${kind}`)}</span>;
}
