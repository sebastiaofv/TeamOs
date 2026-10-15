# Business story delivery

Source: `/Users/sebastiao/Downloads/grilling_user_stories` (15 October 2026).

Branches are stacked, starting from `feat/us-01-workitems-table` at `32c06be`.
Each story commit includes rebuilt `dist/` and `dist-standalone/`.

Execution order: 11 → 12 → 04 → 02 → 05 → 03 → 06 → 07 → 08 → 16 → 17 → 19 → 15 → 09 → 10 → 13.

The package explicitly limits implementation to `APROVADA`. US-01 is already
implemented on the starting branch; its supplied file remains `POR_VALIDAR`.
US-18 and US-20 are also `POR_VALIDAR` and are excluded. US-14 has no file;
product-scoped cross-file features must report their available-session coverage.
Written changes take precedence over accepted suggestions and generic checklists.
In particular: immutable workitem types, one assignee, immutable comments,
optional GitHub PR URLs, and aggregate parent completion.

## US-11 — Project master data

- Additive `extensions.project` v1 migration, preserving the existing root schema.
- Stable persisted project/member IDs, explicit lifecycle, required editable
  metadata, provisional legacy members and imported-data review marker.
- Settings reuse the shared mutation/save/conflict path and block read-only edits.
- Forecast, baseline and actual project dates remain separate; date pairs validated.
- Verification: project migration unit tests and master-data browser acceptance test.

## US-12 — Workitem types

- Epic, User Story, Task and Bug creation; type is immutable after creation.
- Shared Task model with retained type-specific fields and validated hierarchy.
- Epic/Story completion derived bottom-up from children; leaf-only metrics seam.
- Type column and combined filter reuse the existing table and CSV pipeline.
- Tests cover hierarchy, aggregate reopening, immutable types and JSON round trips.

## US-04 — Project workflows

- Versioned workflow extension with immutable IDs, ordered names/colors, semantic
  categories, initial state and explicit transitions.
- Settings support adding, reordering, removing and mapping states in use.
- Board, table filters, palette and all mutation paths use project states; central
  transition validation applies equally to drag/drop, shortcuts and commands.
- Tests cover custom completed categories, transitions, removal mapping and reopen.

## US-02 — Relations and dependencies

- Related creation inherits only phase/milestone and atomically creates the new
  item and its link in the existing project save path.
- Symmetric related links, directional blocking links and project-local hierarchy
  expose both ends with navigation; unlinking retains workitems.
- Cross-project related/blocking links use persistent project IDs within the same
  product and loaded-session coverage. Unloaded references remain visible.
- Derived dependency blocking is separate from manual blocked state.
- Self-links, duplicates, hierarchy errors and blocking cycles rejected.
- US-14 is absent: cross-project hierarchy and transfers require the later
  maintenance increment; no global catalog is assumed.

## US-05 — Project plan and milestones

- Reuses the existing roadmap, phase/milestone/sprint IDs and editors.
- Versioned project-plan extension adds nested phases; only leaf phases accept
  workitems. Creating a child of an occupied phase requires confirmed relocation.
- Phase/milestone clicks expand linked workitems grouped by completion, with
  unique eligible-leaf progress and N/A for an empty denominator.
- Hierarchy/cycle validation and confirmed unlinking protect plan removal.
- Forecast remains in legacy roadmap fields; baseline/actual metadata is separate
  and is completed by the dependent US-19 increment.

## US-03 — Team assignment

- One responsible active project member, identified by stable ID; reassignment
  does not change workflow state and is recorded in the timeline.
- Creation/edit/detail and palette share active-team validation. Local profiles
  support My workitems without representing authentication.
- Inactive references and multi-assignee legacy data are preserved and flagged;
  explicit reassignment retains old names in `legacyAssignees`.
- Existing name-based filters remain compatible; ID-based filtering distinguishes
  directory members. Assignment implies neither capacity nor notifications.
