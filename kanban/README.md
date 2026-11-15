# TeamOS Kanban

This is a local app for portfolio planning and Kanban. It uses Vite, React, Zustand and TypeScript. You can open two or more project folders at the same time. You can plan and do the work of these projects. The app autosaves changes to `project.json`, `history.json` and `attachments/`. You can also continue to use legacy `*.board.json` files.

## What it does

- **Workspace navigation** — The view buttons are below the header. The project selector next to the logo changes between All and one project. It also contains project settings, project removal and save retry. The magnifying glass in the header opens the command palette (Ctrl/⌘+K).

  Board and Table each have a set of query controls. Dashboard, Roadmap and Day Planner have controls for each view. Calendar is in Day Planner. See [US-24](test-board/teamos-development/README.md).
- **Projects** — New Project makes a project subfolder. Import Projects opens a project folder, or the projects in the subfolders directly below it. It also converts the legacy files that are directly in the selected parent folder. The projects that are loaded stay loaded. The import ignores the projects that are loaded. If you drop legacy `.board.json` files, they open read-only.
- **Products and project transfers** — An optional Product in Project settings puts projects into groups, below headers that you can expand. The projects in a group continue to operate independently. When the app compares Product names, it ignores letter case and the spaces before and after the name.

  The ⋯ menu of each task copies or moves the task to a different project. That project must be loaded and writable, and it must be in the same product. You must select the destination state. You must also select a mapping or a removal for each person and tag.

  A move keeps the permanent identity, the comments and the history. A copy starts a new identity and a new history. The transfer maps or removes persons, tags, parent and planning associations, as you select. You must remove scheduled blocks and previous Sprint records. The receipt records these decisions. If a write operation stops before it is complete, the app lets you continue the transfer.
- **App settings** — The gear in the header opens appearance (Light/Dark), theme (Classic/Modern), language (EN/PT) and timeline visibility. This browser keeps the preferences. If you clear timeline visibility, the app stops the historical preview.
- **Project settings** — Open settings from the project selector. General, Technical workflow, Functional workflow and Automations use the same draft. Save applies the draft. Cancel/close/Escape discards the draft. General contains name, acronym, product, description, status, members and tags.

  New projects assign Epics/Stories/Bugs to Functional and Tasks to Technical. You can assign each type again. You can set states, categories, transitions and reference states. You can continue to look at historical and read-only settings.
- **Board view** — Technical and Functional perspectives follow the type assignments of the project. Epics are available in the Table. Columns follow the workflows that you set, which include Backlog and Testing. Initially, the board does not show Cancelled states.

  Initially, the Active Sprints only checkbox is selected for the two perspectives. To see work with no Sprint and other Sprints, clear the checkbox. You can also select one Sprint in Filters. You can move cards with drag/touch/keyboard input. You can assign responsibility directly on a card. A card also has a next-state arrow.

  Filters & View contains Board columns. In a writable project, you can make a Sprint from selected cards. You can also add selected cards to a Sprint.
- **Tasks** — When you save a new workitem, its details open. If you make a workitem from a different workitem, the app keeps a return chain. When you close a new Task, the app goes back to its Story, then its Epic, then the initial screen. The chain also stays when you cancel a new workitem. It also stays when you edit a workitem that you opened from a different workitem.

  Fields include title, description, participants and an optional responsible person. They also include tags, blocked + blocker reason, priority, effort and due date. Other fields are checklist (you can change the sequence of its items), attachments and roadmap phase/milestone/sprint.
- **Acceptance and automation** — To complete a Story or Bug, its child Tasks must be in terminal states. A local author must also accept the Story or Bug manually. Acceptance Criteria are recommended, but they are not mandatory. If you edit the criteria of an accepted Story, you must accept the Story again.

  There are six workflow categories: Backlog, To do, In progress, Testing, Completed and Cancelled. Each of the eight hierarchy/closure rules can be Off, On 1 (approval) or On 2 (automatic). Rules do not bypass transitions, and they do not give functional acceptance.
