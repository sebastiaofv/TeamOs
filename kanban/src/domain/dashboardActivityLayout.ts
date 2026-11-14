export const ACTIVITY_WIDGETS = ['activitySummary', 'activityDetails', 'started', 'completedInPeriod', 'currentlyInProgress', 'testing'] as const;
export type ActivityWidget = typeof ACTIVITY_WIDGETS[number];
export const DASHBOARD_WIDGETS = ['projectProgress', 'activePhases', 'milestones', 'activeSprint', 'epics', 'workitemStatus', ...ACTIVITY_WIDGETS, 'openRisks', 'deliverables', 'decisions'] as const;
export type DashboardWidget = typeof DASHBOARD_WIDGETS[number];
export type DashboardActivityLayout = { version: 2; order: DashboardWidget[]; hidden: DashboardWidget[] };

export function isActivityWidget(value: unknown): value is ActivityWidget {
    return ACTIVITY_WIDGETS.some((key) => key === value);
}
function isWidget(value: unknown): value is DashboardWidget {
    return DASHBOARD_WIDGETS.some((key) => key === value);
}

/** Migrate activity-only layouts without losing saved choices; all widgets now share one layout. */
export function dashboardActivityLayout(value: unknown): DashboardActivityLayout {
    const config = value && typeof value === 'object' && 'version' in value && (value.version === 1 || value.version === 2) ? value : null;
    const order = config && 'order' in config && Array.isArray(config.order) ? config.order.filter(isWidget) : [];
    const hidden = config && 'hidden' in config && Array.isArray(config.hidden) ? config.hidden.filter(isWidget) : [];
    const migrated = config?.version === 1 ? [
        ...DASHBOARD_WIDGETS.filter(key => !isActivityWidget(key) && !['openRisks', 'deliverables', 'decisions'].includes(key)),
        ...order.filter(isActivityWidget), ...ACTIVITY_WIDGETS,
        'openRisks' as const, 'deliverables' as const, 'decisions' as const
    ] : [...order, ...DASHBOARD_WIDGETS];
    return { version: 2, order: [...new Set(migrated)], hidden: config ? [...new Set(hidden)] : ['started', 'completedInPeriod', 'currentlyInProgress', 'testing'] };
}
