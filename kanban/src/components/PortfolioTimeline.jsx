import { createPortal } from 'react-dom';
import { flushSync } from 'react-dom';
import { useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../state/store.js';
import {
    beginPortfolioTimelineSliderDrag,
    movePortfolioTimelineToLatest,
    restorePortfolioTimelineSelection,
    setPortfolioTimelineExpanded,
    setPortfolioTimelineSelection
} from '../actions/legacyHost.js';
import { formatDateTime } from '../domain/calendar.js';
import { formatTimelineValue } from '../domain/timeline.js';

function commitTimelineSelection(boardId, eventIndex) {
    flushSync(() => setPortfolioTimelineSelection(boardId, eventIndex));
}

function TimelineEventChanges({ event }) {
    const changeEntries = Object.entries(event?.changes || {});
    if (changeEntries.length === 0) {
        return (
            <div className="timeline-empty">
                {event?.snapshot
                    ? 'This event stores a full snapshot for replay/restoration.'
                    : 'No field diff stored for this event.'}
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
                            <div className="timeline-diff-label">Before</div>
                            <pre className="timeline-diff-value">{formatTimelineValue(change.before)}</pre>
                        </div>
                        <div className="timeline-diff-box">
                            <div className="timeline-diff-label">After</div>
                            <pre className="timeline-diff-value">{formatTimelineValue(change.after)}</pre>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function TimelineEventList({ view }) {
    const events = Array.isArray(view.timeline?.events) ? view.timeline.events : [];
    return (
        <>
            {events.slice().reverse().map((event, indexFromEnd) => {
                const index = events.length - 1 - indexFromEnd;
                return (
                    <button
                        className={`timeline-event-item${index === view.selectedIndex ? ' active' : ''}`}
                        type="button"
                        data-action="timeline-select-event"
                        data-board-id={view.boardId}
                        data-event-index={index}
                        key={event.id || `${view.boardId}:${index}`}
                        onClick={() => commitTimelineSelection(view.boardId, index)}
                    >
                        <span className="timeline-event-kind">{event.kind}</span>
                        <span className="timeline-event-summary">{event.summary}</span>
                        <span className="timeline-event-time">{formatDateTime(event.at)}</span>
                    </button>
                );
            })}
        </>
    );
}

function PortfolioTimelineView({ view, scrollTopByBoardId }) {
    const eventListRef = useRef(null);
    const timeline = view.timeline;
    const isExpanded = Boolean(view.isExpanded);

    useLayoutEffect(() => {
        const list = eventListRef.current;
        if (!list) return;
        const scrollTop = scrollTopByBoardId?.[view.boardId];
        if (Number.isFinite(scrollTop)) {
            list.scrollTop = scrollTop;
        }
    }, [view.boardId, view.selectedIndex, timeline?.events?.length, isExpanded, scrollTopByBoardId]);

    if (!timeline || timeline.events.length === 0) {
        return (
            <div className="timeline-panel-header">
                <div>
                    <div className="timeline-panel-title">Timeline</div>
                    <div className="timeline-panel-subtitle">
                        {view.boardTitle} does not have tracked events yet. The timeline starts on the first saved change.
                    </div>
                </div>
            </div>
        );
    }

    const selectedEvent = view.selectedEvent;
    const latestIndex = timeline.events.length - 1;
    const latestEvent = timeline.events[latestIndex];
    const subtitleText = `${view.boardTitle} has ${timeline.events.length} tracked event${timeline.events.length === 1 ? '' : 's'}. Latest event: ${latestEvent?.summary || 'Unknown event'} at ${formatDateTime(latestEvent?.at || '')}.`;

    return (
        <>
            <div className="timeline-panel-header">
                <div>
                    <div className="timeline-panel-title">Timeline</div>
                    <div className="timeline-panel-subtitle">{subtitleText}</div>
                </div>
                <div className="timeline-panel-actions">
                    <div className={`timeline-preview-banner${view.isPreview ? ' active' : ''}`}>Historical preview active</div>
                    <button
                        className="btn timeline-toggle-btn"
                        type="button"
                        data-action="timeline-toggle-expanded"
                        data-board-id={view.boardId}
                        onClick={() => setPortfolioTimelineExpanded(view.boardId, !isExpanded)}
                    >
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                </div>
            </div>
            <div className="timeline-controls">
                {isExpanded && (
                    <div className="timeline-summary-row">
                        <span className="timeline-pill">{formatDateTime(selectedEvent?.at || '')}</span>
                        <span className="timeline-pill">Event {view.selectedIndex + 1} / {timeline.events.length}</span>
                        <span className="timeline-pill">{selectedEvent?.kind || ''}</span>
                        {!view.hasHandle && <span className="timeline-pill">Read-only project</span>}
                    </div>
                )}
                <div className="timeline-slider-row">
                    <input
                        className="timeline-slider"
                        type="range"
                        min="0"
                        max={latestIndex}
                        step="1"
                        value={view.selectedIndex}
                        data-action="timeline-slider"
                        data-board-id={view.boardId}
                        onPointerDown={() => beginPortfolioTimelineSliderDrag(view.boardId)}
                        onInput={(event) => commitTimelineSelection(view.boardId, Number(event.currentTarget.value))}
                    />
                    <button
                        className="btn"
                        type="button"
                        data-action="timeline-latest"
                        data-board-id={view.boardId}
                        onClick={() => movePortfolioTimelineToLatest(view.boardId)}
                    >
                        Latest
                    </button>
                    {view.hasHandle && (
                        <button
                            className="btn btn-primary"
                            type="button"
                            data-action="timeline-restore"
                            onClick={() => restorePortfolioTimelineSelection()}
                        >
                            Restore this state
                        </button>
                    )}
                </div>
            </div>
            <div className="timeline-body">
                <div ref={eventListRef} className="timeline-event-list">
                    <TimelineEventList view={view} />
                </div>
                <div className="timeline-event-detail">
                    <div className="timeline-event-detail-title">{selectedEvent?.summary || 'Timeline event'}</div>
                    <TimelineEventChanges event={selectedEvent} />
                </div>
            </div>
        </>
    );
}

export function PortfolioTimeline() {
    const state = useAppStore((current) => current);
    const panel = document.getElementById('portfolioTimelinePanel');
    const view = state.portfolioTimelineView;
    const boardId = view?.boardId || '';
    const isExpanded = Boolean(view?.isExpanded);

    useLayoutEffect(() => {
        if (!panel) return;
        panel.dataset.boardId = boardId;
        panel.className = boardId
            ? `timeline-panel active${isExpanded ? '' : ' collapsed'}`
            : 'timeline-panel';
    }, [panel, boardId, isExpanded]);

    if (!panel) return null;
    return createPortal(
        view
            ? <PortfolioTimelineView view={view} scrollTopByBoardId={state.portfolioTimelineListScrollTopByBoardId} />
            : null,
        panel
    );
}
