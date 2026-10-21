import type { CSSProperties } from 'react';
import type { WorkflowState } from '@/domain/types';

function stateStyle(color: string): CSSProperties {
    const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const foreground = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#111111' : '#ffffff';
    return { '--state-color': color, '--state-foreground': foreground, backgroundColor: color, color: foreground, borderColor: color } as CSSProperties;
}

export function WorkflowStateBadge({ state }: { state: WorkflowState }) {
    return <span className={`table-status-badge status-${state.id}`} data-state-id={state.id} data-state-color={state.color} data-workflow-category={state.category} style={stateStyle(state.color)}>{state.name}</span>;
}
