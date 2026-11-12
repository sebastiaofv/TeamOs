# TeamOS Kanban

A local portfolio planning and Kanban app, built with Vite, React, Zustand and TypeScript. Open several project folders at once, plan and execute work across them, and autosave changes to `project.json`, `history.json` and `attachments/`. Legacy `*.board.json` files remain supported.

## What it does

- **Icons** — Lucide React supplies navigation, actions, workitem types, menus, form chevrons and modal icons through `WorkspaceIcon`. Native-select chevrons are generated from the same library during builds; use `npm run icons:generate` after changing their artwork.
- **Workspace navigation** — View buttons sit below the header. The project selector beside the logo switches between All and a single project; it also contains project settings, removal and save retry. The header magnifying glass opens the command palette (Ctrl/⌘+K). Board and Table have their own query controls; Dashboard, Roadmap and Day Planner have view-specific controls. Calendar is inside Day Planner. See [US-24](test-board/teamos-development/README.md).
- **Projects** — New Project creates a project subfolder; Import Projects opens a project folder or projects in direct subfolders, and converts legacy files found directly in the chosen parent. Existing projects stay loaded and duplicates are skipped. Dropped legacy `.board.json` files open read-only.
- **Products and project transfers** — an optional Product in Project settings groups independent projects under expandable headers, ignoring case and outer whitespace. Each task’s ⋯ menu copies or moves it to another loaded, writable project in the same product, with an explicit destination state and explicit person/tag mappings or removals. Moves preserve permanent identity, comments and history; copies start a new identity/history. People, tags, parent and planning associations are mapped or explicitly removed; scheduled blocks and previous Sprint records require removal. The receipt records these decisions. Interrupted writes expose a resumable transfer.
- **App settings** — The header gear opens appearance (Light/Dark), theme (Classic/Modern), language (EN/PT) and timeline visibility. Preferences are remembered in this browser. Hiding the timeline exits historical preview.
- **Project settings** — Open settings from the project selector. General, Technical workflow, Functional workflow and Automations share one draft; Save applies it and Cancel/close/Escape discards it. General contains name, acronym, product, description, status, members and tags. New projects assign Epics/Stories/Bugs to Functional and Tasks to Technical; each type can be reassigned. States, categories, transitions and reference states are configurable. Historical and read-only settings remain consultable.
- **Board view** — Technical and Functional perspectives follow the project’s type assignments, with Epics available in the Table. Columns follow configurable workflows, including Backlog and Testing; Cancelled states are hidden by default. Active Sprints only is checked by default for both perspectives; clear it for unsprinted work and other Sprints, or select a specific Sprint in Filters. Cards support drag/touch/keyboard moves, direct responsibility assignment and a next-state arrow. Filters & View contains Board columns. Selected cards in a writable project can create or join a Sprint.
- **Tasks** — saving a new workitem opens its details. Creating from another workitem retains a return chain: closing a new Task returns to its Story, then its Epic, then the original screen. Cancelling creation and editing nested workitems preserve this chain. Fields include title, description, participants and an optional responsible person, tags, blocked + blocker reason, priority, effort, due date, checklist (reorderable), attachments, roadmap phase/milestone/sprint.
- **Acceptance and automation** — Stories and Bugs require terminal child Tasks and explicit local-author acceptance to complete; Acceptance Criteria are recommended but not mandatory. Editing an accepted Story’s criteria asks for renewed acceptance. Six workflow categories distinguish Backlog, To do, In progress, Testing, Completed and Cancelled. Eight hierarchy/closure rules support Off, On 1 (approval) or On 2 (automatic); rules never bypass transitions or provide functional acceptance.
- **Workitem relations** — link existing items by ID/title (including completed and archived items), or create a related Backlog item inheriting only phase/milestone. Details group compact, aligned rows into Blocked by, Blocks and Related to, showing ID navigation, truncated title, plain-text status and the responsible person's first name. Direct edit/remove icons support inline relation changes and confirmed replacement/removal, preserving both items and recalculating blocking.
- **Filters and sort** — Board queries and each table subsection/Sprint have independent search and filters. Board filters are kept in the URL and also affect Planner/Calendar; Table filters stay scoped to their table. Filters include status, blocking, people, priority, effort and planning. Board sorting uses priority, effort, score or name; tables sort by column. Dashboard has its own period and widget visibility.
- **Roadmap view** (single project) — phases, milestones and independent sprints on a time axis. Every phase and Sprint exposes its associated workitem table through a dedicated button; parent phases include all descendant phases. Only phases with children have tree arrows. Milestone diamonds fill with completion; two-line tooltips show names, dates and percentages. Bulk Sprint allocation checks explicit and inherited phase dates, offering to keep or extend them.
- **Dashboard** (single project) — All widgets share one Project Overview: blue project progress, parent phases, relevant milestones, Sprints active at End or completed during the period, Epics, workflow-category status bars, Activity Summary, one integrated workitem detail and compact Project Control lists. Sprint and Epics have matching fixed heights; two Sprints fit without scrolling. Sprint rows show name and dd/mm dates, then status and Workitems/SP/Progress; Workitems opens that Sprint in the integrated detail. Epics omit status and show inline SP totals beside the existing progress bars. Workitem Status, Activity Summary and detail have matching compact heights; status has no internal scrolling and detail fits at least three workitems. Activity Summary contains Started, Completed, In Progress, Testing and User Stories Created. In Progress excludes Testing; Testing counts actual transitions during the inclusive period and shows current status; creations use creation dates regardless of status. All indicators use the integrated detail with the selected name as title, starting with a selection hint; no bottom source list exists. Workitem rows retain type/status dots and initials avatars. Workitems and Project Control open normal editable details under the same permissions as Table/Board. The outlined widget selector has Visible/Hidden lists, drag and drop, arrows, eye/+ controls and Reset to Default. Every widget’s order and visibility are shared in the project file; the four independent activity lists remain available but hidden by default. Existing saved choices migrate without loss; read-only/historical layout changes stay local. Start/End use recorded UTC history, status follows End, and phase lists expand without internal scrolling. Sprint Analytics defaults to All Sprints, independently of Overview dates: four summary metrics and four chronological charts use frozen completed-Sprint results, original planning commitments, existing development credits and carryover. Charts support hover/keyboard details and horizontal scrolling; overload is red. Missing initial history/capacity shows N/A, and averages use recorded values only. The newest-first selector prepares individual Sprint analysis for a later iteration. See [Overview scenarios](tests/fixtures/manual/us-34-dashboard.md) and [activity scenarios (EN/PT)](tests/fixtures/manual/issue-83-progress.md).
- **Calendar inside Day Planner** — Task-only year/month consultation and a deadline heatmap, next to Day and Week. Time blocks stay in Day and Week.
- **Command palette** — `⌘K` / `Ctrl+K`, `/` or the header search icon. Find tasks (title, `#id`, `#tag`, assignee), projects, roadmap items and commands; act on a task step by step (move, assign, priority, plan); filter the board by text; create a task in one line with `+ Title @person !high #tag ~S due:fri in:project`; and schedule with `plan <task> 14:00`.
- **Day Planner** — drag tasks from any project onto a 07:00–21:00 day (or Mon–Fri week) in 15-minute slots, then move and resize them. Plans are saved per project in `extensions.dayPlanner` (`{ version: 1, blocks: [{ id, taskId, date, start, end }] }`) and never change the task itself. Every planner change is also recorded in the project timeline.
- **Timeline** (single project) — every saved change is recorded; scrub back to preview a past state read-only and restore it.
- **Table perspectives** (single project) — ALL presents collapsible Epic → Story → Task rows, direct Epic Tasks and independent Tasks/Bugs. The same table renders Roadmap phases, milestones and sprints, including recorded participation. Matching descendants stay visible when filters remove their ancestors; pagination keeps whole root groups together. Existing type-specific views, All Tasks & Bugs, Backlog (planning units with pending work and no eligible Sprint allocation) with selection-to-sprint creation and assignment grouped in Sprint Actions, and collapsible per-sprint tables. Sprint tables have no row-selection checkboxes or Sprint Actions. Filters, Columns and Export CSV use icon buttons; Backlog places Sprint Actions with a runner icon after the divider and immediately before +. Stories expand directly into participating Task rows within each sprint table; independent Tasks and Bugs appear at the top level. Sorting keeps children beneath their Story, pagination keeps each group together, and CSV includes all filtered workitems even when collapsed. Sprint headers retain dates, manually managed Planned/Active/Done status and completeness over unique planning units, including archived items, without counting Story Tasks twice. Filters affect rows/CSV, not the sprint denominator. Dates use `dd/mm/yyyy` and timestamps use UTC `dd/mm/yyyy HH:mm:ss`; columns have minimum widths, two-line cells and horizontal scrolling, with colored status and blocked badges.
- **In-app documentation** — the book button in the top bar (or `H`) swaps the workspace for a navigable documentation page and back; the button then shows an application icon. The workspace stays mounted while hidden, so open projects, selection, view, filters and drafts are preserved, and the documentation works with no project open. Ten sections cover getting started, the Agile methodology as applied in TeamOS (distinguishing methodological advice from rules the app enforces), projects, workitems, workflows, planning, views, files and history, productivity, and an end-to-end example with FAQ. It has a searchable contents sidebar with the active topic marked, related-topic links and previous/next navigation, follows the light/dark theme and EN/PT language, and collapses its contents on small screens. The command palette guide and the shortcut reference are rendered from the live app. Content lives in `src/app/docs/content/{en,pt}.ts`; unit tests keep both outlines and every internal link in sync.
- **Appearance** — App settings selects Classic or Modern, with locally bundled Inter typography for Modern, and Light/Dark for either theme. Preferences stay in the browser and do not change project data or drafts.

