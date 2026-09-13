# Phase 2.0 — React Foundation and Legacy Bridge — Design

**Date:** 2026-09-13
**Status:** Approved (sections 1–3 reviewed in conversation)
**Parent spec:** `2026-09-11-vite-react-tailwind-migration-design.md` (stack, id preservation, Zustand/dnd-kit/Radix choices — not revisited here)

## Decisions taken for Phase 2

| Question | Decision |
|---|---|
| Must `main` work at every merge? | **Yes — incremental.** React mounts into the existing page one piece at a time; the 89 black-box Playwright tests gate every step. |
| Restyle to Tailwind while porting? | **No — separate pass.** Ports reuse existing `legacy.css` class names; Tailwind conversion is sub-project 2.8. |
| Guard against visual regressions? | **Targeted screenshot baselines**, captured against legacy before each port; the port must match. |
| How do legacy code and React share state? | **Version-tick bridge.** `appState` stays the source of truth; React subscribes to a change counter and calls shared action functions. Zustand slices replace the bridge in 2.7. |

Rejected alternatives for state sharing: converting `appState` and every in-place board mutation to immutable Zustand up front (a large, risky step with no UI payoff, breaking the "every merge works" goal), and per-island local React state synced by hand (duplicated state that drifts, worst around timeline preview and save/conflict flows).

## Phase 2 decomposition

Phase 2 is a sequence of sub-projects. **This spec covers 2.0 only.** Every later row gets its own short spec and plan, written after the previous one lands.

| # | Sub-project | Ships |
|---|---|---|
| **2.0** | **Foundation + proof island** | React 19 + `@vitejs/plugin-react`, island mounting, version-tick bridge, screenshot harness, Shortcuts + Help dialogs on Radix Dialog |
| 2.1 | Remaining modals + toast | Task detail, task editor (assignee/tag/checklist/attachment editors), roadmap entity modal, undo toast |
| 2.2 | Toolbar + chips | Filters, sort, view-mode toggle, project chips (save state/retry), bulk actions |
| 2.3 | Timeline panel | Slider, event list, preview banner, restore |
| 2.4 | Board view | Columns/cards; dnd-kit for cards and checklist reorder (the approved drag test rewrites land here) |
| 2.5 | Roadmap view | Sections, rows, disclosure, today marker |
| 2.6 | Calendar view | Year/month/heatmap modes |
| 2.7 | Shell + state takeover | Import/drop/file-watch wiring into hooks; `src/legacy/main.js` deleted; bridge replaced by the four Zustand slices |
| 2.8 | Tailwind pass | Per component; screenshot baselines updated deliberately; `legacy.css` retired |

### Rules for every sub-project

1. DOM ids are preserved exactly.
2. Ported markup reuses the existing CSS classes and structure until 2.8.
3. Screenshot baselines for the piece being ported are captured against legacy first; the port must match them.
4. All 89 existing Playwright tests pass at every merge; `npm run test:unit` and `npm run build` pass.
5. A port deletes the legacy render/event code it replaces in the same change — nothing is rendered by both.
6. Parity is the bar. Improvements are filed, not built (already filed: chip shows "Unsaved" instead of "Saving" during a single in-flight save).

## 2.0 architecture

### Files

```
src/
├─ main.jsx                    # new entry: imports legacy, then mounts React
├─ bridge/
│  └─ appStore.js              # version tick: subscribe / getVersion / notifyAppStateChanged / useAppState
├─ actions/
│  └─ dialogs.js               # openDialog(name) / closeDialog()
├─ components/
│  ├─ AppIslands.jsx           # single React root: error boundary + all islands
│  ├─ IslandErrorBoundary.jsx  # logs via Logger.error, renders null for the failed island
│  └─ dialogs/
│     ├─ ShortcutsDialog.jsx
│     └─ HelpDialog.jsx
├─ legacy/main.js              # modified: dialog functions delegate to actions
└─ state/store.js              # modified: adds activeDialog
```

Dependencies added: `react@19`, `react-dom@19`, `@radix-ui/react-dialog`, and dev dependency `@vitejs/plugin-react`. `vite.config.js` registers the React plugin; `tailwind.config.js` already scans `src/**/*.{js,jsx}`.

