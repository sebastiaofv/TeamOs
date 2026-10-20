import type { BoardData, Task } from '@/domain/types';
import { getWorkflow } from '@/domain/workflow';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useAppStore } from '@/features/portfolio/state/store';
import { WorkflowStateControl } from '../WorkflowStateControl';
import { useI18n } from '@/shared/i18n';

export function TaskWorkflowHeader({ boardId, task, boardData, readOnly }: { boardId: string; task: Task; boardData: BoardData; readOnly: boolean }) {
    const { t } = useI18n();
    const { movePortfolioTaskToStatus, setPortfolioTaskResponsible } = usePortfolioActions();
    const names = [...new Set(boardData.board.tasks.flatMap((item) => item.assignees || []))];
    async function commitResponsible(input: HTMLInputElement) {
        if (readOnly) return;
        await setPortfolioTaskResponsible(boardId, task.id, input.value);
        input.value = useAppStore.getState().portfolioBoards.find((board) => board.id === boardId)?.data.board.tasks.find((item) => item.id === task.id)?.responsible || '';
    }
    return <div className="task-workflow-header">
        <div><span className="detail-label">{t('task.status')}</span><WorkflowStateControl workflow={getWorkflow(boardData)} status={task.status} readOnly={readOnly} onChange={(status) => movePortfolioTaskToStatus(boardId, task.id, status)} /></div>
        <div><label className="detail-label" htmlFor="detailResponsibleControl">{t('task.responsible')}</label>
            {readOnly ? <strong>{task.responsible || t('task.noResponsible')}</strong> : <>
                <input id="detailResponsibleControl" key={task.responsible} defaultValue={task.responsible} list="detailResponsibleNames" placeholder={t('task.noResponsible')}
                    onBlur={(event) => void commitResponsible(event.currentTarget)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void commitResponsible(event.currentTarget); } }} />
                <datalist id="detailResponsibleNames">{names.map((name) => <option key={name} value={name} />)}</datalist>
            </>}
        </div>
    </div>;
}