## Data and persistence

- Uses the File System Access API (Chromium browsers). Projects opened with a file handle autosave on every change; files dropped without a handle are read-only.
- Open files are watched for external changes: they reload automatically, or prompt when local edits conflict.
- Folder structure and current state are validated on import; legacy files require `*.board.json`, a supported schema, the app ID and valid project data. The data rules live in `validateBoardData` (`src/domain/board.ts`).

### Task and schema invariants

- Task titles are required and capped at 80 characters.
- Participants are saved as an `assignees` array; `responsible` is an optional name (empty string when unset) and always belongs to that array. Stable project-local references are stored in `assigneeIds`/`responsibleId`; names remain readable projections. Selecting, changing or clearing responsibility preserves existing participants. Rename members in Project settings to update all current assignments, including archived tasks. Removing the responsible participant asks for confirmation before clearing responsibility. Neither field is required to save or change status.
- Schema v2 adds responsibility. Version 1 files migrate on import/save without choosing a responsible person, even for one participant; older `assignee` strings/arrays still import. IDs, roadmap and existing timeline events are preserved. Assignment changes record before/after values in the same timeline. Regression fixture: `tests/fixtures/assignments-v1.board.json`.
- Responsible/participant filters each offer All, no allocation, or a name; they combine with each other. The palette offers both participant toggles and Set responsible. Quick-create `@name` adds participants and leaves responsibility unset. The table has a separate configurable Responsible column.
- Manually blocked tasks require `blockerReason`. Dependency blocking is derived from unfinished direct blockers, including archived blockers, without changing status or overwriting manual blocking. Board/Table blocked filters include both sources. Workitem tables offer independent Manually Blocked and Dependency Blocked columns and filters; Roadmap tables show both. Active filters appear only as a numeric button badge, with Clear all beside Reset inside the panel.
- Attachments have their own tab in workitem details, with a table of upload date, filename and uploader, plus downloads and image thumbnails. When opening a project, select a member or create one. Comments, new attachment uploads, acceptance and authored history use that selected identity for the session. This remains local attribution. Existing files without `uploadedBy` display Unknown; editing or saving them does not invent an author. Folder projects store attachment binaries separately; legacy files embed `dataUrl`s. Uploads are capped per workitem with a hard size limit and soft size warnings. Older extension-based attachment storage is cleaned up on save.
- Attachment lists in details and editing offer **Open** in a new tab for JPEG/JPG, PNG, GIF, WebP, BMP, ICO, AVIF, PDF, TXT, CSV, JSON, XML, MP3, WAV, OGG, MP4 and WEBM, including filename detection when the MIME is missing or generic. Other formats keep **Download** only; Download remains aligned and available for every attachment. CSV and XML open as readable text without automatic downloads. Previews use temporary local Blob URLs and require no external service. See the [US-23 walkthrough](test-board/teamos-development/README.md).
- Serialization normalizes tasks, columns and timestamps before save.
- Sprint lifecycle is manual. New Sprints start Planned; Roadmap and Table → Sprints offer Edit and Start/Finish actions with an optional local-today date update. Roadmap has no standalone Sprint creation button; create from Board/Table workitem selections. Roadmap v5 persists status, Goal, manually defined Capacity, Review and Retrospective. Older Sprint statuses are inferred from dates once on import, then persisted. Finishing freezes the roster, workflows, estimates, completion/carry-over IDs and results in `extensions.sprintResults` v1, returning unfinished planning units to Backlog; Task status resets depend on the Sprint automation. Stories with completed implementation awaiting acceptance retain their Sprint. Finished roster rows remain read-only when live work moves or changes. Review/Retrospective remain editable. See [US-22](test-board/teamos-development/README.md).
- Story Points are optional numeric estimates independent of Effort, available on Stories, Bugs and Tasks outside a Story or Bug; attaching a Task to a Story or Bug removes its own estimate. One-time completion credits record Story points when all child Tasks are Done (without requiring functional acceptance), or when a childless Story, independent Task or Bug itself becomes Done in an Active Sprint. Frozen Velocity sums these credits and cannot count carried work twice. No detailed analytics are added to Roadmap/Table.
- Table → Sprints displays `Sprint [number] - [user title]`, newest-created first, independently of planning dates. Project-local identities live in `extensions.sprintCatalog` v1 (`lastNumber`, entries with `sprintId`, `number`, `createdAt`). New sprints created from Board or Table receive the next number and creation timestamp; edits preserve both. Deleted IDs/numbers stay reserved, including across timeline preview/restore. Legacy migration reserves sprints by first appearance in existing history snapshots/events, then current-only sprints by array order, with `createdAt: null` (unknown); already assigned numbers are preserved. Unknown dates sort by descending assigned number after dated entries. No creation events or dates are fabricated, and workitem/roadmap IDs remain intact. See `tests/fixtures/sprints-legacy-v1.board.json`.

