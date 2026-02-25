# Kanban Board

A minimalist single-file Kanban app built with plain HTML, CSS, and JavaScript (`kanban.html`).

## What it does

- Create and manage tasks across columns (drag and drop).
- Add, rename, reorder, and delete columns (max 5).
- Add tasks inline from each column (`+ Add Task` card opens modal).
- Task details modal with:
  - description
  - checklist/subtasks
  - due date
  - activity timestamps (created/updated)
- Timeline modal to review changes over time.
- Archive/restore tasks and toggle archived view.
- Sort tasks manually, by due date, or by effort.
- Undo toast for key actions (archive, move).
- Search with yellow text highlighting (titles).

## Data and persistence

- In-memory state during the current session (no `localStorage` persistence).
- File System Access API integration (Chromium):
  - Open board
  - Save / Save As board
  - New board from template
- Strict board schema validation (versioned JSON format).
- Timeline history stored in `extensions.timeline` within board JSON.

## File extensions (required)

- Board files: `*.board.json` (includes `extensions.timeline` history)
- Portfolio config files: `*.portfolio.json` (legacy example; open/save removed)

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

Open `kanban.html` directly in a modern Chromium browser.

## Testing

Automated tests use Playwright and start a temporary local HTTP server automatically.

### Prerequisites

- Node.js 18+ (recommended)
- Python 3 (used for the local static server in Playwright config)

### Install

```bash
npm install
npx playwright install
```

### Run tests

```bash
npm test
```

Optional modes:

```bash
npm run test:headed
npm run test:ui
npm run test:debug
```
