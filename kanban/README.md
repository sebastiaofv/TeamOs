# TeamOS Kanban

This is a local app for portfolio planning and Kanban. It uses Vite, React, Zustand and TypeScript. You can open several project folders at the same time. You can plan and do work across these projects. The app autosaves changes to `project.json`, `history.json` and `attachments/`. The app continues to support legacy `*.board.json` files.

## What it does

- **Workspace navigation** — View buttons are below the header. The project selector next to the logo switches between All and a single project. It also contains project settings, removal and save retry. The header magnifying glass opens the command palette (Ctrl/⌘+K). Board and Table have their own query controls. Dashboard, Roadmap and Day Planner have view-specific controls. Calendar is inside Day Planner. See [US-24](test-board/teamos-development/README.md).
- **Projects** — New Project creates a project subfolder. Import Projects opens a project folder or the projects in direct subfolders. It also converts the legacy files that are directly in the selected parent. The projects that are already loaded stay loaded. The import skips duplicates. If you drop legacy `.board.json` files, they open read-only.
- **Products and project transfers** — An optional Product in Project settings groups independent projects under expandable headers. Product comparison ignores case and outer whitespace. The ⋯ menu of each task copies or moves the task to another loaded, writable project in the same product. The copy or move has an explicit destination state and explicit person/tag mappings or removals. Moves keep the permanent identity, comments and history. Copies start a new identity/history. The transfer maps or explicitly removes people, tags, parent and planning associations. Scheduled blocks and previous Sprint records must be removed. The receipt records these decisions. If a write is interrupted, the app makes the transfer available to resume.
- **App settings** — The header gear opens appearance (Light/Dark), theme (Classic/Modern), language (EN/PT) and timeline visibility. This browser keeps the preferences. When you hide the timeline, the app leaves historical preview.
- **Project settings** — Open settings from the project selector. General, Technical workflow, Functional workflow and Automations share one draft. Save applies the draft. Cancel/close/Escape discards it. General contains name, acronym, product, description, status, members and tags. New projects assign Epics/Stories/Bugs to Functional and Tasks to Technical. You can change the assignment of each type. You can configure states, categories, transitions and reference states. You can still consult historical and read-only settings.
- **Board view** — Technical and Functional perspectives follow the type assignments of the project. Epics are available in the Table. Columns follow configurable workflows, which include Backlog and Testing. By default, the board hides Cancelled states. By default, Active Sprints only is checked for both perspectives. To see unsprinted work and other Sprints, clear it. Or, select a specific Sprint in Filters. Cards support drag/touch/keyboard moves, direct responsibility assignment and a next-state arrow. Filters & View contains Board columns. Selected cards in a writable project can create or join a Sprint.
- **Tasks** — When you save a new workitem, its details open. If you create a workitem from another workitem, the app keeps a return chain. When you close a new Task, the app goes back to its Story, then its Epic, then the original screen. The chain also stays when you cancel creation and when you edit nested workitems. Fields include title, description, participants and an optional responsible person. They also include tags, blocked + blocker reason, priority, effort and due date. Other fields are checklist (reorderable), attachments and roadmap phase/milestone/sprint.
- **Acceptance and automation** — To complete, Stories and Bugs must have terminal child Tasks and explicit local-author acceptance. Acceptance Criteria are recommended, but they are not mandatory. If you edit the criteria of an accepted Story, the app asks for acceptance again. Six workflow categories distinguish Backlog, To do, In progress, Testing, Completed and Cancelled. Eight hierarchy/closure rules support Off, On 1 (approval) or On 2 (automatic). Rules never skip transitions or give functional acceptance.
- **Workitem relations** — Link items that exist by ID/title. This includes completed and archived items. Or, create a related Backlog item that inherits only phase/milestone. Details put compact, aligned rows into the groups Blocked by, Blocks and Related to. Each row shows ID navigation, a truncated title, a plain-text status and the first name of the responsible person. Direct edit/remove icons support inline relation changes and confirmed replacement/removal. These changes keep both items and calculate blocking again.
- **Filters and sort** — Board queries and each table subsection/Sprint have independent search and filters. The URL keeps Board filters. Board filters also affect Planner/Calendar. Table filters apply only to their table. Filters include status, blocking, people, priority, effort and planning. The Board sorts by priority, effort, score or name. Tables sort by column. Dashboard has its own period and scope.
- **Roadmap view** — ALL shows every loaded project except Paused, Completed and Archived projects. It sorts them by phase start. Each project has a different master-bar colour, in load order. Single-project Roadmap shows phases, milestones and independent sprints on a time axis. Project groups and phase trees start collapsed. Both scopes have Expand all and Collapse all. The timeline fits at 100%. Above 100%, it scrolls horizontally. Navigation, dates, milestones and identification labels stay fixed. Associated tables show only ID, Title, Type, Status, Responsible, Manually Blocked, Dependency Blocked and Updated (date only). They have no search or filters. Every phase and Sprint has a dedicated button for its associated workitem table. Parent phases include all descendant phases. Only phases with children have tree arrows. Milestone diamonds fill with completion. Two-line tooltips show names, dates and percentages. Bulk Sprint allocation checks explicit and inherited phase dates. It lets you keep or extend these dates.
- **Dashboard** (single project) — Overview has nine sections that are independently visible. They are project overview, active sprint, project statistics and started/completed/in-progress workitems. They also include open risks, deliverables and decisions. Start/End dates use recorded UTC history. Activity lists count category transitions in the period. Status sections use the end-date snapshot. Planning scope filters descendant phases. Overview keeps parent phases that started and have open work. It also keeps acceptance gates, overdue warnings and the next/overdue milestones. Three circular charts distinguish Stories, independent Tasks and Bugs by workflow category. Activity lists include Stories and independent Tasks. You can still open the details of the workitems, Roadmap items, sprints and Project Control records that exist. Historical gaps show N/A. Sprint Analytics and recorded-history consultation stay available. Its capacity, points, velocity and closure-chart reports still show placeholders. But Sprint headers and editors show recorded point totals and closure fields. See [section acceptance scenarios](test-board/teamos-development/README.md).
- **Calendar inside Day Planner** — It gives Task-only year/month consultation and a deadline heatmap, next to Day and Week. Time blocks stay in Day and Week.
- **Command palette** — Open it with `⌘K` / `Ctrl+K`, `/` or the header search icon. You can find tasks (title, `#id`, `#tag`, assignee), projects, roadmap items and commands. You can do actions on a task step by step (move, assign, priority, plan). You can filter the board by text. You can create a task in one line with `+ Title @person !high #tag ~S due:fri in:project`. You can schedule with `plan <task> 14:00`.
- **Day Planner** — Drag tasks from any project onto a 07:00–21:00 day (or Mon–Fri week) in 15-minute slots. Then you can move and resize them. The app saves plans for each project in `extensions.dayPlanner` (`{ version: 1, blocks: [{ id, taskId, date, start, end }] }`). Plans never change the task itself. The project timeline also records every planner change.
- **Timeline** (single project) — The timeline records every saved change. Scrub back to preview a past state read-only. You can then restore that state.
- **Table perspectives** (single project) — ALL shows collapsible Epic → Story → Task rows, direct Epic Tasks and independent Tasks/Bugs. The same table renders Roadmap phases, milestones and sprints, and includes recorded participation. Descendants that match stay visible when filters remove their ancestors. Pagination keeps full root groups together. The other perspectives are the existing type-specific views, All Tasks & Bugs, Backlog and collapsible per-sprint tables. Backlog shows planning units with pending work and no eligible Sprint allocation. In Backlog, Sprint Actions groups selection-to-sprint creation and assignment. Sprint tables have no row-selection checkboxes or Sprint Actions. Filters, Columns and Export CSV use icon buttons. Backlog puts Sprint Actions with a runner icon after the divider and immediately before +. In each sprint table, Stories expand directly into the Task rows that participate. Independent Tasks and Bugs are at the top level. A sort keeps children below their Story. Pagination keeps each group together. CSV includes all filtered workitems, also when they are collapsed. Sprint headers keep dates and the manually managed Planned/Active/Done status. They also keep completeness over unique planning units, which includes archived items. This completeness does not count Story Tasks two times. Filters affect rows/CSV, not the sprint denominator. Dates use `dd/mm/yyyy`, and timestamps use UTC `dd/mm/yyyy HH:mm:ss`. Columns have minimum widths, two-line cells and horizontal scrolling. They also have colored status and blocked badges.
- **In-app documentation** — The book button in the top bar (or `H`) swaps the workspace and a navigable documentation page. Then the button shows an application icon. The workspace stays mounted while it is hidden. Thus, open projects, selection, view, filters and drafts stay the same. The documentation also works with no project open. Ten sections cover getting started and the Agile methodology as TeamOS applies it. That topic keeps methodological advice separate from the rules that the app enforces. Other sections cover projects, workitems, workflows, planning, views, files and history, productivity, and an end-to-end example with FAQ. It has a searchable contents sidebar that marks the active topic. It also has related-topic links and previous/next navigation. It follows the light/dark theme and EN/PT language. On small screens, it collapses its contents. The live app renders the command palette guide and the shortcut reference. The content is in `src/app/docs/content/{en,pt}.ts`. Unit tests keep both outlines and every internal link in sync.
- **Appearance** — App settings selects Classic or Modern, and Light/Dark for each theme. Modern uses locally bundled Inter typography. Preferences stay in the browser and do not change project data or drafts.

