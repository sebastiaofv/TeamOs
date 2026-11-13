# Domain invariants: inventory, enforcement map and gaps

Reverse-engineered from `src/domain`, `src/features/portfolio/commands` and
`src/infrastructure/persistence` on branch `codex/issue-93-radix-zod-accessibility`
(2026-11-12). Items marked **verified** were reproduced with a throwaway Vitest
probe against the current code; items marked **plausible** come from reading
the code and were not reproduced.

## Status after issue #101

The sections below describe the code **before** issue #101. That issue fixes:

| Gap | Fix | Where |
|---|---|---|
| G1 concurrent creation loses a workitem | A workitem created only on the external side is renumbered when its number is taken, with every number-based reference rewritten | `domain/projectMergeIdentity.ts`, `mergeProject` |
| G2 publish before validate | `assertPublishable` runs the save's document check and the transition rules before `commitState` | `commands/mutationContext.ts` |
| G3 unvalidated recovery restore | `base` and `local` must validate; a refused draft shows a message | `persistence/projectFiles.ts`, `ProjectReconciliation.tsx` |
| G4 merge creates rule violations (A1, A2, P1, P5) | `workitemTransitionViolations(next, previous)`; the merge rejects only violations that neither side had on its own, so legacy projects keep opening | `domain/workitems.ts`, `mergeProject` |
| G5 immutability only in-session (I3–I5) | The same transition rules compare by `permanentId`; immutability is never exempt | `domain/workitems.ts` |
| G6 cross-tab duplicate move | The whole transfer runs under a Web Lock on the source workitem's permanent ID | `persistence/projectLock.ts`, `projectTransferCommands.ts` |
| G9 / R2 non-canonical `related` pairs | Canonicalized when parsed and in the merge identity | `domain/taskRelations.ts`, `projectMerge.ts` |

Two problems found while fixing these:

- `workflowKind()` without a subject resolved as a Task. Projects that configure Tasks to follow the functional workflow built their Board columns from that workflow and could not be saved. No subject now means the technical workflow.
- Deleting a Planned Sprint recorded participation for the Sprint being deleted. Participation is now recorded only for existing Sprints, and entries of a Sprint deleted in the same change are dropped.

Still open (follow-up): G7 (planner blocks dropped silently), G8 (transition check only for single-workitem edits), A3 (criteria change in a merge), P4 (closures not protected against rewrite).

## 1. The enforcement layers that exist today

The app runs in the browser. There is no server API, so the "API" boundaries are file
reads, IndexedDB recovery, the three-way merge and cross-project transfers.

| Layer | Entry point | What it checks |
|---|---|---|
| L0 v1 file schema | `assertWorkitemFile`, `assertControlRecordFile` (`projectFileSchema.ts`), `fromProjectFile` (`projectFormat.ts`) | Shape (Zod), which fields apply to which type, explicit-mode ids, `blockerReason` only when blocked, responsible ∈ assignees, member ids resolvable, relation endpoints resolvable |
| L1 normalization | `serializeBoardDataFromObject` (`serialize.ts`) | **Repairs** instead of rejecting: unknown statuses become a default, invalid planner blocks are dropped, timestamps are back-filled |
| L2 whole-document check | `validateBoardData` (`board.ts:212`) | Structure, ids unique and positive, permanentId unique, status ∈ workflow, leaf phase / milestone exist, blocked ⇒ reason, responsible ∈ participants, member/tag references, local relation DAG, cross-project relation DAG, workflow well-formedness, columns = states, plus `assertWorkitems` without `previous` |
| L3 transition check | `assertWorkitems(data, previous)` (`workitems.ts:313`) | Same as `assertWorkitems` at L2, plus immutability of `permanentId`, `displayId` and `type`, and no orphaned children after a delete |
| L4 command pipeline | `applyWorkitemChange` (`workitemChanges.ts`) | `canTransition` (only when `taskId` is set), acceptance prompt, sprint and planning sync, staleness via `isCurrent()`, acronym uniqueness on change |
| L5 save gate | `enqueueProjectSave` → `BoardRepository.validate` | L2 on the serialized payload, hash-conditional write, post-write verification, revision-regression detection |
| L6 merge gate | `mergeProject` → `validateBoardData(merged)` → `projectIntegrityConflict` | L2 on the merged document, which falls back to an "integrity" conflict |

