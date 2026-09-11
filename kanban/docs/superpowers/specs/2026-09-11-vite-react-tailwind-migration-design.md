# Vite + React + Tailwind Migration — Design

**Date:** 2026-09-11
**Status:** Approved
**Scope:** Migrate the single-file `kanban.html` app to a Vite + React + TailwindCSS project at strict feature parity.

## Motivation

Two drivers, both stated by the project owner:

1. **Maintainability.** `kanban.html` is 11,078 lines in one file — ~3,190 CSS, ~465 HTML, ~7,400 JS across 402 top-level functions and ~40 module-level mutable globals. Navigating and editing it is the bottleneck.
2. **Ecosystem access.** Replace hand-rolled drag/drop, modals, and date handling with maintained libraries.

React and Tailwind are the means, not the goal. Any decision that improves the stack at the cost of maintainability should be re-examined.

## Explicit scope decisions

| Question | Decision |
|---|---|
| Single-file delivery (`file://` double-click) | **Dropped.** Normal Vite build to `dist/`. |
| Feature parity | **Strict.** Every view and behavior ports. |
| Sequencing | **Domain-first, then UI** (two phases). |

Dropping single-file delivery means `README.md` and `playwright.config.js` both change; the README's "single-file delivery model" framing is no longer accurate and must be rewritten.

## Codebase analysis

Classification of all 402 top-level JS functions by what they touch:

| Category | Fns | Lines | Migration cost |
|---|---:|---:|---|
| **Pure** — no DOM, no globals | 253 | 3,382 | Lift and shift |
| **Stateful** — reads/writes module globals | 60 | 1,440 | Mechanical reshape into store |
| **UI** — touches DOM/`Refs`/`window` | 89 | 2,502 | Genuine rewrite |

Only ~34% of the JS is a true rewrite. This ratio is the reason for the domain-first phasing: the majority of the code can move before any React is written.

Verified spot-check: `validateBoardData` (220 lines) contains zero references to `document`, `Refs`, `window`, or any global. `BoardRepository` is DOM-free and depends only on other pure functions plus File System Access handles.

## Target structure

```
kanban/
├─ index.html               # Vite entry, replaces the kanban.html shell
├─ vite.config.js
├─ tailwind.config.js
├─ vitest.config.js
├─ playwright.config.js     # webServer switches to `vite preview`
└─ src/
   ├─ main.jsx
   ├─ App.jsx
   ├─ domain/               # 253 pure functions
   ├─ persistence/          # boardRepository, fileSystem, fileWatch
   ├─ store/                # 60 stateful functions as Zustand slices
   ├─ components/           # 89 UI functions as React components
   ├─ hooks/                # useShortcuts, useFileWatch, useTheme, useUndo
   └─ styles/index.css      # Tailwind directives + theme tokens
```

### `src/domain/` module inventory

Derived from clustering the 253 pure functions by name and call graph. Counts are
a planning estimate; exact placement is refined during extraction.

| Module | Fns | Lines | Representative functions |
|---|---:|---:|---|
| `board.js` | 51 | 567 | `normalizeColumns`, `validateBoardData`, `getBoardTagSuggestions` |
| `task.js` | 41 | 353 | `normalizeTask`, `normalizeAssignees`, `normalizeChecklist`, `normalizeTags` |
| `roadmap.js` | 40 | 576 | `normalizeRoadmapItems`, `normalizeRoadmapExtension` |
| `calendar.js` | 36 | 620 | `formatLocalIsoDate`, `todayLocalIsoDate`, `formatDueDateForUi` |
| `timeline.js` | 32 | 521 | `getBoardTimelineData`, `normalizeTimelineEvent` |
| `util.js` | 19 | 194 | `formatErrorMessage`, `isAbortError` |
| `attachments.js` | 16 | 239 | `normalizeTaskAttachments`, `normalizeAttachmentRecord` |
| `scoring.js` | 9 | 63 | `taskScore`, `priorityScoreValue`, `effortScoreValue` |
| `serialize.js` | 7 | 239 | `serializeBoardDataFromObject`, `hashTextContent` |
| `validation.js` | 2 | 10 | `assertRequiredExtension`, `hasRequiredExtension` |

