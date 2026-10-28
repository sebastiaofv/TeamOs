import type { WorkflowKind } from '@/domain/types';
import { useAppStore } from '@/features/portfolio/state/store';
import { getSelectedPortfolioTimelineView } from '@/features/portfolio/queries';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { getWorkflow } from '@/domain/workflow';
import { hiddenBoardStates } from '@/domain/boardView';
import { useTableDisclosure } from '@/features/portfolio/table/useTableDisclosure';
import { useI18n } from '@/shared/i18n';
import { useShallow } from 'zustand/react/shallow';

export function BoardColumnMenu({ mode }: { mode: WorkflowKind }) {
    const state = useAppStore(useShallow((value) => ({ portfolioBoards: value.portfolioBoards, selectedPortfolioBoardId: value.selectedPortfolioBoardId,
        selectedPortfolioViewMode: value.selectedPortfolioViewMode, portfolioTimelineSelection: value.portfolioTimelineSelection })));
    const { t } = useI18n();
    const hidden = state.selectedPortfolioViewMode !== 'board' || !state.selectedPortfolioBoardId;
    const disclosure = useTableDisclosure(hidden);
    const { setPortfolioBoardColumnVisibility } = usePortfolioActions();
    const board = state.portfolioBoards.find((record) => record.id === state.selectedPortfolioBoardId);
    if (hidden || !board) return null;
    const preview = getSelectedPortfolioTimelineView(state);
    const data = preview?.isPreview ? preview.projectedBoard || board.data : board.data;
    const hiddenIds = hiddenBoardStates(data, mode);
    const canEdit = Boolean(board.handle) && !preview?.isPreview;
    return <details className="board-column-menu" ref={disclosure.detailsRef} onToggle={disclosure.onToggle} onKeyDown={disclosure.onKeyDown}>
        <summary className="btn" role="button" ref={disclosure.summaryRef}>{t('board.columns')}</summary>
        <div className="board-column-panel" data-table-panel>
            <p>{t('board.columnsHint')}</p>
            {getWorkflow(data, mode).states.map((item) => <label key={item.id}>
                <input type="checkbox" checked={!hiddenIds.has(item.id)} disabled={!canEdit} onChange={(event) => void setPortfolioBoardColumnVisibility(board.id, item.id, event.target.checked, mode)} />
                <span>{item.name}</span>
            </label>)}
        </div>
    </details>;
}