### Entry and mounting

- `index.html` replaces `<script type="module" src="/src/legacy/main.js">` with `/src/main.jsx`, and adds `<div id="reactRoot"></div>` as the last element before the script.
- `src/main.jsx` does `import './legacy/main.js'` first (legacy boot runs to completion as a module side effect, exactly as today), then `createRoot(document.getElementById('reactRoot')).render(<AppIslands />)`.
- One React root. Islands render from it: dialogs via Radix's portal (to `document.body`); later sub-projects use `createPortal` into existing containers (`#portfolioBoard`, `#portfolioTimelinePanel`, …). One tree, one context.

### Version-tick bridge — `src/bridge/appStore.js`

```js
import { useSyncExternalStore } from 'react';
import { appState } from '../state/store.js';

let version = 0;
const listeners = new Set();

export function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function getVersion() {
    return version;
}

export function notifyAppStateChanged() {
    version += 1;
    listeners.forEach((listener) => listener());
}

export function useAppState(select) {
    useSyncExternalStore(subscribe, getVersion);
    return select(appState);
}
```

- The snapshot is the version number, so in-place mutation of `appState` (and of board data inside it) is safe: every notify re-renders subscribers, which re-run their selector against current state.
- `notifyAppStateChanged()` is called by actions after they mutate state, and at the end of legacy `renderPortfolio()` plus the targeted legacy renders that change visible state. In 2.0 only the dialog actions need it; the `renderPortfolio` hook-up is added now so 2.1+ islands can rely on it.
- It is never called during a React render. Selectors are read-only.

### Actions — `src/actions/dialogs.js`

```js
import { appState } from '../state/store.js';
import { notifyAppStateChanged } from '../bridge/appStore.js';

export function openDialog(name) {
    appState.activeDialog = name;
    notifyAppStateChanged();
}

export function closeDialog() {
    if (appState.activeDialog === null) return;
    appState.activeDialog = null;
    notifyAppStateChanged();
}
```

`src/state/store.js` gains `activeDialog: null` (values: `null | 'shortcuts' | 'help'`) under the Shell section. Actions are plain modules imported by both legacy code and components — never exposed on `window`.

### Legacy changes in `src/legacy/main.js`

- `openShortcutsModal()` → `openDialog('shortcuts')`; `closeShortcutsModal()` → `closeDialog()`; `openHelpModal()` → `openDialog('help')`; `closeHelpModal()` → `closeDialog()`.
- `getShortcutModalContext()` derives `shortcutsModalOpen` / `helpModalOpen` from `appState.activeDialog` instead of `document.getElementById(...).classList.contains('active')` (those elements exist only while open). Precedence order of modals is unchanged.
- The `close-modal` registry entry's handler calls `closeDialog()` alongside the existing legacy modal closers.
- Deleted: `renderShortcutsModalContent`, `renderShortcutKeys`, the `openShortcutsModal` call to `renderShortcutsModalContent`, the four click listeners for `shortcutsModalCloseBtn`, `shortcutsModalFooterCloseBtn`, `helpModalCloseBtn`, `helpModalFooterCloseBtn`, and the two overlay-click listeners for `#shortcutsModal` / `#helpModal`. `#openShortcutsBtn` and `#openHelpBtn` stay in legacy markup and keep calling the (now delegating) open functions.
- `index.html`: the static `#shortcutsModal` and `#helpModal` markup is deleted.

### Dialog components

Both dialogs render the legacy structure so existing CSS and selectors apply unchanged:

```jsx
<Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog(); }}>
  <Dialog.Portal>
    <Dialog.Overlay className="modal active" id="helpModal">
      <Dialog.Content className="modal-content" aria-describedby={undefined}>
        <div className="modal-header">
          <Dialog.Title asChild><span className="modal-title">Help</span></Dialog.Title>
          <Dialog.Close className="modal-close" id="helpModalCloseBtn">&times;</Dialog.Close>
        </div>
        <div className="modal-body">{/* help manual JSX, copied verbatim from index.html */}</div>
        <div className="modal-footer">
          <Dialog.Close className="btn" id="helpModalFooterCloseBtn">Close</Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Overlay>
  </Dialog.Portal>
</Dialog.Root>
```