`constants.js` additionally holds the ~25 module constants (`BOARD_SCHEMA_VERSION`,
`EFFORT_BUCKETS`, attachment limits, storage keys).

## Key design decisions

### 1. DOM ids are preserved exactly

Every `id` attribute in the current markup is reproduced in the JSX that replaces it.

**Why:** the 94 Playwright tests select by id. Preserving ids is free at authoring
time and is the single measure that keeps the existing suite usable as a parity
oracle throughout the rewrite. This is a hard constraint, not a preference.

### 2. Theming stays CSS-variable-based

The existing light/dark token system is mapped into `tailwind.config.js` as semantic
color names (`bg-surface`, `text-muted`, …) whose values resolve to the same CSS
custom properties already in use. The `teamOsKanbanTheme` localStorage key and the
existing toggle behavior are preserved unchanged.

**Why:** a working, recently-shipped theme system (commit `7b3a036`) already exists.
Re-deriving it in Tailwind's `dark:` idiom would discard working code and require
`dark:` variants on nearly every element.

### 3. Drag and drop moves to dnd-kit

Replaces hand-rolled HTML5 drag/drop for board columns, checklist reorder, timeline
scrubbing, and roadmap rows. Adds keyboard-accessible dragging, which the current
implementation lacks.

**Accepted cost:** this is the one place strict test parity breaks. The ~4 tests that
drive native `DataTransfer` events must be rewritten against dnd-kit's pointer and
keyboard sensors. The file-drop import test is unaffected — it exercises a real
browser file drop, not dnd-kit.

### 4. Modals use Radix Dialog

Provides focus trapping, escape handling, scroll locking, and ARIA wiring that are
currently hand-rolled. Existing ids are preserved on the Radix content elements.

### 5. State uses a sliced Zustand store

The ~40 module globals become four slices: `portfolio`, `board`, `ui`
(modals/toasts/selection/theme), and `files` (save state, watch state). The 60
stateful functions become store actions and selectors; their logic survives
essentially intact while the plumbing changes.

**Why Zustand over `useReducer` + context:** at this number of independent state
atoms, reducer action types and context plumbing become their own maintenance
burden — the exact problem this migration exists to solve.

## Test strategy

The existing suite is the parity oracle. Planned disposition of all 94 tests:

| Fate | Count | Rationale |
|---|---:|---|
| Carry over unchanged | 86 | Stable ids make the implementation swap invisible |
| Rewrite for dnd-kit | 4 | Native drag events → pointer/keyboard sensors |
| Convert to Vitest | 4 | Unit tests currently expressed as E2E |
| **Total** | **94** | |

**Correction (2026-09-11, discovered during Task 1):** the "carry over unchanged"
row above is materially optimistic, and the original claim that the remaining
`page.evaluate` calls only stub File System Access was wrong. Measured against the
real suite:

| Coupling | Tests | Survives a React rewrite on stable ids? |
|---|---:|---|
| Black-box (DOM ids, user flows only) | 34 | Yes |
| White-box (reads/writes app internals) | 60 | **No** |

The 60 white-box tests drive internals directly — `portfolioBoards` (36 tests),
`editPortfolioTask` (12), `getPortfolioBoardRecord` (9), `runPortfolioTaskMutation`,
`setPortfolioSort`, `getProjectSaveState` and others. Under Phase 2's React + Zustand
rewrite those symbols cease to exist in their current form, and stable DOM ids do not
save them.

**Consequence for Phase 1:** none. The functions still exist, so a `window` bridge
(added in Task 1) keeps all 94 green. Phase 1 proceeds as planned.

**Consequence for Phase 2:** the suite is a far weaker parity oracle than this spec
originally claimed, and Phase 2's spec must choose a strategy for those 60 tests
before any React is written. See "Risks".

