export const ACTIVITY_WIDGETS = ['activitySummary', 'activityDetails', 'started', 'completedInPeriod', 'currentlyInProgress', 'testing'] as const;
export type ActivityWidget = typeof ACTIVITY_WIDGETS[number];
export type DashboardActivityLayout = { version: 1; order: ActivityWidget[]; hidden: ActivityWidget[] };

export function isActivityWidget(value: unknown): value is ActivityWidget {
    return ACTIVITY_WIDGETS.some((key) => key === value);
}

/** Preserve saved choices; independent activity lists are opt-in in a fresh or reset layout. */
export function dashboardActivityLayout(value: unknown): DashboardActivityLayout {
    const config = value && typeof value === 'object' && 'version' in value && value.version === 1 ? value : null;
    const order = config && 'order' in config && Array.isArray(config.order) ? config.order.filter(isActivityWidget) : [];
    const hidden = config && 'hidden' in config && Array.isArray(config.hidden) ? config.hidden.filter(isActivityWidget) : [];
    return { version: 1, order: [...new Set([...order, ...ACTIVITY_WIDGETS])], hidden: config ? [...new Set(hidden)] : ['started', 'completedInPeriod', 'currentlyInProgress', 'testing'] };
}
