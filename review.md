# Code review: F-001 to F-004

Review of the whole app on branch `feat/F-004-app-shell` (F-004 uncommitted). No issues were found in the backend code. Issues 1-8 are fixed (uncommitted); see Fixes at the end.

## Bugs

1. **Existing checkouts can't start the stack.** `scripts/start.sh` and `start.cmd` copy `.env.example` only when `.env` is missing, so an older `.env` lacks `FRONTEND_PORT` and `BACKEND_PUBLIC_URL` and compose fails. `FRONTEND_PORT` also has no `:?` guard in `docker-compose.yml`.
   - Fix: have the start scripts add missing variables from `.env.example`, and guard `FRONTEND_PORT`.

2. **A misconfigured frontend reports itself as ready.** `frontend/app/layout.tsx:22` checks `BACKEND_URL` per request, so when it is unset every page returns 500 while `/health/ready` still returns `Healthy`. Compose and Azure readiness probes pass.
   - Fix: check the variable once at startup (`instrumentation.ts`) or in the ready probe.

3. **The colour-guard test is slow and fails on Windows.** `frontend/app/design.test.ts:49` walks all of `node_modules` and `.next` before filtering, and its path regex assumes `/`, so on Windows it matches no files and fails.
   - Fix: read only `app`, `components` and `lib`.

4. **Local env files can leak into images.** `.dockerignore` excludes only `**/.env`, so a `frontend/.env.local` would be copied into the build and loaded by `next build`.
   - Fix: exclude `.env*` except `.env.example`, matching `.gitignore`.

5. **A backend URL with a path prefix breaks.** `frontend/lib/api.ts:19` uses `new URL("/api/pdf/export", backendUrl)`, which drops any path in the base (for example a gateway prefix such as `https://gw/updf` on Azure).
   - Fix: resolve a relative path against a base that ends in `/`.

## Design-rule violations (CLAUDE.md)

6. **Animation too fast.** `frontend/components/ui/dropdown-menu.tsx:45` and `:246` use `duration-100`; the rule is 150-200 ms.

7. **Off-scale button sizing.** `frontend/components/ui/button.tsx:26` (small size) uses `text-[0.8rem]` (12.8 px) and `px-2.5` / `gap-1.5` (10 px / 6 px), off the 12/14/16 px type scale and the 4 px grid. The token setup does not catch arbitrary values like `text-[0.8rem]`.

## Judgement calls

8. **Ports and URLs must be kept in sync by hand.** In `.env.example`, `FRONTEND_ORIGIN` repeats `FRONTEND_PORT` and `BACKEND_PUBLIC_URL` repeats `BACKEND_PORT`. Changing one port silently breaks CORS or the API calls.
   - Option: derive the default URLs from the ports in `docker-compose.yml`.

9. **Hand-copied edit-model types and an unused API client.** `frontend/lib/edits.ts` copies the backend model by hand, and `exportPdf` / `useBackendUrl` have no callers before F-012. They were added for the "talks to the backend through a configurable URL" criterion.
   - Option: generate the client from OpenAPI. That needs the backend to publish an OpenAPI description, so it may fit better in F-012.

10. **Playwright covers Chromium only, with no screenshot or accessibility checks.** `e2e/playwright.config.ts` does not meet the CLAUDE.md testing rules (Chromium, Firefox, WebKit, mobile viewport, `toHaveScreenshot` in both themes, `@axe-core/playwright`). Deferred to F-014, which plans them.
    - Applying it now needs Firefox and WebKit installed; WebKit may need extra system packages on this OS.

## Recommendation

Fix 1-8 as part of F-004. Keep 9 for F-012 and 10 for F-014.

## Fixes

Each issue was reproduced before the fix and checked again after it.

1. and 8. `docker-compose.yml` gives every variable a default and derives `FRONTEND_ORIGIN` and `BACKEND_PUBLIC_URL` from the ports; `.env.example` lists the two URLs only as commented overrides. Before: the F-001 `.env` failed with "required variable BACKEND_PUBLIC_URL is missing", and with `FRONTEND_PORT=3100` the backend still allowed only `http://localhost:3000` (preflight without `Access-Control-Allow-Origin`). After: the F-001 `.env` starts a healthy stack, and with ports 3100/8180 the backend allows `http://localhost:3100` and the page calls port 8180. Explicit URLs still win.
2. `/health/ready` returns 503 without `BACKEND_URL`; `/health/live` stays 200. Test: `app/health/ready/route.test.ts`. Before: the image without `BACKEND_URL` answered `Healthy 200` while `/` returned 500. After: 503, and the compose health check fails.
3. The scan reads only `app`, `components` and `lib`, and no longer filters on `/`. Before: 39,010 entries walked to keep 21, and `app\layout.tsx` failed the filter (not run on Windows). After: 22 entries; a violation planted in a nested folder is still caught.
4. `.dockerignore` excludes `**/.env*`. Correction to the finding: the file did not reach the runtime image, but it reached the build stage and `next build` loaded it ("Environments: .env.local"), so `NEXT_PUBLIC_*` values in it would be baked into the JavaScript. After: no `.env*` file reaches the build context.
5. `exportPdf` appends `/api/pdf/export` to the backend URL. Test: `lib/api.test.ts` (prefix with and without a trailing slash). Before: `https://gateway.example/updf` became `https://gateway.example/api/pdf/export`.
6. and 7. `duration-150` in the dropdown; on-grid spacing (`gap-2`, `px-2`, `px-3`, `pl-1`/`pl-2`) and `text-xs` in the button and dropdown. Tests in `app/design.test.ts` fail on type-scale, half-step spacing and out-of-range durations; before the fix they listed exactly these classes.
