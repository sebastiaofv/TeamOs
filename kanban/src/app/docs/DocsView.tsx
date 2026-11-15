import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { Fragment, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { PaletteHelp } from '@/features/portfolio/palette/PaletteHelp';
import { ShortcutReference } from '@/app/overlays/ShortcutsDialog';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import {
    getDocs,
    locateTopic,
    parseInline,
    searchTopics,
    type CalloutTone,
    type DocBlock,
    type DocTopic
} from './docsModel';
import { DOCS_HEADING_ID, selectDocsTopic } from './docsMode';

type Navigate = (topicId: string) => void;

const CALLOUT_LABEL: Record<CalloutTone, TranslationKey> = {
    method: 'docs.callout.method',
    rule: 'docs.callout.rule',
    tip: 'docs.callout.tip',
    note: 'docs.callout.note'
};

function topicHref(topicId: string): string {
    return `#docs-${topicId}`;
}

// Links stay real anchors (keyboard, screen readers, copy link) but never
// change the address: filters are kept in the URL and must not be disturbed.
function TopicLink({ topicId, onNavigate, children, className }: { topicId: string; onNavigate: Navigate; children: ReactNode; className?: string }) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate(topicId);
    };
    return <a className={className || 'docs-link'} href={topicHref(topicId)} onClick={onClick}>{children}</a>;
}

function Inline({ text, onNavigate }: { text: string; onNavigate: Navigate }) {
    return parseInline(text).map((part, index) => {
        switch (part.kind) {
        case 'strong': return <strong key={index}>{part.text}</strong>;
        case 'code': return <code key={index}>{part.text}</code>;
        case 'kbd': return <kbd key={index}>{part.text}</kbd>;
        case 'link': return <TopicLink key={index} topicId={part.topicId} onNavigate={onNavigate}>{part.text}</TopicLink>;
        default: return <Fragment key={index}>{part.text}</Fragment>;
        }
    });
}

