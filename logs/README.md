# Audit + Logs Monitor

A minimalist single-file monitoring app built with plain HTML, CSS, and JavaScript (`logs.html`).

## What it does

- Unifies logs and audit events into traces grouped by Request ID.
- Search across request IDs, users, messages, tables, and payload fields with highlighting.
- Filter by scope (`All events`, `Logs only`, `Audits only`, `Errors only`).
- Filter by time range (`Last 24h`, `Last 7d`, `Last 30d`, `All time`).
- Show trace-level severity, log/audit counts, and active filter summary pills.
- Inspect a selected trace in a unified timestamp-ordered timeline.
- Expand event cards to view log metadata and audit before/after field diffs.

## Data and persistence

- The page uses an in-file dummy data source (`makeDummyData`) to simulate logs and audits.
- UI state is persisted in `localStorage` (`monitor_state_v1`):
  - search query
  - scope
  - range
  - selected Request ID

## Run

Open `logs.html` directly in a modern browser.