- **Workitem relations** — You can connect a workitem to other items by ID/title. This includes completed and archived items. Or, you can make a related Backlog item. This new item gets only the phase/milestone from the initial item.

  Details put small, aligned rows into the groups Blocked by, Blocks and Related to. Each row shows ID navigation, the start of the title and a plain-text status. It also shows the first name of the responsible person. Edit and remove icons on the row let you change relations there. Before the app replaces or removes a relation, you must accept the change. These changes keep the two items, and the app calculates blocking again.
- **Filters and sort** — Board queries, each table subsection and each Sprint have a search and filters that operate independently. The URL keeps Board filters. Board filters also have an effect on Planner/Calendar. Table filters apply only to their table. Filters include status, blocking, persons, priority, effort and planning.

  The Board sorts by priority, effort, score or name. Tables sort by column. Dashboard uses a period and a scope that apply only to the Dashboard.
- **Roadmap view** — ALL shows all loaded projects, but not Paused, Completed and Archived projects. It puts the projects in sequence by phase start. Each project has a different master-bar color, in load sequence. Single-project Roadmap shows phases, milestones and independent sprints on a time axis. Project groups and phase trees start collapsed. The two scopes have Expand all and Collapse all.

  At 100%, the full timeline is in the view. Above 100%, it scrolls in the horizontal direction. Navigation, dates, milestones and the labels that identify items do not move.

  Roadmap workitem tables show only ID, Title, Type, Status, Responsible, Manually Blocked, Dependency Blocked and Updated (date only). These tables have no search or filters. Each phase and Sprint has a dedicated button for its workitem table. Parent phases include all descendant phases. Only phases with children have tree arrows.

  Milestone diamonds fill to show their completion. Tooltips with two lines show names, dates and percentages. When you do a bulk Sprint allocation, the app examines explicit and inherited phase dates. It lets you keep or extend these dates.
- **Dashboard** (single project) — Overview has nine sections. You can set the visibility of each section independently. The sections are project overview, active sprint, project statistics and started/completed/in-progress workitems. They also include open risks, deliverables and decisions.

  Start/End dates use recorded UTC history. Activity lists count the category transitions in the period. Status sections use the snapshot at the end date. Planning scope filters descendant phases.

  Overview keeps parent phases that started and have work that is not completed. It also keeps acceptance gates, overdue warnings and the next/overdue milestones. Three circular charts show Stories, independent Tasks and Bugs by workflow category. Activity lists include Stories and independent Tasks.

  You can open the details of the workitems, Roadmap items, sprints and Project Control records that are in the project. Where history has no data, the Dashboard shows N/A. Sprint Analytics stays available, and you can continue to look at recorded history. But its capacity, points, velocity and closure-chart reports continue to show placeholders. Sprint headers and editors show recorded point totals and closure fields. See [section acceptance scenarios](test-board/teamos-development/README.md).
