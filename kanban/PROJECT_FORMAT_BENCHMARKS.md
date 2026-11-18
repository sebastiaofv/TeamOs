# Project format benchmarks

The measurements are from 2026-11-11, on one development machine. They used headless Chromium with Origin Private File System streams, not simulated streams. The fixtures are synthetic. They are not production data.

Each operation has one warm-up and seven measured samples. Times are **median / p95 in milliseconds**. p95 is the maximum value of the seven samples.

To do the measurements again, run this command from `kanban/`:

```sh
npm run bench:project-files
```

## Workloads

| Workload | Content |
|---|---|
| control | 100 workitems, 50 risks, 100 Project Control edits |
| sprints | 100 workitems, 100 Sprint participation updates |
| attachments | 100 workitems, 20 references to one deduplicated 64 KiB binary |
| long-history | 100 workitems, 10,000 single-field workitem edits |
| large | 1,000 workitems, 100 risks, 50 Project Control edits |

`large` is the project model from issue #68, with more workitems than the other workloads. It has a smaller number of legacy edits than `control`. This is because each legacy edit stores a full snapshot of approximately 0.8 MB. Also, the browser storage quota sets a limit on the fixture.

## Latency

| Workload | Workitems | Open | Save one workitem edit | Save one Project Control edit | Convert legacy folder | Historical jump |
|---|---:|---:|---:|---:|---:|---:|
| control | 100 | 5.7 / 8 | 13.9 / 14.6 | 11.1 / 11.9 | 505.2 / 523.4 | 1.3 / 1.4 |
| sprints | 100 | 4.9 / 5.4 | 9.6 / 10.4 | 9.9 / 10.9 | 172.3 / 178.1 | 0.9 / 0.9 |
| attachments | 100 | 3.9 / 4 | 7.2 / 8.4 | 7.8 / 9.3 | 14.3 / 15.1 | 0.5 / 0.7 |
| long-history | 100 | 3.9 / 4.2 | 34.9 / 41.1 | 15.6 / 15.8 | 77.6 / 79.4 | 3.1 / 3.7 |
| large | 1,000 | 23.9 / 37 | 35.2 / 37.7 | 38.5 / 40.7 | 1086.2 / 1107.9 | 5.2 / 5.6 |

- **Open** reads and validates `project.json`. It also examines the identity of `history.json` in its first and last bytes. In v1, history size does not change its time. `long-history` opens as fast as the small workloads.
- **Save** rewrites `project.json` and appends to `history.json`. Its time increases with project size. It is approximately 35 to 40 ms at 1,000 workitems, and approximately 10 ms at 100.
- A Project Control edit diffs the full project to make its patch. But its time is approximately the same as the time of a workitem edit.
- `long-history` saves more slowly than the other 100-workitem workloads. The primary possible cause is two facts. The benchmark loaded its 10,000 events into memory before the save. Two or more passes in the save path read the loaded history. We are not sure that this is the cause.
- **Convert** is a one-time operation. Its time increases with the legacy history. That history stored a full project for each board-level edit.
- **Historical jump** gets the state at the last event, after the history is loaded. `long-history` has no checkpoint after its baseline, because single-field edits do not cause a checkpoint. Thus, the jump replays all 10,000 events.

## Size

The values are bytes on disk after the measured saves. The v1 columns were measured again after the names in the file changed to `workitem.*` events and frozen Sprint rows. The latency and heap values are from the previous run on the same day.

| Workload | Legacy `project.json` | Legacy `history.json` | v1 `project.json` | v1 `history.json` | Max observed JS heap (MiB) |
|---|---:|---:|---:|---:|---:|
| control | 91,853 | 19,421,526 | 119,504 | 473,577 | 383.9 |
| sprints | 98,942 | 4,578,150 | 157,455 | 229,730 | 343.3 |
| attachments | 59,205 | 73,988 | 82,800 | 77,315 | 110.9 |
| long-history | 53,916 | 2,044,089 | 76,371 | 2,136,516 | 123.4 |
| large | 597,444 | 38,274,233 | 789,647 | 866,780 | 666.4 |

- Histories that contain board-level edits decrease the most. `control` goes from 19.4 MB to 0.47 MB, and `large` goes from 38.3 MB to 0.87 MB. This is because each edit stores a patch and not the full project.
- `long-history` increases by a small quantity, approximately 4%. Before v1, its events were field-level changes. Also, `workitem.updated` / `"entityType":"workitem"` have more characters than the previous `task` names.
- `sprints` has a history with more bytes than before the frozen rows changed. Each participation update stores the full v1 workitem row and the members of that moment. Thus, if a member gets a new name, a previous Sprint does not change.
- `project.json` has more bytes in v1 for these fixtures. The legacy size comes from compact JSON. The v1 file has indents to make it easy to read. Thus, the two columns do not compare the quantity of stored data.
- The benchmark records heap values after each operation sequence. Garbage collection has an effect on these values. They do not measure peak memory.

## Bulk patch replay

| Rows updated in one patch | Apply (ms) |
|---:|---:|
| 1,000 | 3 / 3.7 |
| 5,000 | 11.9 / 13 |

One patch updates all rows of the project. Replay indexes each changed collection one time. Thus, the time increases linearly with the number of rows.

## What is not measured

- The timings do not include setup, fixture write operations, attachment creation or the history load before a jump.
- No value here is an OS-level I/O measurement. `createWritable` copies the file to a temporary file before an append. The timings include that copy only as elapsed time.
- The benchmarks did not measure a production project.
