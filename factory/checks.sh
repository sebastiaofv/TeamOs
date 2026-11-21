#!/usr/bin/env bash
# Run from the checkout being checked, which the gate supplies as its cwd.
set -euo pipefail

cd kanban
export HUSKY=0
export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-4180}"

npm ci --no-audit --no-fund
npm run lint
npm run typecheck
npm run test:unit
npx --no-install playwright install chromium
# Playwright builds dist/ and dist-standalone/ before running the E2E suite.
npx --no-install playwright test tests/e2e --workers=2 --update-snapshots=none