The 4 conversions are the tests that call domain functions directly via
`page.evaluate`: `normalizeColumns` (×2), legacy assignee serialization, and roadmap
schema normalization. Once those functions are importable ES modules they belong in
Vitest, where they run in milliseconds without a browser.

Of the 129 remaining `page.evaluate` calls, those that stub the File System Access
API (`window.showOpenFilePicker` and friends) are unaffected. **But many others reach
into application internals** — see the correction above. Converting the legacy script
to an ES module removes top-level declarations from `window`, so Task 1 adds an
explicit bridge to keep them reachable.

Mechanical test-harness changes:

- `gotoApp` helper at `tests/app.test.js:69` — `/kanban.html` → `/` (one line).
- Three direct `page.goto('/kanban.html?pb=…&pv=…')` calls → `/?pb=…&pv=…`.
- `playwright.config.js` `webServer` — `python3 -m http.server 4173` → `vite preview`,
  removing the Python 3 prerequisite from the README.

New: Vitest covers `src/domain/` and `src/persistence/` with unit tests written
during Phase 1.

## Phasing

This migration is too large for one implementation plan. It splits into two phases,
each with its own spec and plan.

### Phase 1 — domain extraction

Move the 253 pure functions and `BoardRepository` into `src/domain/` and
`src/persistence/` as ES modules with Vitest coverage. Stand up the Vite, Tailwind,
and Vitest toolchain. `kanban.html` continues to run by importing the built bundle,
so the app stays functional and all 94 Playwright tests stay green throughout.

**Exit criteria:** all 253 functions live in modules; Vitest suite covers them; all
94 Playwright tests still pass; `kanban.html` still runs.

Phase 1 is mechanical, independently valuable, and is work that any migration
approach would require.

### Phase 2 — UI rebuild

Rebuild the 89 UI functions as React components on the stable domain core, in
dependency order:

1. App shell + theme + Tailwind token mapping
2. Board view
3. Task modal (description, checklist, tags, assignees, attachments)
4. Portfolio view (filters, sorting, bulk selection, chips)
5. Roadmap view
6. Timeline view
7. Calendar view
8. File System Access integration + external file watch

Playwright pass count is the progress metric as each view lands.

**Phase 2 requires its own design spec**, written after Phase 1 completes. Its
view-by-view component boundaries depend on what the domain extraction reveals about
the real data dependencies, and specifying them now would be guessing.

## Risks

**File System Access + external file watch.** The least test-covered and most
stateful part of the app. The current polling watcher (`PROJECT_FILE_WATCH_INTERVAL_MS`,
conflict suppression windows) coordinates through mutable globals and timers in ways
that interact awkwardly with React's lifecycle and StrictMode double-invocation.
Mitigation: port last in Phase 2, and add Playwright coverage for conflict and
external-change paths before touching it.

**Tailwind rewrite of 3,190 lines of CSS.** Bulk is mechanical, but bespoke layouts
(roadmap Gantt rows, calendar heat map, timeline scrubber) may not express cleanly as
utilities. Mitigation: allow component-scoped CSS modules for genuinely bespoke
layout rather than forcing utility classes.

**The test suite is a weak oracle for Phase 2.** 60 of 94 tests are coupled to
internals that Phase 2 deletes. Phase 2's spec must pick a strategy before writing
components: rewrite them as black-box tests first (buys a real oracle, delays React),
expose store state and actions on `window` for tests (preserves them, entrenches a
test-only interface), or convert them view-by-view as each is rebuilt (spreads the
cost, but the oracle is weakest exactly when it is most needed). Unresolved — this is
the first decision Phase 2 must make.

**Scope drift during a parity port.** "While I'm in here" improvements inflate a
migration indefinitely. Mitigation: parity is the bar; improvements get filed, not
built.

## Out of scope

- Feature changes or UI redesign.
- Board JSON schema changes — existing `*.board.json` files must load unchanged,
  and `BOARD_SCHEMA_VERSION` stays at `1`.
- TypeScript. A worthwhile follow-up, but adding a type migration to a framework
  migration compounds the risk of both.
