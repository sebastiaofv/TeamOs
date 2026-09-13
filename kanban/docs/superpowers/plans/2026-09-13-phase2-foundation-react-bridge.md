# Phase 2.0 — React Foundation and Legacy Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-09-13-phase2-foundation-react-bridge-design.md`

**Goal:** Mount a single React 19 root beside the legacy app, share `appState` through a version-tick bridge, and port the Shortcuts and Help modals to Radix Dialog with pixel parity against legacy.

**Architecture:** `src/main.jsx` imports `src/legacy/main.js` (legacy boots as a side effect, unchanged), then renders `<AppIslands />` into `#reactRoot`. `appState` stays the source of truth: actions mutate it and call `notifyAppStateChanged()`, and components read it via `useAppState(select)`, which re-renders on a version counter. Dialogs portal to `document.body` and reuse the legacy markup, ids and CSS classes.

**Tech Stack:** Vite 5, React 19, `@radix-ui/react-dialog`, `@vitejs/plugin-react` 4.x, Vitest 2 (node), Playwright 1.52 (CJS test files).

## Global Constraints

- DOM ids are preserved exactly (`#shortcutsModal`, `#shortcutsList`, `#shortcutsModalCloseBtn`, `#shortcutsModalFooterCloseBtn`, `#helpModal`, `#helpModalCloseBtn`, `#helpModalFooterCloseBtn`, `#openShortcutsBtn`, `#openHelpBtn`).
- Ported markup reuses the existing `legacy.css` class names and structure. No Tailwind classes.
- Screenshot baselines are captured against **legacy** (Task 1) before any dialog code changes; the port must match them. Never run `--update-snapshots` after Task 1.
- A port deletes the legacy render/event code it replaces in the same commit — nothing is rendered by both.
- Parity is the bar. Improvements are filed, not built.
- Actions are plain modules imported by legacy code and components. Nothing is exposed on `window`.
- `notifyAppStateChanged()` is never called during a React render; selectors are read-only.
- Tests are black-box: Playwright drives the page only through DOM, URL, keyboard and pointer input.
- Every task ends with `npm run test:unit`, then `npm run build && npm test` all passing. Stage explicit paths (never `git add -A`).
- Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Facts the tasks rely on

- `playwright.config.js` serves `dist/` via `npm run preview` on `127.0.0.1:4173`. **Always `npm run build` before `npm test`**, or the tests run against stale output.
- Legacy boot (`src/legacy/main.js`, last lines): `setPersistenceHost(...)`, `cacheRefs()`, `bindStaticUiEvents()`, `init()`. `init()` calls `buildShortcutRegistry()`, so `appState.ShortcutRegistry` is populated before anything imported after the legacy module runs.
- The shortcut dispatcher (`dispatchShortcutKeydown`, on `document` `keydown`) reads `getShortcutModalContext()` to pick a context: `taskModal` > `detailModal` > `roadmapEntityModal` > `shortcutsModal` > `helpModal` > `global`. Global entries `open-shortcuts` (`?` / `Shift+/`) and `open-help` (`h`) call `openShortcutsModal()` / `openHelpModal()`. The `close-modal` entry (Escape) runs in every modal context.
- Legacy CSS: `.modal { display:none; position:fixed; inset 0; display flex centering when .active }`; `#shortcutsModal .modal-content`, `#shortcutsModal .modal-body`, `#helpModal .modal-content` carry size rules. Keeping `id` + `class="modal active"` on the Radix Overlay and `.modal-content` on Content keeps all of them applying.
- The theme is read from `localStorage['teamOsKanbanTheme']` (`THEME_STORAGE_KEY` in `src/domain/constants.js`).
- Radix Dialog focuses the first tabbable element in Content on open (the `×` close button), returns focus to the previously focused element on close, and routes Escape / outside pointer-down / `Dialog.Close` through `onOpenChange(false)`. A pointer-down on the Overlay counts as outside Content.
- `:focus-visible` in Chromium follows the last input modality. The visual tests open dialogs with **mouse clicks** so Radix's programmatic focus shows no focus ring, and blur before the "no dialog" shot. Do not change that to keyboard opening.
- JSX whitespace: a newline between text and an element is dropped (`existing\n<code>` renders `existing<code>`). Where legacy HTML relies on a line-break space next to an inline element, write `{' '}` explicitly. The Help screenshot baselines catch any miss.

## File map

| File | Status | Responsibility |
|---|---|---|
| `tests/visual.test.js` | create (T1) | Screenshot baselines for dialogs and the idle page |
| `tests/visual.test.js-snapshots/*.png` | create (T1) | Baselines captured against legacy, macOS |
| `playwright.config.js` | modify (T1) | `toHaveScreenshot` threshold |
| `package.json` | modify (T2) | React, Radix, plugin-react |
| `vite.config.js` | modify (T2) | Register React plugin |
| `index.html` | modify (T2, T4, T5) | `#reactRoot`, entry script; delete static dialog markup |
| `src/main.jsx` | create (T2) | Entry: import legacy, mount React root |
| `src/bridge/appStore.js` | create (T2) | Version tick: `subscribe` / `getVersion` / `notifyAppStateChanged` / `useAppState` |
| `src/components/AppIslands.jsx` | create (T2, modify T4, T5) | Single root; wraps each island in the error boundary |
| `src/components/IslandErrorBoundary.jsx` | create (T2) | Logs and renders `null` for a failed island |
| `tests/unit/appStore.test.js` | create (T2) | Bridge unit tests |
| `src/state/store.js` | modify (T3) | `activeDialog: null` |
| `src/actions/dialogs.js` | create (T3) | `openDialog(name)` / `closeDialog()` |
| `tests/unit/dialogs.test.js` | create (T3) | Action unit tests |
| `src/components/dialogs/HelpDialog.jsx` | create (T4) | Help modal on Radix |
| `src/components/dialogs/ShortcutsDialog.jsx` | create (T5) | Shortcuts modal on Radix |
| `src/legacy/main.js` | modify (T2, T4, T5) | `renderPortfolio` notify; dialog functions delegate; dead dialog code deleted |
| `tests/app.test.js` | modify (T4, T5) | Focus-in / focus-return / unmount tests |
| `README.md` | modify (T1, T5) | Snapshot policy, architecture, test counts |