- **Calendar inside Day Planner** — It gives a year/month view of Tasks only, with a deadline heatmap. These views are next to Day and Week. Time blocks stay in Day and Week.
- **Command palette** — Open it with `⌘K` / `Ctrl+K`, `/` or the search icon in the header. You can find tasks (title, `#id`, `#tag`, assignee), projects, roadmap items and commands. You can change a task step by step (move, assign, priority, plan). You can filter the board by text. You can make a task in one line with `+ Title @person !high #tag ~S due:fri in:project`. You can schedule with `plan <task> 14:00`.
- **Day Planner** — Drag tasks from all projects onto a 07:00–21:00 day (or Mon–Fri week) in 15-minute slots. Then you can move the tasks and change their length. The app saves plans for each project in `extensions.dayPlanner` (`{ version: 1, blocks: [{ id, taskId, date, start, end }] }`). Plans do not change the task. The project timeline also records all planner changes.
- **Timeline** (single project) — The timeline records all saved changes. Scrub back to preview a previous state in read-only mode. Then you can restore that state.
- **Table perspectives** (single project) — ALL shows Epic → Story → Task rows that you can collapse. It also shows Tasks directly below an Epic, and independent Tasks/Bugs. The same table shows Roadmap phases, milestones and sprints, and it includes recorded participation. If filters remove the ancestors of a workitem that agrees with the filters, the table continues to show that workitem. Pagination keeps full root groups together.

  The other perspectives are the views for each type, All Tasks & Bugs and Backlog. There is also a table for each sprint, which you can collapse. Backlog shows planning units that have work that is not completed and no applicable Sprint allocation. In Backlog, Sprint Actions has the commands that make or assign a sprint from a selection. Sprint tables have no row-selection checkboxes or Sprint Actions.

  Filters, Columns and Export CSV use icon buttons. In Backlog, Sprint Actions has a runner icon and is after the divider, immediately before +.

  In each sprint table, a Story expands directly into the Task rows that are in the sprint. Independent Tasks and Bugs are at the top level. A sort keeps child rows below their Story. Pagination keeps each group together. CSV includes all filtered workitems, also when they are collapsed.

  Sprint headers keep the dates and the Planned/Active/Done status, which you set manually. They also show the percentage of completed planning units, and they count each planning unit one time. This percentage includes archived items, and it does not count Story Tasks two times. Filters change rows and CSV, but not the sprint denominator.

  Dates use `dd/mm/yyyy`, and timestamps use UTC `dd/mm/yyyy HH:mm:ss`. Columns have minimum widths, cells with two lines and horizontal scrolling. They also have status and blocked badges with colors.
- **In-app documentation** — The book button in the top bar (or `H`) changes between the workspace and a documentation page. You can navigate in this page. When you see the page, the button shows an application icon. The workspace stays mounted while you cannot see it. Thus, the loaded projects, selection, view, filters and drafts stay the same. The documentation also operates when no project is loaded.

  Ten sections give information about getting started and the Agile methodology as TeamOS applies it. The methodology topic shows which items are only recommended and which rules the app makes mandatory. Other sections give information about projects, workitems, workflows, planning, views, files and history, and productivity. One section is an end-to-end example with FAQ.

  The page has a contents sidebar with a search field, and the sidebar shows the active topic with a mark. It also has links to related topics and previous/next navigation. It follows the light/dark theme and the EN/PT language. On small screens, it collapses its contents.

  The live app renders the command palette guide and the shortcut reference. The content is in `src/app/docs/content/{en,pt}.ts`. Unit tests make sure that the two outlines and all internal links agree.
- **Appearance** — In App settings, you select Classic or Modern, and Light/Dark for each theme. Modern uses Inter typography, which is bundled locally. Preferences stay in the browser. They do not change project data or drafts.

## Data and persistence

- The app uses the File System Access API (Chromium browsers). Projects that you open with a file handle autosave on each change. Files that you drop without a handle are read-only.
- The app monitors open files for external changes. The reload of these files is automatic. If local edits are in conflict with these changes, the app tells you.
- On import, the app validates the folder structure and the current state. Legacy files must have `*.board.json`, a schema version that the app can read, the app ID and correct project data. The data rules are in `validateBoardData` (`src/domain/board.ts`).

### Task and schema invariants

- A task title is necessary. It can have a maximum of 80 characters.
- The app saves participants as an `assignees` array. `responsible` is an optional name (empty string when it has no value). This name is always in that array. `assigneeIds`/`responsibleId` store stable project-local references. Names stay as projections that you can read.

  When you select, change or clear responsibility, the participants do not change. To update the current assignments of a member, rename the member in Project settings. This also updates archived tasks. If you remove the responsible participant, you must accept the change before the app clears responsibility. You can save or change status without these two fields.
