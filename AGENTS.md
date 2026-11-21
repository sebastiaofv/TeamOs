# TeamOS

The application lives in `kanban/`; Git, CI and the software factory live at
this repository root.
TeamOS is a local portfolio planning and Kanban app using
React, TypeScript, Zustand and Vite. It opens user-selected project folders and
legacy `.board.json` files through Chromium's File System Access API, with local
autosave, history and recovery. It has no application server, accounts or payments.

## Working on the app

Read `kanban/ARCHITECTURE.md` before changing application structure or shared
behavior. Read `kanban/PROJECT_FORMAT.md` before changing serialization, folder
storage, history or migrations. Consult `kanban/README.md` for existing product
behavior and `kanban/test-board/README.md` for the fictional example project.

Keep domain rules pure; feature commands coordinate writes, queries derive view
models, and infrastructure owns browser and persistence adapters. Follow nearby
code and existing CSS tokens. Update the relevant product documentation when
behavior changes. Partial typed test fixtures use `@total-typescript/shoehorn`.

For tools that ignore `.gitignore`, explicitly exclude `.worktrees/` from searches
and file inventories: it contains complete additional checkouts.

## Setup and validation

Use Node.js 24 (matching CI), npm, Python 3.9+, Git and authenticated `gh`.
From the repository root, set up a fresh checkout:

```bash
cd kanban
HUSKY=0 npm ci --no-audit --no-fund
npx --no-install playwright install chromium
```

On a fresh Linux host, install Chromium system libraries during host provisioning
with `npx --no-install playwright install --with-deps chromium` from `kanban/`.
Factory browser reviews also require `agent-browser` on PATH: install with
`npm install -g agent-browser@0.43.0`, then run `agent-browser install` once.
Sign in to the configured coding CLIs with `claude auth login` and `codex login`.

From the repository root, run `bash factory/checks.sh`. It clean-installs locked
dependencies with Husky disabled, then runs these checks in `kanban/`:

```bash
npm run lint
npm run typecheck
npm run test:unit
npx --no-install playwright install chromium
npx --no-install playwright test tests/e2e --workers=2 --update-snapshots=none
```

Playwright builds both app variants through its configured `webServer` before
testing. The factory checks use port 4180 by default; set `PLAYWRIGHT_PORT` to another free
port for simultaneous check runs. All checks are noninteractive and leave source
and snapshots unchanged. These checks match `.github/workflows/kanban.yml`;
macOS visual tests remain separate: `cd kanban && npm test -- --update-snapshots=none`.
Regenerate visual baselines only when explicitly requested and review image diffs.

`kanban/dist/` and `kanban/dist-standalone/` are tracked artifacts. Include both
regenerated builds with app changes, as required by `kanban/README.md`.

## Development and browser verification

From the supplied worktree root, start the dev server on the supplied port:

```bash
cd kanban
npm run dev -- --host 127.0.0.1 --port <port> --strictPort
```

Open `http://127.0.0.1:<port>` in Chromium. Verify UI changes at desktop and phone
widths, in Classic/Modern themes, Light/Dark modes and EN/PT where affected.
Use disposable fixture copies for writable project-folder tests; dropped legacy
files are read-only. Existing Playwright helpers in `kanban/tests/support/` seed
browser state and emulate file handles for repeatable automated tests.

## Software factory

Installed from [software-factory](https://github.com/sebastiaofv/software-factory/tree/4c4d3ce2b7742177ecdf046896bd3d9051f4f70e)
following its `INSTALL.md`. Run `factory/bin/factory run` for open issues labeled
`factory`, or add an issue number to run one. Intake may first ask numbered
questions on the issue: answer in a comment and rerun. Claude's `/factory` and
Codex's `$factory` invoke the same runner. A run creates real PRs and can merge
approved changes.

Profiles in `factory/config.json` select the CLI, model and reasoning effort per
role; null model/effort values use the CLI defaults. Update `steps`, `routing`
and `surface_reviewers` together when changing providers. Every risk tier needs
a code reviewer. UI review covers both UX and visual design. Start with one
concurrent job; the current limits allow three build rounds, three intake
question rounds, 60 minutes per CLI step and 30 minutes per check run. Only low-risk work
may use the simple track.

Verify with `factory/bin/factory doctor` and
`python3 -m unittest discover -s factory/tests -v`. Factory self-tests are
separate from the app checks in `factory/checks.sh`. Doctor checks subscription
logins, not model entitlement. If it reports API-key or provider overrides,
unset the named variables in the execution environment without printing their
values. Subscription limits and account extra-usage settings still apply.

Inspect the queue with `factory/bin/job queue`, jobs with
`factory/bin/factory status`, and time/token receipts with
`factory/bin/factory trace <issue-number>`. State and native CLI logs live in
`factory/jobs/<job-id>/runs/`; checks and reviews live in `round-<N>/` beside
them. Each job's checkout is `.worktrees/<job-id>`. Both directories are
gitignored. Only `factory/bin/job` writes `job.json`. Rerun the same issue after
fixing a failure to reuse validated stage output.

Dashboard: `python3 -m http.server --bind 127.0.0.1 --directory factory 8000`,
then open http://localhost:8000/dashboard.html.

The installation must reach remote `main` before starting jobs, because job
worktrees start at `origin/main`. For the first run, label one small issue
`factory`, run `factory/bin/factory run <issue-number>`, and inspect its PR and
local dashboard.