- `open` comes from `useAppState((s) => s.activeDialog === 'help')`.
- `ShortcutsDialog` renders `#shortcutsList` from `useAppState((s) => s.ShortcutRegistry)` with the same grouping as the deleted `renderShortcutsModalContent`: groups Global / Cards / Modals (Modals = sections Task Modal, Task Detail, Modal), subsection headings only when a group has more than one section, `<kbd>` tokens joined by `<span class="shortcut-plus">+</span>`. The registry is always populated by the time React renders: legacy `init()` calls `buildShortcutRegistry()` before `src/main.jsx` mounts the root.
- Radix supplies focus trap, focus return to the trigger, scroll lock, `role="dialog"`/`aria-labelledby`, Escape and outside-click dismissal — all routed through `onOpenChange` → `closeDialog()`.

## Error handling

- `AppIslands` wraps each island in `IslandErrorBoundary`: a render error is logged with `Logger.error('React island failed', { island, error })` and that island renders `null`; the rest of the app, legacy and other islands, keeps working.
- If `createRoot` itself fails, legacy boot has already completed, so the app runs without the ported dialogs (their buttons do nothing) rather than failing to load. This is logged, not surfaced to the user.

## Testing

### Screenshot baselines — `tests/visual.test.js` (new)

Captured against **legacy** before any dialog code changes, committed, and required to match after the port.

| Baseline | Theme |
|---|---|
| Shortcuts dialog open | light, dark |
| Help dialog open | light, dark |
| No dialog open (catches leaked overlay / scroll lock) | light |

- Viewport 1280×800, `page.clock.setFixedTime('2026-02-26T12:00:00Z')`, full page, Playwright's default animation disabling.
- Dark theme set via `localStorage.setItem('teamOsKanbanTheme', 'dark')` in `page.addInitScript`.
- `expect.toHaveScreenshot` default `maxDiffPixelRatio: 0.001` in `playwright.config.js`.
- Baselines are platform-specific; this repo generates them on macOS. The README documents that `--update-snapshots` is run only deliberately and the image diff is reviewed. Only 2.8 is expected to update baselines.

### Behaviour (Playwright, existing file)

- Unchanged and must pass: "help button opens and closes help modal", "keyboard shortcut opens shortcuts modal", "keyboard shortcuts can open help and import projects", "roadmap entity modal traps shortcut context and Escape closes it".
- New: opening either dialog moves focus inside it; closing (Escape, close button, footer button, overlay click) removes the dialog from the DOM and returns focus to the element focused before it opened — the header button when opened by click; for shortcut-opened dialogs, whatever had focus (typically `body`).

### Unit (Vitest, node)

- `tests/unit/appStore.test.js`: `subscribe` receives notifications, `getVersion` increments per notify, unsubscribe stops delivery.
- `tests/unit/dialogs.test.js`: `openDialog` sets `activeDialog` and notifies; `closeDialog` clears and notifies; `closeDialog` when already closed does not notify.
- No jsdom component tests — components are covered by Playwright.

## Risks

1. **Two keyboard systems.** Radix and the legacy document `keydown` dispatcher both see keys. Mitigation: dialog open state lives in `appState.activeDialog`, which the dispatcher reads, so global shortcuts stay suppressed while a dialog is open; Radix and the legacy Escape entry both resolve to the idempotent `closeDialog()`. Guarded by the roadmap-modal shortcut test.
2. **Render loops.** Calling `notifyAppStateChanged` inside a React render would loop. Mitigation: only actions and legacy renders notify; selectors are pure.
3. **Mount ordering.** React mounts after legacy boot; `useSyncExternalStore` reads the current version on mount, so no notification before mount is lost.
4. **Radix structure vs legacy CSS.** `.modal` expects `display:flex` centering of `.modal-content` inside the overlay. Rendering `Content` inside `Overlay` preserves that; the screenshot baselines verify it.

## Out of scope for 2.0

Any other modal, view, or toolbar control; Zustand; dnd-kit; Tailwind styling; fixing the chip "Unsaved"/"Saving" quirk.