- Schema v2 adds responsibility. Version 1 files migrate on import/save, and the migration does not select a responsible person. This also applies to a task with one participant. The app continues to import `assignee` strings/arrays from previous versions.

  The migration keeps IDs, roadmap and the timeline events. Assignment changes record before/after values in the same timeline. The regression fixture is `tests/fixtures/assignments-v1.board.json`.
- Each Responsible/participant filter gives All, no allocation, or a name. You can use the two filters together. The palette has the two participant toggles and Set responsible. Quick-create `@name` adds participants, but it does not set responsibility. The table has an isolated Responsible column that you can set.
- Manually blocked tasks must have `blockerReason`. The app calculates dependency blocking from the blockers in the Blocked by relations of a task that are not completed. These blockers include archived blockers. Dependency blocking does not change status or replace manual blocking. Board/Table blocked filters include the two sources.

  Workitem tables have Manually Blocked and Dependency Blocked columns and filters that operate independently. Roadmap tables show the two columns. Active filters show only as a badge with a number on a button. Clear all is next to Reset in the panel.
- Attachments have a tab in workitem details. This tab has a table of upload date, filename and uploader, with downloads and image thumbnails. When you open a project, select a member or make a new member. Comments, new attachment uploads, acceptance and authored history use that selected identity for the session. This author information stays local.

  Files that do not have `uploadedBy` show Unknown. If you edit or save these files, the app does not add an author. Folder projects store attachment binaries in isolated files. Legacy files embed `dataUrl`s. Each workitem has a hard size limit for uploads and soft size warnings. On save, the app removes the attachment storage of previous versions from extensions.
- Attachment lists in details and editing have **Open**, which opens the file in a new tab. You can open JPEG/JPG, PNG, GIF, WebP, BMP, ICO, AVIF, PDF and TXT files. You can also open CSV, JSON, XML, MP3, WAV, OGG, MP4 and WEBM files. If the MIME is missing or generic, the app also uses the filename to find the format.

  Other formats have only **Download**. Download stays aligned and available for all attachments. CSV and XML open as text that you can read, and the app does not start a download. Previews use temporary local Blob URLs, and they do not use an external service. See the [US-23 walkthrough](test-board/teamos-development/README.md).
- Serialization normalizes tasks, columns and timestamps before save.
- Sprint lifecycle is manual. New Sprints start as Planned. Roadmap and Table → Sprints have Edit and Start/Finish commands with an optional local-today date update. Roadmap has no standalone Sprint creation button. Make Sprints from Board/Table workitem selections. Roadmap v5 saves status, Goal, the Capacity that you set manually, Review and Retrospective.

  On import, the app calculates Sprint statuses from previous versions from dates one time. Then it saves these statuses. The Finish command freezes the roster, workflows, estimates, completion/carry-over IDs and results in `extensions.sprintResults` v1. It also moves planning units that are not completed back to Backlog. The Sprint automation controls Task status resets.

  If the work on a Story is completed but the Story waits for acceptance, the Story keeps its Sprint. After the Finish command, roster rows stay read-only when live work moves or changes. You can continue to edit Review/Retrospective. See [US-22](test-board/teamos-development/README.md).
- Story Points are optional estimates in numbers, and they are not related to Effort. They are available on Stories, Bugs, and Tasks that are not in a Story or Bug. If you attach a Task to a Story or Bug, the app removes the estimate of that Task.

  One-time completion credits record Story points when all child Tasks are Done. Functional acceptance is not necessary for this condition. Credits also record Story points in an Active Sprint. This occurs when a Story with no children, an independent Task or a Bug becomes Done. Frozen Velocity adds these credits, and it cannot count carry-over work two times. Roadmap/Table do not get analytics with more information.