---

### Task 1: Screenshot harness and legacy baselines

**Files:**
- Create: `tests/visual.test.js`
- Create: `tests/visual.test.js-snapshots/` (generated PNGs)
- Modify: `playwright.config.js`
- Modify: `README.md` (Testing section)

**Interfaces:**
- Consumes: nothing.
- Produces: five committed baselines that Tasks 4 and 5 must match: `shortcuts-light`, `shortcuts-dark`, `help-light`, `help-dark`, `no-dialog-light`.

No source change in this task. The "failing test" step is the first run, which fails because no baseline exists and writes one.

- [ ] **Step 1: Add the screenshot threshold to `playwright.config.js`**

Replace the `expect` block:

```js
  expect: {
    timeout: 5_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001
    }
  },
```

- [ ] **Step 2: Write `tests/visual.test.js`**

```js
'use strict';

const { test, expect } = require('@playwright/test');

// Pixel baselines for pieces being ported to React. They are captured against
// the legacy implementation first; a port must match them unchanged. Baselines
// are platform-specific (generated on macOS). Only update them deliberately
// (`npx playwright test tests/visual.test.js --update-snapshots`) and review the
// image diff in the commit.

const FIXED_TIME = '2026-02-26T12:00:00Z';

// Dialogs are opened with mouse clicks, never keys: Radix focuses the close
// button on open, and Chromium only paints a :focus-visible ring for that
// programmatic focus after keyboard input. Legacy never moved focus.
async function gotoVisualApp(page, theme) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.setFixedTime(FIXED_TIME);
  await page.addInitScript((value) => {
    window.localStorage.setItem('teamOsKanbanTheme', value);
  }, theme);
  await page.goto('/');
  await expect(page.locator('#portfolioView')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

for (const theme of ['light', 'dark']) {
  test(`shortcuts dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openShortcutsBtn').click();
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect(page.locator('#shortcutsList')).toContainText('Open keyboard shortcuts');
    await expect(page).toHaveScreenshot(`shortcuts-${theme}.png`, { fullPage: true });
  });

  test(`help dialog open (${theme})`, async ({ page }) => {
    await gotoVisualApp(page, theme);
    await page.locator('#openHelpBtn').click();
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect(page.locator('#helpModal')).toContainText('Drag cards between columns');
    await expect(page).toHaveScreenshot(`help-${theme}.png`, { fullPage: true });
  });
}