## Data and persistence

- The app uses the File System Access API (Chromium browsers). Projects that you open with a file handle autosave on every change. Files that you drop without a handle are read-only.
- The app watches open files for external changes. These files reload automatically. If local edits conflict, the app shows a prompt.
- On import, the app validates the folder structure and current state. Legacy files must have `*.board.json`, a supported schema, the app ID and valid project data. The data rules are in `validateBoardData` (`src/domain/board.ts`).

### Task and schema invariants

- A task title is necessary. It can have a maximum of 80 characters.
- The app saves participants as an `assignees` array. `responsible` is an optional name (empty string when unset). It is always in that array. `assigneeIds`/`responsibleId` store stable project-local references. Names stay as readable projections. When you select, change or clear responsibility, the participants do not change. To update all current assignments, rename members in Project settings. This also updates archived tasks. If you remove the responsible participant, the app asks for confirmation before it clears responsibility. Neither field is necessary to save or change status.
- Schema v2 adds responsibility. Version 1 files migrate on import/save, and the migration does not select a responsible person. This is also true for one participant. Older `assignee` strings/arrays still import. The migration keeps IDs, roadmap and the timeline events that exist. Assignment changes record before/after values in the same timeline. The regression fixture is `tests/fixtures/assignments-v1.board.json`.
- Each Responsible/participant filter gives All, no allocation, or a name. The two filters combine. The palette has both participant toggles and Set responsible. Quick-create `@name` adds participants and does not set responsibility. The table has a separate configurable Responsible column.
- Manually blocked tasks must have `blockerReason`. The app derives dependency blocking from unfinished direct blockers, which include archived blockers. This does not change status or overwrite manual blocking. Board/Table blocked filters include both sources. Workitem tables have independent Manually Blocked and Dependency Blocked columns and filters. Roadmap tables show both. Active filters show only as a numeric button badge. Clear all is next to Reset in the panel.
- Attachments have their own tab in workitem details. This tab has a table of upload date, filename and uploader, with downloads and image thumbnails. When you open a project, select a member or create one. Comments, new attachment uploads, acceptance and authored history use that selected identity for the session. This attribution stays local. Files that do not have `uploadedBy` show Unknown. If you edit or save them, the app does not add an author. Folder projects store attachment binaries separately. Legacy files embed `dataUrl`s. Each workitem has a hard size limit for uploads and soft size warnings. On save, the app removes older extension-based attachment storage.
- Attachment lists in details and editing have **Open**, which opens the file in a new tab. **Open** is available for JPEG/JPG, PNG, GIF, WebP, BMP, ICO, AVIF, PDF and TXT. It is also available for CSV, JSON, XML, MP3, WAV, OGG, MP4 and WEBM. The format check also uses the filename when the MIME is missing or generic. Other formats have only **Download**. Download stays aligned and available for every attachment. CSV and XML open as readable text without automatic downloads. Previews use temporary local Blob URLs and do not need an external service. See the [US-23 walkthrough](test-board/teamos-development/README.md).
- Serialization normalizes tasks, columns and timestamps before save.
- Sprint lifecycle is manual. New Sprints start as Planned. Roadmap and Table → Sprints have Edit and Start/Finish actions with an optional local-today date update. Roadmap has no standalone Sprint creation button. Create Sprints from Board/Table workitem selections. Roadmap v5 persists status, Goal, manually defined Capacity, Review and Retrospective. On import, the app infers older Sprint statuses from dates one time. Then it persists them. The Finish action freezes the roster, workflows, estimates, completion/carry-over IDs and results in `extensions.sprintResults` v1. It also returns unfinished planning units to Backlog. Task status resets depend on the Sprint automation. Stories that have completed implementation and wait for acceptance keep their Sprint. Finished roster rows stay read-only when live work moves or changes. You can still edit Review/Retrospective. See [US-22](test-board/teamos-development/README.md).
- Story Points are optional numeric estimates, independent of Effort. They are available on Stories, Bugs, and Tasks outside a Story or Bug. If you attach a Task to a Story or Bug, the app removes the estimate of that Task. One-time completion credits record Story points when all child Tasks are Done. This condition does not need functional acceptance. Credits also record Story points when a childless Story, independent Task or Bug itself becomes Done in an Active Sprint. Frozen Velocity sums these credits and cannot count carried work two times. Roadmap/Table do not get detailed analytics.
- Table → Sprints shows `Sprint [number] - [user title]`, with the newest-created first. This order does not depend on planning dates. Project-local identities are in `extensions.sprintCatalog` v1 (`lastNumber`, entries with `sprintId`, `number`, `createdAt`). New sprints from Board or Table get the next number and a creation timestamp. Edits keep both values. Deleted IDs/numbers stay reserved, also across timeline preview/restore. Legacy migration first reserves the sprints that are in history snapshots/events, by first appearance. Then it reserves current-only sprints by array order, with `createdAt: null` (unknown). Numbers that are already assigned stay the same. Entries with unknown dates come after dated entries, by descending assigned number. The migration does not create false creation events or dates. Workitem/roadmap IDs stay the same. See `tests/fixtures/sprints-legacy-v1.board.json`.

