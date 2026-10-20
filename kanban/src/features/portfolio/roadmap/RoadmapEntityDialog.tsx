import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { RoadmapEntityDates, RoadmapEntityViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { RoadmapFocusField } from '@/features/portfolio/commands/roadmapCommands';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n } from '@/shared/i18n';
import { useLocalToday } from '@/shared/hooks/useLocalToday';
import { buildAssignableSprintOptions } from '@/features/portfolio/queries/sprintPlanning';

type RoadmapEntityFormDraft = RoadmapEntityDates & { existingSprintId: string; parentId: string };

export function RoadmapEntityDialog() {
    const { closeRoadmapEntity } = usePortfolioActions();
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
                        className="modal-content"
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
    const { saveRoadmapEntity } = usePortfolioActions();
    const { t, language } = useI18n();
    const today = useLocalToday();
    const assignmentBoard = useAppStore((state) => {
        const context = state.roadmapEntityContext;
        return context?.mode === 'assign-sprint-from-selection' ? state.portfolioBoards.find((board) => board.id === context.boardId)?.data : undefined;
    });
    const sprintOptions = assignmentBoard && vm.showExistingSprint ? buildAssignableSprintOptions(assignmentBoard, today, language) : vm.sprintOptions;
    const [draft, setDraft] = useState<RoadmapEntityFormDraft>(() => ({ ...vm.initial, existingSprintId: '', parentId: vm.parentId || '' }));
    const selectedSprintId = sprintOptions.some((option) => option.value === draft.existingSprintId) ? draft.existingSprintId : '';
    const dueDateRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    const endDateRef = useRef<HTMLInputElement>(null);
    // Fields saveRoadmapEntity can send focus back to after a failed validation.
    const fieldRefs: Record<RoadmapFocusField, RefObject<HTMLElement | null>> = {
        existingSprintId: sprintRef, title: titleRef, dueDate: dueDateRef, startDate: startDateRef, endDate: endDateRef
    };
    const bind = (field: keyof RoadmapEntityFormDraft) => ({
        value: draft[field],
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [field]: event.target.value }))
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
                <Dialog.Close className="modal-close" id="roadmapEntityModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="roadmapEntityForm" onSubmit={(event) => event.preventDefault()}>
                    <input type="hidden" id="roadmapEntityKind" value={vm.kind} />
                    <input type="hidden" id="roadmapEntityId" value={vm.itemId} />
                    {vm.kind === 'phases' && <div className="form-group">
                        <label htmlFor="roadmapPhaseParent">{t('roadmap.parentPhase')}</label>
                        <select id="roadmapPhaseParent" value={draft.parentId} onChange={(event) => {
                            const parentId = event.target.value;
                            const parent = vm.phases?.find((phase) => phase.id === parentId);
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
                        <input type="text" id="roadmapEntityTitle" ref={titleRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className={`roadmap-entity-date-row single${hideSingleDate ? ' hidden' : ''}`} id="roadmapEntitySingleDateRow">
                        <div className="form-group">
                            <label className="required" id="roadmapEntityDateLabel" htmlFor="roadmapEntityDate">{vm.dateLabel}</label>
                            <input type="date" id="roadmapEntityDate" ref={dueDateRef} {...bind('dueDate')} />
                        </div>
                    </div>
                    <div className={`roadmap-entity-date-row${hideDateRange ? ' hidden' : ''}`} id="roadmapEntityRangeRow">
                        <div className="form-group">
                            <label className="required" htmlFor="roadmapEntityStartDate">{t('roadmapDialog.startDate')}</label>
                            <input type="date" id="roadmapEntityStartDate" ref={startDateRef} readOnly={vm.datesCalculated} {...bind('startDate')} />
                        </div>
                        <div className="form-group">
                            <label className="required" htmlFor="roadmapEntityEndDate">{t('roadmapDialog.endDate')}</label>
                            <input type="date" id="roadmapEntityEndDate" ref={endDateRef} readOnly={vm.datesCalculated} {...bind('endDate')} />
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="roadmapEntityModalCancelBtn">{t('roadmapDialog.cancel')}</Dialog.Close>
                <button
                    className="btn btn-primary"
                    id="roadmapEntityModalSaveBtn"
                    disabled={Boolean(assignmentBoard && vm.showExistingSprint && !selectedSprintId)}
                    onClick={async () => {
                        const result = await saveRoadmapEntity({ kind: vm.kind, itemId: vm.itemId, ...draft });
                        if (result?.focusField) fieldRefs[result.focusField].current?.focus();
                    }}
                >
                    {vm.saveLabel}
                </button>
            </div>
        </>
    );
}
