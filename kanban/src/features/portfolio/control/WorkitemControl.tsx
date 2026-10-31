import { controlRecords } from '@/domain/projectControl';
import type { TaskDetailViewModel } from '@/features/portfolio/types';
import { usePortfolioActions } from '@/app/providers/PortfolioActionsProvider';
import { lastCommentAuthor } from '@/features/portfolio/task/conversationDrafts';
import { useAppStore } from '@/features/portfolio/state/store';
import { ControlAssociations } from './ControlAssociations';

export function WorkitemControl({ vm }: { vm: TaskDetailViewModel }) {
    const live = useAppStore((state) => state.portfolioBoards.find((board) => board.id === vm.boardId)?.data);
    const { setWorkitemControlLinks } = usePortfolioActions();
    const data = vm.readOnly ? vm.sourceBoardData : live || vm.sourceBoardData;
    const selected = controlRecords(data).filter((record) => record.related.workitemIds.includes(vm.taskId)).map((record) => record.id);
    return <ControlAssociations boardId={vm.boardId} data={data} readOnly={vm.readOnly} selected={selected} onChange={(ids) => void setWorkitemControlLinks(vm.boardId, vm.taskId, ids, lastCommentAuthor(vm.boardId))} />;
}