### Relations extension (version 1)

The optional `extensions.taskRelations` stores `{ version: 1, relations: [{ sourceId, targetId, kind }] }`. `kind` is `related` (symmetric) or `blocks` (source blocks target); inverse links are derived, never duplicated. IDs refer only to tasks in the same file, with one relation per unordered pair. Self-links, missing IDs, duplicate pairs and dependency cycles are rejected on import and mutation, as are unsupported extension versions.

Relations are an additive, separately versioned extension to the base board schema (currently version 6). Legacy files without it migrate to an empty relation set without changing task IDs, roadmap or other extension data; the extension is written when the first link is added and omitted after the last link is removed. The compatibility fixture is `tests/fixtures/task-relations-v1.board.json`.

Creating an item and its link is one autosaved mutation; cancelling creates neither. Deleting an item confirms the related IDs and blocking impact, removes its links, and preserves other items. Relation changes use the existing timeline and are replayed in historical previews/restores. Read-only and historical details allow navigation but hide relation mutation controls.

### Project extension (version 1)

`extensions.project` stores `{ version: 1, id, productName?, description, status, members: [{ id, name }], tags }`. New projects open the full settings draft before choosing a parent folder; project name and acronym are required, while other metadata and catalogs are optional. New projects start `planned` with no members and removable `bug`, `feature`, `improvement`, `documentation` tags. Status (`planned`, `active`, `paused`, `completed`, `archived`) is manual and informational: even Archived does not hide projects, block edits or archive tasks.

