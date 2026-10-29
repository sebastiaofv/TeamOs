import { workitemLabel } from '@/domain/taskIdentity';
import { WorkitemTypeBadge } from '@/features/portfolio/task/WorkitemTypeBadge';
import { getWorkflow } from '@/domain/workflow';
import type { SprintParticipation } from '@/domain/workitems';
import { workitemType } from '@/domain/workitems';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';

export function WorkitemTree({ participation, boardId, readOnly = false }: { participation: SprintParticipation; boardId: string; readOnly?: boolean }) {
    const actions = usePortfolioActions();
    const { members, boardData: data } = participation;
    const open = (id: number) => actions.openPortfolioTaskDetails(boardId, id, (readOnly || !participation.isCurrent(id)) ? { boardData: participation.boardData, readOnly: true } : {});
    return <div className="workitem-tree">{participation.planningMembers.map((task) => workitemType(task) === 'story' ? <details key={task.id}><summary><WorkitemTypeBadge type="story" /> <button className="table-item-link" onClick={() => open(task.id)}>{workitemLabel(task)} {task.title}</button> · {getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status}</summary>
        <ul>{members.filter((child) => child.parentId === task.id).map((child) => <li key={child.id}><button className="table-item-link" onClick={() => open(child.id)}>{workitemLabel(child)} {child.title}</button> · {getWorkflow(data, child).states.find((state) => state.id === child.status)?.name || child.status}</li>)}</ul>
    </details> : <p key={task.id}><WorkitemTypeBadge type={workitemType(task)} /> <button className="table-item-link" onClick={() => open(task.id)}>{workitemLabel(task)} {task.title}</button> · {getWorkflow(data, task).states.find((state) => state.id === task.status)?.name || task.status}</p>)}</div>;
}
