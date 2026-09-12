// Application logger. Cross-cutting rather than domain logic, so it sits at the
// src/ root: both the UI layer and the persistence layer use it.

import { DEBUG_LOGS_ENABLED } from './domain/constants.js';

export const Logger = {
    debug(...args) {
        if (!DEBUG_LOGS_ENABLED) return;
        console.debug('[TeamOS Kanban]', ...args);
    },
    warn(...args) {
        console.warn('[TeamOS Kanban]', ...args);
    },
    error(...args) {
        console.error('[TeamOS Kanban]', ...args);
    }
};
