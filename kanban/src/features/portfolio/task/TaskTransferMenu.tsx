import { WorkspaceIcon } from '@/shared/ui/WorkspaceIcon';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { useI18n } from '@/shared/i18n';
import { ActionMenu } from '@/shared/ui/ActionMenu';

export function TaskTransferMenu({ boardId, taskId, historical = false, allowDelete = false }: { boardId: string; taskId: number; historical?: boolean; allowDelete?: boolean }) {
    const { transferPortfolioTask, deletePortfolioTask } = portfolioActions;
    const { t } = useI18n();
    return <ActionMenu trigger={<button type="button" className="task-action-btn" aria-label={t('transfer.actions')} title={t('transfer.actions')}>
        <WorkspaceIcon name="more" />
    </button>} actions={[
        ...(['copy', 'move'] as const).map(mode => ({ label: t(`transfer.${mode}`), disabled: historical,
            title: historical ? t('task.readOnlyHistorical') : undefined,
            icon: <WorkspaceIcon name={mode} />,
            run: () => transferPortfolioTask(boardId, taskId, mode) })),
        ...(allowDelete ? [{ label: t('common.delete'), disabled: historical, run: () => deletePortfolioTask(boardId, taskId) }] : [])
    ]} />;
}
