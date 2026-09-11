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
