import { workitemLabel } from '@/domain/taskIdentity';
import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { childrenOf, epicOf, parentOf, workitemProgress, workitemType, WORKITEM_FIELDS, isTerminal } from '@/domain/workitems';
import { getWorkflow } from '@/domain/workflow';
import { WorkflowStateBadge } from '@/features/portfolio/task/WorkflowStateBadge';
import { useI18n } from '@/shared/i18n';

export function WorkitemLineage({ vm }: { vm: TaskDetailViewModel }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const data = vm.sourceBoardData;
    const task = data.board.tasks.find((entry) => entry.id === vm.taskId);
    if (!task) return null;
    const parent = parentOf(data, task), epic = epicOf(data, task);
    if (!parent) return null;
    const open = (id: number) => actions.openPortfolioTaskDetails(vm.boardId, id, vm.readOnly ? { boardData: data, readOnly: true, historyEventIndex: vm.conversationContext?.eventIndex } : {});
    return <div className="workitem-lineage"><span>{t('workitems.parent')}</span>
        {epic && epic.id !== parent.id && <><button className="table-item-link" onClick={() => open(epic.id)}>{workitemLabel(epic)} {epic.title}</button><span aria-hidden="true">/</span></>}
        <button className="table-item-link" onClick={() => open(parent.id)}>{workitemLabel(parent)} {parent.title}</button>
    </div>;
}

export function WorkitemHierarchy({ vm }: { vm: TaskDetailViewModel }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const data = vm.sourceBoardData;
    const task = data.board.tasks.find((entry) => entry.id === vm.taskId);
    if (!task) return null;
    const type = workitemType(task);
    const children = childrenOf(data, task.id);
    const progress = workitemProgress(data, task.id);
    const open = (id: number) => actions.openPortfolioTaskDetails(vm.boardId, id, vm.readOnly ? { boardData: data, readOnly: true, historyEventIndex: vm.conversationContext?.eventIndex } : {});
    return <div className="workitem-hierarchy">
        {WORKITEM_FIELDS.filter((field) => task[field]).map((field) => <section className={`workitem-section workitem-field-block workitem-field-${field}`} key={field}>
            <h3>{t(`workitems.${field}`)}</h3><p className="workitem-field">{task[field]}</p>
        </section>)}
        {['epic', 'story'].includes(type) && <section className="workitem-progress" aria-label={t('workitems.executionProgress')}>
            <div className="workitem-progress-heading"><span>{t('workitems.executionProgress')}</span><strong>{progress.percent === null ? '—' : `${Math.round(progress.percent)}%`}</strong></div>
            <div className="workitem-progress-track" role="progressbar" aria-label={t('workitems.executionProgress')} aria-valuenow={progress.percent ?? undefined} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress.percent || 0}%` }} /></div>
            <p role="status">{progress.percent === null ? t('workitems.noProgress') : `${progress.completed}/${progress.eligible} ${t(type === 'epic' ? 'workitems.childWorkitems' : 'workitems.tasks')}`}</p>
        </section>}
        {type === 'story' && task.acceptance && children.some((child) => !isTerminal(data, child)) && <p className="workitem-acceptance" role="status">{t('workitems.reopened', { id: children.find((child) => !isTerminal(data, child))?.id || '', parent: task.id })}</p>}
        {task.acceptance && <p className="workitem-acceptance">{t('workitems.acceptance')}: <strong>{task.acceptance.author}</strong> · {new Date(task.acceptance.at).toLocaleString()}</p>}
        {(type === 'epic' ? ['story', 'task'] as const : type === 'story' ? ['task'] as const : []).map((childType) => <section key={childType} className="workitem-section workitem-child-section">
            <div className="workitem-section-heading"><h3>{t(childType === 'story' ? 'workitems.stories' : 'workitems.tasks')} <span className="detail-tab-count">{children.filter((child) => workitemType(child) === childType).length}</span></h3>
                {!vm.readOnly && <button className="btn" type="button" onClick={() => actions.openPortfolioCreateChildTask(vm.boardId, task.id, childType)}>{t(childType === 'story' ? 'workitems.createStory' : 'workitems.createTask')}</button>}
            </div>
            <ul>{children.filter((child) => workitemType(child) === childType).map((child) => {
                const state = getWorkflow(data, child).states.find((state) => state.id === child.status);
                return <li key={child.id}>
                    <span className="workitem-child-id">{workitemLabel(child)}</span><button className="table-item-link" onClick={() => open(child.id)}>{child.title}</button>
                    {state ? <WorkflowStateBadge state={state} /> : <span>{child.status}</span>}
                </li>;
            })}</ul>
        </section>)}
    </div>;
}
