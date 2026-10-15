import { useState } from 'react';
import type { BoardData, Task } from '@/domain/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function DashboardTaskList({ tasks, boardId, data, historical = false, title }: { tasks: readonly Task[]; boardId: string; data: BoardData; historical?: boolean; title: string }) {
    const { t } = useI18n(), actions = usePortfolioActions();
    const [page, setPage] = useState(0);
    const count = Math.max(1, Math.ceil(tasks.length / 50)), current = Math.min(page, count - 1);
    const navigation = tasks.map((task) => ({ boardId, taskId: task.id }));
    return <section className="dashboard-source-list" id="dashboardSourceList"><h2>{title} · {tasks.length}</h2>
        {!tasks.length ? <p>{t('table.noResults')}</p> : <div className="dashboard-table-scroll"><table className="dashboard-table"><thead><tr><th>ID</th><th>{t('workitem.type')}</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('task.assignee')}</th><th>{t('task.due')}</th></tr></thead><tbody>{tasks.slice(current * 50, current * 50 + 50).map((task) => <tr key={task.id}>
            <td>#{task.id}</td><td>{t(`workitem.${task.workitemType || 'task'}`)}</td><td><button className="btn-text" type="button" onClick={() => actions.openPortfolioTaskDetails(boardId, task.id, { navigation, ...(historical ? { boardData: data, readOnly: true } : {}) })}>{task.title}</button></td><td>{data.board.columns.find((column) => column.status === task.status)?.title || task.status}</td><td>{task.assignees.join(', ') || t('plan.na')}</td><td>{task.dueDate || t('plan.na')}</td>
        </tr>)}</tbody></table></div>}
        {tasks.length > 50 && <div className="dashboard-controls"><button className="btn" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{t('table.previous')}</button><span>{current + 1}/{count}</span><button className="btn" type="button" disabled={current + 1 >= count} onClick={() => setPage(current + 1)}>{t('table.next')}</button></div>}
    </section>;
}
