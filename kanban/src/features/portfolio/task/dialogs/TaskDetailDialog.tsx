import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import type { TaskDetailFields, TaskDetailViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { TaskRelations } from '../TaskRelations';
import { TaskAssignment } from '../TaskAssignment';
import { TaskHistory } from '../TaskHistory';
import { TaskComments } from '../TaskComments';
import { TaskPullRequests } from '../TaskPullRequests';
import { TaskAttachments } from '../TaskAttachments';
import { useSmallScreen } from '@/shared/hooks/useSmallScreen';

const FIELD_ROWS: { label: TranslationKey; id: string; key: keyof TaskDetailFields }[] = [
    { label: 'task.title', id: 'detailTitle', key: 'title' },
    { label: 'task.description', id: 'detailDescription', key: 'description' },
    { label: 'task.assignees', id: 'detailAssignees', key: 'assignees' },
    { label: 'task.tags', id: 'detailTags', key: 'tags' },
    { label: 'task.blocked', id: 'detailBlocked', key: 'blocked' },
    { label: 'task.blocker', id: 'detailBlockerReason', key: 'blockerReason' },
    { label: 'task.priority', id: 'detailPriority', key: 'priority' },
    { label: 'task.effort', id: 'detailEffort', key: 'effort' },
    { label: 'task.status', id: 'detailStatus', key: 'status' },
    { label: 'task.created', id: 'detailCreatedAt', key: 'createdAt' },
    { label: 'task.updated', id: 'detailUpdatedAt', key: 'updatedAt' },
    { label: 'task.due', id: 'detailDueDate', key: 'dueDate' },
    { label: 'task.phase', id: 'detailPhase', key: 'phase' },
    { label: 'task.milestone', id: 'detailMilestone', key: 'milestone' },
    { label: 'task.sprint', id: 'detailSprint', key: 'sprint' }
];

export function TaskDetailDialog() {
    const { closeTaskDetail, toggleTaskDetailChecklistItem, editPortfolioTask, navigateWorkitemDetail } = usePortfolioActions();
    const context = useAppStore((s) => s.portfolioDetailContext);
    const smallScreen = useSmallScreen();
    const open = useAppStore((s) => s.activeDialog === 'taskDetail');
    const vm = useAppStore((s) => (s.activeDialog === 'taskDetail' ? s.dialogProps as TaskDetailViewModel : null));
    const returnFocus = useReturnFocus();
    const { t } = useI18n();

    return (
        <Dialog.Root open={open} modal={smallScreen} onOpenChange={(next) => { if (!next) closeTaskDetail(); }}>
            <Dialog.Portal>
                <div className="task-detail-shell" id="taskDetailModal">
                    {smallScreen && <Dialog.Overlay className="task-detail-backdrop" />}
                    <Dialog.Content
                        className="modal-content task-detail-panel"
                        aria-modal={smallScreen || undefined}
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onFocusOutside={(event) => event.preventDefault()}
                        onInteractOutside={(event) => {
                            const target = event.target;
                            if (useAppStore.getState().appMessage || target instanceof Element && target.closest('#undoToast, #appMessageDialog, #appMessageModal')) event.preventDefault();
                        }}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">{t('task.details')}{context ? ` · #${context.taskId}` : ''}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="taskDetailModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            {vm?.missing ? <p role="status">{t('detail.missing')}</p> : vm && <TaskDetailContent key={`${context?.boardId}:${vm.task?.id}`} vm={vm} onToggleChecklistItem={toggleTaskDetailChecklistItem} />}
                        </div>
                        <div className="modal-footer">
                            <button className="btn" type="button" aria-label={t('detail.previous')} disabled={!context?.navigation?.some((ref, index) => ref.boardId === context.boardId && ref.taskId === context.taskId && index > 0)} onClick={() => navigateWorkitemDetail(-1)}>←</button>
                            <button className="btn" type="button" aria-label={t('detail.next')} disabled={!context?.navigation?.some((ref, index) => ref.boardId === context.boardId && ref.taskId === context.taskId && index < context.navigation!.length - 1)} onClick={() => navigateWorkitemDetail(1)}>→</button>
                            {context && vm && !vm.readOnly && !vm.missing && <button className="btn btn-primary" type="button" id="taskDetailEditBtn" onClick={() => editPortfolioTask(context.boardId, context.taskId)}>{t('common.edit')}</button>}
                            <Dialog.Close className="btn" id="taskDetailModalFooterCloseBtn">{t('common.close')}</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </div>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function TaskDetailContent({ vm, onToggleChecklistItem }: { vm: TaskDetailViewModel; onToggleChecklistItem: (index: number, checked: boolean) => unknown }) {
    const { t } = useI18n();
    const [tab, setTab] = useState('summary');
    const tabs = ['summary', 'history', 'comments', 'pullRequests', 'attachments'] as const;
    return <><div className="detail-tabs" role="tablist" aria-label={t('task.details')}>
        {tabs.map((name) => <button key={name} id={`detail-tab-${name}`} type="button" role="tab" aria-selected={tab === name} aria-controls={`detail-panel-${name}`} tabIndex={tab === name ? 0 : -1} onClick={() => setTab(name)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault(); const index = tabs.findIndex((name) => name === tab); const next = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + tabs.length) % tabs.length]; setTab(next); document.getElementById(`detail-tab-${next}`)?.focus();
        }}>{t(name === 'summary' ? 'history.summary' : name === 'history' ? 'history.title' : name === 'comments' ? 'history.comments' : name === 'pullRequests' ? 'history.pullRequests' : 'history.attachments')}</button>)}
    </div><div role="tabpanel" id="detail-panel-summary" aria-labelledby="detail-tab-summary" hidden={tab !== 'summary'}>
        <TaskDetailList vm={vm} onToggleChecklistItem={onToggleChecklistItem} /><TaskRelations readOnly={vm.readOnly} sourceData={vm.boardData} /><TaskAssignment readOnly={vm.readOnly} />
    </div><div role="tabpanel" id="detail-panel-history" aria-labelledby="detail-tab-history" hidden={tab !== 'history'}><TaskHistory /></div>
    <div role="tabpanel" id="detail-panel-comments" aria-labelledby="detail-tab-comments" hidden={tab !== 'comments'}><TaskComments readOnly={vm.readOnly} /></div>
    <div role="tabpanel" id="detail-panel-pullRequests" aria-labelledby="detail-tab-pullRequests" hidden={tab !== 'pullRequests'}><TaskPullRequests readOnly={vm.readOnly} /></div>
    <div role="tabpanel" id="detail-panel-attachments" aria-labelledby="detail-tab-attachments" hidden={tab !== 'attachments'}><TaskAttachments vm={vm} /></div></>;
}

