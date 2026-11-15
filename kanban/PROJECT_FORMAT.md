# Project folder format (v1)

```text
<project>/
├── project.json          # current state, rewritten on every save, always read on open
├── history.json          # append-only; envelope checked on open, events loaded on demand
├── attachments/<sha256>  # binaries named by content hash
└── backup/schema-6/      # only exists after converting an older folder
```

The translation is in `src/domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts`. The entity types and their validation are in `projectFileSchema.ts`. The UI and commands continue to use the in-memory `BoardData` model. Nothing else reads these shapes.

## project.json

| Key | Content |
|---|---|
| `meta` | Envelope only: `schemaVersion: 1`, `appId`, `revision`, `createdAt`, `updatedAt` |
| `project` | `id`, `title`, `acronym`, `productName`, `description`, `status`, `members`, `tags` |
| `workflow` | `technical`, `functional` (always written), `types`, `automation.{hierarchy,transitions}` |
| `workitems` | See field rules below |
| `relations` | `edges: [{ source, target, kind }]` by `permanentId`; `external` holds workitems of other projects |
| `roadmap` | `milestones`, `phases`, `sprints`, `sprintResults.{credits,closures}`, `sprintParticipation` (open Sprints only) |
| `dayPlanner` | `blocks` |
| `projectControl` | `records` |
| `comments` | Workitem and Project Control comments, each with a `subject` |
| `views` | `board.hiddenStateIds.{technical,functional}`, omitted when never set |
| `system` | `sequences.{workitems,sprints,controlRecords}`, `sprintNumbers`, `storage`, `transfers` |
| `extensions` | Unknown keys only, omitted when empty |

The file does not store `board`, columns or per-block versions. The code derives columns from the technical workflow.

### Naming

The file uses the language of the product: workitems, the project and Project Control. The runtime keeps its older names (`board.tasks`, `task.*` events). The mapping in `projectFormat.ts` and `projectHistoryFormat.ts` is the only location where the two sets of names meet.

- References to a workitem are `workitemId` and `workitemKey`. Relations, external entries, day planner blocks, comment subjects and transfers use `workitemId`. `workitemKey` is for Sprint credits and for the incarnation key that replay gets from history.
- `type` is a classification that the user selects. A workitem has a `type` (`epic`, `story`, `task`, `bug`). A Project Control record has a `type` (`risk`, `decision`, `deliverable`).
- `kind` is a technical discriminator: event kinds, relation kinds, attachment kinds, comment subjects and journal entries.

### Field rules

| Field | epic | story | task | bug |
|---|---|---|---|---|
| `objective`, `scope`, `businessValue` | ✓ | | | |
| `acceptanceCriteria` | | ✓ | | |
| `stepsToReproduce`, `expectedResult`, `actualResult`, `environment` | | | | ✓ |
| `severity` | | | | ✓ |
| `parentId`, `effort`, `sprintId`, `pullRequests`, `sprintHistory` | | ✓ | ✓ | ✓ |
| `storyPoints` | | ✓ | ✓ (planning unit only) | ✓ |
| `acceptance` | | ✓ | | ✓ |

A Task under a Story or Bug is not a planning unit. When the code reads a workitem, it rejects a field of another type.

Project Control records keep these common fields: `id`, `type`, `title`, `description`, `status`, `ownerId`, `assigneeIds`, `tags`, `related`, `dueDate`, `createdAt` and `updatedAt`. They also keep the fields of their type:

| Field | risk | decision | deliverable |
|---|---|---|---|
| `probability`, `impact`, `mitigationPlan`, `contingencyPlan`, `materializedDate`, `actualImpact` | ✓ | | |
| `decisionMaker`, `decisionDate`, `rationale` | | ✓ | |
| `validator`, `deliveredDate`, `acceptedDate` | | | ✓ |

When the code reads a record, it rejects the record if it has a field of another type. It also rejects the record if a field of its own type is not there.

Both tables come from `WORKITEM_FIELD_TYPES` and `CONTROL_TYPE_FIELDS` in `src/domain/projectFileSchema.ts`. These values also control writing and validation. A unit test fails when this document and the code do not agree.

- Assignments refer to members by ID. Free-text names from older files become `legacy-member_<name>` members.
- `null` means a date, reference, `priority` or `effort` that has no value. `[]` means an empty applicable list. If the file omits a field, that field does not apply.
- `phaseId`/`milestoneId` exist only with mode `explicit`. `blockerReason` exists only when `blocked` is true.
- Attachments store `sha256` instead of a path. The file is `attachments/<sha256>`.
- Closed Sprints keep their frozen workitems one time, in `closures[].workitems`, as they were at closure. Open Sprints keep their workitems in `sprintParticipation[].workitem`. Frozen rows use the same v1 workitem shape as `workitems`. They have `assigneeIds`/`responsibleId` and explicit planning modes. Each closure or participation entry has `members` (`id`, `name`) as they were at that moment. Thus, renames and removed members never change a closed Sprint. Closure workflows have no internal version.
- `sequences.sprints` holds only `lastNumber`. The numbers that each Sprint gets are in `system.sprintNumbers`.

## history.json

Each line has one entry. The root keys are always in this order. `transactions` stays last because saves rewrite only the closing bytes.