test('no dialog open after opening and closing one (light)', async ({ page }) => {
  await gotoVisualApp(page, 'light');
  await page.locator('#openShortcutsBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeVisible();
  await page.locator('#shortcutsModalFooterCloseBtn').click();
  await expect(page.locator('#shortcutsModal')).toBeHidden();
  await page.evaluate(() => document.activeElement?.blur());
  await expect(page).toHaveScreenshot('no-dialog-light.png', { fullPage: true });
});
```

- [ ] **Step 3: Run it to confirm it fails for missing baselines**

Run: `npm run build && npx playwright test tests/visual.test.js`
Expected: 5 failed, each with `A snapshot doesn't exist at .../tests/visual.test.js-snapshots/<name>-darwin.png, writing actual.`

- [ ] **Step 4: Run it again to confirm the written baselines are stable**

Run: `npx playwright test tests/visual.test.js`
Expected: 5 passed. If any fails, the page is not deterministic — find the moving part (time, animation, focus) and fix the test; do not loosen the threshold.

- [ ] **Step 5: Open each PNG and check it shows what its name says**

Run: `ls tests/visual.test.js-snapshots/`
Expected: five files. Read each image: the two shortcuts shots show the grouped shortcut cards over the dimmed page, the help shots show the Help manual, `no-dialog-light` shows the empty portfolio with no overlay.

- [ ] **Step 6: Document the snapshot policy in `README.md`**

In the `## Testing` section, after the "End-to-end tests" bullet, add:

```markdown
- **Visual baselines** (`tests/visual.test.js`, part of `npm test`) — Playwright screenshots of UI pieces taken against the legacy implementation before they are ported to React; a port must match them. Baselines in `tests/visual.test.js-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.js --update-snapshots`, and review the image diff in the commit. Phase 2.8 (Tailwind pass) is the only planned update.
```

- [ ] **Step 7: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: unit all pass; Playwright `94 passed` (89 existing + 5 visual).

- [ ] **Step 8: Commit**

```bash
git add playwright.config.js tests/visual.test.js tests/visual.test.js-snapshots README.md
git commit -m "test(visual): capture legacy screenshot baselines for shortcuts and help dialogs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: React toolchain, entry point, and version-tick bridge

**Files:**
- Modify: `package.json`, `package-lock.json` (via npm)
- Modify: `vite.config.js`
- Modify: `index.html:477`
- Create: `src/main.jsx`
- Create: `src/bridge/appStore.js`
- Create: `src/components/AppIslands.jsx`
- Create: `src/components/IslandErrorBoundary.jsx`
- Modify: `src/legacy/main.js` (imports at top; `renderPortfolio` end, line ~2174)
- Test: `tests/unit/appStore.test.js`

**Interfaces:**
- Consumes: `appState` from `src/state/store.js`; `Logger` from `src/logger.js`.
- Produces:
  - `subscribe(listener: () => void): () => void` (returns unsubscribe)
  - `getVersion(): number`
  - `notifyAppStateChanged(): void`
  - `useAppState<T>(select: (state: typeof appState) => T): T`
  - `IslandErrorBoundary` — props `{ island: string, children }`
  - `AppIslands` — default-less named export, rendered once by `src/main.jsx`; Tasks 4 and 5 add islands inside it.

- [ ] **Step 1: Install dependencies**

Run:
```bash
npm install react@^19 react-dom@^19 @radix-ui/react-dialog@^1
npm install -D @vitejs/plugin-react@^4
```
Expected: `package.json` gains `dependencies` (`react`, `react-dom`, `@radix-ui/react-dialog`) and devDependency `@vitejs/plugin-react`. `npm ls react` shows a single `react@19.x`. If npm reports a peer conflict between `@vitejs/plugin-react` and `vite@5`, pin `@vitejs/plugin-react@4.3.4` (supports Vite 4–6).

- [ ] **Step 2: Write the failing bridge unit test `tests/unit/appStore.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { subscribe, getVersion, notifyAppStateChanged } from '../../src/bridge/appStore.js';

describe('appStore version tick', () => {
  it('delivers a notification to a subscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    notifyAppStateChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('increments the version by one per notify', () => {
    const before = getVersion();

    notifyAppStateChanged();
    notifyAppStateChanged();

    expect(getVersion()).toBe(before + 2);
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    unsubscribe();
    notifyAppStateChanged();

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies every subscriber', () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = subscribe(first);
    const unsubscribeSecond = subscribe(second);

    notifyAppStateChanged();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribeFirst();
    unsubscribeSecond();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/unit/appStore.test.js`
Expected: FAIL — `Failed to load url ../../src/bridge/appStore.js` (file does not exist).

- [ ] **Step 4: Write `src/bridge/appStore.js`**

```js
// Version-tick bridge between legacy code and React (Phase 2.0 – 2.6).
//
// `appState` stays the source of truth and is mutated in place. React cannot
// detect in-place mutation, so instead of snapshotting state we snapshot a
// counter: every notify bumps it, useSyncExternalStore sees a new snapshot, and
// subscribers re-run their selector against current state.
//
// Call notifyAppStateChanged() after mutating state -- from actions and from
// legacy renders -- and never during a React render. Selectors must be
// read-only. Replaced by Zustand slices in Phase 2.7.

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

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run tests/unit/appStore.test.js`
Expected: 4 passed.

- [ ] **Step 6: Register the React plugin in `vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 4173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist' }
});
```

- [ ] **Step 7: Write `src/components/IslandErrorBoundary.jsx`**

```jsx
import { Component } from 'react';
import { Logger } from '../logger.js';

// A render error in one island is logged and that island renders nothing; the
// legacy app and every other island keep working.
export class IslandErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { failed: false };
    }

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error) {
        Logger.error('React island failed', { island: this.props.island, error });
    }

    render() {
        if (this.state.failed) return null;
        return this.props.children;
    }
}
```

- [ ] **Step 8: Write `src/components/AppIslands.jsx`**

```jsx
import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';

// The single React root. Each island is wrapped in its own error boundary.
// Dialogs portal to document.body; later islands use createPortal into the
// legacy containers they replace.
export function AppIslands() {
    return (
        <>
        </>
    );
}
```

`IslandErrorBoundary` is imported now and used from Task 4 on; leave the import.

- [ ] **Step 9: Write `src/main.jsx`**

```jsx
// Application entry. Legacy boots first, as a module side effect, exactly as it
// did when it was the entry. React mounts afterwards into #reactRoot.
import './legacy/main.js';
import { createRoot } from 'react-dom/client';
import { AppIslands } from './components/AppIslands.jsx';
import { Logger } from './logger.js';

try {
    createRoot(document.getElementById('reactRoot')).render(<AppIslands />);
} catch (error) {
    // Legacy boot has already completed, so the app keeps running without the
    // React islands rather than failing to load.
    Logger.error('React root failed to mount', error);
}
```

- [ ] **Step 10: Point `index.html` at the new entry**

Replace line 477:

```html
    <script type="module" src="/src/legacy/main.js"></script>
```

with:

```html
    <div id="reactRoot"></div>

    <script type="module" src="/src/main.jsx"></script>
```

- [ ] **Step 11: Notify the bridge at the end of legacy `renderPortfolio`**

In `src/legacy/main.js`, add to the imports (after line 15, the `projectFiles.js` import):

```js
import { notifyAppStateChanged } from '../bridge/appStore.js';
```

At the end of `renderPortfolio` (currently lines 2172–2175), make it:

```js
            renderPortfolioBulkActions();
            renderPortfolioBoardChips();
            updateUrlState();
            notifyAppStateChanged();
        }
```

Nothing subscribes yet; this is the hook 2.1+ islands rely on.

- [ ] **Step 12: Verify the app still boots and nothing regressed**

Run: `npm run test:unit && npm run build && npm test`
Expected: unit all pass (previous count + 4); build prints no errors; Playwright `94 passed` — including all 5 visual baselines (the empty `#reactRoot` div must not change pixels).

- [ ] **Step 13: Check the dev server console is clean**

