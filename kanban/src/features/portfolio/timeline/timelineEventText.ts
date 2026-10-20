// Timeline summaries are saved in the project file with fixed wording around
// user content ("Task updated: {title}"). This shows that wording in the
// selected language: it reads the names and numbers back out of the saved
// summary (written in any supported language) and re-renders the template.
// Summaries it does not recognise are shown as saved.

import type { TimelineEvent } from '@/domain/types';
import type { Language } from '@/shared/types/ui';
import { normalizeDayPlannerBlock } from '@/domain/dayPlanner';
import { LANGUAGE_CODES, formatPlannerDateLabel, translate, type TranslationKey } from '@/shared/i18n';

type Descriptor = {
    key: TranslationKey;
    // Placeholders whose saved value is itself translated wording.
    words?: Record<string, readonly TranslationKey[]>;
};

const ROADMAP_WORDS = {
    label: ['roadmap.milestone', 'roadmap.phase', 'roadmap.sprint'],
    action: ['roadmap.created', 'roadmap.updated', 'roadmap.deleted']
} as const;
const TASK_COUNT_WORDS = { tasks: ['common.task', 'common.tasks'] } as const;

const DESCRIPTORS: Record<string, readonly Descriptor[]> = {
    'board.baseline': [{ key: 'timeline.baselineCreated' }],
    'board.restored': [{ key: 'timeline.boardRestored' }],
    'task.created': [{ key: 'timeline.taskCreated' }],
    'task.deleted': [{ key: 'timeline.taskDeleted' }],
    'task.archived': [{ key: 'timeline.taskArchived' }],
    'task.restored': [{ key: 'timeline.taskRestored' }],
    'task.status.changed': [{ key: 'timeline.statusChanged' }],
    'task.updated': [{ key: 'timeline.taskUpdated' }],
    'task.relations.updated': [{ key: 'relations.event' }],
    'roadmap.updated': [{ key: 'roadmap.entityUpdatedSummary', words: ROADMAP_WORDS }],
    'roadmap.bulk-assigned': [
        { key: 'roadmap.sprintCreatedSummary', words: TASK_COUNT_WORDS },
        { key: 'roadmap.sprintAssignedSummary', words: TASK_COUNT_WORDS }
    ],
    'planner.block.added': [{ key: 'planner.eventAdded' }],
    'planner.block.moved': [{ key: 'planner.eventMoved' }],
    'planner.block.resized': [{ key: 'planner.eventResized' }],
    'planner.block.removed': [{ key: 'planner.eventRemoved' }]
};

const LANGUAGES = Object.keys(LANGUAGE_CODES) as Language[];
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Values of the template's placeholders in `summary`, or null when it does not
// fit. Every placeholder but the last matches as little as possible, so a
// title containing the template's own punctuation still parses.
function parseTemplate(template: string, summary: string): Record<string, string> | null {
    const parts = template.split(/\{(\w+)\}/);
    const names = parts.filter((_, index) => index % 2 === 1);
    const pattern = parts
        .map((part, index) => (index % 2 === 0
            ? escapeRegExp(part)
            : (index === parts.length - 2 ? '(.+)' : '(.+?)')))
        .join('');
    const match = new RegExp(`^${pattern}$`, 's').exec(summary);
    if (!match) return null;
    return Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
}

// Translated placeholder values re-rendered in `target`; null when a value is
// not that wording in `source`.
function translateWords(values: Record<string, string>, words: Descriptor['words'], source: Language, target: Language) {
    const next = { ...values };
    for (const [name, keys] of Object.entries(words || {})) {
        const key = keys.find((entry) => translate(source, entry) === values[name]);
        if (!key) return null;
        next[name] = translate(target, key);
    }
    return next;
}

// Planner dates and times are rebuilt from the stored block, so the date is
// formatted for the selected language too.
function plannerValues(event: TimelineEvent, language: Language): Record<string, string> {
    const change = event.changes?.block;
    const block = normalizeDayPlannerBlock(change?.after) || normalizeDayPlannerBlock(change?.before);
    if (!block) return {};
    return { date: formatPlannerDateLabel(language, block.date, 'medium'), start: block.start, end: block.end };
}

export function describeTimelineEvent(event: TimelineEvent | null | undefined, language: Language): string {
    if (!event) return '';
    for (const descriptor of DESCRIPTORS[event.kind] || []) {
        for (const source of LANGUAGES) {
            const parsed = parseTemplate(translate(source, descriptor.key), event.summary);
            const values = parsed && translateWords(parsed, descriptor.words, source, language);
            if (!values) continue;
            const extra = event.kind.startsWith('planner.block.') ? plannerValues(event, language) : {};
            return translate(language, descriptor.key, { ...values, ...extra });
        }
    }
    return event.summary;
}
