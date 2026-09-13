import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeTaskDetail, toggleTaskDetailChecklistItem } from '../../actions/legacyHost.js';
import { useReturnFocus } from './useReturnFocus.js';
import { keepOpenOnUndoToast } from './keepOpenOnUndoToast.js';

const FIELD_ROWS = [
    { label: 'Title', id: 'detailTitle', key: 'title' },
    { label: 'Description', id: 'detailDescription', key: 'description' },
    { label: 'Assignees', id: 'detailAssignees', key: 'assignees' },
    { label: 'Tags', id: 'detailTags', key: 'tags' },
    { label: 'Blocked', id: 'detailBlocked', key: 'blocked' },
    { label: 'Blocker', id: 'detailBlockerReason', key: 'blockerReason' },
    { label: 'Priority', id: 'detailPriority', key: 'priority' },
    { label: 'Effort', id: 'detailEffort', key: 'effort' },
    { label: 'Status', id: 'detailStatus', key: 'status' },
    { label: 'Created', id: 'detailCreatedAt', key: 'createdAt' },
    { label: 'Updated', id: 'detailUpdatedAt', key: 'updatedAt' },
    { label: 'Due', id: 'detailDueDate', key: 'dueDate' },
    { label: 'Phase', id: 'detailPhase', key: 'phase' },
    { label: 'Milestone', id: 'detailMilestone', key: 'milestone' },
    { label: 'Sprint', id: 'detailSprint', key: 'sprint' }
];

export function TaskDetailDialog() {
    const open = useAppState((s) => s.activeDialog === 'taskDetail');
    const vm = useAppState((s) => (s.activeDialog === 'taskDetail' ? s.dialogProps : null));
    const returnFocus = useReturnFocus();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeTaskDetail(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="taskDetailModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Task Details</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="taskDetailModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            {vm && <TaskDetailList vm={vm} />}
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="taskDetailModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function TaskDetailList({ vm }) {
    return (
        <div className="detail-list">
            {FIELD_ROWS.map((row) => (
                <div className="detail-item" key={row.id}>
                    <span className="detail-label">{row.label}</span>
                    <span className="detail-value" id={row.id}>{vm.fields[row.key]}</span>
                </div>
            ))}
            <div className="detail-item">
                <span className="detail-label">Todo List</span>
                <ul className="detail-checklist" id="detailChecklist">
                    {vm.checklist.length === 0
                        ? <li className="detail-value">-</li>
                        : vm.checklist.map((item, index) => (
                            <li className={`detail-checklist-item ${item.done ? 'done' : ''}`} key={index}>
                                <input
                                    type="checkbox"
                                    checked={item.done}
                                    disabled={vm.readOnly}
                                    onChange={(event) => toggleTaskDetailChecklistItem(index, event.target.checked)}
                                />
                                <span className="detail-checklist-text">{item.text}</span>
                            </li>
                        ))}
                </ul>
            </div>
            <div className="detail-item">
                <span className="detail-label">Attachments</span>
                <div className="detail-attachments" id="detailAttachments">
                    {vm.attachments.length === 0
                        ? <div className="detail-attachments-empty">-</div>
                        : vm.attachments.map((item) => (
                            <div className="detail-attachment-item" key={item.id}>
                                {item.isImage
                                    ? <img className="detail-attachment-thumb" alt="" src={item.dataUrl} />
                                    : <span className="attachment-editor-icon">FILE</span>}
                                <div className="detail-attachment-meta">
                                    <div className="detail-attachment-name">{item.name}</div>
                                    <div className="detail-attachment-sub">{item.subLabel}</div>
                                </div>
                                <a className="detail-attachment-download" href={item.dataUrl} download={item.name || 'attachment'}>Download</a>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}