### Relations extension (version 1)

The optional `extensions.taskRelations` stores `{ version: 1, relations: [{ sourceId, targetId, kind }] }`. `kind` is `related` (symmetric) or `blocks` (source blocks target). The app derives inverse links and never duplicates them. IDs refer only to tasks in the same file. Each unordered pair has one relation. Import and mutation reject self-links, missing IDs, duplicate pairs and dependency cycles. They also reject unsupported extension versions.

Relations are an additive, separately versioned extension to the base board schema (currently version 6). Legacy files without it migrate to an empty relation set. This migration does not change task IDs, roadmap or other extension data. The app writes the extension when you add the first link. It omits the extension after you remove the last link. The compatibility fixture is `tests/fixtures/task-relations-v1.board.json`.

The creation of an item and its link is one autosaved mutation. If you cancel, the app creates neither. When you delete an item, the app confirms the related IDs and the blocking impact. Then it removes the links of the item and keeps the other items. Relation changes use the existing timeline. Historical previews/restores replay these changes. Read-only and historical details allow navigation, but they hide relation mutation controls.

### Project extension (version 1)

`extensions.project` stores `{ version: 1, id, productName?, description, status, members: [{ id, name }], tags }`. New projects open the full settings draft before you select a parent folder. Project name and acronym are necessary. Other metadata and catalogs are optional. New projects start `planned` with no members and removable `bug`, `feature`, `improvement`, `documentation` tags. Status (`planned`, `active`, `paused`, `completed`, `archived`) is manual and informational. Even Archived does not hide projects, block edits or archive tasks.

