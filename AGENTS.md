# TeamOS

The application lives in `kanban/`; Git, CI and the software factory live at
this repository root. TeamOS is a local portfolio planning and Kanban app using
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
Browser-based factory roles also require `agent-browser` on PATH; install with
`npm install -g agent-browser@0.43.0` and run `agent-browser install` once per host.
The configured Claude Code and Codex CLIs need subscription logins.

From the repository root, run `bash factory/checks.sh`. This clean-installs the
locked app dependencies with Husky disabled, then runs these commands in `kanban/`:

```bash
npm run lint
npm run typecheck
npm run test:unit
npx --no-install playwright install chromium
npx --no-install playwright test tests/e2e --workers=2 --update-snapshots=none
```

Playwright builds both app variants through its configured `webServer` before
testing. The gate uses port 4180 by default; set `PLAYWRIGHT_PORT` to another free
port for simultaneous check runs. All checks are noninteractive and leave source
and snapshots unchanged. The portable gate matches `.github/workflows/kanban.yml`;
macOS visual tests remain separate: `cd kanban && npm test -- --update-snapshots=none`.
Regenerate visual baselines only when explicitly requested and review image diffs.

`kanban/dist/` and `kanban/dist-standalone/` are tracked artifacts. Include both
regenerated builds with app changes, as required by `kanban/README.md`.

## Development and browser verification

From the supplied job worktree root, start the dev server on the supplied port:

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

Run `factory/bin/factory run` for open issues labeled `factory`, or add an issue
number to run one. Claude's `/factory` and Codex's `$factory` invoke the same
runner. Profiles in `factory/config.json` select the coding CLI/model per role.
Project checks: `factory/checks.sh`. State and native CLI logs live in
`factory/jobs/`; each job's checkout is `.worktrees/<job-id>`. Both directories
are gitignored. Only `factory/bin/job` writes `job.json`.

The installation starts with one concurrent job, three build rounds, 30-minute
CLI steps and a 30-minute check timeout. Base: `main`; merge method: `merge`.
The supplied mixed-CLI profiles use Claude Haiku for intake, Claude Opus for
building/security, Claude Sonnet for UX, and Codex defaults for specs, code/UI
review and approval. Edit `profiles`, `steps`, `routing` and `surface_reviewers`
together to change providers; every risk tier needs a code reviewer. Null model
and reasoning settings use the CLI defaults. Doctor checks login, not model
entitlement. Subscription limits and account extra-usage settings still apply.

Verify configuration with `factory/bin/factory doctor`, inspect issues with
`factory/bin/job queue`, and inspect jobs with `factory/bin/factory status`.
Factory self-tests are separate from app checks:
`python3 -m unittest discover -s factory/tests -v`.
Failures, raw CLI output and usage receipts are in
`factory/jobs/<job-id>/runs/<attempt>/`; round checks and reviews are beside them.
Rerun the same issue after addressing a failure to reuse validated stage output.
If doctor reports an API-key or provider environment override, unset its named
variable in the execution environment without printing or storing its value.

Dashboard: `python3 -m http.server --bind 127.0.0.1 --directory factory 8000`,
then open http://localhost:8000/dashboard.html.

Install changes must reach remote `main` before starting jobs, since worktrees
start at `origin/main`. A run creates real PRs and can merge approved changes.
For the first run, label one small issue `factory`, run
`factory/bin/factory run <issue-number>`, and inspect its PR and local dashboard.