Legacy projects migrate with `status: null` (not defined), empty description and catalogs derived only from existing assignments/tags. Saving persists project/member identities; renaming the project or file does not change them. Settings changes use timeline snapshots; historical preview/restore recovers coherent catalogs and assignments while retaining project identity.

Task editors, palette actions and quick-create accept only the target project's curated members/tags. Add tags in Project settings; add members there or in the project identity selector (US-21 supersedes US-11's original inline creation). Member names must be non-blank and unique ignoring case/outer spaces; renaming preserves identity and never merges members. Members/tags used by current tasks, including archived ones, cannot be removed until their assignments are replaced or removed. Empty catalogs are valid. See the [US-11](test-board/teamos-development/README.md) and [US-21](test-board/teamos-development/README.md) manual walkthroughs.

### Products, permanent identities and transfers (schema 6)

Schema 6 retains older board formats and adds `Task.permanentId`, separate from the project-local number and display ID. Missing legacy identities are derived deterministically within a stable project namespace and persisted on save. Historical snapshots reuse the matching current lifecycle when migrating a missing identity; restoring history does not regenerate it. `extensions.project.productName` is optional; trimming and case-insensitive comparison determine product membership. Products have no file, workflow or tasks of their own.

A transfer promotes its incident local links to `extensions.permanentRelations` v1, with permanent endpoint identities plus last-known project/file/number/title hints. Loaded files resolve the current location by permanent identity. Unavailable endpoints remain visible and unfinished blockers remain blocking while their state is unknown. References learned from closed files stay available in memory for the session, including inverse references from copies with read-only sources; they are not a permission grant or a file-discovery service. Reopen the relevant project files to resolve references in a new session.