- Table → Sprints shows `Sprint [number] - [user title]`, with the last made sprint first. This sequence is not related to planning dates. Project-local identities are in `extensions.sprintCatalog` v1 (`lastNumber`, entries with `sprintId`, `number`, `createdAt`). A new sprint from Board or Table gets the next number and a creation timestamp. Edits keep the two values. Deleted IDs/numbers stay reserved, also across timeline preview/restore.

  Legacy migration first reserves the sprints that are in history snapshots/events, by first appearance. Then it reserves the sprints that are only in the current state, by array sequence, with `createdAt: null` (unknown).

  Numbers that sprints have at this time stay the same. Entries with unknown dates come after entries with dates, by assigned number from high to low. The migration does not make incorrect creation events or dates. Workitem/roadmap IDs stay the same. See `tests/fixtures/sprints-legacy-v1.board.json`.

### Relations extension (version 1)

The optional `extensions.taskRelations` stores `{ version: 1, relations: [{ sourceId, targetId, kind }] }`. `kind` is `related` (symmetric) or `blocks` (source blocks target). The app calculates inverse links, and it does not record them two times. IDs refer only to tasks in the same file. Each pair of tasks has one relation, in the two directions.

Import and mutation reject self-links, missing IDs, pairs that occur two times and dependency cycles. They also reject extension versions that the app cannot read.

Relations are an additive extension to the primary board schema (at this time, version 6), with an isolated version number. Legacy files without this extension migrate to an empty relation set. This migration does not change task IDs, roadmap or other extension data. The app writes the extension when you add the first link. It removes the extension from the file after you remove the last link. The compatibility fixture is `tests/fixtures/task-relations-v1.board.json`.

When you make an item and its link, the app does one autosaved mutation. If you cancel, the app does not make the item or the link. When you delete an item, the app shows the related IDs and the blocking effect, and you must accept them. Then it removes the links of the item, and it keeps the other items.

Relation changes use the same timeline as other changes. Historical previews/restores replay these changes. Read-only and historical details let you navigate, but they do not show relation mutation controls.

### Project extension (version 1)

`extensions.project` stores `{ version: 1, id, productName?, description, status, members: [{ id, name }], tags }`. New projects open the full settings draft before you select a parent folder. Project name and acronym are necessary. Other metadata and catalogs are optional. New projects start `planned` with no members and with these tags, which you can remove: `bug`, `feature`, `improvement`, `documentation`. Status (`planned`, `active`, `paused`, `completed`, `archived`) is manual, and it gives only information.

Thus, Archived status does not remove projects from the view, prevent edits or archive tasks. Legacy projects migrate with `status: null` (no value) and an empty description. Their catalogs come only from the assignments/tags that are in the project. A save keeps project/member identities in the file. If you rename the project or file, these identities do not change. Settings changes use timeline snapshots.

Historical preview/restore recovers catalogs and assignments that agree with each other, and it keeps the project identity.

Task editors, palette actions and quick-create accept only the members/tags in the catalogs of the target project. Add tags in Project settings. Add members there or in the project identity selector. US-21 replaces the initial inline member creation of US-11. Member names must not be empty. Each name must be different from the other names, and the app ignores case/outer spaces when it compares names.

A rename keeps the identity, and it does not merge members. You cannot remove members/tags that tasks use at this time. This also applies to archived tasks. You can remove them only after you replace or remove their assignments. Empty catalogs are correct. See the [US-11](test-board/teamos-development/README.md) and [US-21](test-board/teamos-development/README.md) manual walkthroughs.

### Products, permanent identities and transfers (schema 6)

Schema 6 keeps previous board formats and adds `Task.permanentId`. This identity is not the same as the project-local number and display ID. If a legacy identity is missing, the app calculates it deterministically in a stable project namespace. The app saves that identity in the file. When the app migrates a missing identity, historical snapshots use the current lifecycle that agrees with it. A history restore does not make the identity again.

`extensions.project.productName` is optional. To find the product of a project, the app removes outer spaces from names. It also ignores letter case when it compares names. Products have no file, workflow or tasks.

