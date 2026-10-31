import { childTransferReview, projectTransferFields } from './projectTransferReview';
import { requestWorkitemAcceptance } from './workitemAcceptance';
import { assertWorkitemTransfer, transferDescendants, workitemType, WorkitemError } from '@/domain/workitems';
import { nextTaskIdForBoard } from '@/domain/task';
import { checkPortfolioFiles } from '@/features/portfolio/projects/projectCommands';
import type { BoardMutationContext } from './mutationContext';
import type { BoardData } from '@/domain/types';
import { sameProduct, prepareProjectTransfer, removeTransferredSource, transferBatch, TransferError, type TransferMode, type TransferOperation } from '@/domain/projectTransfers';
import { cloneSerializable } from '@/domain/serializable';
import { statusCategory } from '@/domain/workflow';
import { validateBoardData } from '@/domain/board';
import { isBoardInHistoricalPreview } from '@/features/portfolio/queries';
import { translateCurrent as t } from '@/shared/i18n';
import { lockProjectTransfers, isProjectTransferLocked } from './projectTransferLocks';

export function createProjectTransferActions(context: BoardMutationContext, checkFiles = () => checkPortfolioFiles()) {
    const { getState, getBoardRecord, commitState, enqueueSave, markDirty, alert, choose, confirm, prompt, onBoardChanged } = context;
    let preparing = false;
    const failedCopies = new Map<string, { boardId: string; operationId: string }>();
    const writable = (id: string) => Boolean(getBoardRecord(id)?.handle) && !isBoardInHistoricalPreview(getState(), id)
        && !['conflict', 'watch-error'].includes(getState().projectSaveStateById.get(id)?.watchStatus || '');
    function publish(boardId: string, data: BoardData) {
        validateBoardData(data);
        commitState((state) => ({ portfolioBoards: state.portfolioBoards.map((board) => board.id === boardId ? { ...board, data } : board),
            ...(state.portfolioTimelineSelection.boardId === boardId ? { portfolioTimelineSelection: { boardId, eventIndex: (data.extensions.timeline?.events.length || 1) - 1 } } : {}) }));
        markDirty(boardId); onBoardChanged(boardId);
    }
    async function finish(destinationId: string, operation: TransferOperation): Promise<boolean> {
        const destination = getBoardRecord(destinationId);
        if (!destination || !writable(destinationId)) throw new TransferError('unavailable');
        const source = getState().portfolioBoards.find((board) => board.data.extensions.project?.id === operation.from.projectId);
        if (operation.mode === 'move' && (!source || !writable(source.id))) throw new TransferError('unavailable');
        const unlock = lockProjectTransfers([destinationId, ...(source ? [source.id] : [])]);
        try {
            // Retry the same persisted operation. Never allocate another destination identity.
            if (!await enqueueSave(getBoardRecord(destinationId))) return false;
            if (operation.mode === 'copy') {
                if (operation.status === 'complete') return true;
                const next = cloneSerializable(getBoardRecord(destinationId)!.data);
                for (const entry of transferBatch(next, operation)) entry.status = 'complete';
                publish(destinationId, next);
                return Boolean(await enqueueSave(getBoardRecord(destinationId)));
            }
            await checkFiles();
            if (!getBoardRecord(destinationId)?.data.board.tasks.some((task) => task.permanentId === operation.to.permanentId)) throw new TransferError('stale');
            const currentSource = getBoardRecord(source!.id)!;
            const currentDestination = getBoardRecord(destinationId)!;
            if (!writable(source!.id) || !writable(destinationId)) throw new TransferError('unavailable');
            const nextSource = removeTransferredSource(currentSource.data, operation, currentDestination.data);
            if (nextSource !== currentSource.data) publish(source!.id, nextSource);
            if (!await enqueueSave(getBoardRecord(source!.id))) return false;
            const nextDestination = cloneSerializable(getBoardRecord(destinationId)!.data);
            for (const entry of transferBatch(nextDestination, operation)) entry.status = 'complete';
            publish(destinationId, nextDestination);
            return Boolean(await enqueueSave(getBoardRecord(destinationId)));
        } finally { unlock(); onBoardChanged(destinationId); if (source) onBoardChanged(source.id); }
    }
    async function resumeProjectTransfer(destinationId: string, operationId: string): Promise<boolean> {
        try {
            await checkFiles();
            const operation = getBoardRecord(destinationId)?.data.extensions.projectTransfers?.operations.find((entry) => entry.id === operationId);
            if (!operation) throw new TransferError('stale');
            const complete = await finish(destinationId, operation);
            if (complete) for (const [key, value] of failedCopies) if (value.operationId === operationId) failedCopies.delete(key);
            await alert(t(complete ? 'transfer.complete' : 'transfer.pending'));
            return complete;
        } catch (error) { await alert(t(error instanceof WorkitemError ? `workitems.error.${error.code}` : error instanceof TransferError ? `transfer.error.${error.code}` : 'transfer.pending')); return false; }
    }
    async function transferPortfolioTask(boardId: string, taskId: number, mode: TransferMode): Promise<boolean> {
        if (preparing || isProjectTransferLocked(boardId)) return false;
        preparing = true;
        try {
            await checkFiles();
            const source = getBoardRecord(boardId);
            const task = source?.data.board.tasks.find((item) => item.id === taskId);
            if (!source || !task || isBoardInHistoricalPreview(getState(), boardId) || ['conflict', 'watch-error'].includes(getState().projectSaveStateById.get(boardId)?.watchStatus || '') || (mode === 'move' && !writable(boardId))) throw new TransferError('unavailable');
            const failedCopy = failedCopies.get(`${boardId}:${task.permanentId}`);
            if (mode === 'copy' && failedCopy) return await resumeProjectTransfer(failedCopy.boardId, failedCopy.operationId);
            const pending = getState().portfolioBoards.flatMap((board) => (board.data.extensions.projectTransfers?.operations || []).filter((operation) => operation.status === 'pending' && (operation.from.permanentId === task.permanentId || operation.to.permanentId === task.permanentId)).map((operation) => ({ board, operation })))[0];
            if (pending) return await resumeProjectTransfer(pending.board.id, pending.operation.id);
            const children = mode === 'move' ? transferDescendants(source.data, taskId) : [];
            const childReview = childTransferReview(source.data, children);
            if (childReview.children?.some((child) => child.blocked)) {
                await confirm(t('workitems.error.childrenState'), { title: t(`transfer.${mode}`), confirmLabel: t('common.close'), review: {
                    source: source.title, destination: '—', state: '', color: '', sourceLabel: t('transfer.source'), destinationLabel: t('transfer.destination'), stateLabel: t('task.status'),
                    removalsLabel: '', removals: [], mappingLabel: '', mappingNote: '', note: t('workitems.error.childrenState'), ...childReview
                } });
                return false;
            }
            assertWorkitemTransfer(source.data, taskId, mode);
            const destinations = getState().portfolioBoards.filter((board) => board.id !== boardId && sameProduct(source.data, board.data));
            if (!destinations.length) { await alert(t('transfer.noDestination')); return false; }
            const eligible = destinations.filter((board) => writable(board.id) && !isProjectTransferLocked(board.id));
            if (!eligible.length) throw new TransferError('unavailable');
            const destinationId = await choose(t('transfer.destinationHelp', { source: source.title }), eligible.map((board) => ({ value: board.id, label: board.title })), { title: t(`transfer.${mode}`), selectionLabel: t('transfer.destination'), requiredSelection: true });
            if (!destinationId) return false;
            const destination = getBoardRecord(destinationId)!;
            const hierarchy = children.length ? [task, ...children] : [];
            const rootFields = projectTransferFields(source.data, destination.data, task, '', hierarchy);
            const childFields = children.map((child) => ({ child, editor: projectTransferFields(source.data, destination.data, child, `${child.permanentId}:`, hierarchy) }));
            const selections = [...rootFields.fields, ...childFields.flatMap((entry) => entry.editor.fields)];
            const note = t(children.length ? 'transfer.hierarchySummary' : 'transfer.scopeSummary');
            const answer = await confirm(note, { title: t(`transfer.${mode}`), confirmLabel: t('common.confirm'), selections, review: {
                source: source.title, destination: destination.title, state: '', color: '',
                sourceLabel: t('transfer.source'), destinationLabel: t('transfer.destination'), stateLabel: t('task.status'),
                removalsLabel: t('transfer.removalsTitle'), removals: [],
                mappingLabel: t('transfer.mappingTitle'), mappingNote: t('transfer.mappingSummary'), note, ...childReview
            } });
            if (!answer) return false;
            const values = typeof answer === 'object' ? answer as Record<string, string> : {};
            const { stateId, mapping } = rootFields.read(values);
            const childChoices = Object.fromEntries(childFields.map(({ child, editor }) => [child.permanentId!, editor.read(values)]));
            let acceptanceAuthor: string | undefined;
            if (statusCategory(stateId, destination.data, task) === 'completed' && ['story', 'bug'].includes(workitemType(task)) && !(mode === 'move' && task.acceptance)) {
                // This item arrives without children; its new local number cannot refer to destination children.
                const preview = { ...task, id: nextTaskIdForBoard(destination), status: stateId };
                const author = await requestWorkitemAcceptance(destination.data, preview, prompt);
                if (author === null) return false;
                acceptanceAuthor = author;
            }
            // Watch both files again after the user has reviewed the draft.
            await checkFiles();
            if (getBoardRecord(boardId)?.data !== source.data || getBoardRecord(destinationId)?.data !== destination.data) throw new TransferError('stale');
            if (!writable(destinationId) || isBoardInHistoricalPreview(getState(), boardId) || (mode === 'move' && !writable(boardId))) throw new TransferError('unavailable');
            const prepared = prepareProjectTransfer(source, destination, taskId, mode, stateId, mapping, getState().portfolioBoards, undefined, getState().unloadedRelationSources.flatMap((entry) => entry.relations), acceptanceAuthor, childChoices);
            // Validate before publishing: an invalid draft cannot affect either project.
            validateBoardData(prepared.destination);
            publish(destinationId, prepared.destination);
            if (mode === 'copy') failedCopies.set(`${boardId}:${task.permanentId}`, { boardId: destinationId, operationId: prepared.operation.id });
            const complete = await finish(destinationId, prepared.operation);
            if (complete) failedCopies.delete(`${boardId}:${task.permanentId}`);
            if (complete && mode === 'move') context.closeDialogFn('taskDetail');
            await alert(t(complete ? 'transfer.complete' : 'transfer.pending'));
            return complete;
        } catch (error) { await alert(t(error instanceof WorkitemError ? `workitems.error.${error.code}` : error instanceof TransferError ? `transfer.error.${error.code}` : 'transfer.pending')); return false; }
        finally { preparing = false; }
    }
    return { transferPortfolioTask, resumeProjectTransfer };
}