Start the `kanban-dev` preview, load `/`, read console messages. Expected: no errors, no React warnings. Click `#openHelpBtn`; the legacy Help modal still opens.

- [ ] **Step 14: Commit**

```bash
git add package.json package-lock.json vite.config.js index.html src/main.jsx src/bridge/appStore.js src/components/AppIslands.jsx src/components/IslandErrorBoundary.jsx src/legacy/main.js tests/unit/appStore.test.js
git commit -m "feat: mount a React root beside legacy with a version-tick state bridge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Dialog state and actions

**Files:**
- Modify: `src/state/store.js` (Shell section)
- Create: `src/actions/dialogs.js`
- Test: `tests/unit/dialogs.test.js`

**Interfaces:**
- Consumes: `appState` (`src/state/store.js`); `subscribe`, `notifyAppStateChanged` (`src/bridge/appStore.js`).
- Produces:
  - `appState.activeDialog: null | 'shortcuts' | 'help'`
  - `openDialog(name: 'shortcuts' | 'help'): void` — sets and notifies.
  - `closeDialog(): void` — clears and notifies; no-op (no notify) when already `null`.

- [ ] **Step 1: Write the failing test `tests/unit/dialogs.test.js`**

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { appState } from '../../src/state/store.js';
import { subscribe } from '../../src/bridge/appStore.js';
import { openDialog, closeDialog } from '../../src/actions/dialogs.js';

describe('dialog actions', () => {
  let unsubscribe = () => {};

  afterEach(() => {
    unsubscribe();
    appState.activeDialog = null;
  });

  function listen() {
    const listener = vi.fn();
    unsubscribe = subscribe(listener);
    return listener;
  }

  it('starts with no dialog open', () => {
    expect(appState.activeDialog).toBe(null);
  });

  it('openDialog sets activeDialog and notifies', () => {
    const listener = listen();

    openDialog('help');

    expect(appState.activeDialog).toBe('help');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog clears activeDialog and notifies', () => {
    openDialog('shortcuts');
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('closeDialog does not notify when no dialog is open', () => {
    const listener = listen();

    closeDialog();

    expect(appState.activeDialog).toBe(null);
    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/dialogs.test.js`
Expected: FAIL — `Failed to load url ../../src/actions/dialogs.js`.

- [ ] **Step 3: Add `activeDialog` to `src/state/store.js`**

Change the Shell section to:

```js
    // --- Shell: theme, shortcuts, undo, dialogs ---
    undoAction: null,
    undoTimer: null,
    activeTheme: 'light',
    ShortcutRegistry: [],
    activeDialog: null, // null | 'shortcuts' | 'help'
```

- [ ] **Step 4: Write `src/actions/dialogs.js`**

```js
// Dialog actions, shared by legacy code and React components. Plain module
// functions -- never exposed on window.

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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/dialogs.test.js`
Expected: 4 passed.

- [ ] **Step 6: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: unit all pass; Playwright `94 passed`.

- [ ] **Step 7: Commit**

```bash
git add src/state/store.js src/actions/dialogs.js tests/unit/dialogs.test.js
git commit -m "feat: add activeDialog state with open/close dialog actions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Port the Help modal to Radix Dialog

**Files:**
- Create: `src/components/dialogs/HelpDialog.jsx`
- Modify: `src/components/AppIslands.jsx`
- Modify: `src/legacy/main.js` (imports; `openHelpModal`/`closeHelpModal` ~3570–3576; `getShortcutModalContext` ~3893–3914; `close-modal` handler ~4158–4164; `cacheRefs` ~4257; `bindStaticUiEvents` ~4811–4812 and ~4864–4868)
- Modify: `index.html` (delete lines 397–470, the `#helpModal` block)
- Test: `tests/app.test.js` (new tests after "keyboard shortcuts can open help and import projects")

**Interfaces:**
- Consumes: `useAppState` (`src/bridge/appStore.js`); `openDialog`, `closeDialog` (`src/actions/dialogs.js`); `IslandErrorBoundary`.
- Produces: `HelpDialog` (named export, no props). Legacy `openHelpModal()` / `closeHelpModal()` remain as one-line delegates so the registry and `#openHelpBtn` listener keep working.

- [ ] **Step 1: Write the failing behaviour tests in `tests/app.test.js`**

Insert inside `test.describe('portfolio-only app', ...)`, directly after the test `'keyboard shortcuts can open help and import projects'`. Also add the helper `focusIsInside` just above `test.describe('portfolio-only app', ...)`.

Helper (top level, next to the other helpers):

```js
async function focusIsInside(page, selector) {
  return page.evaluate((sel) => Boolean(document.activeElement?.closest(sel)), selector);
}

async function closeDialogBy(page, dialogId, method) {
  if (method === 'Escape') {
    await page.keyboard.press('Escape');
  } else if (method === 'close button') {
    await page.locator(`#${dialogId}CloseBtn`).click();
  } else if (method === 'footer button') {
    await page.locator(`#${dialogId}FooterCloseBtn`).click();
  } else if (method === 'overlay click') {
    await page.locator(`#${dialogId}`).click({ position: { x: 5, y: 5 } });
  }
}
```

Tests:

```js
  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`help dialog takes focus and returns it to the Help button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openHelpBtn');
      await trigger.click();
      await expect(page.locator('#helpModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

      await closeDialogBy(page, 'helpModal', method);

      await expect(page.locator('#helpModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('help dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('h');
    await expect(page.locator('#helpModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#helpModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#helpModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });
```

- [ ] **Step 2: Run them to verify they fail against legacy**

