import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import {
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    pointerWithin,
    useSensor,
    useSensors,
    type Active,
    type DragEndEvent,
    type DragMoveEvent
} from '@dnd-kit/core';
import { useShallow } from 'zustand/react/shallow';
import type { TaskStatus } from '@/domain/types';
import {
    PLANNER_DEFAULT_BLOCK_MINUTES,
    PLANNER_SLOT_MINUTES,
    PLANNER_WORK_START,
    applyPlannerGesture,
    clampPlannerStart,
    formatPlannerDuration,
    minutesAtPlannerOffset,
    plannerMinutes
} from '@/domain/dayPlanner';
import { todayLocalIsoDate } from '@/domain/util';
import { useAppStore } from '@/features/portfolio/state/store';
import {
    buildPortfolioPlannerViewModel,
    type PlannerBlockView,
    type PlannerTrayItem,
    type PlannerViewModel
} from '@/features/portfolio/queries';
import {
    setPortfolioPlannerMode,
    shiftPortfolioPlannerDate,
    showPortfolioPlannerToday
} from '@/features/portfolio/commands/portfolioControls';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { formatPlannerDateLabel, useI18n } from '@/shared/i18n';
import { PLANNER_SLOT_PX } from './plannerGeometry';
import { PlannerBlock, type PlannerBlockHandlers } from './PlannerBlock';
import { PlannerGrid, type PlannerDropPreview } from './PlannerGrid';
import { PlannerTray, PlannerTrayCardBody, trayDragId } from './PlannerTray';
import { usePlannerBlockGesture, type PlannerGestureDraft } from './usePlannerBlockGesture';

const DEFAULT_TRAY_STATUSES: TaskStatus[] = ['to-do', 'doing'];

type TrayDragData = { boardId: string; taskId: number; title: string };

// Re-renders once a minute so the "now" line and today's date stay current.
function useNow(): Date {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);
    return now;
}

// The slot under the pointer in the hovered day column. dnd-kit's drag delta
// is scroll-adjusted, so the live pointer position is tracked instead; keyboard
// drags have none and use the dragged card's position.
function dropStartMinutes(pointerY: number | null, active: Active, date: string): number {
    const column = document.querySelector<HTMLElement>(`.planner-day[data-planner-date="${date}"]`);
    const y = pointerY ?? active.rect.current.translated?.top ?? null;
    if (y === null || !column) return PLANNER_WORK_START;
    const offset = y - column.getBoundingClientRect().top;
    return clampPlannerStart(minutesAtPlannerOffset(offset, PLANNER_SLOT_PX), PLANNER_DEFAULT_BLOCK_MINUTES);
}

// The pointer's clientY while a tray card is dragged by mouse or touch.
function usePointerY() {
    const pointerY = useRef<number | null>(null);
    const stop = useRef<(() => void) | null>(null);
    useEffect(() => () => stop.current?.(), []);
    const track = () => {
        stop.current?.();
        pointerY.current = null;
        const onMove = (event: PointerEvent) => { pointerY.current = event.clientY; };
        const onTouch = (event: TouchEvent) => { pointerY.current = event.touches[0]?.clientY ?? pointerY.current; };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('touchmove', onTouch);
        stop.current = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('touchmove', onTouch);
            stop.current = null;
        };
    };
    const release = () => {
        stop.current?.();
        pointerY.current = null;
    };
    return { pointerY, track, release };
}

// While a block is being dragged, show it at its drafted time and day,
// full width, on top of the others.
function withDraft(model: PlannerViewModel, draft: PlannerGestureDraft | null): PlannerViewModel {
    if (!draft) return model;
    const original = model.days.flatMap((day) => day.blocks).find((block) => block.id === draft.blockId && block.boardId === draft.boardId);
    if (!original) return model;
    const moved: PlannerBlockView = {
        ...original,
        date: draft.date,
        start: draft.start,
        end: draft.end,
        startMinutes: plannerMinutes(draft.start),
        endMinutes: plannerMinutes(draft.end),
        column: 0,
        columns: 1
    };
    return {
        ...model,
        days: model.days.map((day) => ({
            ...day,
            blocks: [...day.blocks.filter((block) => block !== original), ...(day.date === draft.date ? [moved] : [])]
        }))
    };
}

function PlannerHeader({ model }: { model: PlannerViewModel }) {
    const { language, t } = useI18n();
    const week = model.mode === 'week';
    const first = model.days[0]?.date || model.date;
    const last = model.days[model.days.length - 1]?.date || model.date;
    const label = week
        ? `${formatPlannerDateLabel(language, first)} – ${formatPlannerDateLabel(language, last)}`
        : formatPlannerDateLabel(language, model.date);
    const ratio = model.capacityMinutes > 0 ? Math.min(1, model.plannedMinutes / model.capacityMinutes) : 0;
    return (
        <header className="planner-header">
            <div className="planner-nav">
                <button className="btn" type="button" aria-label={week ? t('planner.previousWeek') : t('planner.previousDay')} onClick={() => shiftPortfolioPlannerDate(-1)}>‹</button>
                <button className="btn" type="button" onClick={() => showPortfolioPlannerToday()}>{t('planner.today')}</button>
                <button className="btn" type="button" aria-label={week ? t('planner.nextWeek') : t('planner.nextDay')} onClick={() => shiftPortfolioPlannerDate(1)}>›</button>
            </div>
            <h2 className="planner-period" id="portfolioPlannerPeriod" aria-live="polite">{label}</h2>
            <div className="planner-mode-toggle" role="group" aria-label={t('planner.rangeLabel')}>
                <button className={`btn${week ? '' : ' active'}`} type="button" aria-pressed={!week} onClick={() => setPortfolioPlannerMode('day')}>{t('planner.day')}</button>
                <button className={`btn${week ? ' active' : ''}`} type="button" aria-pressed={week} onClick={() => setPortfolioPlannerMode('week')}>{t('planner.week')}</button>
            </div>
            <div className="planner-summary">
                <span>{t('planner.summary', { planned: formatPlannerDuration(model.plannedMinutes), capacity: formatPlannerDuration(model.capacityMinutes) })}</span>
                <span className="planner-summary-bar" aria-hidden="true"><i style={{ width: `${ratio * 100}%` }} /></span>
            </div>
        </header>
    );
}

