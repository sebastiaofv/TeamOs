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
- `src/persistence/` — board file reading/writing, the save queue and external-change detection. Conflict prompts and reload dialog handling live in `actions/portfolioFiles.js`.
- `src/state/` — the Zustand store. Immutable writes publish boards and derived portfolio rows together; actions do not trigger manual refreshes.
- `src/selectors/` — view models built from store state.
- `src/actions/` — task, roadmap, timeline, and board-interaction actions. `boardMutationContext.js` owns the shared draft → history → store → save path; `portfolioMutations.js` assembles the actions. Controls, URL state, files, dialogs, and shortcuts remain separate.
- `src/hooks/` — browser integration: theme, keyboard shortcuts and URL state, file drop and file watching. `usePortfolioFileIntegration` starts and stops the polling timer with the app lifecycle.
- `src/App.jsx` — the app shell: header, view layout, and dialogs. Mounted by `src/main.jsx`.
- `src/components/` — React views and Radix dialogs. Views subscribe to the state they use; inactive views do not compute or render their contents.
- `src/styles/` — plain CSS split by feature (`base`, `board`, `calendar`, `roadmap`, `timeline`, `dialogs`, `task-editor`, …). `app.css` imports them in cascade order; `base.css` holds theme variables and shared surfaces, and `theme-dark.css` stays last.

## Development

Requires Node.js 18+.

```bash
npm install
npx playwright install
npm run dev
```

## Testing

- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions.
- `npm test` — Playwright end-to-end and visual tests. It builds the app and serves `dist/` on port 4174 before running, so it never reuses a dev server on 4173; the run fails if 4174 is already taken.
- `npm run lint` — ESLint.

Visual baselines in `tests/visual.test.js-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.js --update-snapshots`, and review the image diff in the commit. Shared seeding helpers live in `tests/support/portfolio.js`.

Optional Playwright modes: `npm run test:headed`, `npm run test:ui`, `npm run test:debug`.

### Pre-commit hook

`npm install` sets up a Husky pre-commit hook (`.husky/pre-commit`, registered at the git root via the `prepare` script). Each commit runs ESLint on staged `.js`/`.jsx`/`.mjs` files (lint-staged, `.lintstagedrc`) and then `npm run test:unit`. Playwright tests are not run by the hook; run `npm test` before pushing UI changes.