Run: `npm run build && npx playwright test tests/app.test.js -g "help dialog"`
Expected: 5 failed. Each fails at `focusIsInside(...)` → `Expected: true, Received: false` (legacy never moves focus into the modal).

- [ ] **Step 3: Write `src/components/dialogs/HelpDialog.jsx`**

Markup is copied from `index.html:397-470`. `class` → `className`; `&` → `&amp;`; `{' '}` where an inline element follows a line break.

```jsx
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeDialog } from '../../actions/dialogs.js';

export function HelpDialog() {
    const open = useAppState((s) => s.activeDialog === 'help');

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="helpModal">
                    <Dialog.Content className="modal-content" aria-describedby={undefined}>
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Help</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="helpModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <div className="help-manual">
                                <div className="help-intro">
                                    <div className="help-intro-title">What This App Is</div>
                                    <div className="help-intro-text">
                                        A portfolio view for multiple project boards. You can import projects, focus one project,
                                        and manage tasks directly from the same screen.
                                    </div>
                                </div>

                                <div className="help-grid">
                                    <section className="help-card" aria-labelledby="help-getting-started">
                                        <h3 className="help-card-title" id="help-getting-started">Getting Started</h3>
                                        <ul>
                                            <li>Use <strong>New Project</strong> to create a project file and add it to the portfolio.</li>
                                            <li>Use <strong>Import Projects</strong> to load one or more existing{' '}<code>.json</code> files.</li>
                                            <li>You can also drag project files into the app to import them.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-navigation">
                                        <h3 className="help-card-title" id="help-navigation">Navigation &amp; Filters</h3>
                                        <ul>
                                            <li>Use the project chips to switch between <strong>All</strong> projects and a single project.</li>
                                            <li>Search filters by task name.</li>
                                            <li>Archive, Sort, Priority, and Effort controls update the visible cards.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-task-actions">
                                        <h3 className="help-card-title" id="help-task-actions">Working With Tasks</h3>
                                        <ul>
                                            <li>Click a card to open task details.</li>
                                            <li>Use the card actions to edit, archive, or delete a task.</li>
                                            <li>When a writable project is selected, each column shows <strong>+ Add Task</strong>.</li>
                                            <li>Drag cards between columns to change status. Moves auto-save for writable projects.</li>
                                        </ul>
                                    </section>

                                    <section className="help-card" aria-labelledby="help-readonly">
                                        <h3 className="help-card-title" id="help-readonly">Read-Only Projects</h3>
                                        <ul>
                                            <li>Projects imported without a file handle are marked <em>(Read-only)</em> in the chip.</li>
                                            <li>You can still open and inspect tasks.</li>
                                            <li>Edit/archive/delete actions are disabled until the project is opened with a writable file handle.</li>
                                        </ul>
                                    </section>
                                </div>

                                <div className="help-note">
                                    Quick shortcuts: <kbd>?</kbd> opens this shortcut list, <kbd>/</kbd> focuses search,{' '}
                                    <kbd>I</kbd> imports projects, and <kbd>Esc</kbd> closes modals.
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="helpModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
```

Note: legacy `<li>` text that ended in a line break before `</li>` rendered a trailing space; that is invisible and not reproduced.

- [ ] **Step 4: Render it from `src/components/AppIslands.jsx`**

```jsx
import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';

// The single React root. Each island is wrapped in its own error boundary.
// Dialogs portal to document.body; later islands use createPortal into the
// legacy containers they replace.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="HelpDialog">
                <HelpDialog />
            </IslandErrorBoundary>
        </>
    );
}
```

- [ ] **Step 5: Make legacy Help functions delegate**

In `src/legacy/main.js`, add to the imports (after the `appStore.js` import from Task 2):

```js
import { openDialog, closeDialog } from '../actions/dialogs.js';
```

Replace `openHelpModal` / `closeHelpModal` (~3570–3576):

```js
        function openHelpModal() {
            openDialog('help');
        }

        function closeHelpModal() {
            closeDialog();
        }
```

- [ ] **Step 6: Derive help-open from state in `getShortcutModalContext`**

Replace the line (~3898):

```js
            const helpModalOpen = document.getElementById('helpModal').classList.contains('active');
```

with:

```js
            const helpModalOpen = appState.activeDialog === 'help';
```

Leave the precedence `if / else if` chain unchanged.

- [ ] **Step 7: Route Escape through `closeDialog` in the `close-modal` registry entry**

Replace the handler body (~4158–4164) with:

```js
                    handler: () => {
                        closeModal();
                        closeDetailModal();
                        closeRoadmapEntityModal();
                        closeShortcutsModal();
                        closeDialog();
                    }
```

(`closeShortcutsModal()` is removed in Task 5.)

- [ ] **Step 8: Delete the legacy Help wiring**

In `src/legacy/main.js` delete:
- in `cacheRefs`: `Refs.helpModal = document.getElementById('helpModal');`
- in `bindStaticUiEvents`:
  ```js
            document.getElementById('helpModalCloseBtn')?.addEventListener('click', closeHelpModal);
            document.getElementById('helpModalFooterCloseBtn')?.addEventListener('click', closeHelpModal);
  ```
- in `bindStaticUiEvents`:
  ```js
            document.getElementById('helpModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('helpModal')) {
                    closeHelpModal();
                }
            });
  ```

Keep `document.getElementById('openHelpBtn')?.addEventListener('click', openHelpModal);`.

In `index.html` delete the whole `<div class="modal" id="helpModal"> … </div>` block (lines 397–470) and the blank line after it.

