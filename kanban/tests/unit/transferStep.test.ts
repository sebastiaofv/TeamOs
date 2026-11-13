import { describe, expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import type { BoardData } from '../../src/domain/types';
import { nextTransferStep, TransferError, type TransferOperation } from '../../src/domain/projectTransfers';

const operation = (changes: Partial<TransferOperation> = {}): TransferOperation => fromPartial({
  id: 'op', mode: 'move', status: 'pending', from: { permanentId: 'src-1' }, to: { permanentId: 'dst-1' }, ...changes
});
const board = (permanentIds: string[], operations: TransferOperation[] = []): BoardData => fromPartial({
  board: { tasks: permanentIds.map((permanentId, index) => ({ id: index + 1, permanentId })) },
  extensions: { projectTransfers: { operations } }
});

describe('nextTransferStep', () => {
  it('is complete once the receipt is written, whatever the projects hold', () => {
    const op = operation({ status: 'complete' });
    expect(nextTransferStep(op, board([], [op]), board(['src-1']))).toBe('complete');
  });

  it('goes straight to the receipt for a copy', () => {
    const op = operation({ mode: 'copy' });
    expect(nextTransferStep(op, board(['dst-1'], [op]), board(['src-1']))).toBe('writeReceipt');
  });

  it('removes a moved item while the source still has it, then writes the receipt', () => {
    const op = operation();
    expect(nextTransferStep(op, board(['dst-1'], [op]), board(['src-1']))).toBe('removeSource');
    expect(nextTransferStep(op, board(['dst-1'], [op]), board([]))).toBe('writeReceipt');
    expect(nextTransferStep(op, board(['dst-1'], [op]), null)).toBe('writeReceipt');
  });

  it('considers every member of a batch', () => {
    const parent = operation({ batchId: 'b' });
    const child = operation({ id: 'op-2', batchId: 'b', from: fromPartial({ permanentId: 'src-2' }), to: fromPartial({ permanentId: 'dst-2' }) });
    expect(nextTransferStep(parent, board(['dst-1', 'dst-2'], [parent, child]), board(['src-2']))).toBe('removeSource');
  });

  it('refuses to continue a move whose destination item disappeared', () => {
    const op = operation();
    expect(() => nextTransferStep(op, board([], [op]), board(['src-1']))).toThrow(TransferError);
  });
});