function Block({ block, onNavigate }: { block: DocBlock; onNavigate: Navigate }) {
    const { t } = useI18n();
    switch (block.kind) {
    case 'p':
        return <p className="docs-p"><Inline text={block.text} onNavigate={onNavigate} /></p>;
    case 'h':
        return <h2 className="docs-h2">{block.text}</h2>;
    case 'list':
        return <ul className="docs-list">{block.items.map((item, index) => <li key={index}><Inline text={item} onNavigate={onNavigate} /></li>)}</ul>;
    case 'steps':
        return <ol className="docs-steps">{block.items.map((item, index) => <li key={index}><Inline text={item} onNavigate={onNavigate} /></li>)}</ol>;
    case 'callout':
        return (
            <aside className={`docs-callout docs-callout-${block.tone}`}>
                <p className="docs-callout-title">{block.title || t(CALLOUT_LABEL[block.tone])}</p>
                <p><Inline text={block.text} onNavigate={onNavigate} /></p>
            </aside>
        );
    case 'table':
        return (
            <div className="docs-table-wrap" role="region" aria-label={block.head.join(' · ')} tabIndex={0}>
                <table className="docs-table">
                    <thead><tr>{block.head.map((cell, index) => <th scope="col" key={index}>{cell}</th>)}</tr></thead>
                    <tbody>
                        {block.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {row.map((cell, index) => index === 0
                                    ? <th scope="row" key={index}><Inline text={cell} onNavigate={onNavigate} /></th>
                                    : <td key={index}><Inline text={cell} onNavigate={onNavigate} /></td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    case 'terms':
        return (
            <dl className="docs-terms">
                {block.items.map(([term, definition]) => (
                    <div className="docs-term" key={term}>
                        <dt>{term}</dt>
                        <dd><Inline text={definition} onNavigate={onNavigate} /></dd>
                    </div>
                ))}
            </dl>
        );
    case 'paletteGuide':
        return <div className="docs-embed"><PaletteHelp /></div>;
    case 'shortcutReference':
        return <div className="docs-embed docs-shortcuts"><ShortcutReference /></div>;
    default:
        return null;
    }
}

function TopicArticle({ topic, onNavigate }: { topic: DocTopic; onNavigate: Navigate }) {
    const { t, language } = useI18n();
    const sections = getDocs(language);
    const { section, index, flat } = locateTopic(sections, topic.id);
    const sectionNumber = sections.indexOf(section) + 1;
    const previous = flat[index - 1];
    const next = flat[index + 1];
    const related = (topic.related || []).map((id) => flat.find((entry) => entry.id === id)).filter((entry): entry is DocTopic => Boolean(entry));

    return (
        <>
            <p className="docs-breadcrumb">
                <span className="docs-eyebrow">{t('docs.sectionLabel', { number: sectionNumber })}</span>
                <span aria-hidden="true"> · </span>
                <span>{section.title}</span>
            </p>
            <h1 className="docs-title" id={DOCS_HEADING_ID} tabIndex={-1}>{topic.title}</h1>
            <p className="docs-lead">{topic.summary}</p>
            <div className="docs-body">
                {topic.blocks.map((block, blockIndex) => <Block block={block} onNavigate={onNavigate} key={blockIndex} />)}
            </div>
            {related.length > 0 && (
                <section className="docs-related" aria-labelledby="docsRelatedTitle">
                    <h2 className="docs-related-title" id="docsRelatedTitle">{t('docs.related')}</h2>
                    <ul>
                        {related.map((entry) => (
                            <li key={entry.id}>
                                <TopicLink topicId={entry.id} onNavigate={onNavigate} className="docs-related-link">
                                    <span className="docs-related-name">{entry.title}</span>
                                    <span className="docs-related-summary">{entry.summary}</span>
                                </TopicLink>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <nav className="docs-pager" aria-label={t('docs.pagination')}>
                {previous ? (
                    <TopicLink topicId={previous.id} onNavigate={onNavigate} className="docs-pager-link docs-pager-prev">
                        <span className="docs-eyebrow"><WorkspaceIcon name="arrowLeft" size={14} /> {t('docs.previous')}</span>
                        <span>{previous.title}</span>
                    </TopicLink>
                ) : <span />}
                {next && (
                    <TopicLink topicId={next.id} onNavigate={onNavigate} className="docs-pager-link docs-pager-next">
                        <span className="docs-eyebrow">{t('docs.next')} <WorkspaceIcon name="arrowRight" size={14} /></span>
                        <span>{next.title}</span>
                    </TopicLink>
                )}
            </nav>
        </>
    );
}

function DocsContents({ activeTopicId, onNavigate }: { activeTopicId: string; onNavigate: Navigate }) {
    const { t, language } = useI18n();
    const sections = getDocs(language);
    const [query, setQuery] = useState('');
    const [expanded, setExpanded] = useState(false);
    const listId = useId();
    const matches = useMemo(() => searchTopics(sections, query), [sections, query]);
    const active = locateTopic(sections, activeTopicId);
    const visibleSections = sections
        .map((section, index) => ({ section, number: index + 1, topics: section.topics.filter((topic) => !matches || matches.has(topic.id)) }))
        .filter((entry) => entry.topics.length > 0);

    const navigate = (topicId: string) => {
        setExpanded(false);
        onNavigate(topicId);
    };

    return (
        <nav className={`docs-sidebar${expanded ? ' is-expanded' : ''}`} aria-label={t('docs.contents')}>
            <button
                className="btn docs-contents-toggle"
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((value) => !value)}
            >
                <span className="docs-eyebrow">{t('docs.contents')}</span>
                <span className="docs-contents-current">{active.topic.title}</span>
                <WorkspaceIcon name="chevronDown" className="docs-contents-chevron" />
            </button>
            <div className="docs-sidebar-panel" id={listId}>
                <div className="docs-search">
                    <WorkspaceIcon name="search" className="docs-search-icon" />
                    <input
                        type="search"
                        id="docsSearch"
                        value={query}
                        placeholder={t('docs.searchPlaceholder')}
                        aria-label={t('docs.search')}
                        onChange={(event) => setQuery(event.target.value)}
                    />
                </div>
                <p className="sr-only" aria-live="polite">{matches ? t('docs.resultCount', { count: matches.size }) : ''}</p>
                {visibleSections.length === 0 && <p className="docs-no-results">{t('docs.noResults', { query: query.trim() })}</p>}
                <ol className="docs-toc">
                    {visibleSections.map(({ section, number, topics }) => {
                        const headingId = `docs-toc-${section.id}`;
                        const current = section.id === active.section.id;
                        return (
                            <li className={`docs-toc-section${current ? ' is-current' : ''}`} key={section.id}>
                                <span className="docs-toc-heading" id={headingId}>
                                    <span className="docs-toc-number" aria-hidden="true">{String(number).padStart(2, '0')}</span>
                                    <span>{section.title}</span>
                                </span>
                                <ol aria-labelledby={headingId}>
                                    {topics.map((topic) => (
                                        <li key={topic.id}>
                                            <a
                                                className="docs-toc-link"
                                                href={topicHref(topic.id)}
                                                aria-current={topic.id === active.topic.id ? 'page' : undefined}
                                                onClick={(event) => {
                                                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                                                    event.preventDefault();
                                                    navigate(topic.id);
                                                }}
                                            >{topic.title}</a>
                                        </li>
                                    ))}
                                </ol>
                            </li>
                        );
                    })}
                </ol>
            </div>
        </nav>
    );
}

// The documentation page. It replaces the workspace in the main area while the
// header stays in place; it stays mounted while hidden so its scroll position
// and search survive a round trip to the workspace.
export function DocsView() {
    const open = useAppStore((state) => state.appMode === 'docs');
    const topicId = useAppStore((state) => state.docsTopicId);
    const { language } = useI18n();
    const sections = getDocs(language);
    const { topic } = locateTopic(sections, topicId);
    const articleRef = useRef<HTMLElement>(null);
    const focusAfterNavigate = useRef(false);

    useEffect(() => {
        const article = articleRef.current;
        if (!article) return;
        article.scrollTop = 0;
        if (!focusAfterNavigate.current) return;
        focusAfterNavigate.current = false;
        document.getElementById(DOCS_HEADING_ID)?.focus({ preventScroll: true });
    }, [topic.id]);

    const navigate = (nextTopicId: string) => {
        focusAfterNavigate.current = true;
        selectDocsTopic(nextTopicId);
    };

    return (
        <main className="docs-view" id="docsView" aria-labelledby={DOCS_HEADING_ID} hidden={!open}>
            <div className="docs-layout">
                <DocsContents activeTopicId={topic.id} onNavigate={navigate} />
                <article className="docs-article" ref={articleRef}>
                    <div className="docs-article-inner">
                        <TopicArticle topic={topic} onNavigate={navigate} />
                    </div>
                </article>
            </div>
        </main>
    );
}
