# Project folder format (v1)

```text
<project>/
├── project.json          # current state, rewritten on every save, always read on open
├── history.json          # append-only; envelope checked on open, events loaded on demand
├── attachments/<sha256>  # binaries named by content hash
└── backup/schema-6/      # only exists after converting an older folder
```

The translation lives in `src/domain/projectFormat.ts`, `projectPatch.ts` and `projectHistoryFormat.ts`. The UI and commands keep using the in-memory `BoardData` model; nothing else reads these shapes.

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
| `system` | `sequences.{workitems,sprints,controlRecords}`, `storage`, `transfers` |
| `extensions` | Unknown keys only, omitted when empty |

`board`, columns and per-block versions are not stored. Columns derive from the technical workflow.

### Field rules

| Field | epic | story | task | bug |
|---|---|---|---|---|
| `objective`, `scope`, `businessValue` | ✓ | | | |
| `acceptanceCriteria` | | ✓ | | |
| `stepsToReproduce`, `expectedResult`, `actualResult`, `environment` | | | | ✓ |
| `parentId`, `effort`, `sprintId`, `pullRequests` | | ✓ | ✓ | ✓ |

Reading rejects a field of another type. Project Control records keep the common fields, including `dueDate`, plus those of their kind: risks `probability`, `impact`, `mitigationPlan`, `contingencyPlan`, `materializedDate`, `actualImpact`; decisions `decisionMaker`, `decisionDate`, `rationale`; deliverables `validator`, `deliveredDate`, `acceptedDate`.

- Assignments reference members by ID. Free-text names from older files become `legacy-member_<name>` members.
- `null` means an unset date, reference, `priority` or `effort`; `[]` an empty applicable list; omission means the field does not apply.
- `phaseId`/`milestoneId` exist only with mode `explicit`; `blockerReason` only when `blocked` is true.
- Attachments store `sha256` instead of a path; the file is `attachments/<sha256>`.
- Closed Sprints keep their frozen workitems once, in `closures[].tasks`, as they were at closure (names included).

## history.json

One entry per line. `transactions` stays last because saves rewrite only the closing bytes.

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

An event has `id`, `at`, `kind`, `entityType`, `entityId`, `summary`, optional `meta`, and at most these payloads:

| Payload | Meaning |
|---|---|
| `changes` | Field-level `before`/`after` of one workitem or setting |
| `task` | The workitem of `task.created` / `task.deleted`, as it was |
| `patch` | Forward-only operations for a board-level change |
| `checkpoint` | The whole project, without `comments` and `system` |

`patch` operations are `upsert` / `remove` / `order` on identified collections and `set` on blocks. Paths, operation fields, identities and entity payloads are validated at the history boundary. Bulk replay indexes each changed collection once, preserving explicit ordering and earlier states.

Checkpoints are written at the baseline, `board.restored`, `board.reconciled`, and whenever the accumulated UTF-8 event bytes, including the incoming event, reach the previous checkpoint size. A checkpoint taken before projects had members carries `project.derived: true`, so replay keeps deriving members as older files always did.

Volume checkpoints cover ordinary workitem events as well as board and Sprint events. A checkpoint can accompany a task/changes payload so lifecycle and history evidence remains available. Random-access reconstruction starts at the nearest complete checkpoint; partial legacy column snapshots retain their original replay behavior.

Project Control comment bodies remain once in `comments`, including comments whose record was removed by a restore. A retained control comment outside the current record's membership has `subject.current: false`. `meta.controlRefs` records newly published comment/history IDs; baseline, restore and reconciliation use `meta.controlRefsReset` to preserve the proven visible membership. Historical consultation uses canonical sequence positions, including equal or out-of-order timestamps. Canonical record histories remain in `recordHistory.control`, including records outside the current roster. The runtime catalogs are omitted from persisted checkpoints.

Historical views take canonical comments, record history, sequences and transfers from their catalogs, limited to what existed at the selected event position. Sequences in `system` are the only source of numbers; history is never scanned for them.

## Detection

| project.json | history.json | Action |
|---|---|---|
| v1 (`schemaVersion: 1`, `workitems` array, no `board`) | v1 | Open |
| Has `board` | Has `timeline` | Convert |
| Has `board` | v1, with `backup/schema-6/` | Resume the conversion from the backup |
| Anything else | | Reject without changing files |

The conversion copies both files to `backup/schema-6/`, verifies the copies, writes `history.json`, and writes `project.json` last. Attachments are not touched. It folds accepted journal transactions into `events`, because their `projectHash` no longer applies to the new text.


Opening scans the full root structure in bounded 64 KiB chunks to reject ambiguous or duplicate envelope fields wherever they occur. It does not allocate/normalize events, record histories, or attachments; those contents load on consultation. Normal writes reuse the verified structure while file size/mtime match, reread canonical identity fields, and retain that verification across app-controlled appends. This structural scan adds open-time work proportional to history bytes, avoiding full event deserialization and the unsafe prefix-only shortcut.

Conversion uses the same project-identity lock as saves and watchers, rereads inputs under the lock, checks both live files before replacement, and never overwrites a verified backup. It recovers canonical control bodies from legacy snapshots and preserves proven permanent identities despite historical project-title changes. New folders establish their baseline before writing either file. The first v1 writer could leave a blank history header with its actual baseline in a transaction; opening such a folder verifies the full recovered journal and repairs that header once under the project lock. A mismatched baseline is rejected without writes.

Reproducible persistence timings and memory observations are recorded in [PROJECT_FORMAT_BENCHMARKS.md](PROJECT_FORMAT_BENCHMARKS.md); run `npm run bench:project-files` to repeat them.