function TaskDetailList({ vm, onToggleChecklistItem }: {
    vm: TaskDetailViewModel;
    onToggleChecklistItem: (itemIndex: number, checked: boolean) => unknown;
}) {
    const { t } = useI18n();
    return (
        <dl className="detail-list">
            <div className="detail-item"><dt className="detail-label">{t('workitem.type')}</dt><dd className="detail-value">{t(`workitem.${vm.task?.workitemType || 'task'}`)}</dd></div>
            {vm.task?.acceptanceCriteria && <div className="detail-item"><dt>{t('workitem.acceptance')}</dt><dd className="detail-value">{vm.task.acceptanceCriteria}</dd></div>}
            {vm.task?.reproductionSteps && <div className="detail-item"><dt>{t('workitem.reproduction')}</dt><dd className="detail-value">{vm.task.reproductionSteps}</dd></div>}
            {vm.task?.expectedResult && <div className="detail-item"><dt>{t('workitem.expected')}</dt><dd className="detail-value">{vm.task.expectedResult}</dd></div>}
            {FIELD_ROWS.map((row) => (
                <div className="detail-item" key={row.id}>
                    <dt className="detail-label">{t(row.label)}</dt>
                    <dd className="detail-value" id={row.id}>{vm.fields[row.key]}</dd>
                </div>
            ))}
            <div className="detail-item">
                <dt className="detail-label">{t('task.todoList')}</dt>
                <ul className="detail-checklist" id="detailChecklist">
                    {vm.checklist.length === 0
                        ? <li className="detail-value">-</li>
                        : vm.checklist.map((item, index) => (
                            <li className={`detail-checklist-item ${item.done ? 'done' : ''}`} key={index}>
                                <label className="detail-checklist-label">
                                    <input
                                        type="checkbox"
                                        checked={item.done}
                                        disabled={vm.readOnly}
                                        aria-label={t('editor.todoItem', { index: index + 1 })}
                                        onChange={(event) => onToggleChecklistItem(index, event.target.checked)}
                                    />
                                    <span className="detail-checklist-text">{item.text}</span>
                                </label>
                            </li>
                        ))}
                </ul>
            </div>
            <div className="detail-item">
                <dt className="detail-label">{t('task.attachments')}</dt>
                <dd className="detail-attachments" id="detailAttachments">
                    {vm.attachments.length === 0
                        ? <div className="detail-attachments-empty">-</div>
                        : vm.attachments.map((item) => (
                            <div className="detail-attachment-item" key={item.id}>
                                {item.isImage
                                    ? <img className="detail-attachment-thumb" alt="" src={item.dataUrl} />
                                    : <span className="attachment-editor-icon">{t('common.file')}</span>}
                                <div className="detail-attachment-meta">
                                    <div className="detail-attachment-name">{item.name}</div>
                                    <div className="detail-attachment-sub">{item.subLabel}</div>
                                </div>
                                <a className="detail-attachment-download" href={item.dataUrl} download={item.name || 'attachment'}>{t('common.download')}</a>
                            </div>
                        ))}
                </dd>
            </div>
        </dl>
    );
}
