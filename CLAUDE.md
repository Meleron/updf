# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Keep this file short.** It's loaded into every session. Add only project-specific facts and decisions, not generic best practices. Prefer one-line bullets, and remove anything outdated. If a topic grows large, move it to `docs/` and link it from here.

## Project

updf is a web app for managing, editing and working with PDF files. The MVP is specified in `specs/SPEC-1.md`. Specs live in `specs/` as `SPEC-<n>.md`.

## Stack

- **Decided:** ASP.NET Core Web API (.NET), Next.js with TypeScript, Docker Compose for local running, Azure for future hosting, a local git repo moving to GitHub later, Playwright for end-to-end tests, Next.js App Router, pdf.js (rendering, in the browser), PDFsharp (writing, on the backend), Noto for new text boxes plus open fonts from Google Fonts for replacements, shadcn/ui (Radix) on Tailwind v4, next-intl, next-themes, Vitest, latest stable versions of everything. No database in the MVP.
- **Not decided (propose options, let the user choose):** database, auth, specific Azure services.

## Commands

Run from the repo root. Tests use Microsoft.Testing.Platform (set in `global.json`).

- Stack: `scripts/start.sh` / `scripts/stop.sh` (Linux) or `scripts\start.cmd` / `scripts\stop.cmd` (Windows). Start creates `.env` from `.env.example` if missing, builds, and waits until healthy. Every compose variable has a default, and the frontend origin and backend URL derive from the ports. Frontend on `http://localhost:3000`, backend on `http://localhost:8080`.
- Backend build: `dotnet build backend/Updf.slnx`
- Backend format check: `dotnet format backend/Updf.slnx --verify-no-changes`
- All backend tests: `dotnet test --solution backend/Updf.slnx`
- One test: `dotnet test --project backend/Updf.Api.Tests --filter-method "*TestName*"` (or `--filter-class "*ClassName"`)
- Frontend (in `frontend/`, after `npm ci`): `npm run lint`, `npm run typecheck`, `npm test` (Vitest); one test: `npx vitest run <file> -t "<name>"`. Dev server: `BACKEND_URL=http://localhost:8080 npm run dev`.
- Test PDFs: `dotnet run fixtures/generate.cs` regenerates `fixtures/pdfs` (committed).
- Fonts: `dotnet run fonts/download.cs` downloads the open families it lists into `fonts/` (committed) with their licences, then regenerate the frontend's face data (below).
- End-to-end (in `e2e/`, after `npm ci` and `npx playwright install chromium`, with the stack running): `npx playwright test`; one test: `npx playwright test <file> -g "<name>"`. `BASE_URL` overrides `http://localhost:3000`.

## Architecture

- `backend/Updf.Api`: minimal API. `Program.cs` wires services, middleware and endpoints. PDF code is in `Pdf/`.
  - `PdfEndpoints`: `AddPdfExport` (options, Kestrel body limit, in-memory forms, CORS, rate limit) and the thin `POST /api/pdf/export`, which reads the form itself so every failure gets an error code.
  - `PdfExporter`: the pipeline. `PdfValidator` checks and opens the file, then `EditValidator` checks the edits, then `PdfEditor` applies them within the timeout.
  - `EditDocument`: the edit model from the spec, parsed with System.Text.Json (camelCase enums, required values enforced).
  - `PdfEditor`: applies edits in memory with PDFsharp. One transform per page maps display coordinates (top-left of the cropped, rotated page) to PDFsharp space, which ignores the MediaBox origin and /Rotate. Covers are drawn before all text on a page.
  - `FontFaces`: the faces in `fonts/` (copied into the build output), named `<family without spaces>-<style>`: which face draws a style (italic is simulated for a family without italic faces), the characters it supports (cmap), and its metrics (hhea ascent and line spacing, post underline), which the frontend reads the same way. `FontResolver` serves them to PDFsharp, registered once, globally.
  - `OriginalFont`: a replacement in its original font (`pdfFont` with character codes) is written as content operators after PDFsharp's drawing, in the PDF's own font found by name on the page. Simple fonts and Identity-H composite fonts only, else the style's font draws it. A space the font lacks takes the style font's regular space. The PDF's kerning after each character goes into the TJ array.
  - Errors: throw `ExportException` (status + stable `code`). `ApiExceptionHandler` turns every error into `ProblemDetails` with `code` and `requestId`, and logs only unexpected ones.
  - `ExportOptions` (`Export` section, env `Export__*`): file size, pages, timeout, rate, allowed origin. Validated on start.
