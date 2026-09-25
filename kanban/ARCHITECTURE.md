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