`extensions.projectTransfers` v1 stores the operation receipt, original/destination references, explicit catalog mappings, removed planning references/times, source recovery signature and preserved move history. Copies omit prior comments/history. The destination is saved before a move removes the source; the receipt remains pending until the source and final receipt are saved. Recovery reuses the same operation/task identity and refuses to remove a source whose task, comments, history or planning changed meanwhile. A move includes all descendants only when every descendant is in a Backlog or To-do category; the confirmation lists their IDs, titles and states and requires explicit destination states and mappings for each. Copying leaves children in the source. Batched moves use per-item receipts with an optional `batchId`, save the entire destination first, validate every source signature before removing any item, and recover the same batch without allocating new identities. A child transferred alone can be detached or mapped to a valid destination parent; hierarchy within a moved batch is preserved. State, people, tags, phase, milestone, sprint and parent choices appear together in a current/destination table. Scheduled blocks and previous sprint records require explicit removal; these have no reusable destination catalog. The receipt records the original associations and their destination mappings. Completed Story/Bug copies require fresh functional acceptance and an explicit author; moves preserve existing acceptance only for completed destinations. Return trips reuse canonical comments through timeline references, retaining the original historical conversation. File watching, conflict resolution and the existing save queue apply to each file independently.

The [example project walkthrough](test-board/teamos-development/README.md) and automated transfer fixtures exercise different workflows, local-number collisions, comments, relationships, planning, read-only access and write failures.

## Project folders (US-25)

**New Project** creates a project subfolder inside the parent folder you select. If folder picking is unavailable but file picking is supported, creation/import can fall back to legacy `.board.json` files. **Import Projects** opens the folder picker for either one project or every direct child containing `project.json`, retaining the current session and skipping duplicates. Each project requires `project.json`, `history.json`, and an `attachments/` directory; invalid projects report their own errors without stopping valid siblings.

`project.json` holds current state and attachment references. `history.json` stores the timeline, Project Control history and transferred history separately. Opening a folder reads only current state; the timeline and History/Comments tabs load history on demand. Attachments are read when displayed, opened or downloaded. Changes with events append only their new events to a JSON transaction journal, without reading or serializing older history; other saves leave history untouched. Binary filenames are SHA-256 hashes and historical/undo references keep their files available. The file layout is documented in [PROJECT_FORMAT.md](PROJECT_FORMAT.md); folders saved by an earlier version are converted once when opened, keeping a copy in `backup/schema-6/`.

**Import Projects** also converts legacy `.board.json` files found directly in the selected parent folder into project subfolders, leaving originals intact. Importing the same folder again skips projects already present. Dropped legacy files remain read-only. Close an already-open legacy version before opening its migrated copy: they preserve the same project identity.

The existing save queue, project locks, exact disk baselines, reconciliation and IndexedDB recovery apply to folder projects. A history transaction stages new events with the expected current-state hash before writing `project.json`, then appends a commit marker. Only the small journal tail is read during saves; full history is parsed on consultation. Failed saves retain committed history, and a missing final marker can be recovered from current-state metadata. Chrome/Edge desktop support folder access, including the standalone HTML. See [the fixture folders and walkthrough](test-board/teamos-development/README.md).

## Keyboard shortcuts

The **Shortcuts** button (or `?`) shows the full reference in the app.