The main structural weakness is that **L4 publishes to the store before L2 runs**.
`mutationContext.publish` commits the draft and calls `markDirty`, and `markDirty`
writes an IndexedDB recovery entry. `BoardRepository.validate` only runs later,
inside the save. If a draft passes L3 but fails L2, it stays in memory and in
recovery storage, and the project gets stuck in `status: 'error'`.

## 2. Invariant catalogue

Legend: ✅ enforced at the right boundary · ⚠️ partly enforced or enforced too late · ❌ not enforced.

### Identity

| # | Invariant | Created | Validated | Status |
|---|---|---|---|---|
| I1 | `task.id` is a positive safe integer, unique within the project | `nextTaskIdForBoard` (high-water mark + 1) | L2 | ⚠️ unique per replica only: see G1 |
| I2 | Workitem ids are never reused, even after deletion | `reserveTaskIdentities`; merge takes `max(highWaterMark)` | L2 parses the reservation | ✅ in a single replica, ❌ across concurrent replicas (G1) |
| I3 | `permanentId` is unique, immutable and set on every task | `ensurePermanentTaskIdentities` | L2 uniqueness, L3 immutability | ⚠️ immutability is checked only in-session, not when a file or merge changes it |
| I4 | `displayId` = `ACR-{EP,US,TK,BG}-id`, fixed at creation | `applyWorkitemChange` | L2 format, L3 immutability | ⚠️ same as I3 |
| I5 | `type` is immutable after creation | none | L3 only | ❌ outside the session: **verified**, a merge where the external side turns a Story into a Bug produces no conflict |
| I6 | Project acronym is 1–4 letters and unique across loaded projects | prompt in `applyWorkitemChange` | `publish` → `assertUniqueProjectAcronym`, only when the acronym changes | ⚠️ two files opened with the same acronym are never rejected |
| I7 | A `permanentId` lives in exactly one project, except during a pending move | `prepareProjectTransfer` | nowhere globally | ❌ plausible cross-tab race (G6) |

### Hierarchy and type rules

| # | Invariant | Validated | Status |
|---|---|---|---|
| H1 | Parent rules: Story/Bug → Epic, Task → Epic/Story/Bug, Epic has no parent; no cycles | L2, L3 (`validParent`, cycle walk) | ✅ |
| H2 | No orphan: you cannot delete a parent that still has children | L3 only (`previous` needed) | ⚠️ a merge where one side deletes the parent and the other adds a child is caught by L2 (missing parent), so this holds |
| H3 | Epic has no `effort`, `sprintId` or `pullRequests` | L0, L2 | ✅ |
| H4 | `storyPoints` only on planning units | L0 (`assertPlanningUnits`), L2; `syncWorkitemPlanning` deletes them | ✅ |
| H5 | Type-specific text fields only on their type | L0 for v1; L2 only checks they are strings | ⚠️ legacy `.board.json` files can carry `stepsToReproduce` on an epic |
| H6 | A Bug auto-creates one child Task on creation | `applyWorkitemChange` | ✅ convention, not an invariant (deleting the Task is allowed) |

### Workflow and state transitions

| # | Invariant | Validated | Status |
|---|---|---|---|
| W1 | Workflow is well formed: reserved Backlog, To-do entry, at least one Completed state, references valid, every state reachable from Backlog, transitions reference states | `workflowErrors` at L2 and in `applyWorkflow` | ✅ |
| W2 | `task.status` ∈ the workflow for its type (technical or functional) | L2 | ✅ for configured workflows (the test confirms serialize does not coerce). `normalizeTaskStatus` still maps unknown values on legacy paths without a workflow |
| W3 | Status changes follow `workflow.transitions` | L4, only in `runPortfolioTaskMutation` (`taskId` set) and `movePortfolioTaskToStatus` | ⚠️ board-level mutations, restores, merges and file edits are not checked. Some bypasses are intentional (sprint closure → Backlog, workflow relocation) but they are not declared as such |
| W4 | Board columns = technical workflow states, in order | L2 | ✅ |
| W5 | Automation rules: `from`/`to` are non-terminal functional states and `to ∉ from` | `validateAutomation` (L2, L3) | ✅ |

