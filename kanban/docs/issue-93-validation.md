# Issue 93 — Radix UI, Zod and WCAG 2.2 AA

Branch: `codex/issue-93-radix-zod-accessibility` · Milestone: Release 1.

## Implementation

Menus use Radix Dropdown Menu; filters, columns, table perspectives, Sprint actions, project selection and app settings use Radix Popover. Radix handles positioning, viewport collisions, scroll/resize updates, outside interaction, Escape and focus restoration. The handwritten positioning/disclosure hooks were removed. Product expansion remains stable when reopening the picker. Actions that open another dialog run after the menu closes, with the originating trigger focused first so cancellation returns to a live control. The Dialog dependency is aligned with Popover/Dropdown Menu to share their focus and dismissable-layer contexts.

Zod schemas validate workitems, Project Control records, attachments and patch operations. File and patch types are inferred from schemas. Shared primitives validate records, timestamps, positive safe integers and unique IDs. Loose file entities preserve unknown extension fields; patch operations reject unknown fields. Boundary checks do not assign parsed output back to the input, coerce values or mutate files. Existing domain parsers still own relational rules, legacy migrations, acceptance, sprint participation and conversion between persisted and runtime data. The field applicability tables remain the source used by the documentation tests.

## Accessibility changes

| Issue | Before | After |
| --- | --- | --- |
| Custom workflow badge text (1.4.3) | `#111111` on `#787878`: 4.27:1; foreground selection measured black but rendered a different colour. | Render the selected black (`#000000`): 4.75:1. Black/white selection meets 4.5:1 for opaque workflow colours. |
| Overdue Project Control text in dark mode (1.4.3) | Hardcoded `#cc3333`: 2.81:1 Modern / 2.87:1 Classic on card backgrounds. | Use the theme's danger/priority colour: 5.63:1 Modern / 5.76:1 Classic. |
| Planned tray cards (1.4.3) | Whole-card opacity reduced metadata to 2.66:1 Classic light and 2.86:1 Classic dark. | Full-opacity text and a dashed border; the explicit planned label remains. Completed/archived blocks likewise retain readable text. |
| Light-theme semantic and muted text (1.4.3) | Medium/low priority colours could be 2.26:1–3.78:1; Modern muted text was 4.26:1 on the secondary surface. | Darker light-theme semantic tokens and muted text; tested against normal card/page/secondary surfaces at ≥4.5:1. |
| Visible keyboard focus (2.4.7, 2.4.11) | Some feature rules removed outlines; native summary controls were omitted from the shared rule. | A final-cascade 2px focus ring covers controls and summaries; inset rings keep selected controls visible inside scrolling surfaces. |
| Board keyboard interaction (2.1.1) | Drag listeners replaced the card's Enter handler; collision detection needed pointer coordinates. | Enter opens details; Space and arrow keys move a card using keyboard collision detection, with the new status persisted. Each horizontal arrow targets the adjacent workflow column; pointer drops outside valid columns remain invalid. |
| Nested menu keyboard navigation (2.1.1, 2.4.3) | Handwritten dismissal/focus listeners and incompatible Radix layer versions could close the dialog underneath. | Shared Radix layers provide arrow navigation; Escape closes only the top menu and restores focus. Subsequent dialogs return to the originating trigger. |
| Icon names and lock semantics (2.5.3, 4.1.2) | Participant/tag removal labels omitted the target; lock spans used unsupported `aria-label`; planner labels differed from visible text. | Contextual removal labels, named lock images and planner names that include their visible text. Existing icon-only button labels are retained and audited. |
| Planner remove control (2.1.1, 4.1.2) | Remove was excluded from Tab order and nested inside a button role. | Remove is a separately labelled sibling button, reachable from the focused block, with a visible focus ring and a 24px target. |
| Reduced motion (2.3.3 preference support) | Only selected CSS effects respected the preference; explicit JavaScript smooth scrolling remained. | All CSS animations/transitions stop under reduced motion, including inline drag transitions; keyboard sensors use instant scrolling. Saving retains a static dotted indicator and text. |

Ratios are rounded to two decimals. Inactive disabled controls are exempt from the text-contrast criterion. The 4.5:1 target is applied to the tested normal text, including small badges and metadata.

## Verification

`tests/e2e/accessibility.test.ts` audits the empty state, project picker, Board, Table, filters, columns, Roadmap, Day Planner, Calendar, Project Control, Dashboard, task detail and its tabs, task editor, command palette, app settings and documentation in Classic/Modern × Light/Dark. Axe runs the WCAG 2 A/AA, 2.1 A/AA and 2.2 AA rules without disabling rules. Additional browser tests cover card activation, keyboard dragging and persistence, nested menu Escape, contextual icon labels, focus rings and reduced-motion drag transitions.

Final checks: ESLint and TypeScript pass; 1,721 unit tests pass in 77 files. The general browser/visual run passes 802 scenarios. The two full historical-example scenarios pass separately (including the June/October Dashboard), giving 804 unique browser/visual scenarios verified. The affected Board/menu/planning suite passes 57 scenarios, and keyboard dragging passes ten consecutive repetitions.

Existing suites exercise pointer/touch drag boundaries, narrow layouts, filters, column ordering/visibility, permissions, historical views, transfers, dialogs, themes, project import/save/reopen, patches and legacy data. Visual references are updated only for the reviewed appearance changes. Both the normal web build and the standalone HTML are regenerated.

This is an automated and keyboard-focused pass in Chromium, with visual inspection of representative screenshots. It does not replace a complete assistive-technology review across browsers.

## Performance and bundle tradeoff

The OPFS benchmark uses isolated Chromium profiles and the unchanged benchmark script against the base commit and this branch. Each row is a median of seven measured iterations after warm-up; timings are local observations, not guarantees. The large scenario contains 1,000 workitems and 100 control records.

| Scenario | Open before / after (ms) | Save before / after (ms) |
| --- | --- | --- |
| Control | 5.4 / 5.4 | 13.2 / 13.6 |
| Sprints | 5.4 / 6.2 | 11.1 / 12.9 |
| Attachments | 4.1 / 4.4 | 8.4 / 10.3 |
| 10,000 history events | 3.8 / 4.8 | 36.3 / 41.6 |
| Large | 23.1 / 28.1 | 35.7 / 38.4 |

Patch validation of 1,000 and 5,000 workitems measured 3.4 → 4.1ms and 11.7 → 17.1ms respectively. Zod adds validation overhead; historical payloads remain lazy and the no-history-copy mutation path remains intact. The JS/CSS production assets increase from 1,482,172 to 1,630,332 bytes, or 404,194 to 449,673 bytes with gzip (about +44.5 KiB compressed). Axe is a development dependency and is excluded from production. Final suite totals are recorded in the PR.
