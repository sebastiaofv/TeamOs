# Kanban Board

A Kanban app built as a Vite project. It is migrating from a single 11,000+ line `kanban.html` file: pure domain logic lives in tested modules under `src/domain/` and `src/persistence/`, while React owns the application shell, dialogs, controls, board, timeline, roadmap, and calendar views.

## What it does

- Create and manage tasks across columns (drag and drop).
- Fixed workflow columns: `backlog`, `to-do`, `in progress`, `done`.
- Add tasks inline from each column (`+ Add Task` card opens modal).
- Task details modal with:
  - description
  - checklist/subtasks
  - due date
  - activity timestamps (created/updated)
- Archive/restore tasks and toggle archived view.
- Sort tasks manually, by due date, by effort, or by score.
- Undo toast for key actions (archive, move).
- Search with yellow text highlighting (titles).

## Data and persistence

- In-memory state during the current session (no `localStorage` persistence).
- File System Access API integration (Chromium):
  - Open board
  - Save / Save As board
  - New board from template
- Strict board schema validation (versioned JSON format).

## Internal architecture

The app is a Vite project (`index.html` + `src/`), split by responsibility:

- `src/domain/` — pure, dependency-free logic, unit-tested with Vitest. 12 modules:
  - `task.js`, `board.js`, `calendar.js`, `roadmap.js`, `timeline.js`, `attachments.js` — feature-specific normalization, validation, and selectors.
  - `serialize.js` — board parsing/validation/serialization.
  - `scoring.js` — priority/effort score calculation.
  - `util.js` — shared helpers.
  - `constants.js` — shared constants.
  - `persistence.js` — pure save-state/queue helpers (not I/O; see `src/persistence/` for that).
  - `taskDraft.js` — task editor rules: assignee/tag/checklist edits, attachment picking and warnings, and building store-ready task saves.
- `src/persistence/fileSystem.js` — File System Access API wrappers. This is the only place that writes to the user's disk; it is kept separate from `src/domain/` because it is I/O, not pure logic.
- `src/main.jsx` — the entry. Loads the shared styles and mounts one React root (`src/components/AppIslands.jsx`) into `#reactRoot`. Each surface is an island wrapped in `IslandErrorBoundary`.
- `src/state/slices.js`, `src/state/store.js`, and `src/state/portfolioViewState.js` — four Zustand slices (`portfolio`, `board`, `ui`, and `files`) plus the store-owned derived portfolio state transition. Components and actions read and write the same store.
- `src/hooks/useTheme.js` — theme initialization and toggle wiring.
- `src/hooks/usePortfolioFileIntegration.js` — file-picker/drop wiring plus focus, visibility, and external-file watch lifecycle.
- `src/hooks/usePortfolioRuntime.js` — URL initialization, keyboard shortcuts, header actions, and timeline pointer lifecycle.
- `src/actions/` — state-changing functions for dialogs, portfolio mutations, controls, navigation, files, and keyboard shortcuts. They write through Zustand and use the persistence modules for disk I/O.
- `src/components/PortfolioControls.jsx` — React portals for the portfolio toolbar, project chips, view-mode toggle, and bulk-action bar (Phase 2.2); actions are store-backed.
- `src/components/PortfolioBoard.jsx` — React portal for portfolio columns, add-task affordances, and task-card markup (Phase 2.3).
- `src/components/PortfolioTimeline.jsx` — React portal for the portfolio timeline panel, event list, historical preview controls, and restore affordance (Phase 2.4).
- `src/components/PortfolioRoadmap.jsx` — React portal for roadmap sections, timeline axis, disclosure rows, and read-only linked task cards (Phase 2.5).
- `src/components/PortfolioCalendar.jsx` — React portal for year/month calendar, roadmap spans, task items, and heatmap modes (Phase 2.6).
- `src/components/` — React components. Ported markup keeps the established ids and CSS classes until the Phase 2.8 Tailwind pass. Shortcuts and Help dialogs use Radix Dialog; `src/components/dialogs/useReturnFocus.js` returns focus to whichever element had it before the dialog opened, but only when closing left focus lost (it fell to `body`) and that element is still in the page, and it can also focus a given field on open via `initialFocus`. The task detail modal, roadmap entity modal, undo toast, and task editor use direct store-backed mutation actions; the editor owns its draft while `src/domain/taskDraft.js` supplies the pure editing rules.
- `src/styles/tailwind.css` — Tailwind entry point, semantic surface/border/content tokens, and component aliases. Preflight remains disabled for parity.
- `src/styles/app.css` — the current styling contract for the established visual language while the final component-by-component Tailwind pass continues.

## Task and schema invariants

- Task titles are required and capped at `80` characters.
- Task assignees are stored as an `assignees` string array on save; older single `assignee` strings still import.
- Blocked tasks require `blockerReason`.
- Attachments are capped per task and validated by hard size limit.
- `schemaVersion` and `appId` are strictly validated on import.
- Serialization normalizes tasks/columns/timestamps before save.

## Attachments policy

- Embedded `dataUrl` attachments remain supported for existing board files.
- Soft warnings are shown for large attachment payloads.
- Hard limits prevent oversized files from being added.
- Older extension-based attachment storage is cleaned during serialization.

## File extensions (required)

- Board files: `*.board.json`

The app validates both extension and JSON structure on open/upload.

## Portfolio view

- Aggregate tasks across multiple loaded board files.
- Filters and sorting (including score = priority / effort).
- Quick switch from portfolio rows/chips to a specific loaded board.

## Keyboard shortcuts

- Use the `Shortcuts` button in the header to view the in-app shortcut reference modal.
- `/` focus search
- `N` new task modal (board mode)
- `E` edit selected task (board mode)
- `Ctrl+S` / `Cmd+S` save current document (board or portfolio)
- `Ctrl+Shift+C` / `Cmd+Shift+C` save as current document (board or portfolio)

## Example files

- `boards/example.board.json` (example board)

## Run

```bash
npm install
npm run dev
```

This starts the Vite dev server.

## Styling

Tailwind CSS is wired into the build (`tailwind.config.js`, `postcss.config.mjs`) with `corePlugins.preflight` disabled. Semantic tokens map to the existing CSS variables, so migrated components can adopt utilities without changing the established light/dark visual contract.

## Testing

There are two test suites:

- **Unit tests** (`npm run test:unit`) — Vitest, 876 tests covering the pure functions in `src/domain/` and `src/persistence/`, the store notification layer, and shared actions.
- **End-to-end tests** (`npm test`) — Playwright, 169 black-box and visual tests driving the built app in a real browser via `npm run preview`. Playwright serves the production build from `dist/`, so **run `npm run build` before `npm test`** or the suite will exercise stale (or missing) output.
- **Visual baselines** (`tests/visual.test.js`, part of `npm test`) — Playwright screenshots of UI pieces taken before each React port; a port must match them. Baselines in `tests/visual.test.js-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.js --update-snapshots`, and review the image diff in the commit. Shared seeding helpers live in `tests/support/portfolio.js`.

### Prerequisites

- Node.js 18+ (recommended)

### Install

```bash
npm install
npx playwright install
```

### Run tests

```bash
npm run test:unit
npm run build && npm test
```

Optional Playwright modes:

```bash
npm run test:headed
npm run test:ui
npm run test:debug
```
