import type { BoardData, Task } from '@/domain/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';
import { Pager, usePage } from './Pager';

export function DashboardTaskList({ tasks, boardId, data, historical = false, title }: { tasks: readonly Task[]; boardId: string; data: BoardData; historical?: boolean; title: string }) {
    const { t } = useI18n(), actions = usePortfolioActions();
    const page = usePage(tasks);
    const navigation = tasks.map((task) => ({ boardId, taskId: task.id }));
    const openTask = (task: Task) => actions.openPortfolioTaskDetails(boardId, task.id, { navigation, ...(historical ? { boardData: data, readOnly: true } : {}) });
    const statusTitle = (task: Task) => data.board.columns.find((column) => column.status === task.status)?.title || task.status;
    return (
        <section className="dashboard-source-list" id="dashboardSourceList">
            <h2>{title} · {tasks.length}</h2>
            {!tasks.length ? <p>{t('table.noResults')}</p> : (
                <div className="dashboard-table-scroll">
                    <table className="dashboard-table">
                        <thead>
                            <tr><th>ID</th><th>{t('workitem.type')}</th><th>{t('task.title')}</th><th>{t('task.status')}</th><th>{t('task.assignee')}</th><th>{t('task.due')}</th></tr>
                        </thead>
                        <tbody>
                            {page.items.map((task) => (
                                <tr key={task.id}>
                                    <td>#{task.id}</td>
                                    <td>{t(`workitem.${task.workitemType || 'task'}`)}</td>
                                    <td><button className="btn-text" type="button" onClick={() => openTask(task)}>{task.title}</button></td>
                                    <td>{statusTitle(task)}</td>
                                    <td>{task.assignees.join(', ') || t('plan.na')}</td>
                                    <td>{task.dueDate || t('plan.na')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Pager {...page} />
        </section>
    );
}
