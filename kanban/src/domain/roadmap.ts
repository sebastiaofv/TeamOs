import { effectivePlanning, sprintMembers } from './workitems';
import type { BoardData } from './types';
import type {
    DateBounds,
    LooseBoardData,
    RoadmapDateKey,
    RoadmapExtension,
    RoadmapItem,
    RoadmapKind,
    RoadmapRange,
    RoadmapTick,
    Task
} from './types';
import { ROADMAP_VERSION, ROADMAP_EXTENSION_KEY } from './constants';
import { getBoardExtensionsObject } from './extensions';
import { hasExactKeys, isRecord, todayLocalIsoDate } from './util';
import type { Language } from '@/shared/types/ui';
import { isLeafPhase, phaseDescendants, recalculatePhaseDates } from './phaseTree';
import { isMilestoneColor } from '@/domain/milestonePresentation';

type RoadmapItemLike = Partial<RoadmapItem> | null | undefined;
type RangeLike = Partial<RoadmapRange> | null | undefined;
export type RoadmapTaskField = 'milestoneId' | 'phaseId' | 'sprintId';
export type SprintCalendarStatus = 'planned' | 'active' | 'done';

export function isValidRoadmapAssignment(roadmap: RoadmapExtension | null | undefined, field: 'phaseId' | 'milestoneId', value: string): boolean {
    return !value || Boolean(roadmap && (field === 'phaseId' ? isLeafPhase(roadmap.phases, value) : roadmap.milestones.some((item) => item.id === value)));
}

/** Start and end days are inclusive, using the project's local calendar day. */
export function getSprintCalendarStatus(sprint: RoadmapItem, today: string): SprintCalendarStatus {
    return sprint.endDate && sprint.endDate < today ? 'done'
        : sprint.startDate && sprint.startDate > today ? 'planned' : 'active';
}

export type RoadmapEntityConfig = {
    label: string;
    singular: 'milestone' | 'phase' | 'sprint';
    dateMode: 'single' | 'range';
    dateLabel?: string;
    taskField: RoadmapTaskField;
    itemsKey: RoadmapKind;
};

// A valid date always yields a date; anything else yields null.
export function addRoadmapDays(date: Date, days: number): Date;
export function addRoadmapDays(date: unknown, days: unknown): Date | null;
export function addRoadmapDays(date: unknown, days: unknown): Date | null {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    return new Date(date.getTime() + (Number(days) * 24 * 60 * 60 * 1000));
}

export function createEmptyRoadmapExtension(): RoadmapExtension {
    return {
        version: ROADMAP_VERSION,
        milestones: [],
        phases: [],
        sprints: []
    };
}

