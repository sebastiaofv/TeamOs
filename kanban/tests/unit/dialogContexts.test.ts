import { afterEach, describe, expect, it } from 'vitest';
import { fromPartial } from '@total-typescript/shoehorn';
import { closeDialog, openDialog } from '../../src/app/overlays/dialogs';
import { useAppStore } from '../../src/features/portfolio/state/store';

const detail = { boardId: 'p1', taskId: 1, readOnly: false };

afterEach(() => {
  useAppStore.setState({ activeDialog: null, dialogProps: null, portfolioDetailContext: null, taskEditorContext: null, roadmapEntityContext: null });
});

describe('dialog contexts live exactly as long as their dialog', () => {
  it('clears the task detail context when any close path closes the detail', () => {
    useAppStore.setState({ portfolioDetailContext: detail });
    openDialog('taskDetail', fromPartial({}));
    closeDialog();
    expect(useAppStore.getState().portfolioDetailContext).toBeNull();
  });

  it('clears the context of a dialog replaced by another one', () => {
    useAppStore.setState({ taskEditorContext: { mode: 'edit', boardId: 'p1', taskId: 1 } });
    openDialog('taskEditor', fromPartial({}));
    openDialog('commandPalette', fromPartial({ contextTask: null, initialQuery: '' }));
    expect(useAppStore.getState().taskEditorContext).toBeNull();
  });

  it('keeps the context when the same dialog is reopened with new props', () => {
    useAppStore.setState({ portfolioDetailContext: detail });
    openDialog('taskDetail', fromPartial({}));
    openDialog('taskDetail', fromPartial({}));
    expect(useAppStore.getState().portfolioDetailContext).toEqual(detail);
  });

  it('leaves other contexts alone when an unrelated dialog closes', () => {
    useAppStore.setState({ portfolioDetailContext: detail });
    openDialog('shortcuts');
    closeDialog('shortcuts');
    expect(useAppStore.getState().portfolioDetailContext).toEqual(detail);
  });
});
