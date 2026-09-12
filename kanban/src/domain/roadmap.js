import { ROADMAP_VERSION } from './constants.js';
import { todayLocalIsoDate } from './calendar.js';
import { hasExactKeys } from './util.js';

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

export function compareRoadmapItemsByDate(a, b) {
    const aBounds = getRoadmapItemDateBounds(a);
    const bBounds = getRoadmapItemDateBounds(b);
    if (aBounds && bBounds) {
        const startDiff = aBounds.start.getTime() - bBounds.start.getTime();
        if (startDiff !== 0) return startDiff;
        const endDiff = aBounds.end.getTime() - bBounds.end.getTime();
        if (endDiff !== 0) return endDiff;
    } else if (aBounds) {
        return -1;
    } else if (bBounds) {
        return 1;
    }

    return String(a?.title || '').localeCompare(String(b?.title || ''));
}

export function getRoadmapAxisTicks(range) {
    if (!range?.start || !range?.end) return [];
    const totalDays = Math.max(1, range.totalDays || getRoadmapDayDiff(range.start, range.end));
    const tickCount = Math.min(5, totalDays + 1);
    const ticks = [];
    for (let index = 0; index < tickCount; index += 1) {
        const offsetDays = Math.round((totalDays * index) / Math.max(1, tickCount - 1));
        const date = addRoadmapDays(range.start, offsetDays);
        const label = formatRoadmapAxisDate(date);
        if (ticks.some((tick) => tick.label === label)) continue;
        ticks.push({
            label,
            position: getRoadmapDatePosition(date, range)
        });
    }
    return ticks;
}

export function getRoadmapTimelinePlacement(item, range) {
    const bounds = getRoadmapItemDateBounds(item);
    if (!bounds || !range?.start || !range?.end) return null;
    const start = getRoadmapDatePosition(bounds.start, range);
    const end = getRoadmapDatePosition(bounds.end, range);
    const minWidth = start === end ? 0 : 2.5;
    const rawWidth = Math.max(end - start, minWidth);
    const width = Math.max(0, Math.min(end, 100) - Math.max(0, Math.min(100, end - rawWidth)));
    const left = Math.max(0, Math.min(100 - width, end - width));
    return {
        left,
        width,
        point: end
    };
}

export function getRoadmapTodayMarker(range) {
    if (!range?.start || !range?.end) return null;
    const todayIso = todayLocalIsoDate();
    const today = parseRoadmapIsoDate(todayIso);
    if (!today) return null;
    if (today < range.start || today > range.end) return null;
    return {
        iso: todayIso,
        position: getRoadmapDatePosition(today, range)
    };
}

export function getVisibleRoadmapDateRange(roadmap) {
    const bounds = ['milestones', 'phases', 'sprints']
        .flatMap((kind) => Array.isArray(roadmap?.[kind]) ? roadmap[kind] : [])
        .map((item) => getRoadmapItemDateBounds(item))
        .filter(Boolean);
    if (bounds.length === 0) {
        const today = parseRoadmapIsoDate(todayLocalIsoDate()) || new Date();
        const start = addRoadmapDays(today, -7);
        const end = addRoadmapDays(today, 7);
        return {
            start,
            end,
            totalDays: Math.max(1, getRoadmapDayDiff(start, end))
        };
    }

    let start = bounds[0].start;
    let end = bounds[0].end;
    bounds.forEach((entry) => {
        if (entry.start < start) start = entry.start;
        if (entry.end > end) end = entry.end;
    });
    if (start.getTime() === end.getTime()) {
        start = addRoadmapDays(start, -1);
        end = addRoadmapDays(end, 1);
    }
    return {
        start,
        end,
        totalDays: Math.max(1, getRoadmapDayDiff(start, end))
    };
}

export function normalizeRoadmapExtension(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    if (Number(value.version) !== ROADMAP_VERSION) return null;
    if (!hasExactKeys(value, ['version', 'milestones', 'phases', 'sprints'])) return null;

    const milestones = normalizeRoadmapItems(value.milestones, ['dueDate'], ['dueDate']);
    const phases = normalizeRoadmapItems(value.phases, ['startDate', 'endDate'], ['startDate', 'endDate']);
    const sprints = normalizeRoadmapItems(value.sprints, ['startDate', 'endDate'], ['startDate', 'endDate']);
    if (!milestones || !phases || !sprints) return null;

    return {
        version: ROADMAP_VERSION,
        milestones,
        phases,
        sprints
    };
}
