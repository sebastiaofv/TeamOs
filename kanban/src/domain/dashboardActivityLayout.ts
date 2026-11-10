export const ACTIVITY_WIDGETS = ['activitySummary', 'started', 'completedInPeriod', 'currentlyInProgress'] as const;
export type ActivityWidget = typeof ACTIVITY_WIDGETS[number];
export type DashboardActivityLayout = { version: 1; order: ActivityWidget[]; hidden: ActivityWidget[] };

export function isActivityWidget(value: unknown): value is ActivityWidget {
    return ACTIVITY_WIDGETS.some((key) => key === value);
}

/** Unknown or missing configuration keeps the default layout; newly added widgets remain visible. */
export function dashboardActivityLayout(value: unknown): DashboardActivityLayout {
    const config = value && typeof value === 'object' && 'version' in value && value.version === 1 ? value : null;
    const order = config && 'order' in config && Array.isArray(config.order) ? config.order.filter(isActivityWidget) : [];
    const hidden = config && 'hidden' in config && Array.isArray(config.hidden) ? config.hidden.filter(isActivityWidget) : [];
    return { version: 1, order: [...new Set([...order, ...ACTIVITY_WIDGETS])], hidden: [...new Set(hidden)] };
}
