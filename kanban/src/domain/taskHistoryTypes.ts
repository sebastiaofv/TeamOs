// Read-only projections of a task's history from the project's timeline.
// These values are never persisted as a second timeline.
export type TaskHistoryValue = {
    known: boolean;
    value: unknown;
    label?: string;
};

export type TaskHistoryChange = {
    field: string;
    before: TaskHistoryValue;
    after: TaskHistoryValue;
};

export type TaskHistoryEntry = {
    id: string;
    at: string;
    kind: string;
    changes: TaskHistoryChange[];
    incomplete: boolean;
};

export type TaskHistory = {
    entries: TaskHistoryEntry[];
    earlierHistoryUnavailable: boolean;
    incomplete: boolean;
    asOf: { eventId: string; at: string } | null;
};