```text
{"schemaVersion":1,"projectId":"…","baselineEventId":"…",
"events":[
{…},
{…}
],
"recordHistory":{"control":{"<recordId>":[…]},"transfers":{"<transferId>":[…]}},
"transactions":[
{"kind":"stage","id":"…","projectHash":"…","events":[…],"recordHistory":{…}},
{"kind":"commit","id":"…"}
]}
```

An event has `id`, `at`, `kind`, `entityType`, `entityId`, `summary`, optional `meta`, and at most these payloads. Kinds are `workitem.*`, `control.*` and `project.*` (for example `project.details.updated`, `project.restored`). `entityType` is `workitem` or `project`. `meta.workitemIds` lists the workitems that a bulk event affected.

| Payload | Meaning |
|---|---|
| `changes` | Field-level `before`/`after` of one workitem or setting |
| `workitem` | The workitem of `workitem.created` / `workitem.deleted`, as it was |
| `patch` | Forward-only operations for a project-level change |
| `checkpoint` | The whole project, without `comments` and `system` |

`patch` operations are `upsert` / `remove` / `order` on identified collections and `set` on blocks. The history boundary validates paths, operation fields, identities and entity payloads. Bulk replay indexes each changed collection one time. It keeps the explicit order and the earlier states.

The code writes a checkpoint at the baseline and at `project.restored`, `project.reconciled` and `project.converted`. It also writes a checkpoint on a `patch` event when the patch budget reaches the size of the last checkpoint. The patch budget is the UTF-8 bytes of the patches written since that checkpoint. It also counts the patches of that event. Thus, checkpoints cost at most about as much as the patches between them.

Field-level events (`changes`, `workitem`) never count towards that budget. They never cause a checkpoint. Thus, a long series of single-workitem edits adds no checkpoints. A checkpoint can occur on an event that has its own `workitem` or `changes`. In that condition, the event keeps the checkpoint and that payload. Thus, the lifecycle and history evidence stays available.

To reconstruct a past moment, the code starts at the nearest earlier checkpoint and replays forward. A checkpoint from before projects had members has `project.derived: true`. Thus, replay continues to derive members, in the same way as for older files. Histories that the code did not convert keep their original snapshot replay.

Project Control comment bodies stay one time in `comments`. This includes comments whose record a restore removed. A control comment that the file keeps outside the membership of the current record has `subject.current: false`. `meta.controlRefs` records the new comment/history IDs that the event publishes. Baseline, restore and reconciliation use `meta.controlRefsReset` to keep the proven visible membership. Historical consultation uses canonical sequence positions, also for equal or out-of-order timestamps. Canonical record histories stay in `recordHistory.control`. This includes records outside the current roster. Persisted checkpoints do not include the runtime catalogs.

Historical views take canonical comments, record history, sequences and transfers from their catalogs. They take only the items that existed at the selected event position. A restore keeps every transfer. Sequences in `system` are the only source of numbers. The code never scans history for them.

## Detection

| project.json | history.json | Action |
|---|---|---|
| v1 (`schemaVersion: 1`, `workitems` array, no `board`) | v1 | Open |
| Has `board` | Has `timeline` | Convert |
| Has `board` | v1, with `backup/schema-6/` | Resume the conversion from the backup |
| Anything else | | Reject, and do not change files |

The conversion copies both files to `backup/schema-6/` and verifies the copies. Then it writes `history.json`, and it writes `project.json` last. It does not touch attachments. It folds accepted journal transactions into `events` because their `projectHash` no longer applies to the new text. It also appends one `project.converted` event with a checkpoint.


### Checking history.json

- **On open**, the code reads only the first 16 KiB and the last 32 bytes. The header must be the v1 header for this project and baseline. The file must end with the close of the journal. The cost does not depend on history size.
- **Before the first append of a session**, the code scans the full root structure in 64 KiB chunks. It does not build events in memory. The structure must contain exactly the six v1 keys, one time each, with `transactions` last. This is because an append trusts that the last array is the journal. The code uses the result again while the file size and modification time do not change. It reads the identity again on every save.
- **When history is loaded** for the timeline or a restore, the code parses the full file. The file must again have exactly the v1 root keys in order.

Thus, the code opens a file that has extra root keys after a large array. But the code cannot append to that file or load it.

### Folding the journal

When history is loaded, the journal can hold two or more stages. In that condition, the code folds the committed stages into `events` and `recordHistory`. It also rewrites the journal with only the last stage, which it empties, and its commit. This occurs only when this session knows that the last stage is committed. Also, `project.json` must agree with the hash of that stage, and the project lock must be free. If not, the code does not change the file and reads it as it is. The code reads the folded file again and compares it before it uses it.

Conversion uses the same project-identity lock as saves and watchers. It reads the inputs again under the lock. It checks both live files before replacement. It never overwrites a verified backup. It recovers canonical control bodies from legacy snapshots. It keeps proven permanent identities, also when the project title changed in history. New folders set their baseline before they write either file.

## Measurements

See [PROJECT_FORMAT_BENCHMARKS.md](PROJECT_FORMAT_BENCHMARKS.md) for sizes and timings of five synthetic workloads. One of these workloads is a 1,000-workitem project.
