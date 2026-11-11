# Project folder format (v1)

```text
<project>/
├── project.json          # current state, rewritten on every save, always read on open
├── history.json          # append-only; envelope checked on open, events loaded on demand
├── attachments/<sha256>  # binaries named by content hash
└── backup/schema-6/      # only exists after converting an older folder
```

The translation lives in `src/domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts`; entity types and their validation are in `projectFileSchema.ts`. The UI and commands keep using the in-memory `BoardData` model; nothing else reads these shapes.

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

`board`, columns and per-block versions are not stored. Columns derive from the technical workflow.

### Naming

The file speaks the product's language: workitems, the project, Project Control. The runtime keeps its older names (`board.tasks`, `task.*` events), and the mapping in `projectFormat.ts` and `projectHistoryFormat.ts` is the only place both meet.

- References to a workitem are `workitemId` (relations, external entries, day planner blocks, comment subjects, transfers) and `workitemKey` (Sprint credits, the incarnation key replayed from history).
- `type` is a classification the user chooses: a workitem's `type` (`epic`, `story`, `task`, `bug`) and a Project Control record's `type` (`risk`, `decision`, `deliverable`).
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

A Task under a Story or Bug is not a planning unit. Reading rejects a field of another type.

Project Control records keep the common fields (`id`, `type`, `title`, `description`, `status`, `ownerId`, `assigneeIds`, `tags`, `related`, `dueDate`, `createdAt`, `updatedAt`) plus those of their type:

| Field | risk | decision | deliverable |
|---|---|---|---|
| `probability`, `impact`, `mitigationPlan`, `contingencyPlan`, `materializedDate`, `actualImpact` | ✓ | | |
| `decisionMaker`, `decisionDate`, `rationale` | | ✓ | |
| `validator`, `deliveredDate`, `acceptedDate` | | | ✓ |

Reading rejects a record with a field of another type, or without a field of its own type.

Both tables are generated from `WORKITEM_FIELD_TYPES` and `CONTROL_TYPE_FIELDS` in `src/domain/projectFileSchema.ts`, which also drive writing and validation; a unit test fails when this document and the code disagree.

- Assignments reference members by ID. Free-text names from older files become `legacy-member_<name>` members.
- `null` means an unset date, reference, `priority` or `effort`; `[]` an empty applicable list; omission means the field does not apply.
- `phaseId`/`milestoneId` exist only with mode `explicit`; `blockerReason` only when `blocked` is true.
- Attachments store `sha256` instead of a path; the file is `attachments/<sha256>`.
- Closed Sprints keep their frozen workitems once, in `closures[].workitems`, as they were at closure; open Sprints keep theirs in `sprintParticipation[].workitem`. Frozen rows use the same v1 workitem shape as `workitems`, with `assigneeIds`/`responsibleId` and explicit planning modes. Each closure or participation entry carries `members` (`id`, `name`) as they were at that moment, so renames and removed members never change a closed Sprint. Closure workflows carry no internal version.
- `sequences.sprints` holds only `lastNumber`; the numbers given to each Sprint are in `system.sprintNumbers`.

## history.json

One entry per line. Root keys are always in this order, and `transactions` stays last because saves rewrite only the closing bytes.

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

An event has `id`, `at`, `kind`, `entityType`, `entityId`, `summary`, optional `meta`, and at most these payloads. Kinds are `workitem.*`, `control.*` and `project.*` (for example `project.details.updated`, `project.restored`); `entityType` is `workitem` or `project`, and `meta.workitemIds` lists the workitems a bulk event touched.

| Payload | Meaning |
|---|---|
| `changes` | Field-level `before`/`after` of one workitem or setting |
| `workitem` | The workitem of `workitem.created` / `workitem.deleted`, as it was |
| `patch` | Forward-only operations for a project-level change |
| `checkpoint` | The whole project, without `comments` and `system` |

`patch` operations are `upsert` / `remove` / `order` on identified collections and `set` on blocks. Paths, operation fields, identities and entity payloads are validated at the history boundary. Bulk replay indexes each changed collection once, preserving explicit ordering and earlier states.

A checkpoint is written at the baseline, at `project.restored`, `project.reconciled` and `project.converted`, and on a `patch` event whenever the UTF-8 bytes of the patches written since the last checkpoint, including that event's, reach the size of that checkpoint. Checkpoints therefore cost at most about as much as the patches between them.

Field-level events (`changes`, `workitem`) never count towards that budget and never trigger a checkpoint, so a long run of single-workitem edits adds none. When a checkpoint falls on an event that has its own `workitem` or `changes`, both are kept, so lifecycle and history evidence remains available.

Reconstruction of a past moment starts at the nearest earlier checkpoint and replays forward. A checkpoint taken before projects had members carries `project.derived: true`, so replay keeps deriving members as older files always did. Histories that have not been converted keep their original snapshot replay.

Project Control comment bodies remain once in `comments`, including comments whose record was removed by a restore. A retained control comment outside the current record's membership has `subject.current: false`. `meta.controlRefs` records newly published comment/history IDs; baseline, restore and reconciliation use `meta.controlRefsReset` to preserve the proven visible membership. Historical consultation uses canonical sequence positions, including equal or out-of-order timestamps. Canonical record histories remain in `recordHistory.control`, including records outside the current roster. The runtime catalogs are omitted from persisted checkpoints.

Historical views take canonical comments, record history, sequences and transfers from their catalogs, limited to what existed at the selected event position; a restore keeps every transfer. Sequences in `system` are the only source of numbers; history is never scanned for them.

## Detection

| project.json | history.json | Action |
|---|---|---|
| v1 (`schemaVersion: 1`, `workitems` array, no `board`) | v1 | Open |
| Has `board` | Has `timeline` | Convert |
| Has `board` | v1, with `backup/schema-6/` | Resume the conversion from the backup |
| Anything else | | Reject without changing files |

The conversion copies both files to `backup/schema-6/`, verifies the copies, writes `history.json`, and writes `project.json` last. Attachments are not touched. It folds accepted journal transactions into `events`, because their `projectHash` no longer applies to the new text, and appends one `project.converted` event with a checkpoint.


### Checking history.json

- **On open**, only the first 16 KiB and the last 32 bytes are read: the header must be the v1 header for this project and baseline, and the file must end by closing the journal. The cost does not depend on history size.
- **Before the first append of a session**, the whole root structure is scanned in 64 KiB chunks without building events in memory. It must contain exactly the six v1 keys, once each, with `transactions` last, because an append trusts that the last array is the journal. The result is reused while the file size and modification time are unchanged; identity is reread on every save.
- **When history is loaded** for the timeline or a restore, the file is parsed in full and must again have exactly the v1 root keys in order.

A file with extra root keys after a large array therefore opens, but cannot be appended to or loaded.

### Folding the journal

When history is loaded and the journal holds two or more stages, the committed ones are folded into `events` and `recordHistory`, and the journal is rewritten with only the last stage, emptied, and its commit. This happens only when the last stage is the one this session knows to be committed and `project.json` matches its hash, and only if the project lock is free; otherwise the file is left as it is and read unchanged. The folded file is reread and compared before it is used.

Conversion uses the same project-identity lock as saves and watchers, rereads inputs under the lock, checks both live files before replacement, and never overwrites a verified backup. It recovers canonical control bodies from legacy snapshots and preserves proven permanent identities despite historical project-title changes. New folders establish their baseline before writing either file.

## Measurements

See [PROJECT_FORMAT_BENCHMARKS.md](PROJECT_FORMAT_BENCHMARKS.md) for sizes and timings of five synthetic workloads, including a 1,000-workitem project.
