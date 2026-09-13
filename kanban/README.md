# Kanban Board

A Kanban app built as a Vite project. It is mid-migration from a single 11,000+ line `kanban.html` file: pure domain logic has been extracted into tested modules under `src/domain/` and `src/persistence/`, while UI and stateful code still lives in `src/legacy/main.js` pending Phase 2.

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

- `src/domain/` — pure, dependency-free logic, unit-tested with Vitest. 11 modules:
  - `task.js`, `board.js`, `calendar.js`, `roadmap.js`, `timeline.js`, `attachments.js` — feature-specific normalization, validation, and selectors.
  - `serialize.js` — board parsing/validation/serialization.
  - `scoring.js` — priority/effort score calculation.
  - `util.js` — shared helpers.
  - `constants.js` — shared constants.
  - `persistence.js` — pure save-state/queue helpers (not I/O; see `src/persistence/` for that).
- `src/persistence/fileSystem.js` — File System Access API wrappers. This is the only place that writes to the user's disk; it is kept separate from `src/domain/` because it is I/O, not pure logic.
- `src/legacy/main.js` — UI rendering, DOM event wiring, drag/drop controllers, and application state. This is a temporary home for everything not yet extracted, pending Phase 2. It exposes nothing on `window`: the Playwright suite drives the app only through the page (DOM, URL, keyboard and pointer input) and test doubles for browser APIs such as File System Access.
- `src/styles/legacy.css` — the app's styling, largely unchanged from the original single-file app. It also carries the Tailwind `@tailwind` directives (see below); Tailwind's preflight reset is disabled so this stylesheet keeps working untouched until it is retired in a later phase.

## Task and schema invariants

- Task titles are required and capped at `80` characters.
- Task assignees are stored as an `assignees` string array on save; legacy single `assignee` strings still import.
- Blocked tasks require `blockerReason`.
- Attachments are capped per task and validated by hard size limit.
- `schemaVersion` and `appId` are strictly validated on import.
- Serialization normalizes tasks/columns/timestamps before save.

## Attachments policy

- Embedded `dataUrl` attachments are supported for compatibility.
- Soft warnings are shown for large attachment payloads.
- Hard limits prevent oversized files from being added.
- Legacy extension-based attachment storage is cleaned during serialization.

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

Tailwind CSS is wired into the build (`tailwind.config.js`, `postcss.config.js`) with `corePlugins.preflight` disabled, so it contributes only utility classes and does not reset or otherwise alter the existing hand-written styles in `src/styles/legacy.css`.

## Testing

There are two test suites:

- **Unit tests** (`npm run test:unit`) — Vitest, 821 tests covering the pure functions in `src/domain/` and `src/persistence/`.
- **End-to-end tests** (`npm test`) — Playwright, 89 black-box tests driving the built app in a real browser via `npm run preview`. Playwright serves the production build from `dist/`, so **run `npm run build` before `npm test`** or the suite will exercise stale (or missing) output.

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