Run: `grep -n "helpModal" src/legacy/main.js index.html`
Expected: only `getShortcutModalContext` (`helpModalOpen`, `'helpModal'` context name) and the `close-modal` entry's `contexts` array.

- [ ] **Step 9: Run the new tests to verify they pass**

Run: `npm run build && npx playwright test tests/app.test.js -g "help"`
Expected: all pass, including "help button opens and closes help modal", "keyboard shortcuts can open help and import projects", and the 5 new tests.

- [ ] **Step 10: Verify the Help baselines match**

Run: `npx playwright test tests/visual.test.js`
Expected: 5 passed. If `help-light`/`help-dark` differ, open the diff image in `test-results/`: a missing space means a `{' '}` is needed; a layout shift means the Overlay/Content structure or classes diverge from legacy. Fix the component — never update the baseline.

- [ ] **Step 11: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: unit all pass; Playwright `99 passed` (94 + 5). The test "roadmap entity modal traps shortcut context and Escape closes it" must pass.

- [ ] **Step 12: Commit**

```bash
git add src/components/dialogs/HelpDialog.jsx src/components/AppIslands.jsx src/legacy/main.js index.html tests/app.test.js
git commit -m "feat: port Help modal to Radix Dialog on the React bridge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Port the Shortcuts modal to Radix Dialog, then document

**Files:**
- Create: `src/components/dialogs/ShortcutsDialog.jsx`
- Modify: `src/components/AppIslands.jsx`
- Modify: `src/legacy/main.js` (`init` ~3266–3267; `openShortcutsModal`/`closeShortcutsModal` ~3561–3568; `getShortcutModalContext` ~3897; `renderShortcutKeys` ~3916–3920; `close-modal` handler; `renderShortcutsModalContent` ~4169–4216; `cacheRefs` ~4256, ~4258; `bindStaticUiEvents` ~4809–4810 and ~4859–4863)
- Modify: `index.html` (delete lines 382–395, the `#shortcutsModal` block)
- Modify: `README.md`
- Test: `tests/app.test.js`

**Interfaces:**
- Consumes: `useAppState`; `openDialog`, `closeDialog`; `IslandErrorBoundary`; `focusIsInside` and `closeDialogBy` test helpers from Task 4; registry entries shaped `{ id, section, keys: string[], description, ... }` in `appState.ShortcutRegistry`.
- Produces: `ShortcutsDialog` (named export, no props). Legacy `openShortcutsModal()` / `closeShortcutsModal()` remain as one-line delegates.

- [ ] **Step 1: Write the failing behaviour tests in `tests/app.test.js`**

Insert directly after the Task 4 help-dialog tests:

```js
  for (const method of ['Escape', 'close button', 'footer button', 'overlay click']) {
    test(`shortcuts dialog takes focus and returns it to the Shortcuts button when closed by ${method}`, async ({ page }) => {
      const trigger = page.locator('#openShortcutsBtn');
      await trigger.click();
      await expect(page.locator('#shortcutsModal')).toBeVisible();
      await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

      await closeDialogBy(page, 'shortcutsModal', method);

      await expect(page.locator('#shortcutsModal')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    });
  }

  test('shortcuts dialog opened by shortcut returns focus to the page body on close', async ({ page }) => {
    await page.keyboard.press('Shift+/');
    await expect(page.locator('#shortcutsModal')).toBeVisible();
    await expect.poll(() => focusIsInside(page, '#shortcutsModal')).toBe(true);

    await page.keyboard.press('Escape');

    await expect(page.locator('#shortcutsModal')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.activeElement === document.body)).toBe(true);
  });

  test('shortcuts dialog groups entries into Global, Cards and Modals', async ({ page }) => {
    await page.locator('#openShortcutsBtn').click();
    const list = page.locator('#shortcutsList');

    await expect(list.locator('.shortcut-section-card-title')).toHaveText(['Global', 'Cards', 'Modals']);
    await expect(list.locator('.shortcut-section-title')).toHaveText(['Task Modal', 'Task Detail', 'Modal']);
    await expect(list.locator('.shortcut-row').filter({ hasText: 'Save task' }).locator('.shortcut-keys'))
      .toHaveText('Ctrl+Enter');
  });
```

The grouping test passes on legacy too; it pins the structure the port must keep.

- [ ] **Step 2: Run them to verify the focus tests fail against legacy**

Run: `npm run build && npx playwright test tests/app.test.js -g "shortcuts dialog"`
Expected: 5 failed at `focusIsInside(...)` (`Received: false`); "shortcuts dialog groups entries…" passes.

- [ ] **Step 3: Write `src/components/dialogs/ShortcutsDialog.jsx`**

Mirrors the deleted `renderShortcutsModalContent` exactly: same groups, subsection heading only when a group spans more than one section, `<kbd>` tokens joined by `<span class="shortcut-plus">+</span>`.

