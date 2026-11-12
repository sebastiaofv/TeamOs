import { describe, expect, it } from 'vitest';
import { initialRelationEditorState, relationEditorReducer, type RelationEditorEvent, type RelationEditorState } from '../../src/features/portfolio/task/dialogs/relationEditorState';

const run = (...events: RelationEditorEvent[]): RelationEditorState => events.reduce(relationEditorReducer, initialRelationEditorState);

describe('relation editor state', () => {
  it('starts each mode from a clean draft that needs an explicit relation', () => {
    const state = run({ type: 'start', mode: 'edit', otherId: '4', search: '#4 Task' });
    expect(state).toEqual({ kind: 'composing', mode: 'edit', search: '#4 Task', otherId: '4', relation: '', picker: { open: false }, busy: false });
  });

  it('clears the chosen item and relation when the search changes', () => {
    const state = run({ type: 'start', mode: 'link' }, { type: 'itemChosen', otherId: '2', search: '#2' }, { type: 'relationChosen', relation: 'blocks' }, { type: 'searchTyped', search: 'x' });
    expect(state).toMatchObject({ otherId: '', relation: '', picker: { open: true, active: -1 } });
  });

  it('wraps keyboard movement through the candidates', () => {
    const down = run({ type: 'start', mode: 'link' }, { type: 'pickerMoved', step: 1, count: 3 });
    expect(down).toMatchObject({ picker: { open: true, active: 0 } });
    const up = run({ type: 'start', mode: 'link' }, { type: 'pickerMoved', step: -1, count: 3 });
    expect(up).toMatchObject({ picker: { open: true, active: 2 } });
    const wrapped = run({ type: 'start', mode: 'link' }, { type: 'pickerMoved', step: -1, count: 3 }, { type: 'pickerMoved', step: 1, count: 3 });
    expect(wrapped).toMatchObject({ picker: { open: true, active: 0 } });
  });

  it('closes the picker when an item is chosen', () => {
    const state = run({ type: 'start', mode: 'link' }, { type: 'pickerOpened' }, { type: 'itemChosen', otherId: '2', search: '#2' });
    expect(state).toMatchObject({ otherId: '2', picker: { open: false } });
  });

  it('closes after a successful request and keeps the draft after a refused one', () => {
    const composing: RelationEditorEvent[] = [{ type: 'start', mode: 'link' }, { type: 'itemChosen', otherId: '2', search: '#2' }, { type: 'requestStarted' }];
    expect(run(...composing, { type: 'requestFinished', ok: true })).toEqual(initialRelationEditorState);
    expect(run(...composing, { type: 'requestFinished', ok: false })).toMatchObject({ kind: 'composing', otherId: '2', busy: false });
  });

  it('ignores start and cancel while a request is running', () => {
    const busy = run({ type: 'start', mode: 'link' }, { type: 'requestStarted' });
    expect(relationEditorReducer(busy, { type: 'cancel' })).toBe(busy);
    expect(relationEditorReducer(busy, { type: 'start', mode: 'create' })).toBe(busy);
  });
});
