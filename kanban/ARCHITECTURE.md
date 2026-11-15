# Architecture and folder guide

TeamOS Kanban is a Vite/React application with one portfolio feature. The
folder layout follows ownership. The domain rules operate independently. The
feature owns the portfolio functions. The app assembles the user interface in
the browser.

## Dependency direction

```text
app shell / overlays
        ↓
portfolio feature (views, commands, queries, state, hooks, projects)
        ↓                         ↘
domain rules              infrastructure adapters
        ↓                         ↘
shared types and UI helpers       browser / persistence / logging
```

The domain must not use React, Zustand, browser globals or file I/O.
Feature commands and queries are the primary seams for the portfolio functions.
Commands control write operations. Queries calculate view models. Views render the
result. Infrastructure owns the file and browser details behind small interfaces.

## Shared behavior

- `domain/workitems.ts` owns the consultation of Sprint participation through `consultSprintParticipation`. Table, Roadmap and the Sprint tree use its recorded workitems and its hierarchy context. They also use how it identifies the current allocation. When you look at history, the app keeps the recorded status and participation. It does not make workflow metadata or Sprint closure data for previous times.
- `features/portfolio/commands/workitemChanges.ts` owns the full Workitem change sequence. This sequence includes the history of the creations/deletions/edits that you make directly. It also includes planning inheritance, automation, functional acceptance, calculated history, stale checks and operation annotation. Commands keep the Project, Workflow, Roadmap and relation events that apply to each command.

  `mutationContext.ts` supplies interaction adapters. It makes the completed draft available before it tries the disk save. If the disk save does not complete, that applied draft stays available for a retry.
- `domain/boardMutation.ts` makes isolated current-state drafts and event arrays. These drafts use the same historical event payloads that the app made available before. Commands use those payloads as immutable data. Commands annotate only the new events that they append. `timeline.ts` replays with structural sharing. Dashboard reports make one forward pass and keep small display counts.

  A loaded history holds thousands of events. The time for a full `createBoardStateSnapshot` is milliseconds for each state. Thus, reports that scan replayed states do not build one snapshot for each event (issue 104). They compare `createBoardAnalysisSnapshot` boards. These boards use each workitem again if its saved object did not change. The reports build full snapshots only for the rows and contexts that they show.

  Task details calculate their view of the history when you look at them. Strict file validation stays at the import/save boundaries. Normalized internal timeline read operations prevent copies that are not necessary. Workflow read caches are only for synchronous, read-only projections. The code discards these caches before it goes back to mutable settings drafts.
- Usual changes and project transfers use the completion validation of `features/portfolio/commands/workitemAcceptance.ts`. They also use its manual author confirmation. Transfer drafts also apply the domain guards for parent/child moves and acceptance.

  `projectTransferCommands.ts` continues to control their destination-first persistence. When comments go back to a project, they keep their canonical version. They also get a `task.comment.referenced` event for the new local lifecycle. Thus, historical views do not change.
- `features/portfolio/projects/useProjectSettingsEditor.ts` owns the General/Workflow draft (one draft for the two), its validation and its save lifecycle. The views render and edit that model. `projectSettingsCommands.ts` owns the injectable confirmation of change effects and the one atomic settings write operation.

- `domain/projectMerge.ts` merges normalized base/local/external versions by permanent entity identity and field. If validation finds errors, `projectMergeIntegrity.ts` isolates connected entities. Edits and watcher checks use `infrastructure/persistence/projectFiles.ts` as their conditional-save path. This path uses Web Locks, accurate written baselines, post-write checks and IndexedDB recovery.

  `meta.revision` is a save counter. Text hashes find changes. `board.reconciled` checkpoints keep the accepted state in replay.

- `infrastructure/persistence/projectDirectory.ts` owns folder validation, content-addressed attachment files and the history journal. `history.json` contains events, record histories and append-only staged/committed transactions. `project.json` stores only current data and references. These references include the identity of the last history transaction. The two files use the v1 format in [PROJECT_FORMAT.md](PROJECT_FORMAT.md).

  `domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts` are the only translation to and from the in-memory model. Entity types, field tables and validation are in `projectFileSchema.ts`. The code converts folders from previous versions one time, when it opens them.

  To append, the code uses `createWritable({ keepExistingData: true })`, `seek` and `truncate`. When the code opens a file, it examines the history identity in the first and last bytes. The first append of a session examines the full root structure with a bounded-memory scan. Subsequent appends read the identity and the bytes at the end again. Consumers that read the full history deserialize and validate events and archives.

  Conversion uses the same project-identity save lock. It examines the two input files before it replaces them. If a current-state write operation does not complete, its staged events stay uncommitted. If a current-state write operation completes, its hash can recover a missing commit marker. `projectFiles.ts` keeps the same disk-hash baselines, save queue, reconciliation and recovery for the two formats.

