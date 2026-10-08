#!/usr/bin/env sh
# Runs the Playwright suite in the official Playwright image against the running stack (scripts/start.sh).
# Arguments go to `playwright test`, e.g. scripts/e2e.sh --project=webkit tests/viewer.spec.ts
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./e2e/node_modules/@playwright/test/package.json').version")
exec docker run --rm --network host --ipc host --user "$(id -u):$(id -g)" -e HOME=/tmp -e CI -e BASE_URL \
  -v "$PWD":/work -w /work/e2e "mcr.microsoft.com/playwright:v$version-noble" npx playwright test "$@"
