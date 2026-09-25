# Command palette — design

Date: 2026-09-26
Status: approved (mockup `command-palette-mockup.html`, v1 + v2 together)

## Opening

- `⌘K` / `Ctrl+K` (works even with single-key shortcuts off), `/`, and a click
  on the toolbar search box open the palette. `Esc` closes it.
- The toolbar search box becomes a button that shows the active board text
  filter (or the placeholder) with an `×` to clear it.

## What it finds (empty query shows context + recent)

| Section | Content | Enter |
| --- | --- | --- |
| Filter | `Filter board by "<query>"` (always first when there is a query) | sets the board text filter |
| Tasks | title, `#id`, `#tag`, assignee, project name; archived excluded | opens task details |
| Projects | project names | selects the project chip |
| Roadmap | sprints, milestones, phases | opens the Roadmap for that project |
| Commands | views, filters, reset, theme, language, shortcuts, help, new/import project, new task | runs it |

- Empty query: actions for the **context task** (open detail, else hovered,
  else selected card), then **Recent** (last 8 items, per browser, localStorage).
- Tab / → on a task opens its actions; Backspace on an empty box goes back.
- Each command shows its keyboard shortcut from the shortcut registry.

## Task actions

Move to <status> (`1`–`4`), Move to… (step), Assign… (step: toggles a person,
keeping other assignees), Set priority… (step), Plan in Day Planner… (step:
today/tomorrow slots), Open details (`Enter`), Edit (`E`), Archive / Restore
(`X`). Read-only or historical tasks only offer Open details.

## Quick create (`+`)

`+ <title> @person !priority #tag ~effort due:<today|tomorrow|mon…sun|YYYY-MM-DD> in:<project>`

- Live preview; unknown person is added as a new assignee (warning shown);
  unknown project falls back to the context/selected/first writable project
  (warning shown). Tokens not recognised stay in the title.
- Created in To Do; undo removes it.

## Plan (`plan <task> [HH[:MM]]`)

Matching tasks; with a time, Enter adds a 1-hour block today at that time;
without, it opens the time step.

## Architecture

`src/features/portfolio/palette/`: pure `paletteText` (scoring, highlight
ranges), `quickCreate` (parser), `paletteModel` (sections and items with
action descriptors), `paletteActions` (runs descriptors against injected
app actions), `recentItems` (localStorage MRU) and the `CommandPalette`
dialog. New task commands: toggle assignee, set priority, quick create, each
with undo and timeline events through the existing mutation path.