A transfer changes the local links of the transferred task to `extensions.permanentRelations` v1. These links have permanent endpoint identities and last-known project/file/number/title hints. Loaded files use the permanent identity to find the current location. Endpoints that are not available continue to show. While their state is unknown, blockers that are not completed continue to block.

The app keeps references from closed files in memory for the session. This includes inverse references from copies with read-only sources. These references do not give permission, and they do not find files. In a new session, open the applicable project files again to find references.

`extensions.projectTransfers` v1 stores the operation receipt, initial/destination references and the catalog mappings that you selected. It also stores removed planning references/times, the source recovery signature and the move history that the transfer keeps. Copies do not include previous comments/history. A move saves the destination before it removes the source. The receipt stays pending until the app saves the source and the last receipt.

Recovery uses the same operation/task identity again. It does not remove a source if its task, comments, history or planning changed after the transfer started. A move includes all descendants only when each descendant is in a Backlog or To-do category. The confirmation shows their IDs, titles and states. For each descendant, you must select destination states and mappings. A copy keeps children in the source.

Batched moves use a receipt for each item, with an optional `batchId`. They save the full destination first. They validate all source signatures before they remove an item. They recover the same batch, and they do not allocate new identities.

If you transfer only a child, you can disconnect it from its parent. Or, you can map it to a correct destination parent. Hierarchy in a moved batch stays the same.

State, person, tag, phase, milestone, sprint and parent selections show together in a current/destination table. You must remove scheduled blocks and previous sprint records. These items have no destination catalog that the app can use again. The receipt records the initial associations and their destination mappings.

Copies of completed Stories/Bugs must get new functional acceptance and an author that you select. A move keeps the acceptance only when the destination state is completed. When a workitem goes back to a project, the app uses its canonical comments again through timeline references. Thus, the initial comments stay in history. File watching, conflict resolution and the same save queue apply to each file independently.

The [example project walkthrough](test-board/teamos-development/README.md) and the transfer fixtures for automatic tests use different workflows and local-number collisions. They also include comments, relations, planning, read-only access and write errors.

## Project folders (US-25)

**New Project** makes a project subfolder in the parent folder that you select. If folder picking is not available but file picking is available, creation/import can use legacy `.board.json` files. **Import Projects** opens the folder picker for one project or for each child folder that directly contains `project.json`. It keeps the current session and ignores the projects that are loaded. Each project must have `project.json`, `history.json` and an `attachments/` directory. Projects that are not correct show their errors, but they do not stop the other correct projects.

`project.json` holds the current state and attachment references. `history.json` stores the timeline, Project Control history and transferred history in isolated sections. When you open a folder, the app reads only the current state. The timeline and History/Comments tabs load history only when you open them. The app reads attachments when it shows, opens or downloads them.

Changes with events append only their new events to a JSON transaction journal. They do not read or serialize previous history. Other saves do not change history. Binary filenames are SHA-256 hashes. Historical/undo references keep their files available. The file layout is in [PROJECT_FORMAT.md](PROJECT_FORMAT.md).

If a previous version saved a folder, the app converts that folder one time when it opens it. The conversion keeps a copy in `backup/schema-6/`.

**Import Projects** also converts legacy `.board.json` files that are directly in the selected parent folder into project subfolders. The initial files do not change. If you import the same folder again, the import ignores the projects that are in the portfolio. Legacy files that you drop stay read-only. Close a loaded legacy version before you open its migrated copy. The two versions have the same project identity.

The same save queue, project locks, accurate disk baselines, reconciliation and IndexedDB recovery apply to folder projects. A history transaction stages new events with the hash that the new current state must have. Then the app writes `project.json`. Then it appends a commit marker. During saves, the app reads only a small part at the end of the journal. It parses the full history only when you look at history.

If a save is not complete, committed history stays. The app can recover a missing last marker from current-state metadata. Chrome/Edge desktop browsers can open folders. This also applies to the standalone HTML. See [the fixture folders and walkthrough](test-board/teamos-development/README.md).