### Acceptance and completion

| # | Invariant | Validated | Status |
|---|---|---|---|
| A1 | A Story or Bug in a Completed state has `acceptance` with an author | L4 prompts; `delete task.acceptance` when it leaves Completed | ❌ at L2: **verified**, a `done` Story with no `acceptance` passes `validateBoardData` |
| A2 | A Story or Bug cannot be completed while a child Task is still open | `assertAcceptance` at L4 and in transfers | ❌ at L2: **verified**, a `done` Story with a `to-do` child passes. A merge (local completes the Story, external adds a child) produces this with no conflict |
| A3 | Changing a Story's acceptance criteria while it is Completed requires re-acceptance | L4 (`changedCriteria`) | ❌ in a merge, an external criteria edit is merged under the local acceptance |
| A4 | `acceptance` exists only on Story and Bug, and only while Completed | L0 type table; the "only while Completed" part is not checked | ⚠️ |

### Planning (Sprints, Phases, Milestones)

| # | Invariant | Validated | Status |
|---|---|---|---|
| P1 | `task.sprintId` refers to an existing Sprint | none | ❌ **verified**: a dangling `sprintId: 'nope'` passes L2 |
| P2 | `phaseId` refers to an existing leaf phase; `milestoneId` refers to an existing milestone | L2 | ✅ |
| P3 | A Task under a Story or Bug inherits its parent's eligible Sprint | `syncWorkitemPlanning` (L4) | ⚠️ derived only in-session; a merge can split parent and child Sprints |
| P4 | A closed Sprint's closure (roster, workflows, velocity) is frozen | `parseSprintResults`; `capture` skips closed Sprints | ⚠️ no check that a later document keeps a closure byte-identical. A restore, merge or external edit can rewrite history |
| P5 | `sprintParticipation` entries refer to open, existing Sprints and are unique per (sprint, task) | `assertWorkitems` checks uniqueness and shape | ❌ **verified**: an entry for Sprint `ghost` passes L2 |
| P6 | Only Planned Sprints can be deleted | `deleteRoadmapEntity` re-checks inside the mutator | ✅ |
| P7 | Sprint numbers are monotonic (`sequences.sprints.lastNumber`) | merge takes the max | ✅ |

### Relations and assignments

| # | Invariant | Validated | Status |
|---|---|---|---|
| R1 | Local relations: no self-links, one relation per pair, `blocks` edges form a DAG, endpoints exist | `parseTaskRelations` at L2, `setTaskRelation` | ✅ |
| R2 | A `related` pair is stored with ascending ids | `setTaskRelation` only | ⚠️ **verified**: `{2,1,'related'}` passes L2. Merge identity is `source:target:kind`, so `{1,2}` and `{2,1}` are seen as different entities and then fail as a "duplicate pair" integrity conflict |
| R3 | Cross-project relation graph is a DAG with unique pairs | `assertPermanentGraph` at L2, in commands and in view state | ✅ per project; the full portfolio graph is checked in `portfolioViewState` and only throws |
| R4 | The responsible person is also an assignee; assignees and responsible refer to members by id, with matching names | L0, L2 (`validateProjectReferences`) | ✅ |
| R5 | Tags are in `project.tags` | L2 | ✅ |
| R6 | Day-planner blocks refer to existing tasks, sit on the 15-minute grid, and have `start < end` | L1 drops invalid blocks | ⚠️ silent repair: a bad block disappears without any history event (**verified**: L2 does not reject `end < start` or a missing task) |
| R7 | Project Control `related` refers to existing phases and milestones | `ControlError('references')` when a record is saved; `removeDeletedControlLinks` | ⚠️ not checked by L2 |

### Persistence and concurrency

| # | Invariant | Mechanism | Status |
|---|---|---|---|
| C1 | Never overwrite a disk version you have not seen | hash-conditional write and post-write verification | ✅ |
| C2 | `meta.revision` strictly increases; equal or older revisions need an explicit decision | `regression` flag in `mergeProject` | ✅ (this also catches the cross-machine lost-update race that Web Locks cannot prevent) |
| C3 | `history.json` stays append-only with `transactions` last; stage before project, commit after | `projectDirectory.ts` envelope scans | ✅ |
| C4 | Everything published to the store is a valid document | none: L4 publishes before L5 validates | ❌ G2 |
| C5 | A restored recovery draft is a valid document | `restoreProjectRecovery` → `applySnapshotToBoardRecord` only normalizes | ❌ G3 |
| C6 | Concurrent creation never loses a workitem | none | ❌ G1 (**verified**) |

