import * as Dialog from '@radix-ui/react-dialog';
import { useMemo } from 'react';
import { deriveTaskHistory } from '@/domain/taskHistory';
import type { TaskHistory } from '@/domain/taskHistoryTypes';
import { resolveTaskDetailSource } from '@/features/portfolio/queries/taskDetailSource';
import { buildTaskDetailViewModel } from '@/features/portfolio/commands/taskViewModels';
import { TaskHistorySection } from './TaskHistorySection';
import type { TaskDetailFields, TaskDetailViewModel } from '@/features/portfolio/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useReturnFocus } from '@/shared/ui/dialogs/useReturnFocus';
import { keepOpenOnUndoToast } from '@/shared/ui/dialogs/keepOpenOnUndoToast';
import { escapeAnswersAppMessage } from '@/shared/ui/dialogs/escapeAnswersAppMessage';
import { useI18n, type TranslationKey } from '@/shared/i18n';

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
    const { closeTaskDetail, toggleTaskDetailChecklistItem } = usePortfolioActions();
    const open = useAppStore((s) => s.activeDialog === 'taskDetail');
    const initialVm = useAppStore((s) => (s.activeDialog === 'taskDetail' ? s.dialogProps as TaskDetailViewModel : null));
    const context = useAppStore((s) => s.activeDialog === 'taskDetail' ? s.portfolioDetailContext : null);
    const boardRecord = useAppStore((s) => s.portfolioBoards.find((board) => board.id === context?.boardId) || null);
    const boardData = boardRecord?.data;
    const saveState = useAppStore((s) => context ? s.projectSaveStateById.get(context.boardId) : undefined);
    const returnFocus = useReturnFocus();
    const { t, language } = useI18n();
    // Store selectors return existing references. Reconstruction and projection
    // run in memoized reads, not getSnapshot, and track full loaded board data.
    const detail = useMemo(() => resolveTaskDetailSource(boardRecord, context), [boardRecord, context]);
    const vm = useMemo(() => {
        if (!detail || !context) return initialVm ? { ...initialVm, readOnly: true } : null;
        return buildTaskDetailViewModel(detail.source, context.taskId, context.readOnly, language);
    }, [detail, context, initialVm, language]);
    const history = useMemo<TaskHistory>(() => {
        if (!detail || !boardData) return {
            entries: [], earlierHistoryUnavailable: true, incomplete: true,
            asOf: context?.eventId ? (() => {
                const event = boardData?.extensions.timeline?.events.find((entry) => entry.id === context.eventId);
                return event ? { eventId: event.id, at: event.at } : null;
            })() : null
        };
        return deriveTaskHistory(boardData, detail.source.task, { eventIndex: detail.eventIndex });
    }, [detail, boardData, context]);

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
                            <Dialog.Title asChild><span className="modal-title">{t('task.details')}</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="taskDetailModalCloseBtn" aria-label={t('common.close')} title={t('common.close')}>&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            {vm && <TaskDetailList vm={vm} onToggleChecklistItem={toggleTaskDetailChecklistItem} />}
                            {vm && <TaskHistorySection key={`${context?.boardId}:${context?.taskId}:${context?.eventId || 'live'}`}
                                history={history} saveState={saveState} sourceUnavailable={!detail} />}
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

function TaskDetailList({ vm, onToggleChecklistItem }: {
    vm: TaskDetailViewModel;
    onToggleChecklistItem: (itemIndex: number, checked: boolean) => unknown;
}) {
    const { t } = useI18n();
    return (
        <dl className="detail-list">
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
