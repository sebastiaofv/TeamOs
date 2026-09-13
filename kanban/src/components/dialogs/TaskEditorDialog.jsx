import { useLayoutEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeTaskEditor, saveTask } from '../../actions/legacyHost.js';
import { buildTaskDraft } from '../../domain/taskDraft.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';
import { AssigneeEditor } from './taskEditor/AssigneeEditor.jsx';
import { TagEditor } from './taskEditor/TagEditor.jsx';
import { ChecklistEditor } from './taskEditor/ChecklistEditor.jsx';
import { AttachmentsEditor } from './taskEditor/AttachmentsEditor.jsx';

const PRIORITY_OPTIONS = [['', 'None'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const EFFORT_OPTIONS = [['', 'None'], ['XS', 'XS'], ['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']];

// Legacy opens the editor with a view model; this component owns the draft and
// hands a finished draft to legacy saveTask, which validates, saves and closes.
export function TaskEditorDialog() {
    const open = useAppState((s) => s.activeDialog === 'taskEditor');
    const vm = useAppState((s) => (s.activeDialog === 'taskEditor' ? s.dialogProps : null));
    const nameRef = useRef(null);
    const submitRef = useRef(null);
    const returnFocus = useReturnFocus({ initialFocus: nameRef, selectInitial: true });

    // Ctrl/Cmd+Enter saves from anywhere in the dialog. The legacy shortcut
    // registry still lists it, with a no-op handler.
    const onKeyDown = (event) => {
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
function TaskEditorForm({ vm, nameRef, submitRef }) {
    const [form, setForm] = useState(() => ({ ...vm.initial }));
    const blockerReasonRef = useRef(null);

    const update = (field, fieldValue) => setForm((current) => ({ ...current, [field]: fieldValue }));
    const bind = (field) => ({ value: form[field], onChange: (event) => update(field, event.target.value) });
    const submit = () => saveTask(buildTaskDraft(form));

    useLayoutEffect(() => {
        submitRef.current = submit;
    });

    const onBlockedChange = (event) => {
        const blocked = event.target.checked;
        setForm((current) => ({ ...current, blocked, blockerReason: blocked ? current.blockerReason : '' }));
        if (blocked) {
            requestAnimationFrame(() => blockerReasonRef.current?.focus());
        }
    };

    return (
        <>
            <div className="modal-header">
                <Dialog.Title asChild>
                    <span className="modal-title" id="modalTitle">{vm.heading}</span>
                </Dialog.Title>
                <Dialog.Close className="modal-close" id="taskModalCloseBtn">&times;</Dialog.Close>
            </div>
            <div className="modal-body">
                <form id="taskForm" onSubmit={(event) => event.preventDefault()}>
                    <div className="form-group">
                        <label className="required">Task Name</label>
                        <input type="text" id="taskName" ref={nameRef} required maxLength={80} {...bind('title')} />
                    </div>
                    <div className="form-group">
                        <label>Description</label>
                        <textarea id="taskDescription" {...bind('description')} />
                    </div>
                    <div className="form-group">
                        <label>Blocked</label>
                        <div className="form-checkbox-row">
                            <input type="checkbox" id="taskBlocked" checked={form.blocked} onChange={onBlockedChange} />
                            <span>Mark task as blocked</span>
                        </div>
                    </div>
                    <div className={`form-group${form.blocked ? '' : ' hidden'}`} id="taskBlockerReasonWrap">
                        <label className="required">Blocker Reason</label>
                        <textarea
                            id="taskBlockerReason"
                            placeholder="What's blocking this task?"
                            ref={blockerReasonRef}
                            {...bind('blockerReason')}
                        />
                    </div>
                    <div className="form-group">
                        <label>Assignees</label>
                        <AssigneeEditor value={form.assignees} onChange={(next) => update('assignees', next)} pool={vm.assigneePool} />
                    </div>
                    <div className="form-group">
                        <label>Tags</label>
                        <TagEditor value={form.tags} onChange={(next) => update('tags', next)} suggestions={vm.tagSuggestions} />
                    </div>
                    <div className="form-group">
                        <label>Todo List</label>
                        <ChecklistEditor value={form.checklist} onChange={(next) => update('checklist', next)} />
                    </div>
                    <div className="form-group">
                        <label>Attachments</label>
                        <AttachmentsEditor
                            value={form.attachments}
                            onChange={(next) => update('attachments', next)}
                            otherAttachmentBytes={vm.otherAttachmentBytes}
                        />
                    </div>
                    <div className="form-group">
                        <label>Due Date</label>
                        <input type="date" id="taskDueDate" {...bind('dueDate')} />
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Priority</label>
                            <select id="taskPriority" {...bind('priority')}>
                                {PRIORITY_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Effort</label>
                            <select id="taskEffort" {...bind('effort')}>
                                {EFFORT_OPTIONS.map(([optionValue, label]) => <option key={label} value={optionValue}>{label}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group">
                            <label>Phase</label>
                            <select id="taskPhase" {...bind('phaseId')}>
                                <option value="">None</option>
                                {vm.phaseOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Milestone</label>
                            <select id="taskMilestone" {...bind('milestoneId')}>
                                <option value="">None</option>
                                {vm.milestoneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                    </div>
                </form>
            </div>
            <div className="modal-footer">
                <Dialog.Close className="btn" id="taskModalCancelBtn">Cancel</Dialog.Close>
                <button className="btn btn-primary" id="taskModalSaveBtn" onClick={submit}>Save Task</button>
            </div>
        </>
    );
}
