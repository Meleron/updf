@echo off
rem Runs the Playwright suite in the official Playwright image against the running stack (scripts\start.cmd).
rem Needs Docker Desktop's host networking, so the browsers reach the stack on localhost.
rem Arguments go to `playwright test`, e.g. scripts\e2e.cmd --project=webkit tests/viewer.spec.ts
setlocal
cd /d "%~dp0.."
for /f %%v in ('node -p "require('./e2e/node_modules/@playwright/test/package.json').version"') do set version=%%v
docker run --rm --network host --ipc host -e CI -e BASE_URL -v "%cd%":/work -w /work/e2e mcr.microsoft.com/playwright:v%version%-noble npx playwright test %*
