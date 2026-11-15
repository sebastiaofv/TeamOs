import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { DeleteMenu } from '@/shared/ui/DeleteMenu';
import { SaveButton } from '@/features/portfolio/projects/ProjectSaveStatus';
import { DateInput } from '@/shared/ui/DateInput';
import { ControlAssociations } from '@/features/portfolio/control/ControlAssociations';
import { controlRecords } from '@/domain/projectControl';
import { lastCommentAuthor } from '@/features/portfolio/task/conversationDrafts';
import { useRef, useState, type CSSProperties, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { RoadmapEntityDates, RoadmapEntityViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import type { RoadmapFocusField } from '@/features/portfolio/commands/roadmapCommands';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { buildAssignableSprintOptions } from '@/features/portfolio/queries/sprintPlanning';
import { MILESTONE_PALETTE } from '@/domain/milestonePresentation';
import { addBusinessDays, businessDaysBetween } from '@/domain/businessDays';

type RoadmapEntityFormDraft = RoadmapEntityDates & { existingSprintId: string; parentId: string };

export function RoadmapEntityDialog() {
    const { closeRoadmapEntity } = portfolioActions;
    const open = useAppStore((s) => s.activeDialog === 'roadmapEntity');
    const vm = useAppStore((s) => (s.activeDialog === 'roadmapEntity' ? s.dialogProps as RoadmapEntityViewModel : null));
    const titleRef = useRef<HTMLInputElement>(null);
    const sprintRef = useRef<HTMLSelectElement>(null);
    const returnFocus = useReturnFocus({
        initialFocus: vm?.initialFocus === 'existingSprint' ? sprintRef : titleRef
    });

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeRoadmapEntity(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="roadmapEntityModal">
                    <Dialog.Content
                        className={`modal-content${vm?.kind === 'sprints' && !vm.showExistingSprint ? ' sprint-editor-modal' : ''}`}
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        {vm && (
                            <RoadmapEntityForm
                                key={`${vm.kind}:${vm.itemId}:${vm.mode}`}
                                vm={vm}
                                titleRef={titleRef}
                                sprintRef={sprintRef}
                            />
                        )}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// Remounts on every open (Radix unmounts Content when closed), so the draft
// always starts from the view model's initial values.
function RoadmapEntityForm({ vm, titleRef, sprintRef }: {
    vm: RoadmapEntityViewModel;
    titleRef: RefObject<HTMLInputElement | null>;
    sprintRef: RefObject<HTMLSelectElement | null>;
}) {
    const { saveRoadmapEntity, deleteRoadmapEntity, closeRoadmapEntity } = portfolioActions;
    const { t, language } = useI18n();
    const today = useLocalToday();
    const [busy, setBusy] = useState(false);
    const assignmentBoard = useAppStore((state) => {
        const context = state.roadmapEntityContext;
        return context?.mode === 'assign-sprint-from-selection' ? state.portfolioBoards.find((board) => board.id === context.boardId)?.data : undefined;
    });
    const sprintOptions = assignmentBoard && vm.showExistingSprint ? buildAssignableSprintOptions(assignmentBoard, today, language) : vm.sprintOptions;
    const liveControlBoard = useAppStore((state) => state.portfolioBoards.find((board) => board.id === vm.boardId)?.data);
    const controlBoard = vm.readOnly ? vm.boardData : liveControlBoard;
    const [controlIds, setControlIds] = useState(() => controlRecords(controlBoard).filter((record) => (vm.kind === 'phases' ? record.related.phaseIds : record.related.milestoneIds).includes(vm.itemId)).map((record) => record.id));
    const [draft, setDraft] = useState<RoadmapEntityFormDraft>(() => ({ ...vm.initial, existingSprintId: '', parentId: vm.parentId || '' }));
    const selectedSprintId = sprintOptions.some((option) => option.value === draft.existingSprintId) ? draft.existingSprintId : '';
    const isSprintEditor = vm.kind === 'sprints' && !vm.showExistingSprint;
    // Sprint duration in business days: start + duration gives the end date,
    // and start + end gives the duration (see domain/businessDays).
    const [duration, setDuration] = useState(() => String(businessDaysBetween(vm.initial.startDate || '', vm.initial.endDate || '') ?? ''));
    const changeSprintDates = (field: 'startDate' | 'endDate' | 'duration', value: string) => {
        if (field === 'duration') {
            setDuration(value);
            const days = value === '' ? NaN : Number(value);
            const endDate = draft.startDate ? addBusinessDays(draft.startDate, days) : '';
            if (endDate) setDraft((current) => ({ ...current, endDate }));
            return;
        }
        const next = { ...draft, [field]: value };
        if (field === 'startDate') {
            const days = duration === '' ? NaN : Number(duration);
            const endDate = value ? addBusinessDays(value, days) : '';
            if (endDate) next.endDate = endDate;
            else setDuration(String(businessDaysBetween(value, next.endDate || '') ?? ''));
        } else {
            setDuration(String(businessDaysBetween(next.startDate || '', value) ?? ''));
        }
        setDraft(next);
    };
    const bindSprintDate = (field: 'startDate' | 'endDate') => isSprintEditor
        ? { value: draft[field] ?? '', onChange: (event: { target: { value: string } }) => changeSprintDates(field, event.target.value) }
        : bind(field);
    const dueDateRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);
    // Fields saveRoadmapEntity can send focus back to after a failed validation.
    const fieldRefs: Record<RoadmapFocusField, RefObject<HTMLElement | null>> = {
        existingSprintId: sprintRef, title: titleRef, dueDate: dueDateRef, startDate: startDateRef, endDate: endDateRef
    };
    const bind = (field: Exclude<keyof RoadmapEntityFormDraft, 'capacity'>) => ({
        value: draft[field] ?? '',
        onChange: (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [field]: event.target.value }))
    });
    const hideTitle = vm.showExistingSprint;
    const hideSingleDate = vm.showExistingSprint || vm.dateMode !== 'single';
    const hideDateRange = vm.showExistingSprint || vm.dateMode !== 'range';

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="roadmapEntityModalTitle">{vm.heading}</span>
                </Dialog.Title>
                {vm.itemId && (vm.kind !== 'sprints' || vm.initial.status === 'planned') && <DeleteMenu disabled={vm.readOnly || busy} onDelete={() => deleteRoadmapEntity(vm.kind, vm.itemId, { boardId: vm.boardId, onApplied: closeRoadmapEntity })} />}
                <Dialog.Close className="modal-close" id="roadmapEntityModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}><WorkspaceIcon name="close" /></Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="roadmapEntityForm" onSubmit={(event) => event.preventDefault()}>
                    <fieldset disabled={vm.readOnly} className="roadmap-edit-fields">
                    <input type="hidden" id="roadmapEntityKind" value={vm.kind} />
                    <input type="hidden" id="roadmapEntityId" value={vm.itemId} />
                    {vm.kind === 'phases' && <div className="form-group">
                        <label htmlFor="roadmapPhaseParent">{t('roadmap.parentPhase')}</label>
                        <select id="roadmapPhaseParent" value={draft.parentId} onChange={(event) => {
                            const parentId = event.target.value;
                            const parent = vm.phases?.find((phase) => phase.id === parentId);
                            if (!vm.itemId && parent) setDuration(String(businessDaysBetween(parent.startDate || '', parent.endDate || '') ?? ''));
                            setDraft((current) => ({ ...current, parentId, ...(!vm.itemId && parent ? { startDate: parent.startDate || '', endDate: parent.endDate || '' } : {}) }));
                        }}><option value="">{t('common.none')}</option>{vm.phaseOptions?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                        {vm.datesCalculated && <p className="field-hint">{t('roadmap.calculatedDates')}</p>}
                    </div>}
                    <div className={`form-group${vm.showExistingSprint ? '' : ' hidden'}`} id="roadmapEntityExistingSprintRow">
                        <label className="required" htmlFor="roadmapEntityExistingSprint">{t('task.sprint')}</label>
                        <select id="roadmapEntityExistingSprint" ref={sprintRef} {...bind('existingSprintId')} value={selectedSprintId}>
                            <option value="">{t('roadmapDialog.selectSprint')}</option>
                            {sprintOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        {assignmentBoard && sprintOptions.length === 0 && <p role="status">{t('roadmapDialog.noEligibleSprints')}</p>}
                    </div>
                    <div className={`form-group${hideTitle ? ' hidden' : ''}`}>
                        <label className="required" htmlFor="roadmapEntityTitle">{t('roadmapDialog.title')}</label>
                        <input type="text" id="roadmapEntityTitle" ref={titleRef} required={!hideTitle} maxLength={80} {...bind('title')} />
                    </div>
                    {vm.kind === 'sprints' && !vm.showExistingSprint && <>
                        {vm.itemId && <div className="form-group"><label htmlFor="sprintStatus">{t('task.status')}</label>
                            <select id="sprintStatus" value={draft.status || 'planned'} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as NonNullable<RoadmapEntityDates['status']> }))}>
                                {(['planned', 'active', 'done'] as const).map((status) => <option key={status} value={status}>{t(`table.sprintStatus.${status}`)}</option>)}
                            </select></div>}
                        <div className="form-group"><label htmlFor="sprintGoal">{t('sprint.goal')}</label><textarea id="sprintGoal" {...bind('goal')} /></div>
                        <div className="form-group"><label htmlFor="sprintCapacity">{t('sprint.capacity')}</label><input id="sprintCapacity" type="number" min="0" step="any" value={draft.capacity ?? ''} onChange={(event) => setDraft((current) => ({ ...current, capacity: event.target.value === '' ? null : Number(event.target.value) }))} /></div>
                        <div className="form-group"><label htmlFor="sprintReview">{t('sprint.review')}</label><textarea id="sprintReview" {...bind('review')} /></div>
                        <div className="form-group"><label htmlFor="sprintRetrospective">{t('sprint.retrospective')}</label><textarea id="sprintRetrospective" {...bind('retrospective')} /></div>
                    </>}
                    {vm.kind !== 'sprints' && <div className="form-group"><label htmlFor="roadmapEntityObjective">{t('control.objective')}</label><textarea id="roadmapEntityObjective" value={draft.objective || ''} onChange={(event) => setDraft({ ...draft, objective: event.target.value })} rows={3} /></div>}
                    <div className={`roadmap-entity-date-row single${hideSingleDate ? ' hidden' : ''}`} id="roadmapEntitySingleDateRow">
                        <div className="form-group">
                            <label className="required" id="roadmapEntityDateLabel" htmlFor="roadmapEntityDate">{vm.dateLabel}</label>
                            <DateInput  id="roadmapEntityDate" ref={dueDateRef} {...bind('dueDate')} />
                        </div>
                    </div>
                    {vm.kind !== 'sprints' && <fieldset className="form-group milestone-color-picker"><legend>{t(vm.kind === 'phases' ? 'roadmap.phaseColor' : 'roadmap.milestoneColor')}</legend>
                        {MILESTONE_PALETTE.map((color) => <label key={color.id} style={{ '--milestone-color': color.value } as CSSProperties}>
                            <input type="radio" name="milestoneColor" value={color.value} checked={draft.color === color.value} aria-label={t(`roadmap.color.${color.id}`)} onChange={() => setDraft((current) => ({ ...current, color: color.value }))} /><span aria-hidden="true"><WorkspaceIcon name="check" /></span>
                        </label>)}
                    </fieldset>}
                    <div className={`roadmap-entity-date-row${isSprintEditor ? ' with-duration' : ''}${hideDateRange ? ' hidden' : ''}`} id="roadmapEntityRangeRow">
                        <div className="form-group">
                            <label className="required" htmlFor="roadmapEntityStartDate">{t('roadmapDialog.startDate')}</label>
                            <DateInput  id="roadmapEntityStartDate" ref={startDateRef} readOnly={vm.datesCalculated} {...bindSprintDate('startDate')} />
                        </div>
                        {isSprintEditor && <div className="form-group">
                            <label htmlFor="sprintDuration">{t('sprint.duration')}</label>
                            <input type="number" id="sprintDuration" min="0" step="1" inputMode="numeric" readOnly={vm.datesCalculated} value={duration} onChange={(event) => changeSprintDates('duration', event.target.value)} />
                        </div>}
                        <div className="form-group">
                            <label className="required" htmlFor="roadmapEntityEndDate">{t('roadmapDialog.endDate')}</label>
                            <DateInput  id="roadmapEntityEndDate" ref={endDateRef} readOnly={vm.datesCalculated} {...bindSprintDate('endDate')} />
                        </div>
                    </div>
                    </fieldset>
                    {controlBoard && vm.kind !== 'sprints' && <ControlAssociations boardId={vm.boardId} data={controlBoard} selected={controlIds} onChange={setControlIds} readOnly={vm.readOnly} />}
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="roadmapEntityModalCancelBtn">{t('roadmapDialog.cancel')}</Dialog.Close>
                <SaveButton boardId={vm.boardId} busy={busy}
                    className="btn btn-primary"
                    id="roadmapEntityModalSaveBtn"
                    disabled={vm.readOnly || Boolean(assignmentBoard && vm.showExistingSprint && !selectedSprintId)}
                    onClick={async () => {
                        if (busy || !document.querySelector<HTMLFormElement>('#roadmapEntityForm')?.reportValidity()) return;
                        setBusy(true);
                        try {
                        const result = await saveRoadmapEntity({ kind: vm.kind, itemId: vm.itemId, ...draft, controlIds, controlAuthor: lastCommentAuthor(vm.boardId) });
                        if (result?.focusField) fieldRefs[result.focusField].current?.focus();
                        } finally { setBusy(false); }
                    }}
                >
                    {vm.saveLabel}
                </SaveButton>
            </div>
        </>
    );
}
