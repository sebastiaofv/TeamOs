# TeamOS Kanban

A portfolio Kanban app for `*.board.json` project files, built with Vite, React, Zustand and TypeScript. Open several project files at once, work across them in one view, and every change autosaves back to its file.

## What it does

- **Projects** — create a new project file or import existing ones (picker or drag and drop). Project chips switch between all projects and a single one.
- **Board view** — fixed columns (`backlog`, `to-do`, `in progress`, `done`), drag cards between columns with a mouse or by touch (keyboard: `1`–`4`), add/edit/archive/delete tasks, undo after archiving.
- **Tasks** — title, description, assignees, tags, blocked + blocker reason, priority, effort, due date, checklist (reorderable), attachments, roadmap phase/milestone/sprint.
- **Filters and sort** — search (with highlighting), archive state, blocked, assignee, priority, effort; sort by priority, effort, score (priority / effort) or name. Filters are kept in the URL.
- **Roadmap view** (single project) — phases, milestones and sprints on a time axis; bulk-select tasks to create or join a sprint.
- **Calendar view** — year and month calendars with tasks and roadmap spans, plus a heatmap mode.
- **Command palette** — `⌘K` / `Ctrl+K`, `/` or the toolbar search box. Find tasks (title, `#id`, `#tag`, assignee), projects, roadmap items and commands; act on a task step by step (move, assign, priority, plan, archive); filter the board by text; create a task in one line with `+ Title @person !high #tag ~S due:fri in:project`; and schedule with `plan <task> 14:00`.
- **Day Planner** — drag tasks from any project onto a 07:00–21:00 day (or Mon–Fri week) in 15-minute slots, then move and resize them. Plans are saved per project in `extensions.dayPlanner` (`{ version: 1, blocks: [{ id, taskId, date, start, end }] }`) and never change the task itself. Every planner change is also recorded in the project timeline.
- **Timeline** (single project) — every saved change is recorded; scrub back to preview a past state read-only and restore it.
- **Table perspectives** (single project) — All workitems, Unplanned (not Done and no sprint) with selection-to-sprint creation, and collapsible per-sprint tables. Sprint headers retain dates, date-derived Planned/Active/Done status and completeness over all unique current members, including archived items. Filters affect rows/CSV, not the sprint denominator. Timestamps display as UTC `yyyy-mm-dd HH:mm:ss`; columns have minimum widths, two-line cells and horizontal scrolling, with colored status and blocked badges.
- **Light and dark theme.**

## Data and persistence

- Uses the File System Access API (Chromium browsers). Projects opened with a file handle autosave on every change; files dropped without a handle are read-only.
- Open files are watched for external changes: they reload automatically, or prompt when local edits conflict.
- Board files are strictly validated on import (`*.board.json` extension, `schemaVersion`, `appId`, structure). The rules live in `validateBoardData` (`src/domain/board.ts`).

### Task and schema invariants

- Task titles are required and capped at 80 characters.
- Assignees are saved as an `assignees` array; older single `assignee` strings still import.
- Blocked tasks require `blockerReason`.
- Attachments are embedded as `dataUrl`s, capped per task with a hard size limit and soft size warnings. Older extension-based attachment storage is cleaned up on save.
- Serialization normalizes tasks, columns and timestamps before save.
- Sprint status in the table is calendar-based (before start / within inclusive dates / after end), refreshed at local midnight and when the tab resumes, not a persisted closure. There is no automatic rollover or frozen closure data yet. `tableViews.ts` separates the current `sprintId` adapter from per-sprint rosters; future closure snapshots can supply independent read-only rows, board data and completion totals, including the same workitem in several sprints. The current file schema remains unchanged.

## Keyboard shortcuts

The **Shortcuts** button (or `?`) shows the full reference in the app.

| Keys | Action |
|---|---|
| `Ctrl/⌘` + `K` | Open the command palette |
| `/` | Search tasks and commands (opens the command palette) |
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

The detailed dependency and folder guide is in [`ARCHITECTURE.md`](ARCHITECTURE.md).
The short version is:

- `src/app/` — bootstrapping, the root composition, providers, and app-wide overlays.
- `src/domain/` — pure board, task, roadmap, timeline, calendar, day planner, attachment, serialization, and scoring rules.
- `src/features/portfolio/` — the portfolio feature, organized by responsibility: views, commands, queries, state, project operations, and lifecycle hooks.
- `src/infrastructure/` — browser adapters, persistence/repository code, file watching, and logging.
- `src/shared/` — reusable UI helpers and small shared types.
- `src/styles/` — CSS grouped into `foundation/`, `portfolio/`, and `overlays/`; `app.css` is the cascade manifest.
- `src/types.ts` — a temporary compatibility facade. New code should import canonical types from `domain`, `features/portfolio`, `infrastructure/browser`, `app`, or `shared`.

## Development

Requires Node.js 22.12+ or 24+ (Vite 8 and Vitest 5).

```bash
npm install
npx playwright install
npm run dev
```

For a serverless build that can be opened directly in a Chromium-based browser, run:

```bash
npm run build:standalone
open dist-standalone/index.html
```

This produces one self-contained HTML file. The regular `npm run build` continues to generate the normal `dist/` bundle.

`dist/` and `dist-standalone/` are committed build outputs, so each branch and PR includes its own runnable builds. Before committing app changes, run both `npm run build` and `npm run build:standalone`, and include the regenerated folders. CI also publishes builds as described below.

## Continuous integration and downloads

GitHub Actions (`.github/workflows/kanban.yml`, at the repository root) runs on every pull request and push that touches `kanban/`: lint, typecheck, unit tests and the Playwright end-to-end tests (`tests/e2e`). The visual snapshot tests are not run in CI because their baselines are macOS-specific; run `npm test` locally for those.

When the tests pass on `main`, the workflow builds the app and replaces the **`kanban-latest`** GitHub Release with:

- `teamos-kanban.html`: the standalone single-file app, to download and open in a Chromium-based browser.
- `teamos-kanban-dist.zip`: the regular `dist/` build for a web server.

To fetch the latest standalone file from the command line:

```bash
gh release download kanban-latest --repo sebastiaofv/TeamOs --pattern teamos-kanban.html
```

The workflow can also be started by hand from the Actions tab (*Run workflow*).

## Testing

Manual boards are in [`test-board/`](test-board/), which contains only JSON files. Walkthroughs are in [`docs/manual-tests/`](docs/manual-tests/README.md); each story supplies its files in its matching branch and PR. Import a copy for writable tests; drag and drop for read-only tests.

- `npm run typecheck` — TypeScript (`strict`) over `src/`, `tests/` and the config files. Vite and Vitest only strip types, so this is the only type check.
- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions. Tests that feed partial or deliberately malformed fixtures to typed functions wrap them in `fromPartial` / `fromAny` from `@total-typescript/shoehorn`.
- `npm test` — Playwright end-to-end and visual tests. It builds the app and serves `dist/` on port 4174 before running, so it never reuses a dev server on 4173; the run fails if the port is already taken. Set `PLAYWRIGHT_PORT` for concurrent worktree runs.
- `npm run lint` — ESLint with `typescript-eslint`.

Visual baselines in `tests/visual.test.ts-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.ts --update-snapshots`, and review the image diff in the commit. Shared seeding helpers live in `tests/support/portfolio.ts`; the browser globals they install are declared in `tests/support/testGlobals.d.ts`.

Optional Playwright modes: `npm run test:headed`, `npm run test:ui`, `npm run test:debug`.

### Pre-commit hook

`npm install` sets up a Husky pre-commit hook (`.husky/pre-commit`, registered at the git root via the `prepare` script). Each commit runs ESLint on staged `.ts`/`.tsx`/`.mjs` files (lint-staged, `.lintstagedrc`), then `npm run typecheck` and `npm run test:unit`. Playwright tests are not run by the hook; run `npm test` before pushing UI changes.
