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

## US-06 — Workitem history

- History tab reuses the project timeline, exact task references, related-link
  events and bulk-assignment metadata; no parallel log is introduced.
- Central audit fills gaps from board-level changes without duplicating existing
  field events. Before/after values, local timestamps, categories and pagination.
- Explicitly selected local profiles are stamped as unverified; otherwise author
  remains unidentified. No historical authors or past events are invented.
- Partial-history notice and read-only history; embedded attachment data is not
  rendered as raw JSON. No restore action is attached to item history.

## US-07 — Conversation comments

- Immutable chronological comments in a versioned conversation extension, with
  local author snapshots, plain text, safe links and textual @mentions.
- Clipboard screenshots reuse embedded attachments and existing size/count limits;
  only PNG/JPEG/WebP payloads render as comment images.
- Description stays separate. Timeline stores only comment references, and replay
  resolves the canonical content without duplicating bodies or image payloads.
- Read-only blocks posting; no edit/delete API or remote notifications.

## US-08 — Pull request links

- GitHub PR number with optional repository/HTTPS URL and notes, following the
  written decision that the URL is optional.
- Canonical URL validation checks host, repository and PR number; duplicate links
  rejected within an item. Multiple items may reference the same PR.
- Create/correct/open/unlink in the detail tab, offline persistence and timeline
  events. No network integration, credentials or invented merge state.

## US-16 — Attachments

- Attachment tab reuses the existing embedded-file editor, limits, duplicate
  detection, project-size warnings and shared save/conflict path.
- New executable/HTML/SVG uploads rejected before reading; only raster data URLs
  render as thumbnails. Legacy attachments remain downloadable without unsafe
  previews. Documents use download rather than executable inline rendering.
- Add/remove audited through task timeline; removal requires confirmation.
- Read-only disables attachment management. Tests cover safe legacy preservation,
  unsafe upload rejection, detail upload/save and confirmed removal.

## US-17 — Workitem side panel

- Right-side nonmodal desktop panel; full-screen accessible mobile dialog.
- Shared summary/history/comments/PR/attachment tabs, explicit Edit, next/previous
  navigation scoped to the underlying filtered list, and retained view context.
- Unsaved editor changes require discard confirmation. Read-only/historical
  contexts keep write actions unavailable and historical relationship navigation.
- Stable project+task URL references reopen after loading the matching project;
  missing/deleted tasks are handled without writes.
- Browser acceptance covers navigation, URL state, discard/cancel and mobile
  read-only behavior, alongside existing detail flows.

## US-19 — Date variance

- Project Dashboard date table and baseline/forecast/actual Gantt overlay reuse
  existing phase forecasts. Legacy dates are not fabricated into baselines.
- Explicit plan approval freezes originals; dated, reasoned revisions retain the
  original and can be selected as an alternative comparison reference.
- Actual dates are recorded manually; signed calendar-day variance with N/A for
  missing baselines or actual finishes. Date order validated and metadata replayed.
- Unit tests cover revisions, reopen, negative variance and leap-day arithmetic.

## US-15 — Gantt drilldown

- Expand plan rows into completion, hierarchy, sprint or milestone groupings.
- Direct/inherited association labels, nested Epic/Story/Task/Bug navigation,
  unique leaf metrics and an explicit unassociated-workitems section.
- Archived inclusion is explicit; lists render in 100-item increments.
- Period controls and expansion/grouping remain mounted when opening the shared
  side panel; project-local sprint groupings do not duplicate totals.

## US-09 — Project dashboard

- Selected-project current/historical snapshots with leaf-based execution,
  open/completed/blocked/overdue/unassigned indicators and exact source drilldown.
- Phase/milestone percentages and all overlapping current phases, reusing the
  Gantt/drilldown and US-19 date analysis instead of parallel plan concepts.
- Semantic completion/cancellation and no-denominator N/A share domain rules.
- FTE/risks are unavailable because US-18/20 are unapproved; no workstream model
  is invented in the absence of US-14. Project/session scope is explicit.

## US-10 — Portfolio dashboard

- Aggregates loaded projects across every product, defaulting to explicit Active
  state. State/manager/product/overdue filters and documented ordering.
- Sums eligible/completed workitems rather than averaging project percentages.
- Persistent-ID deduplication; conflicting copies and unavailable/conflicted files
  are explicitly excluded from current totals.
- Project rows open the project dashboard; returning preserves global filters and
  scroll. Coverage and unavailable FTE/risk metrics are explicit.
