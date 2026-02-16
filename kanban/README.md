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
  - tags
  - activity timestamps (created/updated)
- Archive/restore tasks and toggle archived view.
- Sort tasks manually or by due date.
- Undo toast for key actions (archive, move).
- Search with yellow text highlighting (titles and tags).

## Data and persistence

- Local persistence via `localStorage`.
- File System Access API integration (Chromium):
  - Open board
  - Save / Save As board
  - New board from template
- Strict board schema validation (versioned JSON format).

## File extensions (required)

- Board files: `*.board.json`
- Portfolio config files: `*.portfolio.json`

The app validates both extension and JSON structure on open/upload.

## Portfolio view

- Aggregate tasks across multiple loaded board files.
- Filters and sorting.
- Quick switch from portfolio rows/chips to a specific loaded board.
- Portfolio config actions:
  - `Open Portfolio`
  - `Save Portfolio`
  - `Save Portfolio As`

## Keyboard shortcuts

- Use the `Shortcuts` button in the header to view the in-app shortcut reference modal.
- `/` focus search
- `N` new task modal (board mode)
- `E` edit selected task (board mode)
- `Ctrl+S` / `Cmd+S` save current document (board or portfolio)
- `Ctrl+Shift+C` / `Cmd+Shift+C` save as current document (board or portfolio)

## Example files

- `boards/markathon.board.json` (example board)
- `portfolios/example.portfolio.json` (example portfolio config)

## Run

Open `kanban.html` directly in a modern Chromium browser.
