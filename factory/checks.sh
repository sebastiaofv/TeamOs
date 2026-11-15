#!/usr/bin/env bash
# Run against the caller's checkout, including when the gate invokes this file
# from the main checkout with a job worktree as its working directory.
set -euo pipefail

project_root="$(git rev-parse --show-toplevel)"
cd "$project_root/kanban"

export CI=true
export HUSKY=0
export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-4180}"

npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run test:unit
npx --no-install playwright install chromium
# Playwright's webServer builds both dist/ and dist-standalone/ before testing.
# Match CI's portable suite; macOS visual baselines are a separate local check.
npx --no-install playwright test tests/e2e --workers=2 --update-snapshots=none
