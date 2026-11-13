// The relation editor in the task detail as an explicit state machine.
// Pure: the component dispatches events and renders the state.

import type { TaskRelationKind } from '@/domain/types';

export type RelationEditorMode = 'link' | 'create' | 'edit';

export type RelationPicker = { open: false } | { open: true; active: number };

export type RelationEditorState =
    | { kind: 'viewing'; busy: boolean }
    | {
        kind: 'composing';
        mode: RelationEditorMode;
        /** Text in the search box; the chosen item's label once one is chosen. */
        search: string;
        /** The chosen workitem, or '' while searching. */
        otherId: string;
        /** Replacing or creating a relation always needs an explicit choice, including its direction. */
        relation: TaskRelationKind | '';
        picker: RelationPicker;
        busy: boolean;
    };

export type RelationEditorEvent =
    | { type: 'start'; mode: RelationEditorMode; otherId?: string; search?: string }
    | { type: 'cancel' }
    | { type: 'searchTyped'; search: string }
    | { type: 'pickerOpened' }
    | { type: 'pickerClosed' }
    | { type: 'pickerMoved'; step: 1 | -1; count: number }
    | { type: 'itemChosen'; otherId: string; search: string }
    | { type: 'relationChosen'; relation: TaskRelationKind | '' }
    | { type: 'requestStarted' }
    | { type: 'requestFinished'; ok: boolean };

export const initialRelationEditorState: RelationEditorState = { kind: 'viewing', busy: false };

export function relationEditorReducer(state: RelationEditorState, event: RelationEditorEvent): RelationEditorState {
    switch (event.type) {
        case 'start':
            if (state.busy) return state;
            return { kind: 'composing', mode: event.mode, search: event.search || '', otherId: event.otherId || '', relation: '', picker: { open: false }, busy: false };
        case 'cancel':
            return state.busy ? state : initialRelationEditorState;
        case 'requestStarted':
            return { ...state, busy: true };
        case 'requestFinished':
            // A successful change closes the editor; a refused one keeps the user's input.
            return event.ok ? initialRelationEditorState : { ...state, busy: false };
    }
    if (state.kind !== 'composing') return state;
    switch (event.type) {
        case 'searchTyped':
            return { ...state, search: event.search, otherId: '', relation: '', picker: { open: true, active: -1 } };
        case 'pickerOpened':
            return state.picker.open ? state : { ...state, picker: { open: true, active: -1 } };
        case 'pickerClosed':
            return { ...state, picker: { open: false } };
        case 'pickerMoved': {
            if (!event.count) return { ...state, picker: { open: true, active: state.picker.open ? state.picker.active : -1 } };
            const current = state.picker.open ? state.picker.active : -1;
            const active = current < 0
                ? (event.step === 1 ? 0 : event.count - 1)
                : (current + event.step + event.count) % event.count;
            return { ...state, picker: { open: true, active } };
        }
        case 'itemChosen':
            return { ...state, otherId: event.otherId, search: event.search, relation: '', picker: { open: false } };
        case 'relationChosen':
            return { ...state, relation: event.relation };
    }
}
