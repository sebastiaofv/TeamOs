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