## 3. Paths where invalid states get in (ranked)

**G1: Concurrent creation loses a workitem (verified, high).** Two replicas
(two tabs, or two machines sharing a synced folder) each create a workitem with
id `highWaterMark + 1`. Their `permanentId`s differ, so `mergeProject` keeps
both. `validateBoardData` then fails with "Task ids must be unique", and
`projectIntegrityConflict` offers only *local* or *external* for
`board.tasks[E] + board.tasks[L]`. Both choices drop one of the two new
workitems. The probe confirmed that resolving with `local` leaves
`['local new']` and resolving with `external` leaves `['external new']`. The
`displayId` (`ACR-TK-1`) collides in the same way.
*Fix (merge boundary):* before validating, renumber the colliding workitem whose
`permanentId` is not in `base`. Give it `max(highWaterMark_l, highWaterMark_e) + 1`,
rewrite its `displayId`, and rewrite `taskRelations`, `parentId`, `dayPlanner`
and comment `taskId` references by permanentId. Record a `workitem.renumbered`
event. Ids are a local projection; `permanentId` is the identity.

**G2: Publish before validate (structural, high).** `applyWorkitemChange` runs
`assertWorkitems` (L3) but never `validateBoardData` (L2). `publish` commits to
the store and `markDirty` persists a recovery draft before
`BoardRepository.validate` runs in the save. Any L2-only rule (R2, R4, R5, P2,
W2, W4) broken by a command leaves an invalid in-memory project that every view
renders and that keeps failing to save.
*Fix (command boundary):* in `mutationContext.publish`, run
`validateBoardData(draft.data)` (or a cheaper `validateTransition(previous, next)`,
see §4) **before** `commitState`. `projectTransferCommands.publish` already does
this.

**G3: Unvalidated recovery restore (medium).** `restoreProjectRecovery` adopts
`draft.base` as the baseline and `draft.local` as state with no validation.
Drafts come from IndexedDB, which other tabs can write, and possibly from an
older app version.
*Fix:* `validateBoardData` both `base` and `local` (after normalization). On
failure, keep the draft and show it as "unrecoverable" instead of applying it.

**G4: The merge produces semantically invalid documents (verified for A1, A2, P1).**
L2 is the only gate on merged output, and it does not check A1, A2, A3, P1, P3,
P4 or P5. Example: local completes a Story (with acceptance); external adds a
`to-do` Task under it. The merge succeeds with no conflict, and the result is a
completed Story with pending work. Another example: local deletes a planned
Sprint while external assigns a workitem to it, leaving a dangling `sprintId`.
*Fix:* move these rules into L2 (§4) so that `projectIntegrityConflict` isolates
them like any other integrity failure.

**G5: Immutability only holds in-session (medium).** `type`, `displayId` and
`permanentId` immutability (I3–I5) need `previous`, and `previous` is only
passed in L4. The merge, the watcher's "newer disk version" adoption and history
restore all accept a changed `type` for the same `permanentId`. That silently
re-routes the workitem to the other workflow and reinterprets its fields.
*Fix:* call `assertWorkitems(merged, base)` (immutability part only) in
`mergeProject`, and `assertWorkitems(external, runtime.base)` when adopting a
disk version in `enqueueProjectSave`.

**G6: Cross-tab duplicate move (plausible, medium).** `preparing` and
`lockProjectTransfers` are module state that each tab holds separately. Two tabs
can move the same workitem to different destinations, and each checks `pending`
only against its own store, so one `permanentId` can end up in two projects.
`locateWorkitem` then picks one by receipt time.
*Fix:* take `withProjectIdentityLock` (Web Locks, shared across tabs) on the
**source** project id for the whole prepare → destination save → source save
sequence. Reject a destination receipt in `validateBoardData` for the portfolio
when the source still contains the item and no `pending` operation exists.

