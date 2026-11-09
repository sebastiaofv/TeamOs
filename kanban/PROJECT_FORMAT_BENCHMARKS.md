# Project format review-fix benchmarks

Measured on 2026-11-09 using headless Chromium and real Origin Private File System streams on this development machine. Before is PR #88 at `ad5ae353`; after is the review fixes. These are synthetic fixtures, not production data. The two runs were sequential, with one warm-up and seven measured samples per operation. p95 is the largest of seven samples.

Repeat from `kanban/`:

```sh
npm run bench:project-files
# Compare with an earlier checkout:
node scripts/benchmark-project-files.mjs --root /path/to/earlier/kanban
```

## Latency

| Workload | Operation | Before median / p95 (ms) | After median / p95 (ms) |
|---|---|---:|---:|
| control | Open | 4.1 / 5.5 | 8.5 / 34.4 |
| control | Save one workitem edit | 8.2 / 8.5 | 8.7 / 9.2 |
| control | Convert legacy folder | 385.9 / 424.2 | 450.1 / 463.5 |
| control | Historical jump | 2.8 / 3.1 | 1.2 / 1.4 |
| sprints | Open | 4 / 4.3 | 6.1 / 10 |
| sprints | Save one workitem edit | 8 / 8.6 | 8.2 / 9.2 |
| sprints | Convert legacy folder | 133.1 / 137.8 | 152.2 / 156.9 |
| sprints | Historical jump | 1.1 / 1.1 | 0.6 / 0.6 |
| attachments | Open | 3.1 / 3.5 | 4 / 4.4 |
| attachments | Save one workitem edit | 5.9 / 6.3 | 6.2 / 6.6 |
| attachments | Convert legacy folder | 7.9 / 9.2 | 12 / 12.7 |
| attachments | Historical jump | 0.5 / 0.7 | 0.5 / 0.5 |
| long-history | Open | 3 / 3.5 | 37.7 / 38.3 |
| long-history | Save one workitem edit | 13.6 / 14.2 | 21.1 / 31 |
| long-history | Convert legacy folder | 54.4 / 56.2 | 138.7 / 148.4 |
| long-history | Historical jump | 7.4 / 8.2 | 0.4 / 0.5 |
| Bulk patch: 1000 workitems | Apply all row updates | 16.8 / 17.4 | 2.5 / 2.9 |
| Bulk patch: 5000 workitems | Apply all row updates | 354.8 / 360.2 | 10.3 / 11.4 |

## Size, logical write volume and memory observations

| Workload | Legacy project / history bytes | Before v1 project / history bytes | After v1 project / history bytes | Before / after logical save bytes | Before / after max observed JS heap (MiB) |
|---|---:|---:|---:|---:|---:|
| control | 91853 / 19421526 | 118692 / 453231 | 118692 / 471494 | 119099 / 119099 | 418.3 / 410.3 |
| sprints | 98942 / 4578150 | 152190 / 219662 | 152191 / 211143 | 152597 / 152598 | 327.4 / 497.8 |
| attachments | 59205 / 73988 | 81937 / 73926 | 81937 / 73957 | 82345 / 82345 | 353.8 / 101.8 |
| long-history | 53916 / 2044089 | 75510 / 2053927 | 75507 / 4021340 | 75918 / 75914 | 428.4 / 155.5 |

Logical save bytes count the rewritten project plus the history growth; they are not OS-level I/O measurements. Heap values are sampled after each operation sequence using Chromium precise memory information; they are maximum observed JS heap, not transient peak memory, and depend on garbage collection. They do not establish a memory improvement.

## Interpretation

- Batched identity maps remove the previous repeated scan/copy cost for bulk patches. This is the clearest measured improvement.
- Strict envelope scanning deliberately adds open-time work proportional to history bytes, while keeping allocation bounded and event deserialization lazy. It detects legacy/duplicate root fields after large arrays; a prefix-only check could not establish that guarantee. Normal saves retain verified structural state and reread identity fields.
- Volume checkpoints now cover ordinary workitem-only histories and follow the approved UTF-8 size budget. The long-history fixture therefore contains additional checkpoints and uses more bytes than the original PR, which left that history unbounded. The policy is a storage/replay tradeoff, not a compression-only change.
- Conversion now checks both live files, preserves verified backups, validates payloads, and retains historical control context. Its extra work is a one-time correctness cost.
- Workloads: each has 100 workitems. Control has 50 risks with 100 board-level edits; Sprints has 100 participation updates; attachments has 20 references to one deduplicated 64 KiB binary; long history has 10,000 ordinary workitem edits. Bulk patches update every row at 1,000 and 5,000 workitems.
- Setup, fixture writes, full history loading before a historical jump, and attachment creation are excluded from operation timings. Historical jumps use the public reconstruction interface after history loading. The benchmark verifies workitem counts and the final bulk result.
