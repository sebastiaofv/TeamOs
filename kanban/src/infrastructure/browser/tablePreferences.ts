// Presentation preferences only: these never become part of a project file.
const STORAGE_KEY = 'teamos-kanban.workitems-table.columns.v1';

export function readTableColumnPreferences(): unknown {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored ? JSON.parse(stored) : undefined;
    } catch {
        return undefined;
    }
}

export function saveTableColumnPreferences(columns: readonly string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    } catch {
        // Storage can be unavailable in private browsing or a standalone file.
    }
}