Legacy projects migrate with `status: null` (not defined) and an empty description. Their catalogs come only from the assignments/tags that exist. A save persists project/member identities. If you rename the project or file, these identities do not change. Settings changes use timeline snapshots. Historical preview/restore recovers coherent catalogs and assignments, and keeps the project identity.

Task editors, palette actions and quick-create accept only the curated members/tags of the target project. Add tags in Project settings. Add members there or in the project identity selector. US-21 replaces the original inline creation of US-11. Member names must not be blank. They must be unique, and the check ignores case/outer spaces. A rename keeps the identity and never merges members. You cannot remove members/tags that current tasks use. This also applies to archived tasks. You can remove them only after you replace or remove their assignments. Empty catalogs are valid. See the [US-11](test-board/teamos-development/README.md) and [US-21](test-board/teamos-development/README.md) manual walkthroughs.

### Products, permanent identities and transfers (schema 6)

Schema 6 keeps older board formats and adds `Task.permanentId`. This identity is separate from the project-local number and display ID. If a legacy identity is missing, the app derives it deterministically in a stable project namespace. The app persists that identity on save. When the app migrates a missing identity, historical snapshots use the current lifecycle that matches. A history restore does not generate the identity again. `extensions.project.productName` is optional. The app trims names and compares them case-insensitively to find product membership. Products have no file, workflow or tasks of their own.

