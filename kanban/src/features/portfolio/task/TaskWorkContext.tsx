import { useState } from 'react';
import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { getTaskWorkflow, getWorkflow } from '@/domain/workflow';
import { getMaintenanceConfig } from '@/domain/applications';
import { workitemSubtree, taskWorkContext } from '@/domain/maintenance';
import { useI18n } from '@/shared/i18n';

export function TaskWorkContext({ readOnly }: { readOnly: boolean }) {
    const { t } = useI18n(), actions = usePortfolioActions();
    const context = useAppStore((s) => s.portfolioDetailContext);
    const board = useAppStore((s) => s.portfolioBoards.find((board) => board.id === context?.boardId));
    const [mapping, setMapping] = useState<Record<string, string>>({});
    if (!board || !context) return null;
    const task = board.data.board.tasks.find((task) => task.id === context.taskId);
    if (!task) return null;
    const target = taskWorkContext(task) === 'project' ? 'maintenance' : 'project';
    const destination = target === 'maintenance' ? getMaintenanceConfig(board.data)?.workflow || getWorkflow(board.data) : getWorkflow(board.data);
    const statuses = [...new Set(workitemSubtree(board.data, task.id).map((task) => task.status))];
    const missing = statuses.filter((status) => !destination.states.some((state) => state.id === status));
    return <section className="workitem-section"><h3>{t('maintenance.context')}</h3><p>{t(taskWorkContext(task) === 'maintenance' ? 'maintenance.work' : 'maintenance.projectWork')}</p><p className="muted">{t('maintenance.fileOwnership')}</p>
        {!readOnly && <form onSubmit={(event) => { event.preventDefault(); void actions.moveWorkitemToContext(board.id, task.id, target, mapping); }}>
            {missing.map((status) => <label key={status}>{getTaskWorkflow(board.data, task).states.find((state) => state.id === status)?.name || status} →<select required value={mapping[status] || ''} onChange={(event) => setMapping({ ...mapping, [status]: event.target.value })}><option value="">{t('common.choose')}</option>{destination.states.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>)}
            <button type="submit" className="btn">{t(target === 'maintenance' ? 'maintenance.moveTo' : 'maintenance.returnToProject')}</button>
        </form>}
    </section>;
}
