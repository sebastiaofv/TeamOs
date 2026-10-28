import type { BoardData } from '@/domain/types';
import { isPlanningUnit, sprintMembers, workitemType } from '@/domain/workitems';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function WorkitemTree({ data, boardId, sprintId, readOnly = false }: { data: BoardData; boardId: string; sprintId: string; readOnly?: boolean }) {
    const actions = usePortfolioActions();
    const { t } = useI18n();
    const members = sprintMembers(data, sprintId);
    const open = (id: number) => actions.openPortfolioTaskDetails(boardId, id, (readOnly || !data.board.tasks.some((task) => task.id === id && task.sprintId === sprintId)) ? { boardData: { ...data, board: { ...data.board, tasks: members } }, readOnly: true } : {});
    return <div className="workitem-tree">{members.filter((task) => isPlanningUnit(data, task)).map((task) => workitemType(task) === 'story' ? <details key={task.id}><summary><span className="workitem-type">{t('workitems.type.story')}</span> <button className="table-item-link" onClick={() => open(task.id)}>#{task.id} {task.title}</button> · {data.board.columns.find((col) => col.status === task.status)?.title || task.status}</summary>
        <ul>{members.filter((child) => child.parentId === task.id).map((child) => <li key={child.id}><button className="table-item-link" onClick={() => open(child.id)}>#{child.id} {child.title}</button> · {data.board.columns.find((col) => col.status === child.status)?.title || child.status}</li>)}</ul>
    </details> : <p key={task.id}><span className="workitem-type">{t(`workitems.type.${workitemType(task)}`)}</span> <button className="table-item-link" onClick={() => open(task.id)}>#{task.id} {task.title}</button> · {data.board.columns.find((col) => col.status === task.status)?.title || task.status}</p>)}</div>;
}