**G7: Silent repair at L1 (low to medium).** `normalizeDayPlannerExtension`
drops invalid or orphan blocks on every serialize, including the save path
(`BoardRepository.serialize`). That hides bugs and loses data without a history
event. (Status coercion through `normalizeTaskStatus` did not reproduce for
configured workflows; it only affects legacy files without a workflow.)
*Fix:* split normalization into `migrateLegacy` (only on open of pre-v1 files,
which emits a `project.converted` note) and a strict `serialize`. In the strict
path, an orphan or invalid block throws.

**G8: Transition check is opt-in (low).** `canTransition` runs only when
`taskId` is passed to `runMutation`. Board-level mutators that change a status
are unchecked. *Fix:* in `applyWorkitemChange`, compare every task whose status
changed against `canTransition`, with an explicit allow-list of system causes
(`sprint.close`, `workflow.relocate`, `automation`, `restore`). Make the bypass
a declared parameter rather than a missing argument.

**G9: Non-canonical `related` pairs (verified, low).** `parseTaskRelations`
should reject `related` with `sourceId > targetId`, or canonicalize it at L1, so
that merge identities line up.

## 4. Where each rule should live

```text
          file / recovery / merge / transfer                in-session command
                     │                                              │
          L0 schema (shape, field tables)                          │
                     │                                              │
     ┌──────── validateDocument(data) ────────┐   ← single source for state invariants
     │  structure, references (P1, P5, R6, R7),│     I1, H*, W1–W2, W4, A1, A2, A4, R*
     │  completion rules (A1, A2)              │
     └─────────────────────────────────────────┘
                     │                                              │
     validateTransition(previous, next, cause)   ← I3–I5, H2, W3 (unless cause allows), P4 (closures frozen), A3
                     │                                              │
            merge / adopt / restore ───────────────────── publish (before commitState)
```

1. **`validateDocument`** (today `validateBoardData`) holds every rule that can be
   checked from one snapshot. Add P1, P5, R6 (reject instead of drop), R7, A1
   and A2. A1 and A2 must use the workflow of the closure when one applies,
   because frozen rosters keep historical states.
2. **`validateTransition(previous, next, cause)`** is a new pure function in
   `domain/`. It holds the immutability rules (the `previous` half of
   `assertWorkitems`), closure freezing (every `closures[sprintId]` in
   `previous` is deep-equal in `next`, unless `cause === 'restore'`), status
   transitions per W3 with declared bypasses, and "criteria changed ⇒ acceptance
   renewed". Call it at four boundaries: `mutationContext.publish`, `mergeProject`
   (against `base`), watcher adoption (against `runtime.base`) and
   `restoreProjectRecovery`.
3. **Merge pre-pass** for G1: renumber new-id collisions by permanentId before
   validation.
4. **Cross-tab lock** for G6: use `withProjectIdentityLock`, not
   `lockProjectTransfers`.

Keep `assertWorkitems` as a thin wrapper so the existing tests still compile.

## 5. Tests that attempt to violate each invariant

Proposed file: `tests/unit/domainInvariants.test.ts`. This block was run against
the current code: the 11 tests marked `// RED` fail, and all the others pass and
pin behaviour that already holds. P4 is only a placeholder until
`validateTransition` exists.

