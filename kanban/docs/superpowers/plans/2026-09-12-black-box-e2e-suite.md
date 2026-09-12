# Black-Box E2E Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `tests/app.test.js` so no test reads or writes app internals, then delete the `window` bridge in `src/legacy/main.js` with the suite still green.

**Architecture:** Tests talk to the app only through the DOM, URL, user input, and test doubles at browser-API boundaries. The File System Access API is replaced by an in-page fake disk (`window.__portfolioDiskByBoardId`, `window.__portfolioTestWrites`, `window.__portfolioWriteControl`) — that is a double for the *browser*, not the app, so it stays. Boards are loaded the way a user loads them (Import button / file drop), selected by clicking chips, and verified by reading what was written to the fake disk.

**Tech Stack:** Playwright 1.52 (CJS test file), Vitest 2, Vite 5.

## Global Constraints

- Parity: no app behaviour changes. `src/` may only change in Task 6 (bridge removal) and for pure extractions needed to move a logic test to Vitest.
- A test may not reference any name in the bridge (`Object.defineProperties(window, …)` / `Object.assign(window, …)` in `src/legacy/main.js`).
- A failing assertion after conversion is investigated, not loosened: compare against the pre-conversion test at `git show main:kanban/tests/app.test.js`.
- Every task ends with `npm run test:unit` and `npm run build && npm test` passing. Stage explicit paths.

## Facts the harness relies on

- Import: `importProjects()` → `BoardRepository.importFromHandles` → `appendPortfolioRecords(loaded)`, which renders and then *un-awaited* `primeProjectFileBaselines` reads each file again. A test must wait for that second `text()` read before mutating a file externally, or the mutation becomes the baseline.
- Drop: `window` `drop` with `DataTransfer.files` → `importFromLooseFiles` → records with `handle: null` (read-only).
- Board ids are random (`p<timestamp><rand>`). Test ids (`'p1'`, `'alpha'`) become *labels* keying the fake disk; the UI is addressed by title.
- File watch runs on `window` `focus`, on `visibilitychange`, and every 4000 ms; a check is skipped while another is running or a save is in flight.
- URL state keys: `pq pp pu pbk pe pa ps pd pb pv`.

---

### Task 1: Black-box harness

**Files:** Modify `tests/app.test.js` (helpers, lines 1–322).

**Produces:**
- `seedPortfolioBoards(page, boards, { selectedBoardId, sortKey, sortDir })` — same signature; imports writable boards via mocked `showOpenFilePicker` + Import button, read-only boards via file drop, waits for chips and baseline reads, selects by chip click, applies sort through `#portfolioSortSelect`.
- `readSavedBoard(page, boardLabel)` → parsed JSON of the fake-disk file (last write or seeded text).
- `triggerExternalFileCheck(page, boardLabel?)` → dispatches `focus` and waits for a fresh `text()` read of the file(s).
- `installControlledPortfolioWriter(page, { boardId, holdWrites, failWrites })` → only configures `window.__portfolioWriteControl`; the seeded handle's `createWritable` honours it.

- [ ] Rewrite helpers; seed handles count `getFile`/`text` reads per label.
- [ ] Run full e2e; fix tests broken only by seeding semantics (import appends instead of replacing, alphabetical board order, serialization on import).
- [ ] Commit `test(e2e): seed boards through import instead of app internals`.

### Task 2: Replace in-memory state reads

Replace `portfolioBoards[...]`, `getPortfolioBoardRecord(...)`, `getRoadmapExtension(...)` reads with `readSavedBoard` (polled where a save is pending) or DOM assertions for read-only boards.

- [ ] Convert; run e2e; commit `test(e2e): assert persisted board files instead of in-memory state`.

### Task 3: Replace internal actions with user actions

- `editPortfolioTask` → hover card, click **Edit**.
- `setPortfolioSort` → `#portfolioSortSelect`.
- `applyUrlState` → chip clicks.
- `setTaskModalAttachmentDraft` → `setInputFiles('#taskAttachmentsInput', …)`.
- `runPortfolioTaskMutation` + `getProjectSaveState` → edit through the modal; assert chip save label and fake-disk writes.
- Stale-query test → assert chips/URL/visible view instead of state vars.

- [ ] Convert; run e2e; commit `test(e2e): drive mutations, sorting and selection through the UI`.

### Task 4: Timeline internals

`reconstructBoardStateFromTimeline`, `getSelectedBoardTimelineViewState`, `isHistoricalPreviewActiveForBoard`, `setPortfolioTimelineSelection`, and the scroll-position test's direct event recording → build history with UI edits, read preview state from the timeline panel DOM and the task cards it projects.

- [ ] Convert; run e2e; commit `test(e2e): verify timeline behaviour through the timeline panel`.

### Task 5: Logic tests out of the browser

- Overdue local-vs-UTC → Vitest in `tests/unit/task.test.js` (same fake `Date`), delete e2e test.
- `TaskFormValidator` → keep coverage through the task modal (blocker reason, oversized attachment) if not already asserted; delete the direct-call test.
- Today marker → fixed clock via `page.addInitScript`; expected position derived from the rendered phase bar, not from roadmap functions.

- [ ] Convert; run unit + e2e; commit `test: move logic-only checks to Vitest`.

### Task 6: Delete the bridge

- [ ] Remove `Object.defineProperties(window, …)`, `Object.assign(window, …)` and their comment from `src/legacy/main.js`; drop imports that become unused.
- [ ] `grep` the test file for every former bridge name → zero hits.
- [ ] Update README test counts and the spec's coupling note.
- [ ] Unit, build, e2e green; commit `refactor: remove window test bridge`.
