import { WorkitemHierarchy } from './WorkitemHierarchy';
import { workitemType } from '@/domain/workitems';
import * as Dialog from '@radix-ui/react-dialog';
import { useState, type KeyboardEvent } from 'react';
import type { TaskDetailFields, TaskDetailViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n, type TranslationKey } from '@/shared/i18n';
import { TaskPlanning } from './TaskPlanning';
import { TaskConversation } from './TaskConversation';
import { TaskPullRequestLinks } from './PullRequestLinks';
import { TaskHistory } from './TaskHistory';
import { TaskRelations } from '@/features/portfolio/task/dialogs/TaskRelations';

const FIELD_ROWS: { label: TranslationKey; id: string; key: keyof TaskDetailFields }[] = [
    { label: 'task.title', id: 'detailTitle', key: 'title' },
    { label: 'task.description', id: 'detailDescription', key: 'description' },
    { label: 'task.responsible', id: 'detailResponsible', key: 'responsible' },
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
    const { closeTaskDetail, toggleTaskDetailChecklistItem } = usePortfolioActions();
    const open = useAppStore((s) => s.activeDialog === 'taskDetail');
    const vm = useAppStore((s) => (s.activeDialog === 'taskDetail' ? s.dialogProps as TaskDetailViewModel : null));
    const returnFocus = useReturnFocus();
    const { t } = useI18n();

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeTaskDetail(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="taskDetailModal">
                    <Dialog.Content
                        className="modal-content"
                        aria-describedby={undefined}
                        onPointerDownOutside={keepOpenOnUndoToast}
                        onEscapeKeyDown={escapeAnswersAppMessage}
                        {...returnFocus}
                    >
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">{vm && workitemType(vm.sourceBoardData.board.tasks.find((task) => task.id === vm.taskId) || {}) !== 'task' ? `${t(`workitems.type.${workitemType(vm.sourceBoardData.board.tasks.find((task) => task.id === vm.taskId) || {})}`)} · ${t('history.details')}` : t('task.details')}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="taskDetailModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            {vm && <TaskDetailContent key={vm.historyKey} vm={vm} onToggleChecklistItem={toggleTaskDetailChecklistItem} />}
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="taskDetailModalFooterCloseBtn">{t('common.close')}</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function TaskDetailContent({ vm, onToggleChecklistItem }: { vm: TaskDetailViewModel; onToggleChecklistItem: (index: number, checked: boolean) => unknown }) {
    const tabs = [
        { id: 'details', label: 'history.details' },
        { id: 'comments', label: 'comments.title' },
        { id: 'pullRequests', label: 'pullRequests.title' },
        { id: 'history', label: 'history.title' }
    ] as const;
    const visibleTabs = workitemType(vm.sourceBoardData.board.tasks.find((task) => task.id === vm.taskId) || {}) === 'epic' ? tabs.filter((entry) => entry.id !== 'pullRequests') : tabs;
    const [tab, setTab] = useState<(typeof tabs)[number]['id']>('details');
    const { t } = useI18n();
    function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? visibleTabs.length - 1
            : event.key === 'ArrowRight' ? (index + 1) % visibleTabs.length
                : event.key === 'ArrowLeft' ? (index + visibleTabs.length - 1) % visibleTabs.length : null;
        if (next === null) return;
        event.preventDefault(); setTab(visibleTabs[next].id);
        (event.currentTarget.parentElement?.querySelectorAll('button')[next] as HTMLButtonElement)?.focus();
    }
    return <><div className="detail-tabs" role="tablist" aria-label={t('history.navigation')}>
        {visibleTabs.map((value, index) => <button key={value.id} id={`task-tab-${value.id}`} role="tab" type="button" aria-selected={tab === value.id} aria-controls={`task-panel-${value.id}`} tabIndex={tab === value.id ? 0 : -1} onKeyDown={(event) => navigate(event, index)} onClick={() => setTab(value.id)}>{t(value.label)}</button>)}
    </div>
        <div role="tabpanel" id="task-panel-details" aria-labelledby="task-tab-details" tabIndex={0} hidden={tab !== 'details'}>
            <WorkitemHierarchy vm={vm} /><TaskDetailList vm={vm} onToggleChecklistItem={onToggleChecklistItem} /><TaskRelations key={`${vm.boardId}:${vm.taskId}`} vm={vm} />
        </div>
        <div role="tabpanel" id="task-panel-comments" aria-labelledby="task-tab-comments" tabIndex={0} hidden={tab !== 'comments'}>
            {vm.conversationContext && <TaskConversation key={`${vm.conversationContext.boardId}:${vm.conversationContext.task.id}:${vm.conversationContext.eventIndex ?? 'current'}`} context={vm.conversationContext} />}
        </div>
        <div role="tabpanel" id="task-panel-pullRequests" aria-labelledby="task-tab-pullRequests" tabIndex={0} hidden={tab !== 'pullRequests'}>
            {vm.pullRequestContext && <TaskPullRequestLinks {...vm.pullRequestContext} readOnly={vm.readOnly} />}
        </div>
        <div role="tabpanel" id="task-panel-history" aria-labelledby="task-tab-history" tabIndex={0} hidden={tab !== 'history'}><TaskHistory history={vm.history} /></div>
    </>;
}

function TaskDetailList({ vm, onToggleChecklistItem }: {
    vm: TaskDetailViewModel;
    onToggleChecklistItem: (itemIndex: number, checked: boolean) => unknown;
}) {
    const { t } = useI18n();
    return (
        <dl className="detail-list">
            {FIELD_ROWS.filter((row) => !(workitemType(vm.sourceBoardData.board.tasks.find((task) => task.id === vm.taskId) || {}) === 'epic' && ['effort', 'sprint'].includes(row.key))).map((row) => (
                <div className="detail-item" key={row.id}>
                    <dt className="detail-label">{t(row.label)}</dt>
                    <dd className="detail-value" id={row.id}>{vm.fields[row.key]}</dd>
                </div>
            ))}
            {!vm.readOnly && <div className="detail-planning-associations"><dt className="sr-only">{t('roadmap.planning')}</dt><dd><TaskPlanning readOnly={vm.readOnly} /></dd></div>}
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