```ts
import { describe, expect, it } from 'vitest';
import { createEmptyProjectData, validateBoardData } from '../../src/domain/board';
import { normalizeTask } from '../../src/domain/task';
import { serializeBoardDataFromObject } from '../../src/domain/serialize';
import { cloneSerializable } from '../../src/domain/serializable';
import { mergeProject } from '../../src/domain/projectMerge';
import { assertWorkitems } from '../../src/domain/workitems';
import { setTaskRelation } from '../../src/domain/taskRelations';
import type { BoardData, Task } from '../../src/domain/types';

const task = (input: Parameters<typeof normalizeTask>[0]): Task => ({ ...normalizeTask(input), assigneeIds: [], responsibleId: '' });
const project = (...tasks: Task[]): BoardData => {
    const data = serializeBoardDataFromObject(createEmptyProjectData('Inv'));
    data.board.tasks.push(...tasks);
    return data;
};
const replicas = (base: BoardData) => ({ base, local: cloneSerializable(base), external: cloneSerializable(base) });
const sprint = { id: 's1', title: 'S1', startDate: '2026-11-02', endDate: '2026-11-13', status: 'planned' as const };

describe('identity', () => {
    it('I1/G1 concurrent creation of the same numeric id keeps both workitems', () => { // RED
        const { base, local, external } = replicas(project());
        local.board.tasks.push(task({ id: 1, permanentId: 'L', title: 'L', status: 'backlog' }));
        external.board.tasks.push(task({ id: 1, permanentId: 'E', title: 'E', status: 'backlog' }));
        const result = mergeProject(base, local, external);
        expect(result.conflicts).toEqual([]);
        expect(result.merged.board.tasks.map((t) => t.permanentId).sort()).toEqual(['E', 'L']);
        expect(new Set(result.merged.board.tasks.map((t) => t.id)).size).toBe(2);
        expect(result.merged.extensions.taskIdentity!.highWaterMark).toBeGreaterThanOrEqual(2);
    });
    it('I2 a deleted id is never reallocated', () => {
        const data = project(task({ id: 7, title: 'x', status: 'backlog' }));
        data.extensions.taskIdentity = { version: 1, highWaterMark: 7 };
        data.board.tasks = [];
        expect(() => validateBoardData(data)).not.toThrow();
        // nextTaskIdForBoard must return 8
    });
    it('I3 duplicate permanentId is rejected', () => {
        expect(() => validateBoardData(project(task({ id: 1, permanentId: 'p', title: 'a', status: 'backlog' }), task({ id: 2, permanentId: 'p', title: 'b', status: 'backlog' })))).toThrow(/permanent/);
    });
    it('I5/G5 a merge cannot change a workitem type', () => { // RED
        const { base, local, external } = replicas(project(task({ id: 1, permanentId: 'p', type: 'story', title: 's', status: 'backlog' })));
        external.board.tasks[0].type = 'bug';
        const result = mergeProject(base, local, external);
        expect(result.conflicts.some((c) => c.reason === 'integrity')).toBe(true);
    });
    it('I5 in-session type change is rejected (holds today)', () => {
        const before = project(task({ id: 1, type: 'story', title: 's', status: 'backlog' }));
        const after = cloneSerializable(before); after.board.tasks[0].type = 'bug';
        expect(() => assertWorkitems(after, before)).toThrow();
    });
});

describe('hierarchy', () => {
    it.each([['story', 'story'], ['bug', 'task'], ['epic', 'epic'], ['task', 'task']] as const)('H1 rejects %s under %s', (child, parent) => {
        expect(() => validateBoardData(project(task({ id: 1, type: parent, title: 'p', status: 'backlog' }), task({ id: 2, type: child, parentId: 1, title: 'c', status: 'backlog' })))).toThrow();
    });
    it('H1 rejects a parent cycle', () => {
        expect(() => validateBoardData(project(task({ id: 1, type: 'task', parentId: 2, title: 'a', status: 'backlog' }), task({ id: 2, type: 'story', parentId: 1, title: 'b', status: 'backlog' })))).toThrow();
    });
    it('H2 a merge that deletes a parent while the other side adds a child raises a conflict', () => {
        const { base, local, external } = replicas(project(task({ id: 1, permanentId: 'e', type: 'epic', title: 'e', status: 'backlog' })));
        local.board.tasks = [];
        external.board.tasks.push(task({ id: 2, permanentId: 's', type: 'story', parentId: 1, title: 's', status: 'backlog' }));
        expect(mergeProject(base, local, external).conflicts.length).toBeGreaterThan(0);
    });
    it('H3 an epic cannot carry a sprint', () => {
        expect(() => validateBoardData(project(task({ id: 1, type: 'epic', title: 'e', status: 'backlog', sprintId: 's1' })))).toThrow();
    });
});

describe('acceptance', () => {
    const epicStoryTask = (storyStatus: string, taskStatus: string) => project(
        task({ id: 1, permanentId: 'e', type: 'epic', title: 'e', status: 'backlog' }),
        task({ id: 2, permanentId: 's', type: 'story', parentId: 1, title: 's', status: storyStatus }),
        task({ id: 3, permanentId: 't', type: 'task', parentId: 2, title: 't', status: taskStatus }));
    it('A1 a completed story without acceptance is rejected', () => { // RED
        expect(() => validateBoardData(epicStoryTask('done', 'done'))).toThrow();
    });
    it('A2 a completed story with an open child is rejected', () => { // RED
        const data = epicStoryTask('done', 'to-do');
        data.board.tasks[1].acceptance = { author: 'Ana', at: '2026-11-12T10:00:00.000Z', local: true };
        expect(() => validateBoardData(data)).toThrow();
    });
    it('A2/G4 a merge cannot complete a story while the other side adds an open child', () => { // RED
        const base = project(task({ id: 1, permanentId: 'e', type: 'epic', title: 'e', status: 'backlog' }), task({ id: 2, permanentId: 's', type: 'story', parentId: 1, title: 's', status: 'testing' }));
        const { local, external } = replicas(base);
        Object.assign(local.board.tasks[1], { status: 'done', acceptance: { author: 'Ana', at: '2026-11-12T10:00:00.000Z', local: true } });
        external.board.tasks.push(task({ id: 3, permanentId: 't', type: 'task', parentId: 2, title: 't', status: 'to-do' }));
        expect(mergeProject(base, local, external).conflicts.some((c) => c.reason === 'integrity')).toBe(true);
    });
    it('A4 acceptance on a non-completed story is rejected', () => { // RED
        const data = epicStoryTask('doing', 'doing');
        data.board.tasks[1].acceptance = { author: 'Ana', at: '2026-11-12T10:00:00.000Z', local: true };
        expect(() => validateBoardData(data)).toThrow();
    });
});

describe('planning', () => {
    it('P1 a dangling sprintId is rejected', () => { // RED
        expect(() => validateBoardData(project(task({ id: 1, type: 'story', title: 's', status: 'backlog', sprintId: 'ghost' })))).toThrow();
    });
    it('P1/G4 a merge where one side deletes a sprint and the other assigns to it raises a conflict', () => { // RED
        const base = project(task({ id: 1, permanentId: 'x', title: 'x', status: 'backlog' }));
        base.extensions.roadmap = { version: 1, milestones: [], phases: [], sprints: [sprint] };
        const { local, external } = replicas(base);
        local.extensions.roadmap!.sprints = [];
        external.board.tasks[0].sprintId = 's1';
        expect(mergeProject(base, local, external).conflicts.length).toBeGreaterThan(0);
    });
    it('P2 assigning to a non-leaf phase is rejected (holds today)', () => {
        const data = project(task({ id: 1, title: 'x', status: 'backlog', phaseId: 'parent', phaseMode: 'explicit' }));
        data.extensions.roadmap = { version: 1, milestones: [], sprints: [], phases: [
            { id: 'parent', title: 'P', startDate: '2026-11-01', endDate: '2026-11-30' },
            { id: 'leaf', title: 'L', parentId: 'parent', startDate: '2026-11-01', endDate: '2026-11-30' }] };
        expect(() => validateBoardData(data)).toThrow(/leaf/);
    });
    it('P5 participation for a nonexistent sprint is rejected', () => { // RED
        const data = project();
        data.extensions.sprintParticipation = { version: 1, entries: [{ sprintId: 'ghost', task: task({ id: 5, title: 'x', status: 'backlog' }), at: '2026-11-12T10:00:00.000Z' }] };
        expect(() => validateBoardData(data)).toThrow();
    });
    it('P4 a transition cannot rewrite a closed sprint closure', () => { // RED, needs validateTransition
        // Arrange a document with one closure; mutate closures[0].velocity in `next`;
        // expect(() => validateTransition(previous, next, 'edit')).toThrow();
    });
});

describe('relations', () => {
    it('R1 a blocks cycle is rejected at the command and at the file', () => {
        const data = project(task({ id: 1, title: 'a', status: 'backlog' }), task({ id: 2, title: 'b', status: 'backlog' }));
        setTaskRelation(data, 1, 2, 'blocks');
        expect(() => setTaskRelation(data, 2, 1, 'blocks', true)).not.toThrow(); // replace is allowed
        data.extensions.taskRelations!.relations.push({ sourceId: 1, targetId: 2, kind: 'blocks' });
        expect(() => validateBoardData(data)).toThrow(/duplicate|circular/);
    });
    it('R2 a non-canonical related pair is rejected or canonicalized', () => { // RED
        const data = project(task({ id: 1, title: 'a', status: 'backlog' }), task({ id: 2, title: 'b', status: 'backlog' }));
        data.extensions.taskRelations = { version: 1, relations: [{ sourceId: 2, targetId: 1, kind: 'related' }] };
        expect(() => validateBoardData(data)).toThrow();
    });
    it('R4 a responsible person who is not an assignee is rejected', () => {
        const data = project(task({ id: 1, title: 'a', status: 'backlog' }));
        Object.assign(data.board.tasks[0], { responsible: 'Ana', responsibleId: 'm1' });
        expect(() => validateBoardData(data)).toThrow();
    });
    it('R6 an orphan or inverted planner block is rejected, not dropped', () => { // RED
        const data = project();
        data.extensions.dayPlanner = { version: 1, blocks: [{ id: 'b', taskId: 99, date: '2026-11-12', start: '09:00', end: '08:00' }] };
        expect(() => validateBoardData(data)).toThrow();
    });
});

describe('workflow', () => {
    it('W1 removing the only completed state is rejected', () => {
        const data = project();
        const workflow = cloneSerializable(data.extensions.workflow!);
        workflow.states = workflow.states.filter((s) => s.category !== 'completed');
        data.extensions.workflow = workflow;
        expect(() => validateBoardData(data)).toThrow();
    });
    it('W2 an unknown status is rejected by validation and not coerced by serialize', () => { // holds today
        const data = project(task({ id: 1, title: 'a', status: 'backlog' }));
        data.board.tasks[0].status = 'nonexistent';
        expect(() => validateBoardData(data)).toThrow(/status/);
        expect(() => validateBoardData(serializeBoardDataFromObject(data))).toThrow(/status/);
    });
});
```

