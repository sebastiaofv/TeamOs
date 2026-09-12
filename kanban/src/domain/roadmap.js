import { ROADMAP_VERSION } from './constants.js';

export function addRoadmapDays(date, days) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
}

export function createEmptyRoadmapExtension() {
    return {
        version: ROADMAP_VERSION,
        milestones: [],
        phases: [],
        sprints: []
    };
}

export function formatRoadmapAxisDate(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()];
    return `${month} ${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function formatRoadmapDateRange(item) {
    if (!item || typeof item !== 'object') return '';
    if (item.dueDate) return `Due ${item.dueDate}`;
    if (item.startDate && item.endDate) return `${item.startDate} to ${item.endDate}`;
    return '';
}

export function getRoadmapDayDiff(start, end) {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 0;
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export function getRoadmapEntityConfig(kind) {
    if (kind === 'milestones') {
        return {
            label: 'Milestone',
            singular: 'milestone',
            dateMode: 'single',
            dateLabel: 'Due Date',
            taskField: 'milestoneId',
            itemsKey: 'milestones'
        };
    }
    if (kind === 'phases') {
        return {
            label: 'Phase',
            singular: 'phase',
            dateMode: 'range',
            taskField: 'phaseId',
            itemsKey: 'phases'
        };
    }
    if (kind === 'sprints') {
        return {
            label: 'Sprint',
            singular: 'sprint',
            dateMode: 'range',
            taskField: 'sprintId',
            itemsKey: 'sprints'
        };
    }
    return null;
}

export function normalizeRoadmapDate(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
}

export function normalizeRoadmapRef(value) {
    if (typeof value !== 'string') return '';
    return value.trim();
}

export function parseRoadmapIsoDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function slugifyRoadmapEntityId(title, items, currentId = '') {
    const base = String(title || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item';
    const existingIds = new Set((Array.isArray(items) ? items : []).map((item) => item.id).filter(Boolean));
    if (currentId) {
        existingIds.delete(currentId);
    }
    let candidate = base;
    let suffix = 2;
    while (existingIds.has(candidate)) {
        candidate = `${base}-${suffix}`;
        suffix += 1;
    }
    return candidate;
}

export function getRoadmapDatePosition(date, range) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !range?.start || !range?.end) return 0;
    const totalDays = Math.max(1, range.totalDays || getRoadmapDayDiff(range.start, range.end));
    const offsetDays = Math.max(0, Math.min(totalDays, getRoadmapDayDiff(range.start, date)));
    return Math.max(0, Math.min(100, (offsetDays / totalDays) * 100));
}

export function getRoadmapItemDateBounds(item) {
    if (!item || typeof item !== 'object') return null;
    if (item.dueDate) {
        const point = parseRoadmapIsoDate(item.dueDate);
        return point ? { start: point, end: point } : null;
    }
    if (item.startDate && item.endDate) {
        const start = parseRoadmapIsoDate(item.startDate);
        const end = parseRoadmapIsoDate(item.endDate);
        if (!start || !end) return null;
        return start <= end ? { start, end } : { start: end, end: start };
    }
    return null;
}

export function getRoadmapItemTitle(roadmap, kind, refId) {
    const config = getRoadmapEntityConfig(kind);
    const normalizedRef = normalizeRoadmapRef(refId);
    if (!config || !normalizedRef) return '';
    const items = Array.isArray(roadmap?.[config.itemsKey]) ? roadmap[config.itemsKey] : [];
    return items.find((item) => item.id === normalizedRef)?.title || '';
}

export function getRoadmapTaskFieldTasks(boardData, fieldName, refId) {
    const normalizedRef = normalizeRoadmapRef(refId);
    if (!normalizedRef) return [];
    const tasks = Array.isArray(boardData?.board?.tasks) ? boardData.board.tasks : [];
    return tasks.filter((task) => task && normalizeRoadmapRef(task[fieldName]) === normalizedRef);
}

export function normalizeRoadmapItems(value, dateKeys, requiredDateKeys) {
    if (!Array.isArray(value)) return null;
    const normalized = [];
    const seenIds = new Set();
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const allowedKeys = ['id', 'title', ...dateKeys];
        const keys = Object.keys(item);
        const hasRequiredKeys = typeof item.id === 'string' && item.id.trim()
            && typeof item.title === 'string' && item.title.trim();
        const hasOnlyAllowedKeys = keys.every((key) => allowedKeys.includes(key));
        if (!hasRequiredKeys || !hasOnlyAllowedKeys) return null;

        const id = item.id.trim();
        if (seenIds.has(id)) return null;
        seenIds.add(id);

        const normalizedItem = { id, title: item.title.trim() };

        for (const key of dateKeys) {
            if (Object.prototype.hasOwnProperty.call(item, key)) {
                const normalizedDate = normalizeRoadmapDate(item[key]);
                if (!normalizedDate) return null;
                normalizedItem[key] = normalizedDate;
            }
        }

        for (const key of requiredDateKeys) {
            if (!Object.prototype.hasOwnProperty.call(normalizedItem, key)) {
                return null;
            }
        }

        normalized.push(normalizedItem);
    }
    return normalized;
}
