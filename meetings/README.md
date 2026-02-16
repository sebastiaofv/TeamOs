# Meeting Notes

A minimalist single-file meeting notes viewer built with plain HTML, CSS, and JavaScript (`meetings.html`).

## What it does

- Load and browse meeting JSON files (default files in `data/meetings`).
- Expand/collapse meeting cards to inspect attendees, agenda, summary, decisions, transcription, actions, risks, attachments, and next meeting details.
- Search across meeting content with text highlighting.
- Sort meetings by date, title, or action-item count.
- Filter to meetings with pending actions only.
- Track action-item completion with progress bars and overdue indicators.
- Export loaded meetings to a Markdown file.

## Data and persistence

- Meeting data is loaded from JSON files.
- If opened via `file://`, the app shows a fallback loader so you can upload one or more JSON files manually.
- Action-item completion state is persisted in `localStorage` (`meetingNotesCompleted`).

## File format

- Meeting files: `*.json`
- Each file must contain a single meeting object (not an array).

## Example files

- `data/meetings/01-q1-engineering-planning.json`
- `data/meetings/02-api-design-review-payments.json`
- `data/meetings/03-incident-review-database-outage.json`

## Run

- For bundled sample data, serve the folder over HTTP and open `meetings.html`.
- Or open `meetings.html` directly and upload JSON files when prompted.
