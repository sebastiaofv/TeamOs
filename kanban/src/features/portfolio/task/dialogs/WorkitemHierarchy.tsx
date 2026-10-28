import { getWorkflow } from '@/domain/workflow';
import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { childrenOf, epicOf, parentOf, workitemProgress, workitemType, WORKITEM_FIELDS, isTerminal } from '@/domain/workitems';
import { useI18n } from '@/shared/i18n';

export function WorkitemHierarchy({ vm }: { vm: TaskDetailViewModel }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const data = vm.sourceBoardData;
    const task = data.board.tasks.find((entry) => entry.id === vm.taskId);
    if (!task) return null;
    const type = workitemType(task);
    const children = childrenOf(data, task.id);
    const parent = parentOf(data, task);
    const epic = epicOf(data, task);
    const progress = workitemProgress(data, task.id);
    const open = (id: number) => actions.openPortfolioTaskDetails(vm.boardId, id, vm.readOnly ? { boardData: data, readOnly: true, historyEventIndex: vm.conversationContext?.eventIndex } : {});
    return <section className="workitem-hierarchy" aria-label={t('workitems.parent')}>
        <p><span className="workitem-type">{t(`workitems.type.${type}`)}</span>{parent && <> · {t('workitems.parent')}: <button className="table-item-link" onClick={() => open(parent.id)}>#{parent.id} {parent.title}</button></>}{epic && epic.id !== parent?.id && <> · <button className="table-item-link" onClick={() => open(epic.id)}>#{epic.id} {epic.title}</button></>}</p>
        {WORKITEM_FIELDS.filter((field) => task[field]).map((field) => <div className="detail-item" key={field}><strong>{t(`workitems.${field}`)}</strong><p className="workitem-field">{task[field]}</p></div>)}
        {['epic', 'story'].includes(type) && <p role="status">{t('workitems.progress')}: {progress.percent === null ? t('workitems.noProgress') : `${Math.round(progress.percent)}% · ${progress.completed}/${progress.eligible}`}</p>}
        {type === 'story' && task.acceptance && children.some((child) => !isTerminal(data, child)) && <p role="status">{t('workitems.reopened', { id: children.find((child) => !isTerminal(data, child))?.id || '', parent: task.id })}</p>}
        {task.acceptance && <p>{t('workitems.acceptance')}: {task.acceptance.author} · {new Date(task.acceptance.at).toLocaleString()}</p>}
        {(type === 'epic' ? ['story', 'task'] as const : type === 'story' ? ['task'] as const : []).map((childType) => <section key={childType} className="workitem-child-section">
            <h3>{t(childType === 'story' ? 'workitems.stories' : 'workitems.tasks')}</h3>
            {!vm.readOnly && <button className="btn" type="button" onClick={() => actions.openPortfolioCreateChildTask(vm.boardId, task.id, childType)}>{t(childType === 'story' ? 'workitems.createStory' : 'workitems.createTask')}</button>}
            <ul>{children.filter((child) => workitemType(child) === childType).map((child) => <li key={child.id}><button className="table-item-link" onClick={() => open(child.id)}>#{child.id} {child.title}</button> · {getWorkflow(data, child).states.find((state) => state.id === child.status)?.name || child.status}</li>)}</ul>
        </section>)}
    </section>;
}