A transfer promotes its incident local links to `extensions.permanentRelations` v1. These links have permanent endpoint identities and last-known project/file/number/title hints. Loaded files resolve the current location by permanent identity. Unavailable endpoints stay visible. While their state is unknown, unfinished blockers continue to block. References that the app learned from closed files stay available in memory for the session. This includes inverse references from copies with read-only sources. These references do not grant permission, and they are not a file-discovery service. In a new session, open the applicable project files again to resolve references.

`extensions.projectTransfers` v1 stores the operation receipt, original/destination references and explicit catalog mappings. It also stores removed planning references/times, the source recovery signature and preserved move history. Copies do not include prior comments/history. A move saves the destination before it removes the source. The receipt stays pending until the app saves the source and the final receipt. Recovery uses the same operation/task identity again. It does not remove a source whose task, comments, history or planning changed in the meantime. A move includes all descendants only when every descendant is in a Backlog or To-do category. The confirmation lists their IDs, titles and states. For each descendant, you must give explicit destination states and mappings. A copy leaves children in the source. Batched moves use per-item receipts with an optional `batchId`. They save the full destination first. They validate every source signature before they remove an item. They recover the same batch and do not allocate new identities. If you transfer a child alone, you can detach it or map it to a valid destination parent. Hierarchy in a moved batch stays the same. State, people, tags, phase, milestone, sprint and parent choices appear together in a current/destination table. You must explicitly remove scheduled blocks and previous sprint records. They have no reusable destination catalog. The receipt records the original associations and their destination mappings. Completed Story/Bug copies must get new functional acceptance and an explicit author. Moves keep the acceptance only when the destination is completed. Return trips use canonical comments again through timeline references. Thus, they keep the original historical conversation. File watching, conflict resolution and the same save queue apply to each file independently.

The [example project walkthrough](test-board/teamos-development/README.md) and automated transfer fixtures test different workflows and local-number collisions. They also test comments, relationships, planning, read-only access and write failures.

## Project folders (US-25)

**New Project** creates a project subfolder in the parent folder that you select. If folder picking is not available but file picking is, creation/import can use legacy `.board.json` files instead. **Import Projects** opens the folder picker for one project or for every direct child that contains `project.json`. It keeps the current session and skips duplicates. Each project must have `project.json`, `history.json` and an `attachments/` directory. Invalid projects report their own errors. They do not stop valid siblings.

