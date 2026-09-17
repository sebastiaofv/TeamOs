import { useRef, useState, type ChangeEvent, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { RoadmapEntityDates, RoadmapEntityViewModel } from '../../types';
import { useAppStore } from '../../state/store';
import { usePortfolioActions } from '../../application/PortfolioActionsContext';
import type { RoadmapFocusField } from '../../actions/roadmapActions';
import { useReturnFocus } from './useReturnFocus';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from './escapeAnswersAppMessage';

type RoadmapEntityFormDraft = RoadmapEntityDates & { existingSprintId: string };

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
    const [draft, setDraft] = useState<RoadmapEntityFormDraft>(() => ({ ...vm.initial, existingSprintId: '' }));
    const dueDateRef = useRef<HTMLInputElement>(null);
    const startDateRef = useRef<HTMLInputElement>(null);
    // Fields saveRoadmapEntity can send focus back to after a failed validation.
    const fieldRefs: Record<RoadmapFocusField, RefObject<HTMLElement | null>> = {
        existingSprintId: sprintRef, title: titleRef, dueDate: dueDateRef, startDate: startDateRef
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
                <Dialog.Close className="modal-close" id="roadmapEntityModalCloseBtn">&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="roadmapEntityForm" onSubmit={(event) => event.preventDefault()}>
                    <input type="hidden" id="roadmapEntityKind" value={vm.kind} />
                    <input type="hidden" id="roadmapEntityId" value={vm.itemId} />
                    <div className={`form-group${vm.showExistingSprint ? '' : ' hidden'}`} id="roadmapEntityExistingSprintRow">
                        <label className="required" htmlFor="roadmapEntityExistingSprint">Sprint</label>
                        <select id="roadmapEntityExistingSprint" ref={sprintRef} {...bind('existingSprintId')}>
                            <option value="">Select sprint</option>
                            {vm.sprintOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className={`form-group${hideTitle ? ' hidden' : ''}`}>
                        <label className="required">Title</label>
                        <input type="text" id="roadmapEntityTitle" ref={titleRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className={`roadmap-entity-date-row single${hideSingleDate ? ' hidden' : ''}`} id="roadmapEntitySingleDateRow">
                        <div className="form-group">
                            <label className="required" id="roadmapEntityDateLabel">{vm.dateLabel}</label>
                            <input type="date" id="roadmapEntityDate" ref={dueDateRef} {...bind('dueDate')} />
                        </div>
                    </div>
                    <div className={`roadmap-entity-date-row${hideDateRange ? ' hidden' : ''}`} id="roadmapEntityRangeRow">
                        <div className="form-group">
                            <label className="required">Start Date</label>
                            <input type="date" id="roadmapEntityStartDate" ref={startDateRef} {...bind('startDate')} />
                        </div>
                        <div className="form-group">
                            <label className="required">End Date</label>
                            <input type="date" id="roadmapEntityEndDate" {...bind('endDate')} />
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="roadmapEntityModalCancelBtn">Cancel</Dialog.Close>
                <button
                    className="btn btn-primary"
                    id="roadmapEntityModalSaveBtn"
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