| Keys | Action |
|---|---|
| `Ctrl/⌘` + `K` | Open the command palette |
| `/` | Search tasks and commands (opens the command palette) |
| `N` / `I` | New project / import projects |
| `H` | Open or close the documentation |
| `R` | Reset filters and sort |
| `S` | Focus sort control |
| `[` / `]` | Previous / next project chip |
| `J` / `K` | Select next / previous card |
| `Enter` | Open hovered or selected card |
| `E` | Edit hovered or selected card |
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

The single [TeamOS historical example project](test-board/README.md) covers the application in the current folder format, with a walkthrough and explicit fictional-data notices. Import a copy for writable exploration. Legacy regression fixtures live in `tests/fixtures/manual/`.

- `npm run typecheck` — TypeScript (`strict`) over `src/`, `tests/` and the config files. Vite and Vitest only strip types, so this is the only type check.
- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions. Tests that feed partial or deliberately malformed fixtures to typed functions wrap them in `fromPartial` / `fromAny` from `@total-typescript/shoehorn`.
- `npm run bench:performance` — isolated Chromium measurements of real priority mutations and historical reports, with synthetic projects. Compare another checkout with `-- --root /absolute/path/to/kanban`. See [issue 78 measurements and regression scenarios](test-board/teamos-development/README.md).
- `npm test` — Playwright end-to-end and visual tests. It builds the app and serves `dist/` on port 4174 before running, so it never reuses a dev server on 4173; the run fails if the port is already taken. Set `PLAYWRIGHT_PORT` for concurrent worktree runs.
- `npm run lint` — ESLint with `typescript-eslint`.

Visual baselines in `tests/visual.test.ts-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.ts --update-snapshots`, and review the image diff in the commit. Shared seeding helpers live in `tests/support/portfolio.ts`; the browser globals they install are declared in `tests/support/testGlobals.d.ts`.

Optional Playwright modes: `npm run test:headed`, `npm run test:ui`, `npm run test:debug`.

### Pre-commit hook

`npm install` sets up a Husky pre-commit hook (`.husky/pre-commit`, registered at the git root via the `prepare` script). Each commit runs ESLint on staged `.ts`/`.tsx`/`.mjs` files (lint-staged, `.lintstagedrc`), then `npm run typecheck` and `npm run test:unit`. Playwright tests are not run by the hook; run `npm test` before pushing UI changes.

### Workitem IDs

New projects require a **Project Acronym** of 1–4 letters, unique among the projects open in the local portfolio. New workitems persist IDs such as `CHK-EP-1`, `CHK-US-2`, `CHK-TK-3`, and `CHK-BG-4`, sharing one project sequence. Types stay fixed after creation; display IDs stay fixed within a project, while transfers allocate a destination ID and moves preserve permanent identity; changing the project name or acronym affects only future items. Deletion and history restoration never reuse a number.

Schema 5 reads schema 1–4 files without assigning new IDs to existing items. An older project can set its acronym in General settings or when creating its first new item. Numeric references remain the stable links for hierarchy, relations, comments and planning. Since project files are local, acronym uniqueness is checked against the loaded portfolio.

Project Control adds project-local Risks, Decisions and Deliverables with phase/milestone associations, comments, history and deliverable acceptance gates. Each subsection uses the Table → All layout: counts and selection, search, icon-only Filters/Columns/CSV, a divider and + New record. Filters keep type-specific assessments, dates and associations as removable tags; columns are configurable with separate local preferences per type, pagination uses 25/50/100 rows and CSV exports every filtered row after separator confirmation. Records use workitem-style tabbed dialogs and colored status/assessment badges. New IDs use the project acronym, RK/DC/DL and a monotonic number; existing IDs are preserved. The v3 extension adds participants and tags using the Work Item editors and project catalogs, with direct sidebar editing and the same responsibility/participation behavior. It migrates v1/v2 files while preserving IDs, comments, history and legacy owners; obsolete workitem links remain archived. See [US-20 manual scenarios and data rules](test-board/teamos-development/README.md).

Issue 54 removes archive commands and filters while retaining legacy metadata and historical events. Legacy archived workitems remain visible. Dates stay ISO in project files. See [the manual verification guide](test-board/teamos-development/README.md).
Concurrent project changes are checked before and after every save. Independent edits merge automatically; conflicts pause autosave until field-level reconciliation. Pending work is recoverable through IndexedDB after reopening the project. See [US-28 scenarios](test-board/teamos-development/README.md).