`project.json` holds current state and attachment references. `history.json` stores the timeline, Project Control history and transferred history separately. When you open a folder, the app reads only the current state. The timeline and History/Comments tabs load history on demand. The app reads attachments when it shows, opens or downloads them. Changes with events append only their new events to a JSON transaction journal. They do not read or serialize older history. Other saves do not change history. Binary filenames are SHA-256 hashes. Historical/undo references keep their files available. The file layout is in [PROJECT_FORMAT.md](PROJECT_FORMAT.md). If an earlier version saved a folder, the app converts that folder one time when it opens. The conversion keeps a copy in `backup/schema-6/`.

**Import Projects** also converts legacy `.board.json` files directly in the selected parent folder into project subfolders. The original files do not change. If you import the same folder again, the import skips the projects that are already there. Legacy files that you drop stay read-only. Close an already-open legacy version before you open its migrated copy. The two versions keep the same project identity.

The same save queue, project locks, exact disk baselines, reconciliation and IndexedDB recovery apply to folder projects. A history transaction stages new events with the expected current-state hash. Then the app writes `project.json`. Then it appends a commit marker. During saves, the app reads only the small journal tail. It parses the full history on consultation. If a save fails, committed history stays. The app can recover a missing final marker from current-state metadata. Chrome/Edge desktop support folder access. This also applies to the standalone HTML. See [the fixture folders and walkthrough](test-board/teamos-development/README.md).

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

- `src/app/` — bootstrapping, the root composition, providers and app-wide overlays.
- `src/domain/` — pure board, task, roadmap, timeline, calendar, day planner, attachment, serialization and scoring rules.
- `src/features/portfolio/` — the portfolio feature, organized by responsibility: views, commands, queries, state, project operations and lifecycle hooks.
- `src/infrastructure/` — browser adapters, persistence/repository code, file watching and logging.
- `src/shared/` — reusable UI helpers and small shared types.
- `src/styles/` — CSS grouped into `foundation/`, `portfolio/` and `overlays/`. `app.css` is the cascade manifest.

## Development

You must have Node.js 22.12+ or 24+ (Vite 8 and Vitest 5).

```bash
npm install
npx playwright install
npm run dev
```

To make a serverless build that you can open directly in a Chromium-based browser, run:

```bash
npm run build:standalone
open dist-standalone/index.html
```

This makes one self-contained HTML file. The regular `npm run build` continues to generate the normal `dist/` bundle.

`dist/` and `dist-standalone/` are committed build outputs. Thus, each branch and PR includes its own runnable builds. Before you commit app changes, run `npm run build`. Also run `npm run build:standalone`. Include the regenerated folders. CI also publishes builds, as the section below describes.

## Continuous integration and downloads

GitHub Actions (`.github/workflows/kanban.yml`, at the repository root) runs on every pull request and push that changes `kanban/`. It runs lint, typecheck, unit tests and the Playwright end-to-end tests (`tests/e2e`). CI does not run the visual snapshot tests because their baselines are macOS-specific. For those tests, run `npm test` locally.

When the tests pass on `main`, the workflow builds the app and replaces the **`kanban-latest`** GitHub Release with:

- `teamos-kanban.html`: the standalone single-file app, to download and open in a Chromium-based browser.
- `teamos-kanban-dist.zip`: the regular `dist/` build for a web server.

To get the latest standalone file from the command line, run this command:

```bash
gh release download kanban-latest --repo sebastiaofv/TeamOs --pattern teamos-kanban.html
```

You can also start the workflow manually from the Actions tab (*Run workflow*).

## Testing

The [issue 93 validation report](docs/issue-93-validation.md) describes the Radix/Zod boundaries, WCAG 2.2 AA pass, before/after accessibility table and local performance measurements.

The single [TeamOS historical example project](test-board/README.md) covers the application in the current folder format. It has a walkthrough and explicit fictional-data notices. To explore it in writable mode, import a copy. Legacy regression fixtures are in `tests/fixtures/manual/`.

