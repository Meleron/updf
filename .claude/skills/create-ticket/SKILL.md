---
name: create-ticket
description: Create feature or bug tickets as Markdown files in this repo's local `tickets/` board. Use this whenever the user describes a requirement, feature idea, user story, improvement, bug, defect or broken behaviour that should be recorded, even if they don't say "ticket" (e.g. "add a requirement for merging PDFs", "users should be able to rotate pages", "log a bug: upload fails on big files", "write these requirements down"). Not for implementing or closing an existing ticket.
---

# Create ticket

`tickets/CLAUDE.md` is the source of truth for folder layout, naming and templates. Read it first and follow it exactly. This skill covers how to turn a request into good tickets.

## Steps

1. **Classify** each item as a feature (`F-`, new or changed behaviour) or a bug (`B-`, existing behaviour that's wrong). If the request bundles several independent capabilities, create one ticket per capability. Small tickets are easier to implement, test and close.
2. **Check for duplicates** by grepping `tickets/` for the key terms. If a `ready/` ticket already covers the item, tell the user and suggest updating that ticket instead. Don't edit tickets in `done/`.
3. **Get the next ID** per type, counting both `ready/` and `done/`:
   ```bash
   ls tickets/features/ready tickets/features/done | grep -oE '^F-[0-9]{3}' | sort | tail -1
   ```
   (use `bugs/` and `B-` for bugs). If nothing is found, start at `001`. When creating several tickets, increment from there.
4. **Write** each ticket into `ready/` using the template from `tickets/CLAUDE.md`.
5. **Report** the created file paths with a one-line summary of each, plus any open questions.

## Writing good tickets

- **Title:** short and user-facing, e.g. "Rotate individual pages", not "Implement RotationService".
- **Description:** say what the user can do and why, in 1-3 sentences.
- **Acceptance criteria:** describe observable behaviour that a test can verify, because every criterion becomes a test (Playwright for anything user-facing). Include the main failure paths that matter for PDFs where relevant (invalid, oversized or password-protected file). "Rotated page is saved in the downloaded PDF" beats "rotation works".
- **Bugs:** give concrete reproduction steps and expected vs actual behaviour. If the user didn't give steps, write the best reconstruction and flag it in Notes.
- **Don't invent requirements.** Write only what the user asked for, plus the obvious failure cases. Put uncertainties under Notes as open questions rather than guessing an answer.
- **Leave out implementation details** (libraries, classes, endpoints) unless the user specified them. The stack has undecided parts, and tickets describe what, not how.
- Keep it concise, with no emojis.

Don't implement the ticket or commit anything unless asked.
