# Architecture and folder guide

TeamOS Kanban is a Vite/React application with one portfolio feature. The
folder layout follows ownership: domain rules are independent, the feature
owns portfolio behavior, and the app assembles the browser experience.

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

The domain should stay free of React, Zustand, browser globals, and file I/O.
Feature commands and queries are the main seams for portfolio behavior:
commands coordinate writes, queries derive view models, and views render the
result. Infrastructure owns file and browser details behind small interfaces.

## Shared behavior

- `domain/workitems.ts` owns Sprint participation consultation through `consultSprintParticipation`. Table, Roadmap, and the Sprint tree use its recorded workitems, hierarchy context, and current-allocation distinction. Historical consultation keeps recorded status and participation; it does not invent past workflow metadata or Sprint closure data.
- `features/portfolio/commands/workitemChanges.ts` owns the complete Workitem change sequence: direct creation/deletion/edit history, planning inheritance, automation, functional acceptance, derived history, stale checks, and operation annotation. Commands retain their specific Project, Workflow, Roadmap, and relationship events. `mutationContext.ts` supplies interaction adapters and publishes the completed draft before attempting the disk save; a failed disk save leaves that applied draft available for retry.
- `domain/boardMutation.ts` creates independent current-state drafts and event arrays while sharing already published historical event payloads. Commands treat those payloads as immutable and annotate only newly appended events. `timeline.ts` replays with structural sharing; dashboard reports make one forward pass and keep compact display counts. Task details project history on consultation. Strict file validation remains at import/save boundaries; normalized internal timeline reads avoid redundant copies. Workflow read caches are limited to synchronous, read-only projections and are discarded before returning to mutable settings drafts.
- `features/portfolio/commands/workitemAcceptance.ts` shares completion validation and explicit author confirmation between normal changes and project transfers. Transfer drafts also enforce the domain guards for parent/child moves and acceptance; their destination-first persistence remains coordinated by `projectTransferCommands.ts`. Returning comments retain their canonical publication and gain a `task.comment.referenced` event for the new local lifecycle, preserving historical views.
- `features/portfolio/projects/useProjectSettingsEditor.ts` owns the joint General/Workflow draft, validation, and save lifecycle. The views render and edit that model; `projectSettingsCommands.ts` owns injectable impact confirmation and the single atomic settings write.

- `domain/projectMerge.ts` merges normalized base/local/external versions by permanent entity identity and field; `projectMergeIntegrity.ts` isolates connected entities when validation fails. `infrastructure/persistence/projectFiles.ts` is the shared conditional-save path for edits and watcher checks, with Web Locks, exact written baselines, post-write verification and IndexedDB recovery. `meta.revision` is a save counter; raw text hashes detect changes. `board.reconciled` checkpoints preserve the accepted state in replay.

- `infrastructure/persistence/projectDirectory.ts` owns folder validation, content-addressed attachment files, and the history journal. `history.json` contains events, record histories and append-only staged/committed transactions. `project.json` stores only current data and references, including the last history transaction identity. Both use the v1 format in [PROJECT_FORMAT.md](PROJECT_FORMAT.md); `domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts` are the only translation to and from the in-memory model, with entity types, field tables and validation in `projectFileSchema.ts`, and older folders are converted once on open. Appending uses `createWritable({ keepExistingData: true })`, `seek` and `truncate`; opening checks the history identity from its first and last bytes; the first append of a session verifies the whole root structure with a bounded-memory scan and later appends reread identity plus the closing bytes, while explicit history consumers deserialize and validate events and archives. Conversion shares the project-identity save lock and checks both input files before replacement. A failed current-state write leaves its staged events uncommitted; a successful current-state hash can recover a missing commit marker. `projectFiles.ts` maintains the same disk-hash baselines, save queue, reconciliation and recovery for both formats.

## Explicit state machines

Behavior with distinct modes is modelled as one named state with a transition
function, never as several flags that readers combine.

- `infrastructure/persistence/projectSaveLifecycle.ts` owns a project's save phase (`synced`, `pending`, `writing`, `failed`, `conflict`, `unreachable`), its version counters and the short-lived disk notice. `projectFiles.ts` changes it only through `transitionProjectSave` events; views and commands read its selectors (`projectSaveBadge`, `needsCloseWarning`, `blocksProjectTransfers`, `currentProjectMerge`). The notice badge fades on a timer event, not during render.
- `features/portfolio/queries/projectAccess.ts` lists every reason a project is read-only once. `canEditProjectWorkitems` and `canTransferProjectFile` are the two policies over those reasons.
- `app/overlays/dialogs.ts` ties each dialog's store context (`portfolioDetailContext`, `taskEditorContext`, `roadmapEntityContext`) to the dialog: closing or replacing the dialog clears it. `taskEditorContext` is either `edit` or `create`; `returnToDetail` chains are the detail back stack.
- `domain/projectTransfers.ts` `nextTransferStep` derives a cross-project transfer's next step from the persisted operation, for first runs and retries alike.
- Component-local machines use a reducer or a single union state: the relation editor (`task/dialogs/relationEditorState.ts`), pull request links, Project Control records and the reconciliation form. `shared/hooks/useSubmission.ts` is the single in-flight guard for submissions.

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
│   ├── types.ts                 # feature-owned session and view-model types
│   └── index.ts                 # public feature entry point
├── infrastructure/              # replaceable outside-world adapters
│   ├── browser/                 # File API and drag/drop/file readers
│   ├── persistence/              # repository, save queue, file watcher
│   └── logging/                 # logging adapter
├── shared/                      # reusable UI helpers and small shared types
├── styles/                      # CSS grouped by foundation, feature, overlay
│   └── app.css                  # cascade manifest imported by the app
└── types.ts                     # temporary compatibility type facade
```

## Import rules for new code

- Use `@/domain/...` for pure business rules and domain types.
- Use `@/features/portfolio/...` for portfolio-specific behavior.
- Use `@/infrastructure/...` for browser, persistence, or logging details.
- Use `@/shared/...` for reusable UI helpers and shared primitives.
- Keep `src/types.ts` only for compatibility; new code should import the
  canonical type module directly.
- Prefer a feature's public `src/features/portfolio/index.ts` entry point when
  a consumer needs a stable feature-level interface.