```jsx
import { Fragment } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useAppState } from '../../bridge/appStore.js';
import { closeDialog } from '../../actions/dialogs.js';

const DISPLAY_GROUPS = [
    { title: 'Global', sections: ['Global'] },
    { title: 'Cards', sections: ['Cards'] },
    { title: 'Modals', sections: ['Task Modal', 'Task Detail', 'Modal'] }
];

function ShortcutKeys({ tokens }) {
    return (tokens || []).map((token, index) => (
        <Fragment key={index}>
            {index > 0 && <span className="shortcut-plus">+</span>}
            <kbd>{token}</kbd>
        </Fragment>
    ));
}

function ShortcutSections({ registry }) {
    return (
        <div className="shortcut-sections-grid">
            {DISPLAY_GROUPS.map((group) => {
                const subgroups = group.sections
                    .map((section) => ({
                        section,
                        rows: registry.filter((entry) => entry.section === section)
                    }))
                    .filter((subgroup) => subgroup.rows.length > 0);

                if (subgroups.length === 0) return null;
                const showSubheading = group.sections.length > 1;

                return (
                    <section className="shortcut-section-card" aria-label={`${group.title} shortcuts`} key={group.title}>
                        <h3 className="shortcut-section-card-title">{group.title}</h3>
                        {subgroups.map((subgroup) => (
                            <Fragment key={subgroup.section}>
                                {showSubheading && <div className="shortcut-section-title">{subgroup.section}</div>}
                                <div className="shortcuts-list">
                                    {subgroup.rows.map((entry) => (
                                        <div className="shortcut-row" key={entry.id}>
                                            <div className="shortcut-keys"><ShortcutKeys tokens={entry.keys} /></div>
                                            <div className="shortcut-desc">{entry.description}</div>
                                        </div>
                                    ))}
                                </div>
                            </Fragment>
                        ))}
                    </section>
                );
            })}
        </div>
    );
}

export function ShortcutsDialog() {
    const open = useAppState((s) => s.activeDialog === 'shortcuts');
    const registry = useAppState((s) => s.ShortcutRegistry);

    return (
        <Dialog.Root open={open} onOpenChange={(next) => { if (!next) closeDialog(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="modal active" id="shortcutsModal">
                    <Dialog.Content className="modal-content" aria-describedby={undefined}>
                        <div className="modal-header">
                            <Dialog.Title asChild><span className="modal-title">Keyboard Shortcuts</span></Dialog.Title>
                            <Dialog.Close className="modal-close" id="shortcutsModalCloseBtn">&times;</Dialog.Close>
                        </div>
                        <div className="modal-body">
                            <div className="shortcuts-list" id="shortcutsList">
                                <ShortcutSections registry={registry} />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Dialog.Close className="btn" id="shortcutsModalFooterCloseBtn">Close</Dialog.Close>
                        </div>
                    </Dialog.Content>
                </Dialog.Overlay>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
```

- [ ] **Step 4: Render it from `src/components/AppIslands.jsx`**

```jsx
import { IslandErrorBoundary } from './IslandErrorBoundary.jsx';
import { HelpDialog } from './dialogs/HelpDialog.jsx';
import { ShortcutsDialog } from './dialogs/ShortcutsDialog.jsx';

// The single React root. Each island is wrapped in its own error boundary.
// Dialogs portal to document.body; later islands use createPortal into the
// legacy containers they replace.
export function AppIslands() {
    return (
        <>
            <IslandErrorBoundary island="ShortcutsDialog">
                <ShortcutsDialog />
            </IslandErrorBoundary>
            <IslandErrorBoundary island="HelpDialog">
                <HelpDialog />
            </IslandErrorBoundary>
        </>
    );
}
```

- [ ] **Step 5: Make legacy Shortcuts functions delegate**

Replace `openShortcutsModal` / `closeShortcutsModal` (~3561–3568):

```js
        function openShortcutsModal() {
            openDialog('shortcuts');
        }

        function closeShortcutsModal() {
            closeDialog();
        }
```

- [ ] **Step 6: Derive shortcuts-open from state in `getShortcutModalContext`**

Replace (~3897):

```js
            const shortcutsModalOpen = document.getElementById('shortcutsModal').classList.contains('active');
```

with:

```js
            const shortcutsModalOpen = appState.activeDialog === 'shortcuts';
```

- [ ] **Step 7: Simplify the `close-modal` handler**

```js
                    handler: () => {
                        closeModal();
                        closeDetailModal();
                        closeRoadmapEntityModal();
                        closeDialog();
                    }
```

- [ ] **Step 8: Delete the legacy Shortcuts rendering and wiring**

In `src/legacy/main.js` delete:
- in `init()`: the line `renderShortcutsModalContent();` (keep `buildShortcutRegistry();`)
- the whole `function renderShortcutKeys(tokens) { … }` (~3916–3920)
- the whole `function renderShortcutsModalContent() { … }` (~4169–4216)
- in `cacheRefs`: `Refs.shortcutsModal = …` and `Refs.shortcutsList = …`
- in `bindStaticUiEvents`:
  ```js
            document.getElementById('shortcutsModalCloseBtn')?.addEventListener('click', closeShortcutsModal);
            document.getElementById('shortcutsModalFooterCloseBtn')?.addEventListener('click', closeShortcutsModal);
  ```
- in `bindStaticUiEvents`:
  ```js
            document.getElementById('shortcutsModal')?.addEventListener('click', (e) => {
                if (e.target === document.getElementById('shortcutsModal')) {
                    closeShortcutsModal();
                }
            });
  ```

Keep `document.getElementById('openShortcutsBtn')?.addEventListener('click', openShortcutsModal);`.

In `index.html` delete the `<div class="modal" id="shortcutsModal"> … </div>` block (lines 382–395) and the blank line after it.

Run: `grep -n "renderShortcut\|shortcutsList\|Refs.shortcutsModal\|Refs.helpModal\|getElementById('shortcutsModal')\|getElementById('helpModal')" src/legacy/main.js index.html`
Expected: no output.

Run: `grep -n "escapeHtml" src/legacy/main.js | head -3`
Expected: still used elsewhere (do not remove it).

- [ ] **Step 9: Run the new tests to verify they pass**

Run: `npm run build && npx playwright test tests/app.test.js -g "shortcut"`
Expected: all pass, including "keyboard shortcut opens shortcuts modal" and the 6 new tests.

