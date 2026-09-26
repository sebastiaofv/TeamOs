// Parses the palette's quick-create line:
//   + <title> @person !priority #tag ~effort due:<when> in:<project>
// Tokens that are not recognised stay in the title.

import type { Effort, Priority } from '@/domain/types';
import { EFFORT_BUCKETS } from '@/domain/constants';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { shiftPlannerDate } from '@/domain/dayPlanner';

export type QuickCreateContext = {
    people: readonly string[];
    projects: readonly { id: string; title: string }[];
    defaultProjectId: string;
    // Local YYYY-MM-DD.
    today: string;
};

export type QuickCreateWarning =
    | { kind: 'newPerson'; value: string }
    | { kind: 'unknownProject'; value: string }
    | { kind: 'unknownDate'; value: string };

export type QuickCreateDraft = {
    title: string;
    assignees: string[];
    priority: Priority | null;
    tags: string[];
    effort: Effort | null;
    dueDate: string;
    projectId: string;
    warnings: QuickCreateWarning[];
};

const PRIORITIES: Record<string, Priority> = {
    h: 'high', high: 'high', m: 'medium', med: 'medium', medium: 'medium', l: 'low', low: 'low'
};
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const compact = (value: string) => value.toLowerCase().replace(/\s+/g, '');

// today, tomorrow, a weekday (the next one, today included) or YYYY-MM-DD.
function resolveDueDate(value: string, today: string): string {
    const word = value.toLowerCase();
    if (word === 'today') return today;
    if (word === 'tomorrow') return shiftPlannerDate(today, 1);
    if (parseRoadmapIsoDate(value)) return value;
    const weekday = word.length >= 3 ? WEEKDAYS.findIndex((name) => name.startsWith(word)) : -1;
    const todayDate = parseRoadmapIsoDate(today);
    if (weekday < 0 || !todayDate) return '';
    return shiftPlannerDate(today, (weekday - todayDate.getUTCDay() + 7) % 7);
}

function findPerson(people: readonly string[], value: string): string | null {
    const needle = value.toLowerCase();
    return people.find((name) => name.toLowerCase() === needle)
        || people.find((name) => name.toLowerCase().startsWith(needle))
        || null;
}

function findProject(projects: QuickCreateContext['projects'], value: string): string | null {
    const needle = compact(value);
    const match = projects.find((project) => compact(project.title).startsWith(needle))
        || projects.find((project) => compact(project.title).includes(needle));
    return match ? match.id : null;
}

export function parseQuickCreate(input: string, context: QuickCreateContext): QuickCreateDraft {
    const draft: QuickCreateDraft = {
        title: '', assignees: [], priority: null, tags: [], effort: null, dueDate: '',
        projectId: context.defaultProjectId, warnings: []
    };
    const titleWords: string[] = [];
    input.replace(/^\s*\+\s*/, '').split(/\s+/).filter(Boolean).forEach((token) => {
        let match: RegExpExecArray | null;
        if ((match = /^@([\p{L}\p{N}._-]+)$/u.exec(token))) {
            const person = findPerson(context.people, match[1]);
            if (!person) draft.warnings.push({ kind: 'newPerson', value: match[1] });
            const name = person || match[1];
            if (!draft.assignees.some((existing) => existing.toLowerCase() === name.toLowerCase())) draft.assignees.push(name);
        } else if ((match = /^!([a-z]+)$/i.exec(token)) && PRIORITIES[match[1].toLowerCase()]) {
            draft.priority = PRIORITIES[match[1].toLowerCase()];
        } else if ((match = /^#([\p{L}\p{N}_-]+)$/u.exec(token))) {
            if (!draft.tags.includes(match[1])) draft.tags.push(match[1]);
        } else if ((match = /^~([a-z]+)$/i.exec(token)) && (EFFORT_BUCKETS as readonly string[]).includes(match[1].toUpperCase())) {
            draft.effort = match[1].toUpperCase() as Effort;
        } else if ((match = /^due:(\S+)$/i.exec(token))) {
            draft.dueDate = resolveDueDate(match[1], context.today);
            if (!draft.dueDate) draft.warnings.push({ kind: 'unknownDate', value: match[1] });
        } else if ((match = /^in:(\S+)$/i.exec(token))) {
            const projectId = findProject(context.projects, match[1]);
            if (projectId) draft.projectId = projectId;
            else draft.warnings.push({ kind: 'unknownProject', value: match[1] });
        } else {
            titleWords.push(token);
        }
    });
    draft.title = titleWords.join(' ');
    return draft;
}
