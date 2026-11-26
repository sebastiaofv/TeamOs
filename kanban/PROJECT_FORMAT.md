# Project folder format (v1)

```text
<project>/
├── project.json          # current state, rewritten on every save, always read on open
├── history.json          # append-only; envelope checked on open, events loaded on demand
├── attachments/<sha256>  # binaries named by content hash
└── backup/schema-6/      # only exists after converting an older folder
```

The translation is in `src/domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts`. The entity types and their validation are in `projectFileSchema.ts`. The UI and commands continue to use the in-memory `BoardData` model. No other code reads these shapes.

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
| `views` | `board.hiddenStateIds.{technical,functional}`, not written if you did not set it |
| `system` | `sequences.{workitems,sprints,controlRecords}`, `sprintNumbers`, `storage`, `transfers` |
| `extensions` | Unknown keys only, not written when empty |

The file does not store `board`, columns or per-block versions. The code calculates columns from the technical workflow.

### Naming

The file uses the language of the product: workitems, the project and Project Control. The runtime keeps its previous names (`board.tasks`, `task.*` events). The mapping in `projectFormat.ts` and `projectHistoryFormat.ts` is the only location that connects the two sets of names.

- References to a workitem are `workitemId` and `workitemKey`. Relations, external entries, day planner blocks, comment subjects and transfers use `workitemId`. `workitemKey` is for Sprint credits and for the incarnation key that replay gets from history.
- `type` is a classification that the user selects. A workitem has a `type` (`epic`, `story`, `task`, `bug`). A Project Control record has a `type` (`risk`, `decision`, `deliverable`).
- `kind` is a technical discriminator. Events, relations, attachments, comment subjects and journal entries use `kind`.

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

A Task in a Story or Bug is not a planning unit. When the code reads a workitem, it rejects a field of a different type.

All Project Control records keep these fields: `id`, `type`, `title`, `description`, `status`, `ownerId`, `assigneeIds`, `tags`, `related`, `dueDate`, `createdAt` and `updatedAt`, plus optional `attachments` (using the same `sha256` attachment entries as workitems). They also keep the fields of their type:

| Field | risk | decision | deliverable |
|---|---|---|---|
| `probability`, `impact`, `mitigationPlan`, `contingencyPlan`, `materializedDate`, `actualImpact` | ✓ | | |
| `decisionMaker`, `decisionDate`, `rationale` | | ✓ | |
| `validator`, `deliveredDate`, `acceptedDate` | | | ✓ |

When the code reads a record, it rejects the record if it has a field of a different type. It also rejects the record if a field of its type is missing.

The two tables come from `WORKITEM_FIELD_TYPES` and `CONTROL_TYPE_FIELDS` in `src/domain/projectFileSchema.ts`. These values also control the write operations and validation. If this document and the code do not agree, a unit test shows an error.

- Assignments refer to members by ID. Free-text names from files of previous versions become `legacy-member_<name>` members.
- `null` shows that a date, reference, `priority` or `effort` has no value. `[]` shows an empty applicable list. If the file does not contain a field, that field does not apply.
- `phaseId`/`milestoneId` are in the file only with mode `explicit`. `blockerReason` is in the file only when `blocked` is true.
- Attachments store `sha256` and not a path. The file is `attachments/<sha256>`.
- Closed Sprints keep their frozen workitems one time, in `closures[].workitems`, as they were at closure. Open Sprints keep their workitems in `sprintParticipation[].workitem`.

  Frozen rows use the same v1 workitem shape as `workitems`. They have `assigneeIds`/`responsibleId` and explicit planning modes. Each closure or participation entry has `members` (`id`, `name`) as they were at that moment. Thus, renames and removed members do not change a closed Sprint. Closure workflows have no internal version.
- `sequences.sprints` holds only `lastNumber`. The numbers that each Sprint gets are in `system.sprintNumbers`.

## history.json

Each line has one entry. The root keys are always in this sequence. `transactions` stays last, because saves rewrite only the bytes at the end.

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

An event has `id`, `at`, `kind`, `entityType`, `entityId`, `summary` and optional `meta`. It can also have these payloads, but no other payloads. Event `kind` values are `workitem.*`, `control.*` and `project.*` (for example `project.details.updated`, `project.restored`). `entityType` is `workitem` or `project`. `meta.workitemIds` gives the workitems that a bulk event changed.

| Payload | Meaning |
|---|---|
| `changes` | Field-level `before`/`after` of one workitem or setting |
| `workitem` | The workitem of `workitem.created` / `workitem.deleted`, as it was |
| `patch` | Forward-only operations for a project-level change |
| `checkpoint` | The full project, without `comments` and `system` |