export function formatRoadmapAxisDate(date: unknown, language: Language = 'en'): string {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    const month = (language === 'pt'
        ? ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
        : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'])[date.getUTCMonth()];
    return `${month} ${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function formatRoadmapDateRange(item: RoadmapItemLike, language: Language = 'en'): string {
    if (!item || typeof item !== 'object') return '';
    if (item.dueDate) return language === 'pt' ? `Prazo ${item.dueDate}` : `Due ${item.dueDate}`;
    if (item.startDate && item.endDate) return language === 'pt'
        ? `${item.startDate} a ${item.endDate}`
        : `${item.startDate} to ${item.endDate}`;
    return '';
}

export function getRoadmapDayDiff(start: unknown, end: unknown): number {
    if (!(start instanceof Date) || Number.isNaN(start.getTime())) return 0;
    if (!(end instanceof Date) || Number.isNaN(end.getTime())) return 0;
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}

export function getRoadmapEntityConfig(kind: unknown): RoadmapEntityConfig | null {
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

export function normalizeRoadmapDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return parseRoadmapIsoDate(trimmed) ? trimmed : '';
}

export function normalizeRoadmapRef(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value.trim();
}

export function parseRoadmapIsoDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year < 1 || month < 1 || month > 12 || day < 1) return null;

    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return null;
    }
    return date;
}

export function slugifyRoadmapEntityId(title: unknown, items: readonly { id?: string }[] | null | undefined, currentId = ''): string {
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

export function getRoadmapDatePosition(date: unknown, range: RangeLike): number {
    if (!(date instanceof Date) || Number.isNaN(date.getTime()) || !range?.start || !range?.end) return 0;
    const totalDays = Math.max(1, range.totalDays || getRoadmapDayDiff(range.start, range.end));
    const offsetDays = Math.max(0, Math.min(totalDays, getRoadmapDayDiff(range.start, date)));
    return Math.max(0, Math.min(100, (offsetDays / totalDays) * 100));
}

export function getRoadmapItemDateBounds(item: RoadmapItemLike): DateBounds | null {
    if (!item || typeof item !== 'object') return null;
    if (item.dueDate) {
        const point = parseRoadmapIsoDate(item.dueDate);
        return point ? { start: point, end: point } : null;
    }
    if (item.startDate && item.endDate) {
        const start = parseRoadmapIsoDate(item.startDate);
        const end = parseRoadmapIsoDate(item.endDate);
        if (!start || !end) return null;
        if (start > end) return null;
        return { start, end };
    }
    return null;
}

export function getRoadmapItemTitle(roadmap: RoadmapExtension | null | undefined, kind: RoadmapKind, refId: unknown): string {
    const config = getRoadmapEntityConfig(kind);
    const normalizedRef = normalizeRoadmapRef(refId);
    if (!config || !normalizedRef) return '';
    const items = roadmap?.[config.itemsKey];
    return (Array.isArray(items) ? items : []).find((item) => item.id === normalizedRef)?.title || '';
}

export function getRoadmapTaskFieldTasks(boardData: LooseBoardData | null | undefined, fieldName: RoadmapTaskField, refId: unknown): Task[] {
    const normalizedRef = normalizeRoadmapRef(refId);
    if (!normalizedRef) return [];
    const tasks = Array.isArray(boardData?.board?.tasks) ? boardData.board.tasks : [];
    const refs = fieldName === 'phaseId' ? phaseDescendants(getRoadmapExtension(boardData)?.phases || [], normalizedRef) : new Set([normalizedRef]);
    if (fieldName === 'sprintId' && boardData?.board) return sprintMembers(boardData as BoardData, normalizedRef);
    return tasks.filter((task) => task && refs.has(normalizeRoadmapRef(boardData?.board ? effectivePlanning(boardData as BoardData, task, fieldName as 'phaseId' | 'milestoneId') : task[fieldName])));
}

export function normalizeRoadmapItems(value: unknown, dateKeys: readonly RoadmapDateKey[], requiredDateKeys: readonly RoadmapDateKey[], allowParent = false, allowColor = false): RoadmapItem[] | null {
    if (!Array.isArray(value)) return null;
    const normalized: RoadmapItem[] = [];
    const seenIds = new Set<string>();
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const allowedKeys: string[] = ['id', 'title', ...dateKeys, ...(allowParent ? ['parentId'] : []), ...(allowColor ? ['color'] : [])];
        const keys = Object.keys(item);
        const hasRequiredKeys = typeof item.id === 'string' && item.id.trim()
            && typeof item.title === 'string' && item.title.trim();
        const hasOnlyAllowedKeys = keys.every((key) => allowedKeys.includes(key));
        if (!hasRequiredKeys || !hasOnlyAllowedKeys) return null;

        const id = item.id.trim();
        if (seenIds.has(id)) return null;
        seenIds.add(id);

        const normalizedItem: RoadmapItem = { id, title: item.title.trim() };
        if ('color' in item) {
            if (!allowColor || !isMilestoneColor(item.color)) return null;
            normalizedItem.color = item.color;
        }
        if ('parentId' in item) {
            if (!allowParent || typeof item.parentId !== 'string') return null;
            if (item.parentId.trim()) normalizedItem.parentId = item.parentId.trim();
        }

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

        if (requiredDateKeys.includes('startDate') && requiredDateKeys.includes('endDate')) {
            const start = parseRoadmapIsoDate(normalizedItem.startDate);
            const end = parseRoadmapIsoDate(normalizedItem.endDate);
            if (!start || !end || start > end) return null;
        }

        normalized.push(normalizedItem);
    }
    return normalized;
}

export function compareRoadmapItemsByDate(a: RoadmapItemLike, b: RoadmapItemLike): number {
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

export function getRoadmapAxisTicks(range: RangeLike, language: Language = 'en', width = 320): RoadmapTick[] {
    if (!range?.start || !range?.end) return [];
    const totalDays = Math.max(1, range.totalDays || getRoadmapDayDiff(range.start, range.end));
    const tickSpacing = totalDays > 732 ? 104 : 72;
    const tickCount = Math.min(Math.max(2, Math.floor(width / tickSpacing) + 1), totalDays + 1);
    const ticks: RoadmapTick[] = [];
    for (let index = 0; index < tickCount; index += 1) {
        const offsetDays = Math.round((totalDays * index) / Math.max(1, tickCount - 1));
        const date = addRoadmapDays(range.start, offsetDays);
        const label = totalDays > 732
            ? new Intl.DateTimeFormat(language === 'pt' ? 'pt-PT' : 'en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
            : formatRoadmapAxisDate(date, language);
        ticks.push({
            label,
            position: getRoadmapDatePosition(date, range)
        });
    }
    return ticks;
}

/** January boundaries on the shared date scale, spaced to keep year labels readable. */
export function getRoadmapYearTicks(range: RangeLike, width = Infinity): RoadmapTick[] {
    if (!range?.start || !range.end) return [];
    const ticks = [{ label: String(range.start.getUTCFullYear()), position: 0 }];
    for (let year = range.start.getUTCFullYear() + 1; year <= range.end.getUTCFullYear(); year++) {
        const date = new Date(range.start);
        date.setUTCFullYear(year, 0, 1);
        ticks.push({ label: String(year), position: getRoadmapDatePosition(date, range) });
    }
    const minimumGap = 56 / Math.max(1, width) * 100;
    const visible = [ticks[0]];
    const last = ticks[ticks.length - 1];
    for (const tick of ticks.slice(1, -1)) {
        if (tick.position - visible[visible.length - 1].position >= minimumGap && last.position - tick.position >= minimumGap) visible.push(tick);
    }
    if (ticks.length > 1 && last.position - visible[visible.length - 1].position >= minimumGap) visible.push(last);
    return visible;
}

export function getRoadmapTimelinePlacement(item: RoadmapItemLike, range: RangeLike): { left: number; width: number; point: number } | null {
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

export function getRoadmapTodayMarker(range: RangeLike): { iso: string; position: number } | null {
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

export function getVisibleRoadmapDateRange(roadmap: RoadmapExtension | null | undefined): RoadmapRange {
    const bounds = (['milestones', 'phases', 'sprints'] as const)
        .flatMap((kind) => {
            const items = roadmap?.[kind];
            return Array.isArray(items) ? items : [];
        })
        .map((item) => getRoadmapItemDateBounds(item))
        .filter((entry): entry is DateBounds => entry !== null);
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

export function normalizeRoadmapExtension(value: unknown): RoadmapExtension | null {
    if (!isRecord(value)) return null;
    if (![1, 2, 3, ROADMAP_VERSION].includes(Number(value.version))) return null;
    if (!hasExactKeys(value, ['version', 'milestones', 'phases', 'sprints'])) return null;

    const milestones = normalizeRoadmapItems(value.milestones, ['dueDate'], ['dueDate'], false, Number(value.version) >= 3);
    const phases = normalizeRoadmapItems(value.phases, ['startDate', 'endDate'], ['startDate', 'endDate'], true, Number(value.version) >= 4);
    const sprints = normalizeRoadmapItems(value.sprints, ['startDate', 'endDate'], ['startDate', 'endDate'], true);
    if (!milestones || !phases || !sprints) return null;
    try { recalculatePhaseDates(phases); } catch { return null; }

    return {
        version: ROADMAP_VERSION,
        milestones,
        phases,
        sprints
    };
}

export function clearInvalidRoadmapTaskRefs<T extends Partial<Record<RoadmapTaskField, string>>>(normalizedTask: T, roadmap: unknown): T {
    if (!normalizedTask || typeof normalizedTask !== 'object' || Array.isArray(normalizedTask)) return normalizedTask;
    const normalizedRoadmap = normalizeRoadmapExtension(roadmap);
    if (!normalizedRoadmap) return normalizedTask;

    const phaseIds = new Set(normalizedRoadmap.phases.map((phase) => phase.id));
    const milestoneIds = new Set(normalizedRoadmap.milestones.map((milestone) => milestone.id));
    const sprintIds = new Set(normalizedRoadmap.sprints.map((sprint) => sprint.id));

    if (normalizedTask.phaseId && !phaseIds.has(normalizedTask.phaseId)) {
        normalizedTask.phaseId = '';
    }
    if (normalizedTask.milestoneId && !milestoneIds.has(normalizedTask.milestoneId)) {
        normalizedTask.milestoneId = '';
    }
    if (normalizedTask.sprintId && !sprintIds.has(normalizedTask.sprintId)) {
        normalizedTask.sprintId = '';
    }
    return normalizedTask;
}

export function getRoadmapExtension(boardData: LooseBoardData | null | undefined): RoadmapExtension | null {
    return normalizeRoadmapExtension(boardData?.extensions?.[ROADMAP_EXTENSION_KEY]);
}

export function getRoadmapExtensionObject(boardData: LooseBoardData, options: { create: true }): RoadmapExtension;
export function getRoadmapExtensionObject(boardData: LooseBoardData | null | undefined, options?: { create?: boolean }): RoadmapExtension | null;
export function getRoadmapExtensionObject(boardData: LooseBoardData | null | undefined, options: { create?: boolean } = {}): RoadmapExtension | null {
    const create = Boolean(options.create);
    const extensions = getBoardExtensionsObject(boardData, { create });
    if (!extensions) return null;
    const normalized = normalizeRoadmapExtension(extensions[ROADMAP_EXTENSION_KEY]);
    if (normalized) {
        extensions[ROADMAP_EXTENSION_KEY] = normalized;
        return normalized;
    }
    if (!create) return null;
    const created = createEmptyRoadmapExtension();
    extensions[ROADMAP_EXTENSION_KEY] = created;
    return created;
}
