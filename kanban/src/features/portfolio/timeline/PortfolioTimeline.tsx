import { flushSync } from 'react-dom';
import type { PortfolioTimelineViewModel } from '@/features/portfolio/types';
import type { TimelineEvent } from '@/domain/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { PortfolioMutationActions } from '@/features/portfolio/commands/portfolioCommands';
import { formatDateTime } from '@/domain/calendar';
import { formatTimelineValue } from '@/domain/timeline';
import { useI18n } from '@/shared/i18n';
import { describeTimelineEvent } from './timelineEventText';

function commitTimelineSelection(
    setSelection: PortfolioMutationActions['setPortfolioTimelineSelection'],
    boardId: string,
    eventIndex: number
) {
    flushSync(() => setSelection(boardId, eventIndex));
}

function TimelineEventChanges({ event }: { event: TimelineEvent | null }) {
    const { t } = useI18n();
    const changeEntries = Object.entries(event?.changes || {});
    if (changeEntries.length === 0) {
        return (
            <div className="timeline-empty">
                {event?.snapshot
                    ? t('timeline.fullSnapshot')
                    : t('timeline.noDiff')}
            </div>
        );
    }

    return (
        <div className="timeline-diff-list">
            {changeEntries.map(([field, change]) => (
                <div className="timeline-diff-item" key={field}>
                    <div className="timeline-diff-field">{field}</div>
                    <div className="timeline-diff-values">
                        <div className="timeline-diff-box">
                            <div className="timeline-diff-label">{t('common.before')}</div>
                            <pre className="timeline-diff-value">{formatTimelineValue(change.before)}</pre>
                        </div>
                        <div className="timeline-diff-box">
                            <div className="timeline-diff-label">{t('common.after')}</div>
                            <pre className="timeline-diff-value">{formatTimelineValue(change.after)}</pre>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function TimelineEventList({ view, onSelect }: {
    view: PortfolioTimelineViewModel;
    onSelect: (boardId: string, eventIndex: number) => void;
}) {
    const { language } = useI18n();
    const events = Array.isArray(view.timeline?.events) ? view.timeline.events : [];
    return (
        <div role="listbox" aria-label={`${view.boardTitle} timeline events`}>
            {events.slice().reverse().map((event, indexFromEnd) => {
                const index = events.length - 1 - indexFromEnd;
                return (
                    <button
                        className={`timeline-event-item${index === view.selectedIndex ? ' active' : ''}`}
                        type="button"
                        role="option"
                        aria-selected={index === view.selectedIndex}
                        data-action="timeline-select-event"
                        data-board-id={view.boardId}
                        data-event-index={index}
                        key={event.id || `${view.boardId}:${index}`}
                        onClick={() => onSelect(view.boardId, index)}
                    >
                        <span className="timeline-event-kind">{event.kind}</span>
                        <span className="timeline-event-summary">{describeTimelineEvent(event, language)}</span>
                        <span className="timeline-event-time">{formatDateTime(event.at, language === 'pt' ? 'pt-PT' : undefined)}</span>
                    </button>
                );
            })}
        </div>
    );
}

function PortfolioTimelineView({ view, actions }: {
    view: PortfolioTimelineViewModel;
    actions: PortfolioMutationActions;
}) {
    const { language, t } = useI18n();
    const timeline = view.timeline;
    const isExpanded = Boolean(view.isExpanded);
    const locale = language === 'pt' ? 'pt-PT' : undefined;

    if (!timeline || timeline.events.length === 0) {
        return (
            <div className="timeline-panel-header">
                <div>
                    <h2 className="timeline-panel-title" id={`timeline-title-${view.boardId}`}>{t('roadmap.timeline')}</h2>
                    <div className="timeline-panel-subtitle" role="status" aria-live="polite">
                        {t('timeline.noEvents', { board: view.boardTitle })}
                    </div>
                </div>
            </div>
        );
    }

    const selectedEvent = view.selectedEvent;
    // A timeline with events always has a selected index.
    const selectedIndex = view.selectedIndex ?? 0;
    const latestIndex = timeline.events.length - 1;
    const latestEvent = timeline.events[latestIndex];
    const latestText = t('timeline.latestEvent', {
        summary: describeTimelineEvent(latestEvent, language) || t('timeline.timelineEvent'),
        date: formatDateTime(latestEvent?.at || '', locale)
    });
    const subtitleText = t(timeline.events.length === 1 ? 'timeline.summary' : 'timeline.summaryPlural', {
        board: view.boardTitle,
        count: timeline.events.length,
        latest: latestText
    });

    return (
        <>
            <div className="timeline-panel-header">
                <div className="timeline-header-summary">
                    <h2 className="timeline-panel-title" id={`timeline-title-${view.boardId}`}>{t('roadmap.timeline')}</h2>
                    <div className="timeline-panel-subtitle" role="status" aria-live="polite" title={subtitleText}>{subtitleText}</div>
                </div>
                <div className="timeline-panel-actions">
                    <div className={`timeline-preview-banner${view.isPreview ? ' active' : ''}`} role="status" aria-live="polite">{t('timeline.historicalPreview')}</div>
                    <button
                        className="btn timeline-toggle-btn"
                        type="button"
                        data-action="timeline-toggle-expanded"
                        data-board-id={view.boardId}
                        aria-expanded={isExpanded}
                        aria-controls={`timeline-body-${view.boardId}`}
                        aria-label={isExpanded ? t('timeline.collapse', { board: view.boardTitle }) : t('timeline.expand', { board: view.boardTitle })}
                        onClick={() => actions.setPortfolioTimelineExpanded(view.boardId, !isExpanded)}
                    >
                        {isExpanded ? t('common.collapse') : t('common.expand')}
                    </button>
                </div>
            </div>
            <div className="timeline-controls">
                {isExpanded && (
                    <div className="timeline-summary-row">
                        <span className="timeline-pill">{formatDateTime(selectedEvent?.at || '', locale)}</span>
                        <span className="timeline-pill">{t('timeline.event', { current: selectedIndex + 1, total: timeline.events.length })}</span>
                        <span className="timeline-pill">{selectedEvent?.kind || ''}</span>
                        {!view.hasHandle && <span className="timeline-pill">{t('common.readOnlyProject')}</span>}
                    </div>
                )}
                <div className="timeline-slider-row">
                    <label className="sr-only" htmlFor={`timeline-slider-${view.boardId}`}>{t('timeline.sliderLabel', { board: view.boardTitle })}</label>
                    <input
                        id={`timeline-slider-${view.boardId}`}
                        className="timeline-slider"
                        type="range"
                        min="0"
                        max={latestIndex}
                        step="1"
                        value={selectedIndex}
                        data-action="timeline-slider"
                        data-board-id={view.boardId}
                        aria-valuetext={t('timeline.selectedEvent', {
                            summary: describeTimelineEvent(selectedEvent, language) || t('timeline.timelineEvent'),
                            date: formatDateTime(selectedEvent?.at || '', locale)
                        })}
                        onInput={(event) => commitTimelineSelection(
                            actions.setPortfolioTimelineSelection,
                            view.boardId,
                            Number(event.currentTarget.value)
                        )}
                    />
                    <button
                        className="btn"
                        type="button"
                        data-action="timeline-latest"
                        data-board-id={view.boardId}
                        onClick={() => actions.movePortfolioTimelineToLatest(view.boardId)}
                    >
                        {t('common.latest')}
                    </button>
                    {view.hasHandle && (
                        <button
                            className="btn btn-primary"
                            type="button"
                            data-action="timeline-restore"
                            onClick={() => actions.restorePortfolioTimelineSelection()}
                        >
                            {t('timeline.restoreState')}
                        </button>
                    )}
                </div>
            </div>
            <div className="timeline-body" id={`timeline-body-${view.boardId}`}>
                <div className="timeline-event-list">
                    <TimelineEventList
                        view={view}
                        onSelect={(boardId, eventIndex) => commitTimelineSelection(
                            actions.setPortfolioTimelineSelection,
                            boardId,
                            eventIndex
                        )}
                    />
                </div>
                <div className="timeline-event-detail" aria-live="polite" aria-atomic="true">
                    <div className="timeline-event-detail-title">{describeTimelineEvent(selectedEvent, language) || t('timeline.timelineEvent')}</div>
                    <TimelineEventChanges event={selectedEvent} />
                </div>
            </div>
        </>
    );
}

export function PortfolioTimeline() {
    const actions = usePortfolioActions();
    const view = useAppStore((state) => state.portfolioTimelineView);
    const boardId = view?.boardId || '';
    const className = boardId
        ? `timeline-panel active${view?.isExpanded ? '' : ' collapsed'}`
        : 'timeline-panel';

    return (
        <div className={className} id="portfolioTimelinePanel" data-board-id={boardId}>
            {view && <PortfolioTimelineView view={view} actions={actions} />}
        </div>
    );
}