## Explicit state machines

The code uses one named state with a transition function for each function
that has different modes. It does not use two or more flags that readers use
together.

- `infrastructure/persistence/projectSaveLifecycle.ts` owns the save phase of a project (`synced`, `pending`, `writing`, `failed`, `conflict`, `unreachable`). It also owns the version counters and the temporary disk notice. `projectFiles.ts` changes the save phase only through `transitionProjectSave` events. Views and commands read its selectors (`projectSaveBadge`, `needsCloseWarning`, `blocksProjectTransfers`, `currentProjectMerge`). The app removes the notice badge on a timer event, not during render.
- `features/portfolio/queries/projectAccess.ts` gives each reason that makes a project read-only, one time. `canEditProjectWorkitems` and `canTransferProjectFile` are the two policies that use those reasons.
- `app/overlays/dialogs.ts` connects the store context of each dialog (`portfolioDetailContext`, `taskEditorContext`, `roadmapEntityContext`) to the dialog. When you close or replace the dialog, the app clears its context. `taskEditorContext` is `edit` or `create`. `returnToDetail` chains are the detail back stack.
- `infrastructure/persistence/projectDirectory.ts` keeps the history of a folder project as `deferred` or `loaded`. In `deferred`, each save keeps its timeline in a buffer. `markDirectoryHistoryLoaded` is the only switch. It also folds in the saves that occur while the code reads history.json. The journal transaction of the last write operation is `none`, `unconfirmed` or `committed`. `unconfirmed` is the state after the code writes the stage and before it sees the commit marker.
- `domain/projectTransfers.ts` `nextTransferStep` calculates the next step of a cross-project transfer from the saved operation. It does this for first runs and for retries.
- Component-local machines use a reducer or one union state. Examples are the relation editor (`task/dialogs/relationEditorState.ts`), pull request links, Project Control records and the reconciliation form. Async loads (`AttachmentImage`, `useProjectHistory`) tag each result with the request that it is for. Thus, a result does not continue after its request. `shared/hooks/useSubmission.ts` is the only in-flight guard for submissions.

## Folder map

```text
src/
├── app/                         # bootstrapping and application composition
│   ├── main.tsx                 # Vite entry point
│   ├── App.tsx                  # root composition
│   ├── AppHeader.tsx            # top-level shell controls
│   ├── providers/               # React context providers
│   ├── docs/                    # in-app documentation page, mode toggle, EN/PT content
│   └── overlays/                # app-wide dialogs and messages
├── domain/                      # pure board, task, roadmap, timeline rules
├── features/portfolio/          # the portfolio feature
│   ├── board/                   # board view and drag/drop composition
│   ├── calendar/                # calendar view and grid
│   ├── planner/                 # day planner view, tray, time grid, block gestures
│   ├── palette/                 # command palette: matching, quick create, results, actions
│   ├── roadmap/                 # roadmap view and roadmap dialog
│   ├── task/                    # task card and task dialogs
│   ├── timeline/                # timeline view
│   ├── shell/                   # toolbar, chips, bulk controls, undo toast
│   ├── commands/                # state-changing feature operations
│   ├── queries/                 # derived state and view models
│   ├── state/                   # Zustand slices, store, derived state
│   ├── projects/                # project import/create/file-facing actions
│   ├── hooks/                   # feature lifecycle and browser integration
│   └── types.ts                 # feature-owned session and view-model types
├── infrastructure/              # replaceable outside-world adapters
│   ├── browser/                 # File API and drag/drop/file readers
│   ├── persistence/              # repository, save queue, file watcher
│   └── logging/                 # logging adapter
├── shared/                      # reusable UI helpers and small shared types
└── styles/                      # CSS grouped by foundation, feature, overlay
    └── app.css                  # cascade manifest imported by the app
```

## Import rules for new code

- Use `@/domain/...` for pure business rules and domain types.
- Use `@/features/portfolio/...` for the functions of the portfolio.
- Use `@/infrastructure/...` for browser, persistence or logging details.
- Use `@/shared/...` for UI helpers that you can use again and for shared primitives.
- Import types from the module that owns them (`domain/types`,
  `features/portfolio/types`, `infrastructure/browser/types`, `app/types`,
  `shared/types/ui`). There is no aggregate type facade or feature barrel.
- Components and shortcuts get access to feature actions through the
  `portfolioActions` singleton in `features/portfolio/commands/portfolioCommands.ts`.