- `frontend`: Next.js App Router, rendered per request.
  - Dashboard (`/`): `PdfDropZone` checks the file with `lib/pdf-check.ts` (the backend's checks and error codes, in the same order), stores the file and the already-parsed document in `OpenDocumentProvider` (browser only, nothing uploaded) and opens `/edit`, which returns to `/` without a document.
  - Autosave: `lib/document-repository.ts` (`DocumentRepository`, IndexedDB now, a server later) stores the file once under a new id when the editor opens a new one, then the edits (`editsToSave`) a second after each change (`lib/autosave.ts`), and any waiting change when the editor or page closes (`beforeunload`: Chromium drops IndexedDB writes started in `pagehide` on reload). Edits save only to their own document's id, so a failed file save or another tab's document stops them; its operations run in call order, so the dashboard loads what the closing editor just saved. A failed save turns autosave off with a warning. The dashboard closes the open document (Back can't reopen a stale one), and its Continue card restores the saved one (`saved`, nothing to undo); opening another file asks first if the saved one has edits. Download reads the fonts of pages with replacements that haven't been drawn yet.
  - Editor (`/edit`): `components/editor` has the top bar, the thumbnail panel (floats over the pages below `md`) and `<main>`: the scrolling pages (`data-testid="pages"`, focusable from code) with the formatting bar and notices over them. `PdfPage` draws a page only near the visible area, into a fresh canvas swapped in when done (no flicker, no canvas shared with a cancelled render), frees it when far away, caps the canvas at 16.7M pixels (the mobile Safari limit), and is `aria-busy` while drawing. The pages area keeps a stable scrollbar gutter so fit width doesn't loop. `lib/coordinates.ts` converts points to CSS pixels (100% zoom is actual size, 96/72 px per point); `lib/zoom.ts` has fit-width, the 50-200% steps and Ctrl+wheel zoom. Every zoom change keeps a point on a page in place (the pointer, or the middle of the view); the editor's non-passive wheel listener stops the browser's own zoom.
  - Editor state: `lib/editor-state.ts`, a pure reducer over the edit list (the shared model in `lib/edits.ts`), the tool, the box being edited, the last-used style and the undo history (snapshots of the edit list). A new replacement stays `untouched` while it equals its line: the PDF shows instead of its cover and text (only the caret is drawn), and it's discarded if its first edit finishes unchanged. A step is recorded only when no box is being typed in, so typing becomes a step when its edit finishes, and undo finishes it first. Tools: Select (default) and Add text (`T`, ignored while typing). Placing a box goes back to Select.
  - Selection (`text-box.tsx`): a selected box is the focused one and shows the formatting bar (`formatting-bar.tsx`) over the pages. Click or Tab selects, a second click or Enter edits, Esc while typing keeps the box selected, Esc again or focus anywhere else deselects. Arrows (Shift: 10 pt) and dragging move a box within its page, one `move` per drag; Delete removes it and focuses the next box. The box, the bar and its menus carry `data-edit-ui` (`edit-focus.ts`), so focus moves between them freely (not on a window switch). Bar buttons keep the focus where it is; menus return it to the box. Each style change is also the style of new boxes. Tab follows creation order, since re-sorting the elements as boxes move would drop focus.
  - Fonts: `lib/font-faces.json` (each face's family, metrics and code points) and `app/fonts.css` (an `@font-face` per face, so browsers fetch only the faces in use) are generated from `fonts/` by `lib/font-faces.test.ts` (file snapshots: `npx vitest run lib/font-faces.test.ts -u` after changing fonts). `lib/fonts.ts` picks a style's face as the backend does. New boxes choose from three Noto fonts; a replacement's font is matched by name (`similarFamily` in `lib/text-lines.ts`: metric-compatible fonts for Arial, Times, Calibri and others) and can't be changed.
  - Original fonts (`lib/pdf-fonts.ts`): a replacement draws in the PDF's embedded font while bold and italic are unchanged and every character is in it. Reading a page's lines collects each font's character codes from the operator list and builds a copy of pdf.js's font with a cmap from text to glyphs for the preview. `forExport` adds the codes the backend writes. The PDF's kerning (TJ adjustments between letters that are the same every time, never next to a space, which browsers don't kern) goes into the copy's `kern` table and the export. Underlines are found from thin rules under a line (`findRules`).
  - Text boxes (`components/editor/text-box.tsx`) must match the PDF: the files from `fonts/` (copied to `public/fonts` by `predev`/`prebuild`), each face's explicit line height (`normal` is rounded by browsers), no kerning (except the PDF's own, in its own font) or ligatures, and `geometricPrecision` (Chrome on Linux rounds advances otherwise). Browsers also round the first baseline, so each box measures it and shifts by the difference. Compare against an export after any change here.
  - pdf.js: load it only through `loadPdfJs()` (`lib/pdfjs.ts`), which imports the legacy build lazily (the main build needs JavaScript features browsers about a year old and Node 24 lack; importing eagerly breaks server rendering) and runs it in a Web Worker. Owner-password-only PDFs open without a password, so encryption is read from `getMetadata().info.EncryptFilterName`. Only `PasswordException` and `InvalidPDFException` count as file problems; other errors are `unexpected`. Tests that use pdf.js import `test-utils/pdf.ts`, which loads its worker code into the test process and opens fixtures.
  - The browser calls the backend directly (`lib/api.ts`). The layout reads `BACKEND_URL` at request time and passes it down with `BackendUrlProvider`, so one image works everywhere.
  - Download (`editor.tsx`): sends every edit through `forExport` with its page's PDF fonts (each `PageView` reports them once its lines are read), saves the blob under the `Content-Disposition` name, and keeps the edits. Failures show a banner with Retry, translated from `ExportErrors` by code (`unexpected` for network errors and unknown codes). The button stays focusable while busy (`aria-disabled`) and ignores clicks.
  - Styling: the design tokens in `app/globals.css` are the only colours (Tailwind's palette is removed). shadcn/ui components live in `components/ui` and are edited to use the tokens; shadcn's own `accent` hover colour is replaced by `muted`.
  - i18n: next-intl without URL prefixes. `i18n/locale.ts` picks the locale from the `NEXT_LOCALE` cookie, then `Accept-Language`. Messages in `messages/{en,pl}.json`, typed by `global.d.ts`.
  - Theme: next-themes (`class` on `<html>`, system by default, choice in localStorage). The toggle fades the colours (`.theme-fade`, 500ms). It applies the class itself and calls `setTheme` only when the fade ends, because next-themes turns transitions off while applying a theme. Reduced motion switches instantly.
  - Vitest guards (`app/design.test.ts`, `messages/messages.test.ts`): message key parity, WCAG AA contrast of token pairings, and in `app`, `components` and `lib`: no raw colours, only type-scale sizes, spacing on the 4px grid, 150-200ms animations.
- `fixtures/pdfs`: the shared test PDFs from the spec plus a form, `styles.pdf` (fonts and layouts for replacing lines), `fonts.pdf` (Arimo, Tinos and an underline) and `kerned.pdf` (kerning, justified spacing; made by LibreOffice from `fixtures/kerned.fodt` with `soffice --headless --convert-to pdf --outdir fixtures/pdfs fixtures/kerned.fodt`, not by the generator), used by backend, Vitest and Playwright tests. The generator rewrites every file it makes, so keep only the ones you meant to change. The file over 25 MB is generated by each test.
- `e2e`: Playwright against the compose stack (Chromium for now). Next.js renders an empty `role="alert"` route announcer, so find alerts by their text. Shared helpers in `tests/helpers.ts`; `tests/text-boxes.ts` adds, formats and measures text boxes, downloads the edited PDF and opens a download in the editor; `tests/pdf.ts` reads a PDF's text positions with pdf.js. Rendered pages are compared as canvas bitmaps (`*-snapshots/`), so layout shifts don't matter; they were checked against `pdftoppm -cropbox`, so update them with `--update-snapshots` only after checking the new images. Headless Chromium hides scrollbars; tests that need them launch without `--hide-scrollbars` in their own file.
- `backend/Updf.Api.Tests`: xUnit v3. Use `ApiFactory` (raised rate limit) for integration tests. Output PDFs are read back with PdfPig, which reports positions on the displayed page with a bottom-left origin. `TestPdfs` builds fixture PDFs and edits. Keep theory data small: runners serialize every row (a 25 MB row made a run take 53 s instead of 2 s).

## Tickets

Requirements live in `tickets/` as Markdown files: `features/` and `bugs/`, each split into `ready/` and `done/`. Read `tickets/CLAUDE.md` before creating, working on or closing a ticket.

- Every ticket has a plan next to it (`F-001-foo.md` -> `F-001-foo.plan.md`). There are no other plan files.
- Plans are short and high-level: approach, key decisions, ordered milestones, what to test, pitfalls. Never put code, file-by-file steps or exact commands in a plan. The implementing agent designs the details.

## Overall coding guidelines
- Use latest versions of libraries and idiomatic approaches as of today
- Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
- Be concise. Keep README.md and CLAUDE.md minimal. IMPORTANT: no emojis ever

## Conventions

- Use Conventional Commits and feature branches. Never commit until the user explicitly says so, even when a ticket, plan or acceptance criterion calls for a commit. Add a GitHub remote and Actions only when asked.
- Before calling work done, run lint, type-check and the relevant tests for the side(s) you touched.
- **.NET:** nullable reference types and `TreatWarningsAsErrors`, central package management, thin endpoints with logic in services, `IOptions<T>` validated on startup, `ProblemDetails` errors, async I/O with a `CancellationToken` passed through.
- **Next.js:** strict TypeScript, one typed API client (ideally generated from OpenAPI), and never put secrets in `NEXT_PUBLIC_*` variables.
- Make every schema change a versioned migration, and never edit an applied one.

## Portability (local Docker → Azure)

- The app must start from a clean clone with `docker compose` and a `.env` copied from `.env.example`. Never commit `.env`.
- Put infrastructure behind interfaces (e.g. `IFileStorage`), with local implementations (filesystem or Azurite) and Azure implementations swapped by config only.
- Config comes from env vars only: no hard-coded hosts or connection strings, and no assumption of a local secrets file (Azure will use Key Vault or managed identity).
- Containers are stateless and non-root, with pinned images and multi-stage builds. Expose `/health/live` and `/health/ready`. Write structured logs to stdout.

## Security (PDFs are untrusted)

- Validate uploads by magic bytes (`%PDF-`), and enforce size and page limits.
- Guard against decompression bombs, cyclic object graphs, and embedded JavaScript and attachments. Never execute PDF scripts.
- Enforce timeouts and size limits on PDF processing.
- Store files under server-generated IDs and check ownership on every access. Serve downloads via `Content-Disposition: attachment` or short-lived SAS URLs.
- Restrict CORS to the frontend origin, and rate-limit upload and processing endpoints. Never log document contents, PDF passwords or tokens.

## Testing

- Write unit tests for services, integration tests with `WebApplicationFactory` and Testcontainers, and add a regression test with every bug fix.
- Keep a shared PDF fixtures set: multi-page, scanned, password-protected, forms, large and malformed files.
- **Playwright:** every user-facing feature needs end-to-end tests for its happy path and main failure paths before it's done.
  - Run against the real `docker compose` stack, with the base URL from env.
  - After a download, parse the output PDF to verify the result (pages, order, rotation, text).
  - Use role and label locators and web-first assertions. Never use `waitForTimeout`.
  - Tests must be isolated and parallel-safe: each test creates its own data, and auth comes from `storageState`.
  - Run in Chromium, Firefox, WebKit and a mobile viewport, with `toHaveScreenshot` in both themes and `@axe-core/playwright` on key pages.

## Design

High-end, modern, minimalist. Neutral surfaces, whitespace and a single scarce accent colour, with the PDF as the hero. When in doubt, remove rather than add.

Colour tokens are CSS variables (`--color-*`, light / dark). Components use the tokens, never raw hex values. All text pairings pass WCAG AA, so re-check contrast whenever you change a token.

| Token | Light | Dark | Token | Light | Dark |
|---|---|---|---|---|---|
| `bg` | `#FAFAFA` | `#09090B` | `accent` | `#4F46E5` | `#818CF8` |
| `surface` | `#FFFFFF` | `#18181B` | `accent-hover` | `#4338CA` | `#A5B4FC` |
| `surface-muted` | `#F4F4F5` | `#1F1F23` | `on-accent` | `#FFFFFF` | `#09090B` |
| `canvas` (viewer) | `#EDEDEF` | `#111113` | `accent-subtle` | `#EEF2FF` | `rgba(129,140,248,.12)` |
| `border` | `#E4E4E7` | `#2E2E33` | `success` | `#15803D` | `#4ADE80` |
| `text` | `#18181B` | `#FAFAFA` | `warning` | `#B45309` | `#FBBF24` |
| `text-secondary` | `#52525B` | `#A1A1AA` | `danger` | `#DC2626` | `#F87171` |
| `text-muted` | `#71717A` | `#8A8A93` | | | |

- Use at most one accent (primary) button per view, and status colours only for status.
- Fonts: Geist or Inter via `next/font`. Sizes 12/14/16/20/24/32px, weights 400/500/600.
- 4px spacing grid. Radius 6px on controls and 12px on cards. Use 1px borders, with soft shadows only on floating layers.
- Use Lucide icons. Animations are 150–200ms ease-out and respect `prefers-reduced-motion`. The one exception is the theme switch colour fade, at 500ms.
- Support light and dark themes, following the system setting with a persisted toggle.
- Show clear upload, processing and error states, and design empty states deliberately. The app must be fully keyboard-accessible.
- Editing is non-destructive with undo/redo.