function ConnectedPlanner() {
    const state = useAppStore(useShallow((s) => ({
        portfolioBoards: s.portfolioBoards,
        portfolioVisibleRows: s.portfolioVisibleRows,
        selectedPortfolioBoardId: s.selectedPortfolioBoardId,
        portfolioTimelineSelection: s.portfolioTimelineSelection,
        portfolioPlannerDate: s.portfolioPlannerDate,
        portfolioPlannerMode: s.portfolioPlannerMode,
        activeLanguage: s.activeLanguage
    })));
    const actions = usePortfolioActions();
    const [includeParents, setIncludeParents] = useState(false);
    const [trayStatuses, setTrayStatuses] = useState<TaskStatus[]>(DEFAULT_TRAY_STATUSES);
    const [preview, setPreview] = useState<PlannerDropPreview | null>(null);
    const [activeItem, setActiveItem] = useState<PlannerTrayItem | null>(null);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const now = useNow();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const model = buildPortfolioPlannerViewModel(state, { today: todayLocalIsoDate(), trayStatuses, includeParents });

    const sensors = useSensors(
        // A short move before dragging keeps clicks on the card working.
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        // Touch waits for a brief press, so swiping still scrolls the tray.
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
        useSensor(KeyboardSensor)
    );
    const pointer = usePointerY();
    const gesture = usePlannerBlockGesture((next) => {
        void actions.updatePlannerBlock(next.boardId, next.blockId, { date: next.date, start: next.start, end: next.end });
    });

    const toggleStatus = (status: TaskStatus) => setTrayStatuses((current) => (
        current.includes(status) ? current.filter((entry) => entry !== status) : [...current, status]
    ));
    const findTrayItem = (id: unknown) => model.trayGroups.flatMap((group) => group.items).find((item) => trayDragId(item) === id) || null;
    const clearDrag = () => {
        pointer.release();
        setPreview(null);
        setActiveItem(null);
    };
    const onDragMove = (event: DragMoveEvent) => {
        const date = event.over?.data.current?.date as string | undefined;
        setPreview(date ? { date, startMinutes: dropStartMinutes(pointer.pointerY.current, event.active, date) } : null);
    };
    const onDragEnd = (event: DragEndEvent) => {
        const startMinutes = (date: string) => dropStartMinutes(pointer.pointerY.current, event.active, date);
        const data = event.active.data.current as TrayDragData | undefined;
        const date = event.over?.data.current?.date as string | undefined;
        if (data && date) void actions.addPlannerBlock(data.boardId, data.taskId, date, startMinutes(date));
        clearDrag();
    };

    const onBlockKeyDown = (event: KeyboardEvent<HTMLDivElement>, block: PlannerBlockView) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            actions.openPortfolioTaskDetailsForCalendar(block.boardId, block.taskId);
            return;
        }
        if (!block.canEdit) return;
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            void actions.removePlannerBlock(block.boardId, block.id);
            return;
        }
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        event.stopPropagation();
        const delta = event.key === 'ArrowUp' ? -PLANNER_SLOT_MINUTES : PLANNER_SLOT_MINUTES;
        void actions.updatePlannerBlock(block.boardId, block.id, applyPlannerGesture(block, event.shiftKey ? 'resize-end' : 'move', delta));
    };
    const blockHandlers: PlannerBlockHandlers = {
        onSelect: (block) => setSelectedBlockId(block.id),
        onOpen: (block) => actions.openPortfolioTaskDetailsForCalendar(block.boardId, block.taskId),
        onRemove: (block) => { void actions.removePlannerBlock(block.boardId, block.id); },
        onKeyDown: onBlockKeyDown,
        onGestureStart: gesture.begin
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={({ active }) => {
                pointer.track();
                setActiveItem(findTrayItem(active.id));
            }}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
            onDragCancel={clearDrag}
        >
            <PlannerHeader model={model} />
            <div className="planner-body">
                <PlannerTray includeParents={includeParents} onIncludeParents={setIncludeParents} groups={model.trayGroups} statuses={trayStatuses} onToggleStatus={toggleStatus} />
                <PlannerGrid
                    model={withDraft(model, gesture.draft)}
                    nowMinutes={nowMinutes}
                    preview={preview}
                    renderBlock={(block) => (
                        <PlannerBlock
                            key={block.id}
                            block={block}
                            selected={selectedBlockId === block.id}
                            dragging={gesture.draft?.blockId === block.id}
                            handlers={blockHandlers}
                        />
                    )}
                />
            </div>
            {/* In a portal, so the tray's scroll area never clips the card being dragged. */}
            {createPortal(
                <DragOverlay dropAnimation={null}>
                    {activeItem && (
                        <div className="planner-tray-card overlay" style={{ '--planner-project': activeItem.color.border } as CSSProperties}>
                            <PlannerTrayCardBody item={activeItem} />
                        </div>
                    )}
                </DragOverlay>,
                document.body
            )}
        </DndContext>
    );
}

export function PortfolioPlanner({ hidden }: { hidden: boolean }) {
    return (
        <div className={`portfolio-planner-view${hidden ? ' hidden' : ''}`} id="portfolioPlannerView">
            {!hidden && <ConnectedPlanner />}
        </div>
    );
}