`patch` operations are `upsert` / `remove` / `order` on identified collections and `set` on blocks. The history boundary validates paths, operation fields, identities and entity payloads. Bulk replay indexes each changed collection one time. It keeps the sequence that `order` operations give, and the previous states.

The code writes a checkpoint at the baseline and at `project.restored`, `project.reconciled` and `project.converted`. On a `patch` event, the code also compares the patch budget with the size of the last checkpoint. If the budget is equal to that size or more than that size, the code writes a checkpoint. The patch budget is the UTF-8 bytes of the patches that the code wrote since that checkpoint. It also includes the patches of that event. Thus, the size of checkpoints is at most approximately the size of the patches between them.

Field-level events (`changes`, `workitem`) do not add to that budget. They do not cause a checkpoint. Thus, a long sequence of edits that each change one workitem adds no checkpoints. A checkpoint can occur on an event that has a `workitem` or `changes` payload. In that condition, the event keeps the checkpoint and that payload. Thus, the lifecycle and history records stay available.

To get the state at a previous moment, the code starts at the last checkpoint before that moment. Then it replays forward. Some checkpoints are from the time before projects had members. These checkpoints have `project.derived: true`. Thus, replay continues to calculate members, as it always did for files of previous versions. Histories that the code did not convert keep their initial snapshot replay.

Project Control comment bodies stay one time in `comments`. This includes the comments of records that a restore removed. A control comment can stay in the file when it is not in the membership of the current record. This comment has `subject.current: false`. `meta.controlRefs` records the new comment/history IDs of the event.

Baseline, restore and reconciliation use `meta.controlRefsReset` to keep the membership that you could see, as the records show it. Historical consultation uses canonical sequence positions. It also uses them for timestamps that are equal or not in sequence. Canonical record histories stay in `recordHistory.control`. This includes records that are not in the current roster. Saved checkpoints do not include the runtime catalogs.

Historical views get canonical comments, record history, sequences and transfers from their catalogs. They get only the items that were there at the selected event position. A restore keeps all transfers. Sequences in `system` are the only source of numbers. The code does not scan history for them.

## Detection

| project.json | history.json | Action |
|---|---|---|
| v1 (`schemaVersion: 1`, `workitems` array, no `board`) | v1 | Open |
| Has `board` | Has `timeline` | Convert |
| Has `board` | v1, with `backup/schema-6/` | Continue the conversion from the backup |
| Other content | | Reject, and do not change files |

The conversion copies the two files to `backup/schema-6/` and makes sure that the copies are correct. Then it writes `history.json`, and it writes `project.json` last. It does not change attachments. It folds accepted journal transactions into `events`, because their `projectHash` does not agree with the new text. It also appends one `project.converted` event with a checkpoint.


### Checking history.json

- **On open**, the code reads only the first 16 KiB and the last 32 bytes. The header must be the v1 header for this project and baseline. The last characters of the file must close the journal. The time for this check does not change with history size.
- **Before the first append of a session**, the code scans the full root structure in 64 KiB chunks. It does not build events in memory. The structure must contain only the six v1 keys, one time each, with `transactions` last. This is because an append operates as if the last array is the journal. The code uses the result again while the file size and modification time do not change. It reads the identity again on each save.
- **When history is loaded** for the timeline or a restore, the code parses the full file. The file must again have only the v1 root keys, in sequence.

Thus, the code opens a file that has more root keys after a large array. But the code cannot append to that file or load it.

### Folding the journal

When history is loaded, the journal can hold two or more stages. In that condition, the code folds the committed stages into `events` and `recordHistory`. It also rewrites the journal with only the last stage, which it empties, and the commit of that stage. This occurs only when this session knows that the last stage is committed. Also, `project.json` must agree with the hash of that stage, and the project lock must be free.

If not, the code does not change the file and reads it as it is. The code reads the folded file again and compares it before it uses it.

Conversion uses the same project-identity lock as saves and watchers. It reads the inputs again while it holds the lock. It examines the two live files before it replaces them. It does not write over a backup that it examined and found correct.

It recovers canonical control bodies from legacy snapshots. It keeps the permanent identities that the data shows to be correct, also when the project title changed in history. New folders set their baseline before they write the first file.

## Measurements

See [PROJECT_FORMAT_BENCHMARKS.md](PROJECT_FORMAT_BENCHMARKS.md) for sizes and timings of five synthetic workloads. One of these workloads is a 1,000-workitem project.
