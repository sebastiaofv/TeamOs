import { useAppStore } from '@/features/portfolio/state/store';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { getRoadmapExtension } from '@/domain/roadmap';
import { isLeafPhase } from '@/domain/phaseTree';
import { useI18n } from '@/shared/i18n';

export function TaskPlanning({ readOnly }: { readOnly: boolean }) {
    const context = useAppStore((state) => state.portfolioDetailContext);
    const board = useAppStore((state) => state.portfolioBoards.find((b) => b.id === state.portfolioDetailContext?.boardId));
    const { setPortfolioTaskPlanning } = usePortfolioActions();
    const { t } = useI18n();
    const task = board?.data.board.tasks.find((item) => item.id === context?.taskId);
    if (!context || !task || readOnly) return null;
    const roadmap = getRoadmapExtension(board?.data);
    return <section className="task-planning"><h3>{t('roadmap.planning')}</h3><div className="form-row">
        {(['phaseId', 'milestoneId'] as const).map((field) => <div className="form-group" key={field}>
            <label htmlFor={`detailPlanning-${field}`}>{t(field === 'phaseId' ? 'task.phase' : 'task.milestone')}</label>
            <select id={`detailPlanning-${field}`} value={task[field] || ''} onChange={(e) => void setPortfolioTaskPlanning(context.boardId, task.id, field, e.target.value)}>
                <option value="">{t('common.none')}</option>
                {(field === 'phaseId' ? roadmap?.phases.filter((phase) => isLeafPhase(roadmap.phases, phase.id)) : roadmap?.milestones)?.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
        </div>)}
    </div></section>;
}