Command and persistence tests (these use the existing harness in
`tests/support/portfolio.ts` and `tests/unit/portfolioMutations.test.ts`):

| Invariant | Test idea |
|---|---|
| C4/G2 | Run `runPortfolioBoardMutation` with a mutator that leaves a `related` pair non-canonical, or adds an unknown tag. Expect `false` from the mutation, an unchanged store, and **no** IndexedDB recovery write (stub `saveProjectRecovery`). RED today. |
| C5/G3 | Seed `listProjectRecovery` with a draft whose `local` has a duplicate task id. `restoreProjectRecovery` must return `false` and leave the store untouched. RED today. |
| W3/G8 | `runPortfolioBoardMutation(board, (d) => { d.board.tasks[0].status = 'done'; return true; })` from `backlog` (no `backlog → done` transition). Expect rejection unless the cause is declared. RED today. |
| A1 via L4 | `movePortfolioTaskToStatus` on a Story into `done` with the prompt stubbed to `null`. The status must stay unchanged. Holds today. |
| A3 | Local: a completed Story with acceptance. External: changed `acceptanceCriteria`. The merged result must clear `acceptance` or raise a conflict. RED today. |
| G6 | Two `createProjectTransferActions` instances (simulating two tabs) sharing one `withProjectIdentityLock` stub start `transferPortfolioTask` on the same item at once. Exactly one completes; the other gets `TransferError('stale')`. RED today. |
| C2 | Already covered by `projectSaveState.test.ts`; add a case where the external revision equals the base revision but the content differs. It must raise a `regression` conflict and not merge silently. |
| P6 | `deleteRoadmapEntity('sprints', id)` where the Sprint becomes Active between the confirmation and the mutator. It must throw `roadmap.impactChanged`. Holds today. |

## 6. Suggested order

1. G1 (data loss) and its test.
2. G2: validate before `commitState`. This is cheap, contained, and turns every
   §2 rule into an in-session guarantee.
3. Add P1, P5, A1, A2 and R2 to `validateBoardData`. Run the example project and the
   fixtures in `tests/fixtures` first; legacy files may hold violations, which
   then need a migration that fixes them on open and records an event.
4. `validateTransition` at the four boundaries (G5, P4, A3, W3).
5. G3, G6, G7.
