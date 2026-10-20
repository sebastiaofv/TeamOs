import { useLayoutEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { TaskEditorFields, TaskEditorViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import type { TaskFocusField } from '@/features/portfolio/commands/taskCommands';
import { buildTaskDraft } from '@/domain/taskDraft';
import { editTaskParticipant, removeTaskParticipant, setTaskResponsible } from '@/domain/taskAssignments';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { AssigneeEditor } from './editor/AssigneeEditor';
import { TagEditor } from './editor/TagEditor';
import { ChecklistEditor } from './editor/ChecklistEditor';
import { AttachmentsEditor } from './editor/AttachmentsEditor';
import { PullRequestLinks } from './PullRequestLinks';
import { useI18n } from '@/shared/i18n';

type SubmitRef = RefObject<(() => Promise<void>) | null>;

// The form fields edited through a plain input, textarea or select.
type TextField = 'title' | 'description' | 'responsible' | 'blockerReason' | 'dueDate' | 'priority' | 'effort' | 'phaseId' | 'milestoneId';

const PRIORITY_OPTIONS = [['', 'None'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const EFFORT_OPTIONS = [['', 'None'], ['XS', 'XS'], ['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']];

// The mutation action opens the editor with a view model; this component owns
// the draft and hands a finished draft to the store-backed save action.
export function TaskEditorDialog() {
    const { closeTaskEditor } = usePortfolioActions();
    const open = useAppStore((s) => s.activeDialog === 'taskEditor');
    const vm = useAppStore((s) => (s.activeDialog === 'taskEditor' ? s.dialogProps as TaskEditorViewModel : null));
    const nameRef = useRef<HTMLInputElement>(null);
    const submitRef: SubmitRef = useRef(null);
    const returnFocus = useReturnFocus({ initialFocus: nameRef, selectInitial: true });

    // Ctrl/Cmd+Enter saves from anywhere in the dialog. The global shortcut
    // registry reserves this key combination for the editor.
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key !== 'Enter') return;
        event.preventDefault();
        submitRef.current?.();
    };

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeTaskEditor(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="taskModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        onKeyDown={onKeyDown}
                        {...returnFocus}
                    >
                        {vm && <TaskEditorForm key={vm.openId} vm={vm} nameRef={nameRef} submitRef={submitRef} />}
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

// Remounts on every open (keyed by openId), so the draft always starts from the
// view model's initial values.
function TaskEditorForm({ vm, nameRef, submitRef }: {
    vm: TaskEditorViewModel;
    nameRef: RefObject<HTMLInputElement | null>;
    submitRef: SubmitRef;
}) {
    const { saveTask, confirmResponsibleParticipantRemoval } = usePortfolioActions();
    const { t } = useI18n();
    const [form, setForm] = useState<TaskEditorFields>(() => ({ ...vm.initial }));
    const pendingParticipantRename = useRef<{ index: number; name: string } | null>(null);
    const blockerReasonRef = useRef<HTMLTextAreaElement>(null);
    const dueDateRef = useRef<HTMLInputElement>(null);
    // Fields saveTask can send focus back to after a failed validation.
    const fieldRefs: Record<TaskFocusField, RefObject<HTMLElement | null>> = { title: nameRef, blockerReason: blockerReasonRef, dueDate: dueDateRef };

    const update = <K extends keyof TaskEditorFields>(field: K, fieldValue: TaskEditorFields[K]) => setForm((current) => ({ ...current, [field]: fieldValue }));
    const bind = (field: TextField) => ({
        value: form[field],
        onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => update(field, event.target.value)
    });
    const submit = async () => {
        // Normalize a completed correction once, including keyboard saves that
        // keep focus in the input. Intermediate names must not merge people.
        const pending = pendingParticipantRename.current;
        const completedForm = pending ? editTaskParticipant(form, pending.index, pending.name) : form;
        const result = await saveTask(buildTaskDraft(completedForm));
        if (result?.focusField) fieldRefs[result.focusField].current?.focus();
    };

    useLayoutEffect(() => {
        submitRef.current = submit;
    });

    const onBlockedChange = (event: ChangeEvent<HTMLInputElement>) => {
        const blocked = event.target.checked;
        setForm((current) => ({ ...current, blocked, blockerReason: blocked ? current.blockerReason : '' }));
        if (blocked) {
            requestAnimationFrame(() => blockerReasonRef.current?.focus());
        }
    };

    const removeParticipant = async (index: number) => {
        const result = removeTaskParticipant(form, index);
        if (result.needsConfirmation && !(await confirmResponsibleParticipantRemoval(form.assignees[index]))) return;
        setForm((current) => removeTaskParticipant(current, index, true).task);
    };

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="modalTitle">{vm.heading}</span>
                </Dialog.Title>
                <Dialog.Close className="modal-close" id="taskModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="taskForm" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
                    {vm.relationNotice && <p className="relation-preview" role="status">{vm.relationNotice} · Backlog</p>}
                    <div className="form-group">
                        <label className="required" htmlFor="taskName">{t('task.taskName')}</label>
                        <input type="text" id="taskName" ref={nameRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="taskDescription">{t('task.description')}</label>
                        <textarea id="taskDescription" {...bind('description')} />
                    </div>
                    <div className="form-group">
                        <label htmlFor="taskBlocked">{t('task.blocked')}</label>
                        <div className="form-checkbox-row">
                            <input type="checkbox" id="taskBlocked" checked={form.blocked} onChange={onBlockedChange} />
                            <span>{t('task.markBlocked')}</span>
                        </div>
                    </div>
                    <div className={`form-group${form.blocked ? '' : ' hidden'}`} id="taskBlockerReasonWrap">
                        <label className="required" htmlFor="taskBlockerReason">{t('task.blocker')}</label>
                        <textarea
                            id="taskBlockerReason"
                            placeholder={t('task.blockerPlaceholder')}
                            ref={blockerReasonRef}
                            {...bind('blockerReason')}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="taskResponsible">{t('task.responsible')}</label>
                        <input type="text" id="taskResponsible" list="taskResponsibleSuggestions" placeholder={t('task.noResponsible')}
                            {...bind('responsible')} onBlur={() => setForm((current) => setTaskResponsible(current, current.responsible))} />
                        <datalist id="taskResponsibleSuggestions">
                            {[...new Set([...form.assignees, ...vm.assigneePool])].map((name) => <option key={name} value={name} />)}
                        </datalist>
                    </div>
                    <div className="form-group">
                        <label id="taskAssigneesLabel">{t('task.assignees')}</label>
                        <AssigneeEditor value={form.assignees} onChange={(next) => update('assignees', next)} pool={vm.assigneePool}
                            onDraftRename={(index, name) => { pendingParticipantRename.current = { index, name }; }}
                            onRename={(index, name) => {
                                pendingParticipantRename.current = null;
                                setForm((current) => editTaskParticipant(current, index, name));
                            }}
                            onRemove={removeParticipant} />
                    </div>
                    <div className="form-group">
                        <label id="taskTagsLabel">{t('task.tags')}</label>
                        <TagEditor value={form.tags} onChange={(next) => update('tags', next)} suggestions={vm.tagSuggestions} />
                    </div>
                    <div className="form-group">
                        <label id="taskTodoListLabel">{t('task.todoList')}</label>
                        <ChecklistEditor value={form.checklist} onChange={(next) => update('checklist', next)} />
                    </div>
                    <div className="form-group">
                        <label id="taskAttachmentsLabel">{t('task.attachments')}</label>
                        <AttachmentsEditor
                            value={form.attachments}
                            onChange={(next) => update('attachments', next)}
                            otherAttachmentBytes={vm.otherAttachmentBytes}
                        />
                    </div>
                    <PullRequestLinks value={form.pullRequests || []} onChange={(next) => update('pullRequests', next)} draft />
                    <div className="form-group">
                        <label htmlFor="taskDueDate">{t('task.due')}</label>
                        <input type="date" id="taskDueDate" ref={dueDateRef} {...bind('dueDate')} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="taskPriority">{t('task.priority')}</label>
                            <select id="taskPriority" {...bind('priority')}>
                                {PRIORITY_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label === 'None' ? t('common.none') : label === 'High' ? t('toolbar.high') : label === 'Medium' ? t('toolbar.medium') : label === 'Low' ? t('toolbar.low') : label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="taskEffort">{t('task.effort')}</label>
                            <select id="taskEffort" {...bind('effort')}>
                                {EFFORT_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label === 'None' ? t('common.none') : label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label htmlFor="taskPhase">{t('task.phase')}</label>
                            <select id="taskPhase" {...bind('phaseId')}>
                                <option value="">{t('common.none')}</option>
                                {vm.phaseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label htmlFor="taskMilestone">{t('task.milestone')}</label>
                            <select id="taskMilestone" {...bind('milestoneId')}>
                                <option value="">{t('common.none')}</option>
                                {vm.milestoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="taskModalCancelBtn">{t('common.cancel')}</Dialog.Close>
                <button className="btn btn-primary" id="taskModalSaveBtn" onClick={submit}>{t('task.save')}</button>
            </div>
        </>
    );
}
