# Architecture and folder guide

TeamOS Kanban is a Vite/React application with one portfolio feature. The
folder layout follows ownership. The domain rules are independent. The feature
owns the portfolio behavior. The app assembles the browser experience.

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

The domain should not use React, Zustand, browser globals or file I/O.
Feature commands and queries are the main seams for the portfolio behavior.
Commands coordinate writes. Queries derive view models. Views render the
result. Infrastructure owns the file and browser details behind small interfaces.

## Shared behavior

- `domain/workitems.ts` owns the consultation of Sprint participation through `consultSprintParticipation`. Table, Roadmap and the Sprint tree use its recorded workitems, its hierarchy context and its current-allocation distinction. Historical consultation keeps the recorded status and participation. It does not create past workflow metadata or Sprint closure data.
- `features/portfolio/commands/workitemChanges.ts` owns the complete Workitem change sequence. This sequence includes direct creation/deletion/edit history, planning inheritance, automation and functional acceptance. It also includes derived history, stale checks and operation annotation. Commands keep their specific Project, Workflow, Roadmap and relationship events. `mutationContext.ts` supplies interaction adapters. It publishes the completed draft before it tries the disk save. If the disk save fails, that applied draft stays available for a retry.
- `domain/boardMutation.ts` creates independent current-state drafts and event arrays. It shares the historical event payloads that are already published. Commands treat those payloads as immutable. Commands annotate only the new events that they append. `timeline.ts` replays with structural sharing. Dashboard reports make one forward pass and keep compact display counts. A loaded history holds thousands of events. A full `createBoardStateSnapshot` costs milliseconds for each state. Thus, reports that scan replayed states never build one snapshot for each event (issue 104). Instead, they compare `createBoardAnalysisSnapshot` boards. These boards use again the workitems whose saved object did not change. The reports build full snapshots only for the rows and contexts that they show. Task details project the history at consultation time. Strict file validation stays at the import/save boundaries. Normalized internal timeline reads avoid redundant copies. Workflow read caches are only for synchronous, read-only projections. The code discards these caches before it returns to mutable settings drafts.
- `features/portfolio/commands/workitemAcceptance.ts` shares completion validation and explicit author confirmation between normal changes and project transfers. Transfer drafts also enforce the domain guards for parent/child moves and acceptance. `projectTransferCommands.ts` continues to coordinate their destination-first persistence. Comments that return keep their canonical publication. They also get a `task.comment.referenced` event for the new local lifecycle. Thus, historical views do not change.
- `features/portfolio/projects/useProjectSettingsEditor.ts` owns the joint General/Workflow draft, validation and save lifecycle. The views render and edit that model. `projectSettingsCommands.ts` owns the injectable impact confirmation and the single atomic settings write.

- `domain/projectMerge.ts` merges normalized base/local/external versions by permanent entity identity and field. When validation fails, `projectMergeIntegrity.ts` isolates connected entities. `infrastructure/persistence/projectFiles.ts` is the shared conditional-save path for edits and watcher checks. This path uses Web Locks, exact written baselines, post-write verification and IndexedDB recovery. `meta.revision` is a save counter. Raw text hashes find changes. `board.reconciled` checkpoints keep the accepted state in replay.

- `infrastructure/persistence/projectDirectory.ts` owns folder validation, content-addressed attachment files and the history journal. `history.json` contains events, record histories and append-only staged/committed transactions. `project.json` stores only current data and references. These references include the identity of the last history transaction. Both files use the v1 format in [PROJECT_FORMAT.md](PROJECT_FORMAT.md). `domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts` are the only translation to and from the in-memory model. Entity types, field tables and validation are in `projectFileSchema.ts`. The code converts older folders one time, when it opens them. To append, the code uses `createWritable({ keepExistingData: true })`, `seek` and `truncate`. When the code opens a file, it checks the history identity from the first and last bytes. The first append of a session checks the full root structure with a bounded-memory scan. Later appends read the identity and the closing bytes again. Explicit history consumers deserialize and validate events and archives. Conversion shares the project-identity save lock. It checks both input files before replacement. If a current-state write fails, its staged events stay uncommitted. If a current-state write is successful, its hash can recover a missing commit marker. `projectFiles.ts` keeps the same disk-hash baselines, save queue, reconciliation and recovery for both formats.

## Explicit state machines

The code models each behavior that has different modes as one named state with
a transition function. It never uses several flags that readers combine.

- `infrastructure/persistence/projectSaveLifecycle.ts` owns the save phase of a project (`synced`, `pending`, `writing`, `failed`, `conflict`, `unreachable`). It also owns the version counters and the short-lived disk notice. `projectFiles.ts` changes it only through `transitionProjectSave` events. Views and commands read its selectors (`projectSaveBadge`, `needsCloseWarning`, `blocksProjectTransfers`, `currentProjectMerge`). The notice badge fades on a timer event, not during render.
- `features/portfolio/queries/projectAccess.ts` lists one time each reason that makes a project read-only. `canEditProjectWorkitems` and `canTransferProjectFile` are the two policies over those reasons.
- `app/overlays/dialogs.ts` ties the store context of each dialog (`portfolioDetailContext`, `taskEditorContext`, `roadmapEntityContext`) to the dialog. When you close or replace the dialog, its context clears. `taskEditorContext` is `edit` or `create`. `returnToDetail` chains are the detail back stack.
- `infrastructure/persistence/projectDirectory.ts` keeps the history of a folder project as `deferred` or `loaded`. In `deferred`, saves buffer their own timeline. `markDirectoryHistoryLoaded` is the only switch. It also folds in the saves that occur while the code reads history.json. The journal transaction of the last write is `none`, `unconfirmed` or `committed`. `unconfirmed` means that the stage is written, but the code did not see the commit marker yet.
- `domain/projectTransfers.ts` `nextTransferStep` derives the next step of a cross-project transfer from the persisted operation. It does this for first runs and for retries.
- Component-local machines use a reducer or a single union state. Examples are the relation editor (`task/dialogs/relationEditorState.ts`), pull request links, Project Control records and the reconciliation form. Async loads (`AttachmentImage`, `useProjectHistory`) tag each result with the request that it answers. Thus, a result never lasts longer than its request. `shared/hooks/useSubmission.ts` is the single in-flight guard for submissions.

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
- Use `@/features/portfolio/...` for portfolio-specific behavior.
- Use `@/infrastructure/...` for browser, persistence or logging details.
- Use `@/shared/...` for reusable UI helpers and shared primitives.
- Import types from the module that owns them (`domain/types`,
  `features/portfolio/types`, `infrastructure/browser/types`, `app/types`,
  `shared/types/ui`). There is no aggregate type facade or feature barrel.
- Components and shortcuts get access to feature actions through the
  `portfolioActions` singleton in `features/portfolio/commands/portfolioCommands.ts`.
