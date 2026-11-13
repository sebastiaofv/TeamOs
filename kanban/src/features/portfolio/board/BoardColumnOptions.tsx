import type { WorkflowKind } from '@/domain/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { portfolioActions } from '@/features/portfolio/commands/portfolioCommands';
import { getWorkflow } from '@/domain/workflow';
import { hiddenBoardStates } from '@/domain/boardView';
import { useI18n } from '@/shared/i18n';
import { useShallow } from 'zustand/react/shallow';

export function BoardColumnOptions({ mode }: { mode: WorkflowKind }) {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId,
        selectedPortfolioViewMode: value.selectedPortfolioViewMode, portfolioTimelineSelection: value.portfolioTimelineSelection })));
    const { t } = useI18n();
    const hidden = state.selectedPortfolioViewMode !== 'board' || !state.selectedPortfolioBoardId;
    const { setPortfolioBoardColumnVisibility } = portfolioActions;
    const board = state.portfolioBoards.find((record) => record.id === state.selectedPortfolioBoardId);
    if (hidden || !board) return null;
    const preview = getSelectedPortfolioTimelineView(state);
    const data = preview?.isPreview ? preview.projectedBoard || board.data : board.data;
    const hiddenIds = hiddenBoardStates(data, mode);
    const canEdit = Boolean(board.handle) && !preview?.isPreview;
    return <fieldset className="board-column-options">
        <legend>{t('board.columns')}</legend>
        <div>
            <p>{t('board.columnsHint')}</p>
            {getWorkflow(data, mode).states.map((item) => <label key={item.id}>
                <input type="checkbox" checked={!hiddenIds.has(item.id)} disabled={!canEdit} onChange={(event) => void setPortfolioBoardColumnVisibility(board.id, item.id, event.target.checked, mode)} />
                <span>{item.name}</span>
            </label>)}
        </div>
    </fieldset>;
}
