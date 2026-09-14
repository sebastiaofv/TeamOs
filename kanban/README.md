# TeamOS Kanban

A portfolio Kanban app for `*.board.json` project files, built with Vite, React and Zustand. Open several project files at once, work across them in one view, and every change autosaves back to its file.

## What it does

- **Projects** — create a new project file or import existing ones (picker or drag and drop). Project chips switch between all projects and a single one.
- **Board view** — fixed columns (`backlog`, `to-do`, `in progress`, `done`), drag and drop between columns, add/edit/archive/delete tasks, undo after archiving.
- **Tasks** — title, description, assignees, tags, blocked + blocker reason, priority, effort, due date, checklist (reorderable), attachments, roadmap phase/milestone/sprint.
- **Filters and sort** — search (with highlighting), archive state, blocked, assignee, priority, effort; sort by priority, effort, score (priority / effort) or name. Filters are kept in the URL.
- **Roadmap view** (single project) — phases, milestones and sprints on a time axis; bulk-select tasks to create or join a sprint.
- **Calendar view** — year and month calendars with tasks and roadmap spans, plus a heatmap mode.
- **Timeline** (single project) — every saved change is recorded; scrub back to preview a past state read-only and restore it.
- **Light and dark theme.**

## Data and persistence

- Uses the File System Access API (Chromium browsers). Projects opened with a file handle autosave on every change; files dropped without a handle are read-only.
- Open files are watched for external changes: they reload automatically, or prompt when local edits conflict.
- Board files are strictly validated on import (`*.board.json` extension, `schemaVersion`, `appId`, structure). See [`docs/board-json-reference.html`](docs/board-json-reference.html) and the example in [`boards/example.board.json`](boards/example.board.json).

### Task and schema invariants

- Task titles are required and capped at 80 characters.
- Assignees are saved as an `assignees` array; older single `assignee` strings still import.
- Blocked tasks require `blockerReason`.
- Attachments are embedded as `dataUrl`s, capped per task with a hard size limit and soft size warnings. Older extension-based attachment storage is cleaned up on save.
- Serialization normalizes tasks, columns and timestamps before save.

## Keyboard shortcuts

The **Shortcuts** button (or `?`) shows the full reference in the app.

| Keys | Action |
|---|---|
| `/` | Focus search |
| `N` / `I` | New project / import projects |
| `H` | Help |
| `R` | Reset filters and sort |
| `S` | Focus sort control |
| `[` / `]` | Previous / next project chip |
| `J` / `K` | Select next / previous card |
| `Enter` | Open hovered or selected card |
| `E` / `X` | Edit / archive-restore hovered or selected card |
| `1`–`4` | Move card to backlog / to-do / in progress / done |
| `Ctrl/Cmd+Enter` | Save task (in the task editor) |
| `Esc` | Close dialog |

## Project structure

- `src/domain/` — pure, dependency-free logic (tasks, boards, roadmap, timeline, calendar, attachments, serialization, scoring, task-editor draft rules). Unit-tested with Vitest.
- `src/persistence/` — board file reading/writing, the save queue and external-change watching.
- `src/state/` — the Zustand store and the derived portfolio state.
- `src/selectors/` — view models built from store state.
- `src/actions/` — state-changing functions (mutations, controls, navigation/URL state, files, dialogs, shortcuts).
- `src/hooks/` — browser integration: theme, keyboard shortcuts and URL state, file picker/drop and file watching.
- `src/components/` — React views and Radix dialogs, mounted from `src/main.jsx`.
- `src/styles/` — `app.css` (the visual language) and the Tailwind entry (`preflight` disabled; semantic tokens map to the CSS variables).

## Development

Requires Node.js 18+.

```bash
npm install
npx playwright install
npm run dev
```

## Testing

- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions.
- `npm test` — Playwright end-to-end and visual tests. It builds the app and serves `dist/` before running.
- `npm run lint` — ESLint.

Visual baselines in `tests/visual.test.js-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.js --update-snapshots`, and review the image diff in the commit. Shared seeding helpers live in `tests/support/portfolio.js`.

Optional Playwright modes: `npm run test:headed`, `npm run test:ui`, `npm run test:debug`.