## Keyboard shortcuts

The **Shortcuts** button (or `?`) shows the full reference in the app.

| Keys | Action |
|---|---|
| `Ctrl/⌘` + `K` | Open the command palette |
| `/` | Find tasks and commands (opens the command palette) |
| `N` / `I` | New project / import projects |
| `H` | Open or close the documentation |
| `R` | Reset filters and sort |
| `S` | Put the focus on the sort control |
| `[` / `]` | Previous / next project chip |
| `J` / `K` | Select next / previous card |
| `Enter` | Open hovered or selected card |
| `E` | Edit hovered or selected card |
| `1`–`4` | Move card to backlog / to-do / in progress / done |
| `Ctrl/Cmd+Enter` | Save task (in the task editor) |
| `Esc` | Close dialog |

## Project structure

The full dependency and folder guide is in [`ARCHITECTURE.md`](ARCHITECTURE.md).
The short version is:

- `src/app/` — bootstrapping, the root composition, providers and app-wide overlays.
- `src/domain/` — pure board, task, roadmap, timeline, calendar, day planner, attachment, serialization and scoring rules.
- `src/features/portfolio/` — the portfolio feature, in groups by responsibility: views, commands, queries, state, project operations and lifecycle hooks.
- `src/infrastructure/` — browser adapters, persistence/repository code, file watching and logging.
- `src/shared/` — UI helpers that you can use again and small shared types.
- `src/styles/` — CSS in the groups `foundation/`, `portfolio/` and `overlays/`. `app.css` is the cascade manifest.

## Development

You must have Node.js 22.12+ or 24+ (Vite 8 and Vitest 5).

```bash
npm install
npx playwright install
npm run dev
```

You can make a build that operates without a server. You can open this build directly in a Chromium-based browser. To make it, run these commands:

```bash
npm run build:standalone
open dist-standalone/index.html
```

This makes one self-contained HTML file. The usual `npm run build` continues to make the usual `dist/` bundle.

`dist/` and `dist-standalone/` are committed build outputs. Thus, each branch and PR includes builds that you can run. Before you commit app changes, run `npm run build`. Also run `npm run build:standalone`. Include the regenerated folders. CI also publishes builds, as the section below shows.

## Continuous integration and downloads

GitHub Actions (`.github/workflows/kanban.yml`, at the repository root) runs on each pull request and push that changes `kanban/`. It runs lint, typecheck, unit tests and the Playwright end-to-end tests (`tests/e2e`). CI does not run the visual snapshot tests, because their baselines are for macOS only. For those tests, run `npm test` locally.

When the tests on `main` give satisfactory results, the workflow builds the app and replaces the **`kanban-latest`** GitHub Release with:

- `teamos-kanban.html`: the standalone single-file app, to download and open in a Chromium-based browser.
- `teamos-kanban-dist.zip`: the usual `dist/` build for a web server.

To get the last standalone file from the command line, run this command:

```bash
gh release download kanban-latest --repo sebastiaofv/TeamOs --pattern teamos-kanban.html
```

You can also start the workflow manually from the Actions tab (*Run workflow*).

## Testing

The [issue 93 validation report](docs/issue-93-validation.md) gives information about the Radix/Zod boundaries and the WCAG 2.2 AA review. It also contains the before/after accessibility table and local performance measurements.

The single [TeamOS historical example project](test-board/README.md) shows the application in the current folder format. It has a walkthrough, and it tells you clearly that all its data is example data. To use the project in writable mode, import a copy. Legacy regression fixtures are in `tests/fixtures/manual/`.