- [ ] **Step 10: Verify all baselines match**

Run: `npx playwright test tests/visual.test.js`
Expected: 5 passed. On a `shortcuts-*` diff, compare the DOM of `#shortcutsList` with the deleted template (extra wrapper, missing `.shortcut-plus`, subheading shown for a single-section group). Fix the component — never update the baseline.

- [ ] **Step 11: Check the browser console**

Start the `kanban-dev` preview, open and close both dialogs by button, Escape and overlay click, and read console messages. Expected: no errors, no React key warnings, no Radix `DialogContent requires a DialogTitle` warning.

- [ ] **Step 12: Update `README.md`**

- Replace the `src/legacy/main.js` bullet's opening so the architecture list reads:

```markdown
- `src/main.jsx` — the entry. Imports `src/legacy/main.js` (legacy boots as a side effect), then mounts one React root (`src/components/AppIslands.jsx`) into `#reactRoot`. Each ported piece is an island wrapped in `IslandErrorBoundary`.
- `src/bridge/appStore.js` — version-tick bridge: `appState` stays the source of truth, actions mutate it and call `notifyAppStateChanged()`, and components read it with `useAppState(select)`. Replaced by Zustand slices in Phase 2.7.
- `src/actions/` — state-changing functions shared by legacy code and components (Phase 2.0: `openDialog` / `closeDialog`).
- `src/components/` — React components. Ported markup keeps legacy ids and `legacy.css` classes until the Phase 2.8 Tailwind pass. Shortcuts and Help dialogs use Radix Dialog.
```

- Update the test counts: Vitest `821 tests` → the number printed by `npm run test:unit`; Playwright `89 black-box tests` → the number printed by `npm test` minus the 5 visual tests (expected `100`), and note the visual baselines are included in `npm test`.

- [ ] **Step 13: Run the full suites**

Run: `npm run test:unit && npm run build && npm test`
Expected: unit `829 passed` (821 + 4 + 4); Playwright `105 passed` (89 existing + 5 visual + 5 help + 6 shortcuts).

- [ ] **Step 14: Commit**

```bash
git add src/components/dialogs/ShortcutsDialog.jsx src/components/AppIslands.jsx src/legacy/main.js index.html tests/app.test.js README.md
git commit -m "feat: port Shortcuts modal to Radix Dialog and document the React bridge

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| React 19, react-dom, Radix Dialog, plugin-react; Vite plugin registered | 2 |
| `index.html` `#reactRoot` + `/src/main.jsx` entry; legacy imported first | 2 |
| One root, `AppIslands`, `IslandErrorBoundary` logging `React island failed` | 2, 4, 5 |
| `createRoot` failure logged, legacy keeps running | 2 |
| `src/bridge/appStore.js` exactly as specified + unit tests | 2 |
| `notifyAppStateChanged()` at end of `renderPortfolio()` | 2 |
| `activeDialog` in store; `openDialog` / `closeDialog` + unit tests (incl. no-notify when closed) | 3 |
| Legacy open/close functions delegate; context derives from `activeDialog`; `close-modal` calls `closeDialog()` | 4, 5 |
| Deleted: `renderShortcutsModalContent`, `renderShortcutKeys`, 4 close-button listeners, 2 overlay listeners, static markup | 4, 5 |
| Dialog components with legacy structure; ShortcutsDialog grouping rules | 4, 5 |
| Screenshot baselines (5, light/dark, 1280×800, fixed clock, threshold 0.001) captured on legacy first | 1 |
| README snapshot policy | 1 |
| Existing 4 dialog/shortcut e2e tests unchanged and green | 4, 5 |
| New e2e: focus moves in; 4 close methods remove from DOM and return focus; shortcut-opened returns to body | 4, 5 |

## Deviations and follow-ups (recorded after execution, 2026-09-13)

**Deviations from this plan:**
- **Focus return.** "Facts" claimed Radix returns focus to the previously focused element. It only returns focus to a `Dialog.Trigger`, and our openers are legacy buttons and shortcuts. Added `src/components/dialogs/useReturnFocus.js`: it captures `document.activeElement` in `onOpenAutoFocus` and restores it in `onCloseAutoFocus` (with `preventDefault`). Both dialogs spread it onto `Dialog.Content`. Every later legacy-opened Radix dialog should use it.
- **Close delegates deleted.** Tasks 4–5 kept `closeHelpModal()` / `closeShortcutsModal()` as delegates, but the later steps removed all their callers, so they were deleted (user decision). `openHelpModal()` / `openShortcutsModal()` remain.

**Carry into the 2.1 plan (from the final review):**
- Audit legacy state changes and targeted renders outside `renderPortfolio()` (e.g. the persistence host's `onStatusChanged: renderPortfolioBoardChips`). Add `notifyAppStateChanged()` wherever an island will read that state.
- `useReturnFocus`: guard `returnTarget.isConnected` and fall back sensibly. Card-level openers are re-rendered by `renderPortfolio` and may be detached by close time.
- A dialog island that fails to render, or a failed `createRoot`, leaves `appState.activeDialog` set, and the shortcut dispatcher then suppresses global shortcuts. Consider `closeDialog()` from the boundary, or accept and document it.
- `createRoot(...).render` errors outside a boundary go to React's `onUncaughtError`, not `Logger`. Consider passing `{ onUncaughtError }`.
- Radix modal side effects are new versus legacy: scroll lock with scrollbar-gap padding, and `aria-hidden` / `pointer-events: none` on the rest of the page. macOS overlay scrollbars hide any layout shift; the baselines are macOS-only.
