// The in-app documentation: a fixed outline of sections and topics, written
// once per supported language. Text uses a small inline markup (see
// parseInline) so content files stay readable and free of JSX.

import type { Language } from '@/shared/types/ui';
import type { PortfolioViewMode } from '@/features/portfolio/types';
import { DOCS_EN } from './content/en';
import { DOCS_PT } from './content/pt';

// A callout states what kind of guidance it carries, so methodology advice is
// never confused with a rule the application actually enforces.
export type CalloutTone = 'method' | 'rule' | 'tip' | 'note';

export type DocBlock =
    | { kind: 'p'; text: string }
    | { kind: 'h'; text: string }
    | { kind: 'list'; items: string[] }
    | { kind: 'steps'; items: string[] }
    | { kind: 'callout'; tone: CalloutTone; text: string; title?: string }
    | { kind: 'table'; head: string[]; rows: string[][] }
    | { kind: 'terms'; items: [term: string, definition: string][] }
    // Live references rendered from the app itself, so they never drift.
    | { kind: 'paletteGuide' }
    | { kind: 'shortcutReference' };

export type DocTopic = {
    id: string;
    title: string;
    summary: string;
    blocks: DocBlock[];
    related?: string[];
};

export type DocSection = {
    id: string;
    title: string;
    topics: DocTopic[];
};

export const DEFAULT_DOCS_TOPIC = 'start-what';
export const PALETTE_DOCS_TOPIC = 'prod-palette';

// The topic that explains each workspace view, for contextual help.
export const VIEW_DOCS_TOPIC: Record<PortfolioViewMode, string> = {
    board: 'wf-board',
    table: 'views-table',
    roadmap: 'plan-roadmap',
    calendar: 'plan-calendar',
    planner: 'plan-day',
    dashboard: 'views-dashboard',
    control: 'views-control'
};

const DOCS: Record<Language, DocSection[]> = { en: DOCS_EN, pt: DOCS_PT };

export function getDocs(language: Language): DocSection[] {
    return DOCS[language] || DOCS_EN;
}

export type TopicLocation = { section: DocSection; topic: DocTopic; index: number; flat: DocTopic[] };

export function flattenTopics(sections: DocSection[]): DocTopic[] {
    return sections.flatMap((section) => section.topics);
}

// Unknown ids fall back to the first topic, so a stale id never shows a blank page.
export function locateTopic(sections: DocSection[], topicId: string): TopicLocation {
    const flat = flattenTopics(sections);
    let index = flat.findIndex((topic) => topic.id === topicId);
    if (index < 0) index = 0;
    const topic = flat[index];
    const section = sections.find((entry) => entry.topics.includes(topic)) || sections[0];
    return { section, topic, index, flat };
}

export function isDocsTopic(topicId: string): boolean {
    return flattenTopics(DOCS_EN).some((topic) => topic.id === topicId);
}

// Inline markup: **bold**, `code`, [[Key]] for a keyboard key and
// [label](topic-id) for a link to another topic.
export type InlinePart =
    | { kind: 'text'; text: string }
    | { kind: 'strong'; text: string }
    | { kind: 'code'; text: string }
    | { kind: 'kbd'; text: string }
    | { kind: 'link'; text: string; topicId: string };

const INLINE_PATTERN = /\*\*([^*]+)\*\*|`([^`]+)`|\[\[([^\]]+)\]\]|\[([^\]]+)\]\(([a-z0-9-]+)\)/g;

export function parseInline(text: string): InlinePart[] {
    const parts: InlinePart[] = [];
    let last = 0;
    for (const match of text.matchAll(INLINE_PATTERN)) {
        const start = match.index ?? 0;
        if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
        if (match[1] !== undefined) parts.push({ kind: 'strong', text: match[1] });
        else if (match[2] !== undefined) parts.push({ kind: 'code', text: match[2] });
        else if (match[3] !== undefined) parts.push({ kind: 'kbd', text: match[3] });
        else parts.push({ kind: 'link', text: match[4], topicId: match[5] });
        last = start + match[0].length;
    }
    if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
    return parts;
}

function plainText(text: string): string {
    return parseInline(text).map((part) => part.text).join('');
}

function blockText(block: DocBlock): string {
    switch (block.kind) {
    case 'p':
    case 'h': return block.text;
    case 'list':
    case 'steps': return block.items.join(' ');
    case 'callout': return `${block.title || ''} ${block.text}`;
    case 'table': return [...block.head, ...block.rows.flat()].join(' ');
    case 'terms': return block.items.flat().join(' ');
    default: return '';
    }
}

function normalize(text: string): string {
    return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Topics whose title, summary or text contain every word of the query.
export function searchTopics(sections: DocSection[], query: string): Set<string> | null {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    const matches = new Set<string>();
    for (const topic of flattenTopics(sections)) {
        const haystack = normalize(plainText([topic.title, topic.summary, ...topic.blocks.map(blockText)].join(' ')));
        if (words.every((word) => haystack.includes(word))) matches.add(topic.id);
    }
    return matches;
}

// Every [label](topic-id) link and related id, for consistency checks.
export function topicReferences(topic: DocTopic): string[] {
    const texts = [topic.summary, ...topic.blocks.map(blockText)];
    const links = texts.flatMap((text) => parseInline(text).flatMap((part) => part.kind === 'link' ? [part.topicId] : []));
    return [...links, ...(topic.related || [])];
}
