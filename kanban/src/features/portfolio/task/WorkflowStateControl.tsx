import type { CSSProperties } from 'react';
import type { Workflow, WorkflowState } from '@/domain/types';
import { useI18n } from '@/shared/i18n';

function stateStyle(color: string): CSSProperties {
    const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const foreground = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
    return { '--state-color': color, '--state-foreground': foreground, backgroundColor: color, color: foreground, borderColor: color } as CSSProperties;
}

export function WorkflowStateBadge({ state, table = false }: { state: WorkflowState; table?: boolean }) {
    return <span className={`workflow-state-badge${table ? ` table-status-badge status-${state.id}` : ''}`} data-state-id={state.id} data-state-color={state.color} data-workflow-category={state.category} style={stateStyle(state.color)}>{state.name}</span>;
}

export function WorkflowStateControl({ workflow, status, readOnly, onChange }: { workflow: Workflow; status: string; readOnly: boolean; onChange: (value: string) => unknown }) {
    const { t } = useI18n();
    const state = workflow.states.find((item) => item.id === status) || { id: status, name: status, color: '#94a3b8', category: 'to-do' as const };
    const destinations = workflow.states.filter((item) => workflow.transitions[status]?.includes(item.id));
    if (readOnly) return <WorkflowStateBadge state={state} />;
    return <span className="workflow-state-control" title={!destinations.length ? t('workflow.noDestinations') : t('task.status')}>
        <WorkflowStateBadge state={state} /><span aria-hidden="true">▾</span>
        <select aria-label={t('task.status')} value={status} disabled={!destinations.length} onChange={(event) => onChange(event.target.value)}>
            <option value={status} disabled>{state.name}</option>
            {destinations.map((destination) => <option value={destination.id} key={destination.id}>{destination.name}</option>)}
        </select>
    </span>;
}
