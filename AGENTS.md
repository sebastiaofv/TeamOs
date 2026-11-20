# TeamOS

The application lives in `kanban/`; Git and CI live at this repository root.
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

Use Node.js 24 (matching CI), npm and Git.
From the repository root, set up a fresh checkout:

```bash
cd kanban
HUSKY=0 npm ci --no-audit --no-fund
npx --no-install playwright install chromium
```

On a fresh Linux host, install Chromium system libraries during host provisioning
with `npx --no-install playwright install --with-deps chromium` from `kanban/`.

After installing dependencies, run these checks from `kanban/`:

```bash
npm run lint
npm run typecheck
npm run test:unit
npx --no-install playwright install chromium
npx --no-install playwright test tests/e2e --workers=2 --update-snapshots=none
```

Playwright builds both app variants through its configured `webServer` before
testing. Playwright uses port 4174 by default; set `PLAYWRIGHT_PORT` to another free
port for simultaneous check runs. All checks are noninteractive and leave source
and snapshots unchanged. These checks match `.github/workflows/kanban.yml`;
macOS visual tests remain separate: `cd kanban && npm test -- --update-snapshots=none`.
Regenerate visual baselines only when explicitly requested and review image diffs.

`kanban/dist/` and `kanban/dist-standalone/` are tracked artifacts. Include both
regenerated builds with app changes, as required by `kanban/README.md`.

## Development and browser verification

From the repository root, start the dev server on an available port:

```bash
cd kanban
npm run dev -- --host 127.0.0.1 --port <port> --strictPort
```

Open `http://127.0.0.1:<port>` in Chromium. Verify UI changes at desktop and phone
widths, in Classic/Modern themes, Light/Dark modes and EN/PT where affected.
Use disposable fixture copies for writable project-folder tests; dropped legacy
files are read-only. Existing Playwright helpers in `kanban/tests/support/` seed
browser state and emulate file handles for repeatable automated tests.
