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
- `features/portfolio/projects/useProjectSettingsEditor.ts` owns the joint General/Workflow draft, validation, and save lifecycle. The views render and edit that model; `projectSettingsCommands.ts` owns injectable impact confirmation and the single atomic settings write.

## Folder map

```text
src/
├── app/                         # bootstrapping and application composition
│   ├── main.tsx                 # Vite entry point
│   ├── App.tsx                  # root composition
│   ├── AppHeader.tsx            # top-level shell controls
│   ├── providers/               # React context providers
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