- `npm run typecheck` — TypeScript (`strict`) for `src/`, `tests/` and the config files. Vite and Vitest only remove types. Thus, this is the only type check.
- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions. Some tests give typed functions fixtures that have only some fields, or fixtures that the test makes incorrect. These tests put the fixtures in `fromPartial` / `fromAny` from `@total-typescript/shoehorn`.
- `npm run bench:performance` — isolated Chromium measurements of priority mutations and historical reports, with synthetic projects. To compare a different checkout, use `-- --root /absolute/path/to/kanban`. See [issue 78 measurements and regression scenarios](test-board/teamos-development/README.md).
- `npm test` — Playwright end-to-end and visual tests. Before the tests start, it builds the app and serves `dist/` on port 4174. Thus, it does not use a dev server on 4173. If a different process uses the port, the run stops. If you run tests in two or more worktrees at the same time, set `PLAYWRIGHT_PORT`.
- `npm run lint` — ESLint with `typescript-eslint`.

Visual baselines in `tests/visual.test.ts-snapshots/` are for macOS only. Regenerate them only when you must change them, with `npx playwright test tests/visual.test.ts --update-snapshots`. Then examine the image diff in the commit. Shared seeding helpers are in `tests/support/portfolio.ts`. `tests/support/testGlobals.d.ts` declares the browser globals that these helpers install.

Optional Playwright modes are `npm run test:headed`, `npm run test:ui` and `npm run test:debug`.

### Pre-commit hook

`npm install` installs a Husky pre-commit hook (`.husky/pre-commit`). The `prepare` script registers this hook at the git root. Each commit runs ESLint on staged `.ts`/`.tsx`/`.mjs` files (lint-staged, `.lintstagedrc`). Then it runs `npm run typecheck` and `npm run test:unit`. The hook does not run Playwright tests. Before you push UI changes, run `npm test`.

### Workitem IDs

New projects must have a **Project Acronym** of 1–4 letters. This acronym must be different from the acronyms of the other projects in the local portfolio. New workitems save IDs such as `CHK-EP-1`, `CHK-US-2`, `CHK-TK-3`, and `CHK-BG-4`. These IDs use the same project sequence. Types stay the same after creation. Display IDs stay the same in a project.

Transfers allocate a destination ID, and moves keep the permanent identity. If you change the project name or acronym, the change applies only to the items that you make after it. Deletion and history restoration do not use a number again.

Schema 5 reads schema 1–4 files, and it does not assign new IDs to the items in these files. In a project from a previous version, you can set the acronym in General settings. You can also set it when you make the first new item of the project. References by number continue to be the stable links for hierarchy, relations, comments and planning. Project files are local. Thus, the app compares the acronym only with the loaded portfolio.

Project Control adds project-local Risks, Decisions and Deliverables with phase/milestone associations, comments, history and deliverable acceptance gates. Each subsection uses the Table → All layout. This layout has counts and selection, search, icon-only Filters/Columns/CSV, a divider and + New record.

Filters keep the assessments, dates and associations of each type as tags that you can remove. You can set the columns, with local preferences for each type. Pagination uses 25/50/100 rows. After you accept the separator, CSV exports all filtered rows. Records use tabbed dialogs, as workitems do, and status/assessment badges with colors.

New IDs use the project acronym, RK/DC/DL and a number that only increases. IDs that are in the project stay the same. The v3 extension adds participants and tags through the Work Item editors and project catalogs. You can edit these fields directly in the sidebar, and responsibility/participation operates as in workitems.

The v3 extension migrates v1/v2 files, and it keeps IDs, comments, history and legacy owners. Workitem links that the v3 extension does not use stay archived. See [US-20 manual scenarios and data rules](test-board/teamos-development/README.md).

Issue 54 removes archive commands and filters, but it keeps legacy metadata and historical events. Legacy archived workitems continue to show. Dates stay ISO in project files. See [the manual verification guide](test-board/teamos-development/README.md).

Before and after each save, the app looks for project changes that occurred at the same time. The merge of independent edits is automatic. Conflicts stop autosave until field-level reconciliation. After you open the project again, you can recover pending work through IndexedDB. See [US-28 scenarios](test-board/teamos-development/README.md).