- `npm run typecheck` — TypeScript (`strict`) over `src/`, `tests/` and the config files. Vite and Vitest only strip types. Thus, this is the only type check.
- `npm run test:unit` — Vitest unit tests for the domain, persistence, store and actions. Some tests give partial or deliberately malformed fixtures to typed functions. These tests wrap the fixtures in `fromPartial` / `fromAny` from `@total-typescript/shoehorn`.
- `npm run bench:performance` — isolated Chromium measurements of real priority mutations and historical reports, with synthetic projects. Compare another checkout with `-- --root /absolute/path/to/kanban`. See [issue 78 measurements and regression scenarios](test-board/teamos-development/README.md).
- `npm test` — Playwright end-to-end and visual tests. It builds the app and serves `dist/` on port 4174 before it runs. Thus, it never uses again a dev server on 4173. If the port is already in use, the run fails. For concurrent worktree runs, set `PLAYWRIGHT_PORT`.
- `npm run lint` — ESLint with `typescript-eslint`.

Visual baselines in `tests/visual.test.ts-snapshots/` are macOS-specific. Regenerate them only deliberately, with `npx playwright test tests/visual.test.ts --update-snapshots`. Then review the image diff in the commit. Shared seeding helpers are in `tests/support/portfolio.ts`. `tests/support/testGlobals.d.ts` declares the browser globals that these helpers install.

Optional Playwright modes are `npm run test:headed`, `npm run test:ui` and `npm run test:debug`.

### Pre-commit hook

`npm install` installs a Husky pre-commit hook (`.husky/pre-commit`). The `prepare` script registers this hook at the git root. Each commit runs ESLint on staged `.ts`/`.tsx`/`.mjs` files (lint-staged, `.lintstagedrc`), then `npm run typecheck` and `npm run test:unit`. The hook does not run Playwright tests. Before you push UI changes, run `npm test`.

### Workitem IDs

New projects must have a **Project Acronym** of 1–4 letters. The acronym must be unique among the projects open in the local portfolio. New workitems persist IDs such as `CHK-EP-1`, `CHK-US-2`, `CHK-TK-3`, and `CHK-BG-4`. These IDs share one project sequence. Types stay fixed after creation. Display IDs stay fixed in a project. Transfers allocate a destination ID, and moves keep the permanent identity. If you change the project name or acronym, the change affects only future items. Deletion and history restoration never use a number again.

Schema 5 reads schema 1–4 files and does not assign new IDs to the items that they already contain. An older project can set its acronym in General settings or when it creates its first new item. Numeric references stay the stable links for hierarchy, relations, comments and planning. Project files are local. Thus, the app checks acronym uniqueness against the loaded portfolio.

Project Control adds project-local Risks, Decisions and Deliverables with phase/milestone associations, comments, history and deliverable acceptance gates. Each subsection uses the Table → All layout. This layout has counts and selection, search, icon-only Filters/Columns/CSV, a divider and + New record. Filters keep type-specific assessments, dates and associations as removable tags. You can configure columns, with separate local preferences for each type. Pagination uses 25/50/100 rows. After separator confirmation, CSV exports every filtered row. Records use workitem-style tabbed dialogs and colored status/assessment badges. New IDs use the project acronym, RK/DC/DL and a monotonic number. IDs that exist stay the same. The v3 extension adds participants and tags through the Work Item editors and project catalogs. It has direct sidebar editing and the same responsibility/participation behavior. It migrates v1/v2 files and keeps IDs, comments, history and legacy owners. Obsolete workitem links stay archived. See [US-20 manual scenarios and data rules](test-board/teamos-development/README.md).

Issue 54 removes archive commands and filters, but keeps legacy metadata and historical events. Legacy archived workitems stay visible. Dates stay ISO in project files. See [the manual verification guide](test-board/teamos-development/README.md).
The app checks concurrent project changes before and after every save. Independent edits merge automatically. Conflicts pause autosave until field-level reconciliation. After you open the project again, you can recover pending work through IndexedDB. See [US-28 scenarios](test-board/teamos-development/README.md).
