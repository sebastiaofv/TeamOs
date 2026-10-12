// Parses the palette's quick-create line:
//   + <title> @person !priority #tag ~effort due:<when> in:<project>
// Tokens that are not recognised stay in the title.

import type { Effort, Priority } from '@/domain/types';
import { EFFORT_BUCKETS } from '@/domain/constants';
import { parseRoadmapIsoDate } from '@/domain/roadmap';
import { shiftPlannerDate } from '@/domain/dayPlanner';
import { normalizeAssignees } from '@/domain/task';

export type QuickCreateContext = {
    peopleForProject: (projectId: string) => readonly string[];
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
    ambiguousAssignees: QuickCreateAssigneeChoice[];
};

export type QuickCreateAssigneeChoice = {
    value: string;
    candidates: string[];
    start: number;
    end: number;
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

function findPeople(people: readonly string[], value: string): string[] {
    const needle = value.toLowerCase();
    const unique = normalizeAssignees(people);
    const exact = unique.find((name) => name.toLowerCase() === needle);
    return exact ? [exact] : unique.filter((name) => name.toLowerCase().startsWith(needle));
}

// Quoting keeps names containing spaces in a single @ token after a choice.
export function chooseQuickCreateAssignee(input: string, choice: QuickCreateAssigneeChoice, name: string): string {
    const token = /^[\p{L}\p{N}._-]+$/u.test(name) ? `@${name}` : `@${JSON.stringify(name)}`;
    return input.slice(0, choice.start) + token + input.slice(choice.end);
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
        projectId: context.defaultProjectId, warnings: [], ambiguousAssignees: []
    };
    const body = input.replace(/^\s*\+\s*/, '');
    const offset = input.length - body.length;
    const tokens = [...body.matchAll(/@"(?:\\.|[^"\\])*"(?=\s|$)|\S+/g)];
    // Resolve the final destination before any person, regardless of token order.
    tokens.forEach(([token]) => {
        const match = /^in:(\S+)$/i.exec(token);
        const projectId = match ? findProject(context.projects, match[1]) : null;
        if (projectId) draft.projectId = projectId;
    });
    const people = context.peopleForProject(draft.projectId);
    const titleWords: string[] = [];
    tokens.forEach((tokenMatch) => {
        const token = tokenMatch[0];
        let match: RegExpExecArray | null;
        if ((match = /^@([\p{L}\p{N}._-]+|"(?:\\.|[^"\\])*")$/u.exec(token))) {
            let value: string;
            try {
                value = match[1].startsWith('"') ? JSON.parse(match[1]) : match[1];
            } catch {
                titleWords.push(token);
                return;
            }
            if (!value.trim()) {
                titleWords.push(token);
                return;
            }
            const candidates = findPeople(people, value);
            if (candidates.length > 1) {
                draft.ambiguousAssignees.push({ value, candidates, start: offset + tokenMatch.index, end: offset + tokenMatch.index + token.length });
                return;
            }
            if (!candidates.length) draft.warnings.push({ kind: 'newPerson', value });
            const name = candidates[0] || value;
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
            if (!projectId) draft.warnings.push({ kind: 'unknownProject', value: match[1] });
        } else {
            titleWords.push(token);
        }
    });
    draft.title = titleWords.join(' ');
    return draft;
}
