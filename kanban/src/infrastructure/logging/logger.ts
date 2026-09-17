// Application logger. Cross-cutting rather than domain logic, so it sits at the
// src/ root: both the UI layer and the persistence layer use it.

import { DEBUG_LOGS_ENABLED } from '@/domain/constants';

export const Logger = {
    debug(...args: unknown[]) {
        if (!DEBUG_LOGS_ENABLED) return;
        console.debug('[TeamOS Kanban]', ...args);
    },
    warn(...args: unknown[]) {
        console.warn('[TeamOS Kanban]', ...args);
    },
    error(...args: unknown[]) {
        console.error('[TeamOS Kanban]', ...args);
    }
};
