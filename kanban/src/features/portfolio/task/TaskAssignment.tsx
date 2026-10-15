import { useAppStore } from '@/features/portfolio/state/store';
import { getProjectInfo } from '@/domain/project';
import { assignmentNeedsReview } from '@/domain/assignments';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { useI18n } from '@/shared/i18n';

export function TaskAssignment({ readOnly }: { readOnly: boolean }) {
    const { t } = useI18n();
    const { setWorkitemResponsible } = usePortfolioActions();
    const context = useAppStore((s) => s.portfolioDetailContext);
    const board = useAppStore((s) => s.portfolioBoards.find((b) => b.id === context?.boardId));
    const task = board?.data.board.tasks.find((task) => task.id === context?.taskId);
    if (!board || !task || readOnly) return null;
    const team = getProjectInfo(board.data).team;
    return <section className="workitem-section"><label htmlFor="detailResponsible">{t('task.assignee')}</label>
        <select id="detailResponsible" value={task.assigneeId || (task.assignees.length ? 'legacy' : '')} onChange={(e) => setWorkitemResponsible(board.id, task.id, e.target.value)}>
            <option value="">{t('common.none')}</option>
            {assignmentNeedsReview(board.data, task) && <option disabled value={task.assigneeId || 'legacy'}>{task.assignees.join(', ')} · {t('assignment.review')}</option>}
            {team.filter((m) => m.active).map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
        </select>
    </section>;
}
