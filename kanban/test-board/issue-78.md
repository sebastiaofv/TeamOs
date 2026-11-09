# Issue 78 — responsiveness without changing project behaviour

The investigation found repeated processing of history and current-state data rather than runaway event creation. The fixes preserve the file schema, full audit trail, comments, historical navigation/restoration, Sprint participation/results, workflow decisions, attachment references and concurrent-save checks.

## What changed

- Dashboard reports replay history once in canonical order instead of restarting from the baseline for every observation. Replay copies changed containers/workitems rather than the whole project. The visible recorded-history table keeps compact counts and canonical positions; full historical details remain available on navigation. Counts are reused only when an event cannot change their workflow category, hierarchy or phase scope. Events outside the selected date range still invalidate subsequent counts, including inverted timestamps.
- Task details defer their history projection until History is requested. Each view model reuses its projection. Comments/History still load the authoritative project history, concurrent consumers share one load, and failures can be retried. Loading indicators use the existing spinner and respect the current language.
- Ordinary mutations clone current state and an independent event array, sharing already published event payloads. Commands continue to append/annotate only new events. Import/save validation still examines event contents; the normalized read path avoids repeating normalization during every projection/mutability check.
- Workflow validation uses a bounded content cache, with detached results for mutable callers. Synchronous read-only reports reuse the resolved workflow within that operation, then discard the cache. In-place settings changes and failed reports cannot leave stale validation behind.
- Hierarchy automations skip edits that cannot trigger a rule. Structural edits, state changes, new items/deletions and Sprint closures continue through the existing automation/review path. Lookups and progress calculations avoid repeated full-array searches.
- Folder persistence externalizes current data and new events, rather than walking old event payloads for attachment extraction. Existing committed payloads are immutable. Recovery retains complete base/local data; Web Locks, exact hashes, pre/post-write checks, staged transactions, conflict reconciliation and retries remain in place.
- Unchanged projects reuse derived rows while dependency blocking is recalculated across projects. Board selection rerenders affected cards and reuses column projections. Sprint rosters are built when the Sprints perspective needs them. Existing table expansion, filters and drafts remain available when switching views.

The `.board.json` format still has to read/write a whole file; folder projects remain preferable for a large audit trail. No history is deleted or truncated.

## Measurements

Measured on 9 November 2026 with synthetic data in isolated Chromium profiles, comparing the starting checkout `a2b9203` with this change. These are local measurements, not hardware-independent guarantees.

The committed benchmark uses the real domain/store/mutation code, excluding disk and React rendering. Medians: seven mutations and three historical reports per scenario.

| Operation | Workitems | Previous events | Before | After |
|---|---:|---:|---:|---:|
| Priority mutation | 1 | 10,000 | 65.6 ms | 0.6 ms |
| Priority mutation | 1,000 | 0 | 102.6 ms | 21.4 ms |
| Priority mutation | 100 | 10,000 | 72.3 ms | 2.7 ms |
| Complete dashboard history report | 20 | 100 | 291.3 ms | 10.8 ms |
| Complete dashboard history report | 20 | 500 | 3,670.7 ms | 51.7 ms |
| Complete dashboard history report | 20 | 1,000 | 13,158.5 ms | 88.8 ms |

Production-build browser observations, including React rendering and two animation frames after the click:

| Interaction | Workitems / events | Before | After |
|---|---|---:|---:|
| Open Dashboard after consulting Comments | 20 / 1,000 | 14,210 ms | 163 ms |
| Open Details with history already loaded | 100 / 10,000 | 1,010 ms | 73 ms |

These UI observations are single local samples; the automated budgets are deliberately more conservative. Large Boards still mount every card, and a 1,000-card Board can still take around 250 ms to open a modal. This change removes the measured history amplification; it does not claim a fixed latency for arbitrary project sizes or eliminate all browser layout/focus costs.

A separate complete-save measurement used real Chromium OPFS streams and IndexedDB recovery, 100 workitems, 10,000 old events and five changes. Folder saves with loaded history fell from approximately **422 ms to 84 ms**; unopened history from **89 ms to 54 ms**; legacy files from **449 ms to 154 ms**. In each folder scenario the five saves read zero full history files, read 1,600 bytes of journal tails and appended about 5.3 KB. These wall times include asynchronous I/O; they are not a measure of continuous UI blocking. Real folders, sync clients and slower devices can behave differently.

Run from `kanban/`:

```bash
npm run bench:performance
npm run bench:performance -- --root /absolute/path/to/another/kanban-checkout
```

The comparison checkout needs its dependencies available. The script starts/stops an isolated Vite server and headless Chromium profile; it does not open or change user project files.

## Regression coverage

Validation on the implementation: lint and TypeScript checks, **1,559 unit tests**, and **679 Playwright tests including visual snapshots**. The fast Pull Requests tab-navigation scenario also passed 20 consecutive repetitions. Both committed builds were regenerated; visual baselines were unchanged.

- Unit tests bound whole-board copies during a history report and compare observations/counts against standalone replay across phase scopes and date ranges. They cover canonical order with inverted timestamps, immutable existing events, lazy detail history, workflow edits/cache cleanup, strict import validation, journal delta writes and shared history loading/retry.
- Browser tests exercise a hydrated 1,000-event Dashboard under a conservative two-second budget while retaining all 1,001 observations and historical navigation. Details with 10,000 events must open under one second and retain comment drafts and History consultation. A separate navigation case keeps an expanded Sprint open after switching Board → Table.
- The existing suite exercises restores, comments/images, attachments, identity migration, workflows/automations and acceptance, Sprint closure/participation, project transfers, concurrent edits, failed writes/recovery, keyboard navigation and light/dark desktop/mobile visual baselines.
- Opening a Pull Request URL editor now focuses the committed input in a layout effect. A deferred animation-frame callback could otherwise steal focus from the next tab during fast keyboard navigation. The URL draft and confirmation behaviour are unchanged.
- A Project Control test now waits for the newly created record to reach disk. The previous helper only required any earlier write and could read the previous iteration while the current asynchronous save was still pending.

## Manual checks

1. Import a folder project with a large history. Use Board and edit a priority before consulting history; then visit Comments, return to Details and repeat the edit. Check the saved value, attribution and one canonical operation per user edit. Open History and verify before/after values.
2. Open Dashboard over a period with many events. Check every recorded observation, phase scopes, start/end dates, Sprint Analytics and opening historical workitems. Restore a historical state and confirm identity reservations, comments and Sprint records remain correct.
3. Select cards with J/K, bulk-select, use direct assignment/status controls and drag by mouse/keyboard/touch. Verify the previous and next selection, drop overlay, allowed transitions, acceptance and undo.
4. Switch among Board, Table, Sprints, Roadmap, Dashboard and documentation. Preserve table sorting/filtering/expanded Sprints and unsaved relation/comment/editor drafts according to the existing navigation behaviour.
5. Open the same project in two sessions, make independent and conflicting edits, simulate a failed write, retry and reopen. Verify no silent overwrite, lost event, duplicate comment or discarded recovery draft. Repeat with the standalone build.
