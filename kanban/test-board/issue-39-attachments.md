# Issue #39 — attachment tab feedback

Scope: [the attachment comment](https://github.com/sebastiaofv/TeamOs/issues/39#issuecomment-6563854950), independently of the issue body.

1. Open a writable project and edit any workitem. Set **Uploaded by** to a local name, add a file and an image, then save.
2. Open its details. Attachments belong to the **Attachments** tab. The table shows upload date, attachment name and uploader; downloads and image thumbnails remain available.
3. Edit again, change the uploader and add another file. Save and reopen: earlier attachments retain their original authors and dates, and the new file uses the new name.
4. Import the saved project again. The same names and dates must survive. Open an older project without uploader metadata: those rows show **Unknown**, including after editing another field and saving.
5. Open a workitem with no files: its Attachments tab shows an empty-state message.
6. Use Left/Right, Home and End in the detail tab bar. All tabs remain reachable and switching tabs preserves unsent comment and Pull Request drafts.
7. Inspect read-only projects and historical timeline positions. Attachments remain downloadable and show only the files and upload metadata present at that position.
8. Repeat in Portuguese, light/dark themes and a narrow window. The table scrolls horizontally inside the dialog when needed.

Uploader names are local attribution, shared with the last-used comment author (Anonymous initially), rather than an authenticated identity. `uploadedBy` is optional for compatibility with existing files. It is recorded only when picking a new attachment; existing authorship is never backfilled.
