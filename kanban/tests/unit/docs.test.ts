import { beforeEach, describe, expect, it } from 'vitest';
import {
    DEFAULT_DOCS_TOPIC,
    PALETTE_DOCS_TOPIC,
    VIEW_DOCS_TOPIC,
    flattenTopics,
    getDocs,
    locateTopic,
    parseInline,
    searchTopics,
    topicReferences
} from '../../src/app/docs/docsModel';
import { closeDocs, openDocs, openDocsForCurrentView, selectDocsTopic, toggleDocs } from '../../src/app/docs/docsMode';
import { useAppStore } from '../../src/features/portfolio/state/store';
import { openDialog } from '../../src/app/overlays/dialogs';
import { fromAny } from '@total-typescript/shoehorn';
import { createEmptyProjectData } from '../../src/domain/board';
import type { BoardRecord } from '../../src/features/portfolio/types';

const project = (id: string): BoardRecord => fromAny({ id, colorSeed: 0, handle: {}, fileName: `${id}.board.json`, title: id, data: createEmptyProjectData(id) });

const outline = (language: 'en' | 'pt') => getDocs(language).map((section) => [section.id, section.topics.map((topic) => topic.id)]);

describe('documentation content', () => {
    it('has the same outline in every language', () => {
        expect(outline('pt')).toEqual(outline('en'));
    });

    it('has unique topic ids and non-empty topics', () => {
        for (const language of ['en', 'pt'] as const) {
            const topics = flattenTopics(getDocs(language));
            expect(new Set(topics.map((topic) => topic.id)).size).toBe(topics.length);
            for (const topic of topics) {
                expect(topic.title.trim(), topic.id).not.toBe('');
                expect(topic.summary.trim(), topic.id).not.toBe('');
                expect(topic.blocks.length, topic.id).toBeGreaterThan(0);
            }
        }
    });

    it('links only to existing topics', () => {
        for (const language of ['en', 'pt'] as const) {
            const topics = flattenTopics(getDocs(language));
            const ids = new Set(topics.map((topic) => topic.id));
            for (const topic of topics) {
                for (const reference of topicReferences(topic)) expect(ids.has(reference), `${language}:${topic.id} → ${reference}`).toBe(true);
            }
        }
    });

    it('covers every workspace view and the special entry points', () => {
        const ids = new Set(flattenTopics(getDocs('en')).map((topic) => topic.id));
        for (const topicId of [DEFAULT_DOCS_TOPIC, PALETTE_DOCS_TOPIC, ...Object.values(VIEW_DOCS_TOPIC)]) expect(ids.has(topicId)).toBe(true);
    });

    it('includes the methodology section and an end-to-end example', () => {
        const sections = getDocs('en').map((section) => section.id);
        expect(sections).toEqual(['start', 'agile', 'projects', 'workitems', 'workflows', 'planning', 'views', 'files', 'productivity', 'example']);
        expect(locateTopic(getDocs('en'), 'ex-walkthrough').section.id).toBe('example');
    });
});

describe('parseInline', () => {
    it('parses bold, code, keys and topic links', () => {
        expect(parseInline('Press [[H]] or see **Board** in `x` and [Sprints](plan-sprints).')).toEqual([
            { kind: 'text', text: 'Press ' },
            { kind: 'kbd', text: 'H' },
            { kind: 'text', text: ' or see ' },
            { kind: 'strong', text: 'Board' },
            { kind: 'text', text: ' in ' },
            { kind: 'code', text: 'x' },
            { kind: 'text', text: ' and ' },
            { kind: 'link', text: 'Sprints', topicId: 'plan-sprints' },
            { kind: 'text', text: '.' }
        ]);
    });
});

describe('searchTopics', () => {
    it('returns null for an empty query', () => {
        expect(searchTopics(getDocs('en'), '  ')).toBeNull();
    });

    it('matches every word, ignoring case and accents', () => {
        const matches = searchTopics(getDocs('pt'), 'ACEITACAO funcional');
        expect(matches?.has('wi-acceptance')).toBe(true);
        expect(searchTopics(getDocs('en'), 'zzzz-no-such-word')?.size).toBe(0);
    });
});

describe('locateTopic', () => {
    it('falls back to the first topic for unknown ids', () => {
        expect(locateTopic(getDocs('en'), 'missing').topic.id).toBe(DEFAULT_DOCS_TOPIC);
    });
});

describe('documentation mode', () => {
    beforeEach(() => {
        useAppStore.setState({ appMode: 'workspace', docsTopicId: '', activeDialog: null, dialogProps: null, selectedPortfolioViewMode: 'board', selectedPortfolioBoardId: '', portfolioBoards: [] });
    });

    it('toggles between workspace and documentation without touching workspace state', () => {
        useAppStore.setState({ portfolioBoards: [project('web')], selectedPortfolioBoardId: 'web', selectedPortfolioViewMode: 'table' });
        toggleDocs();
        expect(useAppStore.getState().appMode).toBe('docs');
        expect(useAppStore.getState().docsTopicId).toBe(DEFAULT_DOCS_TOPIC);
        toggleDocs();
        expect(useAppStore.getState().appMode).toBe('workspace');
        expect(useAppStore.getState().selectedPortfolioViewMode).toBe('table');
        expect(useAppStore.getState().selectedPortfolioBoardId).toBe('web');
    });

    it('reopens the last topic read', () => {
        openDocs();
        selectDocsTopic('plan-sprints');
        closeDocs();
        openDocs();
        expect(useAppStore.getState().docsTopicId).toBe('plan-sprints');
    });

    it('opens a requested topic, ignoring unknown ids, and closes open dialogs', () => {
        openDialog('shortcuts');
        openDocs(PALETTE_DOCS_TOPIC);
        expect(useAppStore.getState().activeDialog).toBeNull();
        expect(useAppStore.getState().docsTopicId).toBe(PALETTE_DOCS_TOPIC);
        selectDocsTopic('missing');
        expect(useAppStore.getState().docsTopicId).toBe(PALETTE_DOCS_TOPIC);
    });

    it('opens the topic for the current view, or getting started without projects', () => {
        openDocsForCurrentView();
        expect(useAppStore.getState().docsTopicId).toBe('start-first-project');
        useAppStore.setState({ portfolioBoards: [project('web')], selectedPortfolioBoardId: 'web', selectedPortfolioViewMode: 'roadmap' });
        openDocsForCurrentView();
        expect(useAppStore.getState().docsTopicId).toBe(VIEW_DOCS_TOPIC.roadmap);
    });
});
